"""What protects the database when the program is updated or a data folder is copied: a verified safety copy before every update,
a refusal (and no change at all) for data written by a newer program, and a copied folder that really starts as a new PC."""
import glob
import hashlib
import json
import os
import sqlite3
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ADMIN, ApiError, Server, make_authority, wait_until  # noqa: E402
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
from journal import SCHEMA  # noqa: E402
from version import VERSION  # noqa: E402


def fingerprint(folder):
    out = {}
    for name in ('center.db', 'auth.db', 'journal.db', 'program.json'):
        path = os.path.join(folder, name)
        if os.path.exists(path):
            conn = sqlite3.connect(path) if name.endswith('.db') else None
            if conn:
                conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                conn.close()
            with open(path, 'rb') as f:
                out[name] = hashlib.sha256(f.read()).hexdigest()
    return out


class DataSafetyTest(unittest.TestCase):
    def setUp(self):
        self.s = Server('safety').start()
        self.addCleanup(self.s.cleanup)
        self.admin = make_authority(self.s)
        self.admin.post('/api/commit', {'label': 'Synthetic centre', 'ops': [
            {'e': 'students', 'id': 'sf-s', 'op': 'put', 'row': {'name': 'Synthetic Safety Student', 'gradeCode': 'S1', 'code': '10001'}}]})
        self.marker = os.path.join(self.s.data_dir, 'program.json')

    def restart(self, **marker):
        self.s.stop()
        if marker:
            with open(self.marker, encoding='utf-8') as f:
                m = json.load(f)
            m.update(marker)
            with open(self.marker, 'w', encoding='utf-8') as f:
                json.dump(m, f)
        self.s.start()
        c = self.s.client()
        c.login(*ADMIN)
        return c

    def test_an_update_makes_a_verified_copy_and_keeps_every_record(self):
        with open(self.marker, encoding='utf-8') as f:
            first = json.load(f)
        self.assertEqual((first['version'], first['schema']), (VERSION, SCHEMA))          # every start records what wrote the data
        c = self.restart(version='0.0.1')                                                   # "the data was last written by an older program"
        snaps = glob.glob(os.path.join(self.s.data_dir, 'upgrades', '*_0.0.1_to_' + VERSION))
        self.assertEqual(len(snaps), 1)
        for name in ('center.db', 'auth.db', 'journal.db', 'info.json'):
            self.assertTrue(os.path.exists(os.path.join(snaps[0], name)), name)
        # the safety copy holds the student of before the update, and the update lost nothing
        copy = sqlite3.connect(os.path.join(snaps[0], 'center.db'))
        self.assertEqual(copy.execute("SELECT COUNT(*) FROM students WHERE id='sf-s'").fetchone()[0], 1)
        copy.close()
        self.assertTrue(any(s['id'] == 'sf-s' for s in c.get('/api/state')['students']))
        info = c.get('/api/data-safety')
        self.assertEqual(info['program'], VERSION)
        self.assertEqual(info['history'][0]['from'], '0.0.1')
        self.assertTrue(info['history'][0]['verified'])
        self.assertEqual(len(info['snapshots']), 1)
        res = c.post('/api/data-safety/check', {})
        self.assertTrue(res['ok'], res)
        self.assertGreater(res['checked_changes'], 0)
        # a normal restart (same version) makes no new copy
        self.restart()
        self.assertEqual(len(glob.glob(os.path.join(self.s.data_dir, 'upgrades', '*'))), 1)

    def test_data_from_a_newer_program_is_refused_and_nothing_is_changed(self):
        self.s.stop()
        with open(self.marker, encoding='utf-8') as f:
            m = json.load(f)
        m['schema'] = SCHEMA + 5
        m['version'] = '9.9.9'
        with open(self.marker, 'w', encoding='utf-8') as f:
            json.dump(m, f)
        before = fingerprint(self.s.data_dir)
        self.s.start(wait=False)
        wait_until(lambda: self.s.proc.poll() is not None, 30, what='the refusal')
        self.assertEqual(self.s.proc.returncode, 3)
        text = open(os.path.join(self.s.data_dir, 'logs', 'STARTUP_PROBLEM.txt'), encoding='utf-8').read()
        self.assertIn('newer version of Hessa', text)
        self.assertEqual(fingerprint(self.s.data_dir), before)                          # not one byte of the data changed
        self.assertFalse(os.path.exists(os.path.join(self.s.data_dir, 'upgrades')))
        m['schema'], m['version'] = SCHEMA, VERSION                                      # the right program again: starts, problem note is gone
        with open(self.marker, 'w', encoding='utf-8') as f:
            json.dump(m, f)
        self.s.start()
        self.assertFalse(os.path.exists(os.path.join(self.s.data_dir, 'logs', 'STARTUP_PROBLEM.txt')))

    def test_a_copied_data_folder_set_up_as_a_new_pc_leaves_nothing_of_the_old_centre_behind(self):
        self.s.stop()
        with open(os.path.join(self.s.data_dir, 'node', 'RESET_REQUESTED'), 'w') as f:
            f.write('now')
        self.s.start()
        status = self.s.client().get('/api/auth/status')
        self.assertFalse(status['hasUsers'])
        self.assertEqual(status['node']['role'], 'unconfigured')
        aside = glob.glob(os.path.join(self.s.data_dir, 'copied-*'))
        self.assertEqual(len(aside), 1)
        for name in ('center.db', 'auth.db', 'journal.db', 'node'):
            self.assertTrue(os.path.exists(os.path.join(aside[0], name)), name)         # kept, nothing deleted
        fresh = sqlite3.connect(os.path.join(self.s.data_dir, 'center.db'))
        self.assertEqual(fresh.execute('SELECT COUNT(*) FROM students').fetchone()[0], 0)   # the new PC does not show the old centre
        fresh.close()
        old = sqlite3.connect(os.path.join(aside[0], 'center.db'))
        self.assertEqual(old.execute('SELECT COUNT(*) FROM students').fetchone()[0], 1)
        old.close()


