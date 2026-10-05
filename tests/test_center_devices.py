"""The Devices & Sync page with real, connected PCs in a real browser: status of every PC, a real conflict (two PCs edit the same
student while disconnected) decided from the screen, the record check, "Add a PC" with live feedback, removing a PC, and what an
ordinary user must not see."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ADMIN, ApiError, Server, wait_until  # noqa: E402
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright  # noqa: E402
from test_multinode import Base  # noqa: E402


@SKIP
class DevicesPageTest(Base):
    N = 2

    @classmethod
    def setUpClass(cls):
        cls.addClassCleanup(cls.cleanup_all)
        super().setUpClass()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)
        cls.extra = []

    @classmethod
    def cleanup_all(cls):
        for name in ('browser', 'pw'):
            try:
                getattr(cls, name).close() if name == 'browser' else getattr(cls, name).stop()
            except Exception:
                pass
        for s in getattr(cls, 'extra', []):
            s.cleanup()
        for p in getattr(cls, 'proxies', []):
            p.close()
        for s in getattr(cls, 'servers', []):
            s.cleanup()

    def open(self, user=ADMIN, hash_='/devices', lang='en', width=1360):
        ctx = self.browser.new_context(viewport={'width': width, 'height': 860})
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: '%s', motion: 'off'}))" % lang)
        pg = ctx.new_page()
        self.errors = []
        pg.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and 'status of 4' not in m.text else None)
        pg.on('pageerror', lambda e: self.errors.append(str(e)))
        pg.goto(self.A.base)
        pg.wait_for_selector('#auth-form')
        pg.fill('#username', user[0])
        pg.fill('#password', user[1])
        pg.click('#auth-form [type=submit]')
        pg.wait_for_selector('#app-shell')
        pg.goto(self.A.base + '/#' + hash_)
        return pg

    def student(self, client, sid):
        return next(s for s in client.get('/api/state')['students'] if s['id'] == sid)

    def test_a_status_conflict_check_add_and_remove(self):
        pg = self.open()
        # every PC with its state; the light in the top bar says all is well
        pg.wait_for_selector('.dev-hero')
        pg.wait_for_selector('.dev-hero h2:has-text("All PCs are up to date")', timeout=30000)
        self.assertEqual(pg.locator('.pc-card').count(), 2, pg.inner_text('.pc-list'))
        self.assertIn('pc1', pg.inner_text('.pc-list'))
        self.assertFalse(pg.is_hidden('#sync-pill'))
        self.assertIn('s-ok', pg.get_attribute('#sync-pill', 'class'))
        self.assertTrue(pg.is_visible('[data-add]'))                       # only the centre PC can add PCs
        self.assertTrue(pg.is_visible('[data-key]'))                       # ... and it must save the administrator key once
        # a real conflict: both PCs rename the same student while they cannot reach each other
        self.ac.post('/api/commit', {'label': 'student', 'ops': [{'e': 'students', 'id': 'dv-s', 'op': 'put', 'row': {
            'name': 'Synthetic Conflict', 'gradeCode': 'S1', 'system': 'thanaweya', 'active': True}}]})
        self.converged()
        for i in range(2):
            self.unplug(i)
        for client, name in zip(self.clients, ('Synthetic Name From Centre', 'Synthetic Name From Door')):
            row = self.student(client, 'dv-s')
            ver = row.pop('ver')
            row['name'] = name
            client.post('/api/commit', {'label': 'rename', 'ops': [{'e': 'students', 'id': 'dv-s', 'op': 'put', 'ver': ver, 'row': row}]})
        for i in range(2):
            self.plug(i)
        self.converged(timeout=90)
        # the administrator hears about it on the overview, in the advisor and in the "is everything safe?" card
        advice = {a['id']: a for a in self.ac.get('/api/c/advice')}
        self.assertEqual(advice['conflictsWaiting']['vars']['n'], 1)
        self.assertIn('keyUnsaved', advice)                                  # two PCs share, the administrator key has not been saved yet
        sync = self.ac.get('/api/c/status')['sync']
        self.assertEqual((sync['multi'], sync['conflicts'], sync['pcs']), (True, 1, 2))
        ov = self.open(hash_='/overview')
        ov.wait_for_selector('.st-row:has-text("Waiting for your decision")', timeout=30000)
        ov.wait_for_selector('.adv:has-text("wait for your decision")', timeout=30000)
        ov.wait_for_selector('.adv:has-text("Save the administrator key")', timeout=30000)
        pg.click('[data-tab="conflicts"]')
        pg.wait_for_selector('.conflict', timeout=30000)
        self.assertIn('two PCs at the same time', pg.inner_text('.conflict'))
        self.assertEqual(pg.locator('[data-keep]').count(), 2)
        self.assertIn('(1)', pg.inner_text('[data-tab="conflicts"]'))      # counted on its tab
        pg.locator('tr', has_text='Synthetic Name From Door').locator('[data-keep]').click()
        pg.wait_for_selector('.conflict', state='detached', timeout=30000)
        self.converged(timeout=60)
        self.assertNotIn('conflictsWaiting', [a['id'] for a in self.ac.get('/api/c/advice')])
        for client in self.clients:
            self.assertEqual(self.student(client, 'dv-s')['name'], 'Synthetic Name From Door')   # decided once, the same on every PC
        # the record check says everything is in order
        pg.click('[data-tab="pcs"]')
        pg.click('[data-verify]')
        pg.wait_for_selector('.toast:has-text("no problems")', timeout=60000)
        # Add a PC: the window opens, a new PC joins, the dialog tells the moment it has
        pg.click('[data-add]')
        pg.wait_for_selector('.dialog [data-add-body]')
        self.assertIn('Join the centre PC', pg.inner_text('.dialog'))
        self.assertTrue(self.ac.get('/api/devices')['adding_until'])         # pressing the button opened the 15-minute window
        third = Server('dv-c').start()
        type(self).extra.append(third)
        third.client().post('/api/join', {'address': self.A.sync_address, 'code': '', 'name': 'Teachers laptop'})
        pg.wait_for_selector('.dialog .tip.ok', timeout=30000)
        self.assertIn('Teachers laptop joined', pg.inner_text('.dialog .tip.ok'))
        pg.click('.dialog [data-close]')
        pg.wait_for_selector('.pc-card:has-text("Teachers laptop")')
        # remove it again: nothing of what it did is lost, it just cannot share any more
        pg.locator('.pc-card', has_text='Teachers laptop').locator('[data-revoke]').click()
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.pc-card:has-text("Teachers laptop") .badge:has-text("Removed")', timeout=30000)
        self.assertEqual(self.errors, [])

    def test_b_an_ordinary_user_sees_no_devices_page_and_the_server_agrees(self):
        self.ac.post('/api/users/save', {'username': 'desk9', 'full_name': 'Front Desk', 'password': 'Tulip-river-5521', 'must_change': False,
                                         'perms': ['overview.view', 'door.use', 'students.view'], 'scopes': None})
        self.converged()
        pg = self.open(('desk9', 'Tulip-river-5521'), '/devices')
        pg.wait_for_selector('#app-shell')
        self.assertNotIn('devices', pg.evaluate('location.hash'))            # sent back to a page this user may open
        self.assertEqual(pg.locator('#sidebar a[data-page="devices"]').count(), 0)
        self.assertTrue(pg.is_hidden('#sync-pill'))                           # no sharing noise for ordinary users when all is well
        desk = self.A.client()
        desk.login('desk9', 'Tulip-river-5521')
        for path in ('/api/devices', '/api/conflicts', '/api/devices/log'):
            with self.assertRaises(ApiError) as e:
                desk.get(path)
            self.assertEqual(e.exception.code, 403, path)
        for path in ('/api/devices/adding-open', '/api/devices/verify', '/api/devices/revoke'):
            with self.assertRaises(ApiError) as e:
                desk.post(path, {})
            self.assertEqual(e.exception.code, 403, path)

    def test_c_activity_log_shows_who_changed_what_and_never_leaks_a_phone(self):
        phone = '01012345678'
        self.ac.post('/api/commit', {'label': 'Add student', 'ops': [{'e': 'students', 'id': 'al-s', 'op': 'put', 'row': {
            'name': 'Synthetic Log Student', 'gradeCode': 'S1', 'system': 'thanaweya', 'active': True, 'parentMobile': phone}}]})
        self.converged()
        row = self.student(self.clients[1], 'al-s')                        # the door PC renames and changes the phone: the entry must say which PC did it
        ver = row.pop('ver')
        row.update({'name': 'Synthetic Log Student Renamed', 'parentMobile': '01099999999'})
        self.clients[1].post('/api/commit', {'label': 'Update student', 'ops': [{'e': 'students', 'id': 'al-s', 'op': 'put', 'ver': ver, 'row': row}]})
        self.converged()
        try:
            self.A.client().post('/api/auth/login', {'username': ADMIN[0], 'password': 'wrong-password-1'})
        except ApiError:
            pass
        pg = self.open(hash_='/activity')
        pg.wait_for_selector('.log-row:has-text("Synthetic Log Student")', timeout=30000)
        text = pg.inner_text('.log-list')
        self.assertIn('Update student', text)
        self.assertIn('Student', text)
        self.assertEqual(pg.locator('[data-f="node"]').is_visible(), True)   # two PCs: the PC filter is offered
        # before -> after, readable: field names in words, the phone number visible to an administrator
        pg.locator('.log-row', has_text='Update student').locator('summary').click()
        pg.wait_for_selector('.log-diff')
        diff = pg.inner_text('.log-diff')
        for part in ('Name', 'Synthetic Log Student Renamed', 'Parent mobile', phone, '01099999999'):
            self.assertIn(part, diff)
        # filters: the search and the kind narrow the list, an unmatched search explains itself, clearing brings everything back
        total = pg.locator('.log-row').count()
        pg.fill('[data-f="q"]', 'Renamed')
        wait_until(lambda: pg.locator('.log-row').count() < total, 20, what='the search to narrow the list')
        pg.fill('[data-f="q"]', 'zzzz-nothing-matches')
        pg.wait_for_selector('.empty:has-text("Nothing matches these filters")')
        pg.click('[data-reset]')
        wait_until(lambda: pg.locator('.log-row').count() >= total, 20, what='the list to come back')
        # the spreadsheet
        with pg.expect_download() as dl:
            pg.click('[data-export]')
        path = dl.value.path()
        with open(path, encoding='utf-8-sig') as f:
            csv_text = f.read()
        self.assertIn('Update student', csv_text)
        self.assertIn('Parent mobile: ' + phone + ' → 01099999999', csv_text)
        # logins and security: the refused attempt stands out
        pg.click('[data-tabs] [data-tab="security"]')
        pg.wait_for_selector('.log-row.is-bad', timeout=30000)
        self.assertIn('Wrong password', pg.inner_text('.log-row.is-bad'))
        self.assertIn('Signed in', pg.inner_text('.log-list'))
        self.assertEqual(self.errors, [])
        # a reader without the contacts permission: the history is there, the numbers are not, and there is no security tab
        self.ac.post('/api/users/save', {'username': 'reader9', 'full_name': 'Log Reader', 'password': 'Tulip-river-5521', 'must_change': False,
                                         'perms': ['overview.view', 'logs.view', 'students.view'], 'scopes': None})
        self.converged()
        rd = self.open(('reader9', 'Tulip-river-5521'), '/activity', width=390)        # a phone
        rd.wait_for_selector('.log-row:has-text("Synthetic Log Student")', timeout=30000)
        rd.locator('.log-row', has_text='Update student').locator('summary').click()
        rd.wait_for_selector('.log-diff')
        body = rd.inner_text('#app-shell')
        self.assertNotIn(phone, body)
        self.assertNotIn('01099999999', body)
        self.assertIn('Hidden', rd.inner_text('.log-diff'))
        self.assertEqual(rd.locator('[data-tabs] [data-tab]').count(), 0)
        self.assertLessEqual(rd.evaluate('document.documentElement.scrollWidth'), rd.evaluate('window.innerWidth'))   # no sideways scrolling on a phone
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