class LogPrivacyTest(unittest.TestCase):
    """The history keeps every value, but what a screen shows is cut down to what that user may see."""
    PHONE = '01012345678'

    @classmethod
    def setUpClass(cls):
        cls.s = Server('logprivacy').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = make_authority(cls.s)
        cls.admin.post('/api/commit', {'label': 'Add student', 'ops': [{'e': 'students', 'id': 'lp-s', 'op': 'put', 'row': {
            'name': 'Synthetic Log Student', 'gradeCode': 'S1', 'code': '10001', 'parentMobile': cls.PHONE, 'portalHash': 'secret-link-hash'}}]})
        row = next(x for x in cls.admin.get('/api/state')['students'] if x['id'] == 'lp-s')
        ver = row.pop('ver')
        row['parentMobile'] = '01099999999'
        cls.admin.post('/api/commit', {'label': 'Change parent phone', 'ops': [{'e': 'students', 'id': 'lp-s', 'op': 'put', 'ver': ver, 'row': row}]})
        for name, perms in (('reader', ['overview.view', 'logs.view', 'students.view']), ('phones', ['overview.view', 'logs.view', 'students.view', 'contacts.view'])):
            cls.admin.post('/api/users/save', {'username': name, 'full_name': name.title(), 'password': 'Tulip-river-5521', 'must_change': False, 'perms': perms, 'scopes': None})
        cls.reader, cls.phones = cls.s.client(), cls.s.client()
        cls.reader.login('reader', 'Tulip-river-5521')
        cls.phones.login('phones', 'Tulip-river-5521')

    def test_a_reader_without_contacts_never_sees_a_phone_number_in_the_log(self):
        text = json.dumps(self.reader.get('/api/audit?limit=100'), ensure_ascii=False)
        self.assertIn('Synthetic Log Student', text)                                  # the history itself is there
        for number in (self.PHONE, '01099999999'):
            self.assertNotIn(number, text)
        self.assertIn('•••', text)                                                    # and says that something was hidden
        # typing the number into the search must not reveal that it exists in the history
        self.assertEqual(self.reader.get('/api/audit?q=' + self.PHONE)['total'], 0)
        self.assertEqual(self.reader.get('/api/audit?q=01099999999')['total'], 0)

    def test_with_contacts_permission_the_numbers_are_shown_and_searchable(self):
        text = json.dumps(self.phones.get('/api/audit?limit=100'), ensure_ascii=False)
        self.assertIn(self.PHONE, text)
        self.assertGreaterEqual(self.phones.get('/api/audit?q=' + self.PHONE)['total'], 1)

    def test_the_parent_link_secret_is_shown_to_nobody_not_even_the_administrator(self):
        for who in (self.admin, self.phones, self.reader):
            self.assertNotIn('secret-link-hash', json.dumps(who.get('/api/audit?limit=100')))
        with self.assertRaises(ApiError) as e:                                        # the security log stays administrators only
            self.reader.get('/api/security')
        self.assertEqual(e.exception.code, 403)


@SKIP
class DataTabBrowserTest(unittest.TestCase):
    """Settings -> Data in a real browser: the second backup folder, the "Check my data now" button, the promises."""

    @classmethod
    def setUpClass(cls):
        cls.s = Server('datatab').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = make_authority(cls.s)
        cls.admin.post('/api/users/save', {'username': 'restorer9', 'full_name': 'Restore Only', 'password': 'Tulip-river-5521', 'must_change': False,
                                           'perms': ['overview.view', 'backups.restore'], 'scopes': None})
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)
        cls.addClassCleanup(cls.pw.stop)
        cls.addClassCleanup(cls.browser.close)

    def open(self, user=ADMIN, width=1280, lang='en'):
        ctx = self.browser.new_context(viewport={'width': width, 'height': 900})
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: '%s', motion: 'off'}))" % lang)
        pg = ctx.new_page()
        self.errors = []
        pg.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and 'status of 4' not in m.text else None)
        pg.on('pageerror', lambda e: self.errors.append(str(e)))
        pg.goto(self.s.base)
        pg.wait_for_selector('#auth-form')
        pg.fill('#username', user[0])
        pg.fill('#password', user[1])
        pg.click('#auth-form [type=submit]')
        pg.wait_for_selector('#app-shell')
        pg.goto(self.s.base + '/#/settings?tab=data')
        return pg

    def test_second_folder_check_and_promises(self):
        usb = tempfile.mkdtemp(prefix='hs-usb-')
        self.addCleanup(shutil.rmtree, usb, True)
        pg = self.open()
        pg.wait_for_selector('[data-folder]')
        self.assertIn('own disk', pg.inner_text('[data-folder] .tip.warn'))               # no second copy: said plainly
        pg.fill('#bk2-path', usb)
        pg.click('[data-folder-form] [type=submit]')
        pg.wait_for_selector('[data-folder] .tip.ok:has-text("also copied to")', timeout=30000)
        self.assertTrue(glob.glob(os.path.join(usb, 'db', '*.db')), 'a backup was copied to the second folder at once')
        self.assertEqual(self.admin.get('/api/backups/folder')['dirs'], [os.path.normpath(usb)])
        pg.click('[data-folder-off]')
        pg.wait_for_selector('[data-folder] .tip.warn')
        self.assertEqual(self.admin.get('/api/backups/folder')['dirs'], [])
        self.assertTrue(glob.glob(os.path.join(usb, 'db', '*.db')), 'stopping the copies never deletes what is already there')
        # a folder inside the program data is refused with a sentence, and nothing changes
        pg.fill('#bk2-path', os.path.join(self.s.data_dir, 'inside'))
        pg.click('[data-folder-form] [type=submit]')
        pg.wait_for_selector('.toast.bad, .toast:has-text("not inside")')
        self.assertEqual(self.admin.get('/api/backups/folder')['dirs'], [])
        # the check
        pg.click('[data-check]')
        pg.wait_for_selector('[data-check-result] .tip.ok:has-text("No problems found")', timeout=60000)
        self.assertEqual(len(pg.locator('[data-safety] .steps').first.locator('li').all()), 5)   # the five promises
        self.assertIn('No update has happened', pg.inner_text('[data-safety]'))
        self.assertEqual(self.errors, [])
        # someone who may only restore sees the backups but cannot choose folders or run the check
        rd = self.open(('restorer9', 'Tulip-river-5521'), width=390)
        rd.wait_for_selector('.card:has-text("Backups")')
        self.assertEqual(rd.locator('[data-folder]').count(), 0)
        self.assertEqual(rd.locator('[data-folder-form]').count(), 0)
        self.assertEqual(rd.locator('[data-check]').count(), 0)
        self.assertLessEqual(rd.evaluate('document.documentElement.scrollWidth'), rd.evaluate('window.innerWidth'))


class SystemHealthTest(unittest.TestCase):
    """The overview's "is everything safe?" card and the advisor's system items: only for people who can act on them, and true."""

    @classmethod
    def setUpClass(cls):
        cls.s = Server('health').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = make_authority(cls.s)
        cls.db = os.path.join(cls.s.root, 'backups', 'db')
        for name, perms in (('plain9', ['overview.view']), ('restorer9', ['overview.view', 'backups.restore'])):
            cls.admin.post('/api/users/save', {'username': name, 'full_name': name, 'password': 'Tulip-river-5521', 'must_change': False, 'perms': perms, 'scopes': None})

    def client(self, name):
        c = self.s.client()
        c.login(name, 'Tulip-river-5521')
        return c

    def ids(self, client=None):
        return {a['id']: a for a in (client or self.admin).get('/api/c/advice')}

    def age_backups(self, days):
        """Pretend every backup is `days` old (names carry the time) and return how to put them back."""
        moved = []
        for n in sorted(os.listdir(self.db)):
            if n.startswith('to_') and n.endswith('.db'):
                stamp = datetime.strptime(n[3:18], '%Y%m%d_%H%M%S') - timedelta(days=days)
                new = 'to_' + stamp.strftime('%Y%m%d_%H%M%S') + n[18:]
                os.replace(os.path.join(self.db, n), os.path.join(self.db, new))   # os.replace: same as Linux rename on Windows
                moved.append((new, n))
        self.addCleanup(lambda: [os.path.exists(os.path.join(self.db, a)) and os.replace(os.path.join(self.db, a), os.path.join(self.db, b)) for a, b in moved])

    def test_a_status_and_advice_follow_the_real_state_of_the_backups(self):
        st = self.admin.get('/api/c/status')
        self.assertEqual(st['backup']['folders'], 0)
        self.assertFalse(st['backup']['has_data'])
        self.assertEqual((st['sync']['state'], st['sync']['multi'], st['sync']['conflicts']), ('single', False, 0))
        self.assertEqual(st['gateway'], {'configured': False})
        ids = self.ids()
        for quiet in ('backupNone', 'backupSingleDisk', 'keyUnsaved'):                      # an empty centre, one PC: nothing to protect or to share yet
            self.assertNotIn(quiet, ids)
        self.admin.post('/api/commit', {'label': 'Add student', 'ops': [{'e': 'students', 'id': 'hl-s', 'op': 'put', 'row': {'name': 'Synthetic Health Student', 'gradeCode': 'S1', 'code': '10001'}}]})
        self.assertEqual(self.ids()['backupNone']['level'], 'bad')                          # data exists and nothing has ever been copied
        self.admin.post('/api/backups', {})
        ids = self.ids()
        self.assertNotIn('backupNone', ids)
        self.assertEqual(ids['backupSingleDisk']['level'], 'info')                          # ... and only one disk holds it
        usb = tempfile.mkdtemp(prefix='hs-usb-')
        self.addCleanup(shutil.rmtree, usb, True)
        self.admin.post('/api/backups/folder', {'path': usb})
        self.addCleanup(lambda: self.admin.post('/api/backups/folder', {'path': ''}))
        self.assertNotIn('backupSingleDisk', self.ids())
        self.assertEqual(self.admin.get('/api/c/status')['backup']['folders'], 1)
        # old backups: only a problem when the data changed since and nothing was copied for days (a PC that was switched off is fine)
        self.age_backups(10)
        self.assertNotIn('backupOld', self.ids())                                           # nothing changed since: the old copy still holds everything
        self.admin.post('/api/commit', {'label': 'Add student', 'ops': [{'e': 'students', 'id': 'hl-s2', 'op': 'put', 'row': {'name': 'Synthetic Health Student Two', 'gradeCode': 'S1', 'code': '10002'}}]})
        old = self.ids()['backupOld']
        self.assertEqual(old['level'], 'warn')
        self.assertGreaterEqual(old['vars']['n'], 9)
        self.admin.post('/api/backups', {})                                                 # a fresh one clears it
        self.assertNotIn('backupOld', self.ids())
        # a failing second folder is named
        shutil.rmtree(usb)
        open(usb, 'w').close()                                                              # the "drive" turned into a file: copying cannot work
        self.admin.post('/api/backups', {})
        self.assertEqual(self.ids()['backupFailed']['level'], 'bad')
        self.assertTrue(self.admin.get('/api/c/status')['backup']['error'])

    def test_b_everybody_hears_only_what_they_can_act_on(self):
        plain = self.client('plain9')
        self.assertEqual(plain.get('/api/c/status'), {})                                    # nothing about backups, PCs or keys
        for hidden in ('backupNone', 'backupOld', 'backupSingleDisk', 'backupFailed', 'syncProblem', 'conflictsWaiting', 'keyUnsaved', 'dataCheckBad'):
            self.assertNotIn(hidden, self.ids(plain))
        restorer = self.client('restorer9')
        st = restorer.get('/api/c/status')
        self.assertEqual(sorted(st), ['backup'])                                            # may restore, so may see how old the backups are ...
        for hidden in ('backupNone', 'backupOld', 'backupSingleDisk'):
            self.assertNotIn(hidden, self.ids(restorer))                                    # ... but fixing them is for those who manage backups


@SKIP
class RecordHistoryBrowserTest(unittest.TestCase):
    """The history of one student in the student file, and "Undo this change" - saved as a new change, nothing removed."""

    @classmethod
    def setUpClass(cls):
        cls.s = Server('recordhist').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = make_authority(cls.s)
        for name, perms in (('nolog9', ['overview.view', 'students.view', 'students.manage']), ('viewer9', ['overview.view', 'students.view', 'logs.view'])):
            cls.admin.post('/api/users/save', {'username': name, 'full_name': name, 'password': 'Tulip-river-5521', 'must_change': False, 'perms': perms, 'scopes': None})
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)
        cls.addClassCleanup(cls.pw.stop)
        cls.addClassCleanup(cls.browser.close)

    def student(self, sid):
        return next(x for x in self.admin.get('/api/state')['students'] if x['id'] == sid)

    def edit(self, sid, **fields):
        row = self.student(sid)
        ver = row.pop('ver')
        row.update(fields)
        self.admin.post('/api/commit', {'label': 'Edit student', 'ops': [{'e': 'students', 'id': sid, 'op': 'put', 'ver': ver, 'row': row}]})

    def open(self, sid, user=ADMIN, page=None):
        ctx = self.browser.new_context(viewport={'width': 1280, 'height': 900})
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: 'en', motion: 'off'}))")
        pg = ctx.new_page()
        self.errors = []
        pg.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and 'status of 4' not in m.text else None)
        pg.on('pageerror', lambda e: self.errors.append(str(e)))
        pg.goto(self.s.base)
        pg.wait_for_selector('#auth-form')
        pg.fill('#username', user[0])
        pg.fill('#password', user[1])
        pg.click('#auth-form [type=submit]')
        pg.wait_for_selector('#app-shell')
        if page:
            pg.goto(self.s.base + '/#/' + page)
            return pg
        pg.goto(self.s.base + '/#/students?id=' + sid)
        pg.wait_for_selector('[data-file]')
        return pg

    def test_history_of_a_record_and_undo(self):
        self.admin.post('/api/commit', {'label': 'Add student', 'ops': [{'e': 'students', 'id': 'hs-1', 'op': 'put', 'row': {
            'name': 'Synthetic History Student', 'gradeCode': 'S1', 'system': 'thanaweya', 'code': '10001', 'active': True}}]})
        self.admin.post('/api/commit', {'label': 'Add student', 'ops': [{'e': 'students', 'id': 'hs-2', 'op': 'put', 'row': {
            'name': 'Another Synthetic Student', 'gradeCode': 'S1', 'system': 'thanaweya', 'code': '10002', 'active': True}}]})
        self.edit('hs-1', name='Synthetic History Student Renamed')
        self.edit('hs-1', school='School A')
        self.edit('hs-1', school='School B')                                            # the school was changed twice
        # the server returns the history of exactly this record
        only = self.admin.get('/api/audit?entity=students&id=hs-1')
        self.assertEqual(only['total'], 4)
        self.assertTrue(all(r['entity_id'] == 'hs-1' for r in only['rows']))
        self.assertEqual(self.admin.get('/api/audit?entity=students&id=nobody')['total'], 0)
        pg = self.open('hs-1')
        pg.click('[data-file] [data-tab="history"]')
        pg.wait_for_selector('[data-history] .log-row')
        self.assertEqual(pg.locator('[data-history] .log-row').count(), 4)
        self.assertEqual(pg.locator('[data-history] [data-undo]').count(), 3)            # the three changes can be undone, the first entry (adding) cannot
        # undo the rename: nothing was changed afterwards, so there is no warning
        pg.locator('[data-history] .log-row', has_text='Changed: Name').locator('[data-undo]').click()
        pg.wait_for_selector('.dialog:has-text("Undo this change?")')
        self.assertIn('Synthetic History Student Renamed', pg.inner_text('.dialog'))
        self.assertNotIn('changed again', pg.inner_text('.dialog'))
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.toast:has-text("earlier values are back")', timeout=30000)
        self.assertEqual(self.student('hs-1')['name'], 'Synthetic History Student')
        pg.wait_for_selector('[data-history] .log-row:nth-child(5)')                      # the undo is a fifth entry: nothing was removed
        self.assertEqual(self.admin.get('/api/audit?entity=students&id=hs-1')['total'], 5)
        self.assertIn('Undo a change', pg.inner_text('[data-history] .log-list'))
        # undo the first school change although the school was changed again afterwards: said before it is done
        pg.locator('[data-history] .log-row', has_text='Changed: School').last.locator('[data-undo]').click()
        pg.wait_for_selector('.dialog:has-text("changed again")')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.toast:has-text("earlier values are back")', timeout=30000)
        self.assertFalse(self.student('hs-1').get('school'))
        self.assertEqual(self.errors, [])
        # a user who may change students but may not read the log has no History tab; one who reads the log but may not change students has no undo
        nolog = self.open('hs-1', ('nolog9', 'Tulip-river-5521'))
        self.assertEqual(nolog.locator('[data-file] [data-tab="history"]').count(), 0)
        viewer = self.open('hs-1', ('viewer9', 'Tulip-river-5521'))
        viewer.click('[data-file] [data-tab="history"]')
        viewer.wait_for_selector('[data-history] .log-row')
        self.assertEqual(viewer.locator('[data-history] [data-undo]').count(), 0)
        c = self.s.client()
        c.login('viewer9', 'Tulip-river-5521')
        self.assertGreaterEqual(c.get('/api/audit?entity=students&id=hs-1')['total'], 5)
        # the Activity log links each entry to the history of its record
        act = self.open(None, page='activity')
        act.wait_for_selector('[data-hist]')
        act.locator('[data-hist]').first.click()
        act.wait_for_selector('.dialog [data-hist-host] .log-row')
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()


class TrialLoginTest(unittest.TestCase):
    """Owner's request (2026-10-06): admin / 123 opens a brand-new PC for a first look. It must never weaken a PC that
    already has accounts, never work from another device, and the screens keep asking for a real password until it changes."""

    def test_a_trial_sign_in_creates_the_administrator_once(self):
        s = Server('trial', extra_cfg={'dev_login': True}).start()
        self.addCleanup(s.cleanup)
        c = s.client()
        st = c.get('/api/auth/status')
        self.assertEqual(st['trial'], {'username': 'admin', 'password': '123'})
        self.assertFalse(st['hasUsers'])
        with self.assertRaises(ApiError):                      # a wrong password creates nothing
            c.login('admin', '1234')
        self.assertFalse(c.get('/api/auth/status')['hasUsers'])
        me = c.login('admin', '123')
        self.assertTrue(me['admin'])
        self.assertTrue(me['trialPassword'])
        self.assertTrue(c.get('/api/auth/status')['trial'])    # still shown while the password is 123
        # a second browser signs in with the same trial password (no second account)
        c2 = s.client()
        self.assertEqual(c2.login('admin', '123')['id'], me['id'])
        # changing the password ends the trial: no hint, no banner, 123 refused
        c.post('/api/auth/password', {'old': '123', 'new': 'Centre-Owner-2026'})
        self.assertFalse(c.get('/api/me')['trialPassword'])
        self.assertIsNone(c.get('/api/auth/status')['trial'])
        with self.assertRaises(ApiError):
            s.client().login('admin', '123')
        s.client().login('admin', 'Centre-Owner-2026')

    def test_b_never_on_a_pc_with_accounts_or_when_switched_off(self):
        s = Server('trial-off', extra_cfg={'dev_login': True}).start()
        self.addCleanup(s.cleanup)
        make_authority(s)
        c = s.client()
        self.assertIsNone(c.get('/api/auth/status')['trial'])
        with self.assertRaises(ApiError):
            c.login('admin', '123')
        off = Server('trial-no').start()                       # the harness default: switched off
        self.addCleanup(off.cleanup)
        c = off.client()
        self.assertIsNone(c.get('/api/auth/status')['trial'])
        with self.assertRaises(ApiError):
            c.login('admin', '123')
        self.assertFalse(c.get('/api/auth/status')['hasUsers'])

    def test_c_not_through_a_tunnel(self):
        s = Server('trial-proxy', extra_cfg={'dev_login': True}).start()
        self.addCleanup(s.cleanup)
        c, tunnel = s.client(), {'X-Forwarded-For': '203.0.113.9'}
        with self.assertRaises(ApiError):                      # remote work is off: refused before anything else
            c.call('GET', '/api/auth/status', headers=tunnel)
        s.stop()
        with open(s.cfg_path) as f:
            cfg = json.load(f)
        cfg['remote_access'] = True
        with open(s.cfg_path, 'w') as f:
            json.dump(cfg, f)
        s.start()
        self.assertIsNone(c.call('GET', '/api/auth/status', headers=tunnel)['trial'])
        with self.assertRaises(ApiError):
            c.call('POST', '/api/auth/login', {'username': 'admin', 'password': '123'}, headers=tunnel)
        self.assertFalse(s.client().get('/api/auth/status')['hasUsers'])
