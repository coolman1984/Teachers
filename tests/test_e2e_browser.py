"""Real-browser check of the application shell (Playwright + the pre-installed Chromium). Skipped when Playwright is missing."""
import json
import os
import unittest

from harness import ADMIN, Server, make_authority

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

CHROMIUM = os.environ.get('HS_CHROMIUM', '/opt/pw-browsers/chromium')


SKIP = unittest.skipIf(sync_playwright is None or not os.path.exists(CHROMIUM), 'Playwright or Chromium not available')


class BrowserBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.S = Server('e2e').start()
        make_authority(cls.S)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.S.cleanup()

    def open(self, prefs=None, width=1360, height=860):
        ctx = self.browser.new_context(viewport={'width': width, 'height': height})
        ctx.add_init_script("if (!localStorage.getItem('hs.prefs')) localStorage.setItem('hs.prefs', %s)" % json.dumps(json.dumps({'welcomed': True, **(prefs or {})})))
        pg = ctx.new_page()
        self.errors = []
        pg.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: self.errors.append(str(e)))
        # a server error names its request: a bare "500" in the console cannot be traced
        pg.on('response', lambda r: self.errors.append(f'HTTP {r.status} {r.request.method} {r.url}') if r.status >= 500 else None)
        pg.goto(self.S.base)
        pg.wait_for_selector('#auth-form')
        pg.fill('#username', ADMIN[0])
        pg.fill('#password', ADMIN[1])
        pg.click('button[type=submit]')
        pg.wait_for_selector('#app-shell')
        return pg



@SKIP
class ShellTest(BrowserBase):
    def test_language_and_direction(self):
        pg = self.open({'lang': 'ar'})
        self.assertEqual(pg.evaluate('document.documentElement.dir'), 'rtl')
        pg.keyboard.press('KeyL')
        pg.wait_for_function("document.documentElement.dir === 'ltr'")
        self.assertIn('Overview', pg.inner_text('#sidebar'))
        pg.keyboard.press('KeyL')
        pg.wait_for_function("document.documentElement.dir === 'rtl'")
        self.assertEqual(self.errors, [])

    def test_theme_toggle_and_persistence(self):
        pg = self.open({'theme': 'daylight'})
        pg.keyboard.press('KeyT')
        pg.wait_for_function("document.documentElement.dataset.theme === 'night'")
        pg.reload()
        pg.wait_for_selector('#app-shell')
        self.assertEqual(pg.evaluate('document.documentElement.dataset.theme'), 'night')
        self.assertEqual(self.errors, [])

    def test_palette_and_go_shortcuts(self):
        pg = self.open({'lang': 'en'})
        pg.keyboard.press('Control+k')
        pg.wait_for_selector('#pal-q')
        pg.keyboard.type('settings')
        pg.keyboard.press('Enter')
        pg.wait_for_url('**/#/settings')
        pg.keyboard.press('KeyG')
        pg.keyboard.press('KeyH')
        pg.wait_for_url('**/#/help')
        self.assertEqual(self.errors, [])

    def test_panel_stack_and_escape(self):
        pg = self.open({'lang': 'en'})
        pg.click('[data-act="account"]')
        pg.wait_for_selector('.drawer.on')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('.drawer', state='detached')
        pg.keyboard.press('Shift+Slash')
        pg.wait_for_selector('.keys')
        pg.keyboard.press('Escape')
        self.assertEqual(pg.locator('#overlay.on').count(), 0)

    def test_settings_apply_live(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/settings')
        pg.click('[data-pref="size"][data-v="xl"]')
        self.assertEqual(pg.evaluate('document.documentElement.dataset.size'), 'xl')
        pg.click('[data-pref="theme"][data-v="contrast"]')
        self.assertEqual(pg.evaluate('document.documentElement.dataset.theme'), 'contrast')
        pg.click('[data-pref="font"][data-v="cairo"]')
        self.assertEqual(pg.evaluate('document.documentElement.dataset.font'), 'cairo')
        pg.click('[data-reset]')
        self.assertEqual(pg.evaluate('document.documentElement.dataset.size'), 'm')

    def test_phone_menu(self):
        pg = self.open({'lang': 'ar'}, 390, 800)
        pg.click('[data-act="menu"]')
        pg.wait_for_function("document.getElementById('app-shell').dataset.menu === '1'")
        pg.click('#sidebar a[data-page="settings"]')
        pg.wait_for_function("document.getElementById('app-shell').dataset.menu === '0'")
        self.assertEqual(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), True, 'no sideways scrolling')

    def test_no_slides_first_time_but_available_from_help(self):
        # owner 2026-10-08: the first sign-in goes straight to work; the slides open only from Help
        ctx = self.browser.new_context(viewport={'width': 1200, 'height': 800})
        pg = ctx.new_page()
        pg.goto(self.S.base)
        pg.wait_for_selector('#auth-form')
        pg.fill('#username', ADMIN[0])
        pg.fill('#password', ADMIN[1])
        pg.click('button[type=submit]')
        pg.wait_for_selector('#app-shell')
        pg.wait_for_timeout(1200)
        self.assertEqual(pg.locator('#slides.on').count(), 0)
        self.assertEqual(pg.evaluate('document.documentElement.dataset.theme'), 'daylight')
        self.assertEqual(pg.evaluate('document.documentElement.dataset.font'), 'system')
        pg.goto(self.S.base + '/#/help?view=faq')
        pg.click('[data-a="slides"]')
        pg.wait_for_selector('#slides.on')
        pg.click('[data-sclose]')
        self.assertEqual(pg.locator('#slides.on').count(), 0)


@SKIP
class CentreAdminTest(BrowserBase):
    """The administrator's flows in a real browser (replaces the inherited trip scenarios, review E07): a teacher account limited to
    one teacher, a deleted list record brought back from the Recycle Bin, a student import with its preview, the welcome slides in
    both directions and the month report with its presentation."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.c = cls.S.client()
        cls.c.login(ADMIN[0], ADMIN[1])
        from datetime import date
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
        import domain as D
        wd = D.weekday(date.today())
        ops = [('subjects', 'ca-sub', {'name': 'Synthetic Subject'}),
               ('teachers', 'ca-t1', {'name': 'Synthetic Teacher One'}), ('teachers', 'ca-t2', {'name': 'Synthetic Teacher Two'})]
        for t in ('1', '2'):
            ops.append(('groups', 'ca-g' + t, {'name': 'Synthetic Group ' + t, 'teacherId': 'ca-t' + t, 'subjectId': 'ca-sub', 'gradeCode': 'S2', 'feeType': 'session',
                                              'fee': 50, 'capacity': 30, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}))
            ops.append(('students', 'ca-s' + t, {'code': '4500' + t, 'name': 'Synthetic Pupil ' + t, 'gradeCode': 'S2', 'system': 'thanaweya', 'consent': True, 'active': True}))
        cls.c.post('/api/commit', {'label': 'Admin fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for t in ('1', '2'):
            cls.c.post('/api/c/enroll', {'studentId': 'ca-s' + t, 'groupId': 'ca-g' + t})

    def test_a_teacher_account_sees_only_its_teacher(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/settings?tab=access')
        pg.wait_for_selector('[data-adduser]')
        pg.click('[data-adduser]')
        pg.wait_for_selector('.drawer.on #u-form')
        pg.fill('.drawer.on [name="full_name"]', 'Synthetic Teacher Account')
        pg.fill('.drawer.on [name="username"]', 'teacher.one')
        pg.fill('.drawer.on [name="password"]', 'Lantern-oak-8812')
        pg.select_option('.drawer.on [name="role"]', 'Teacher')
        self.assertTrue(pg.is_checked('.drawer.on [data-perm="marks.enter"]'))
        self.assertFalse(pg.is_checked('.drawer.on [data-perm="users.manage"]'))
        pg.click('.drawer.on [data-scope="some"]')
        pg.check('.drawer.on [data-teacher="ca-t1"]')
        pg.click('.drawer.on [data-save]')
        pg.wait_for_selector('.drawer', state='detached')
        self.assertIn('Synthetic Teacher Account', pg.inner_text('#view'))
        # the teacher signs in, sets a password, and sees only the first teacher's group and student - also through the API
        ctx = self.browser.new_context()
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: 'en'}))")
        p2 = ctx.new_page()
        p2.goto(self.S.base)
        p2.wait_for_selector('#auth-form')
        p2.fill('#username', 'teacher.one')
        p2.fill('#password', 'Lantern-oak-8812')
        p2.click('button[type=submit]')
        p2.wait_for_selector('[name="old"]')
        p2.fill('[name="old"]', 'Lantern-oak-8812')
        p2.fill('[name="new"]', 'Willow-stone-4471')
        if p2.query_selector('[name="new2"]'):
            p2.fill('[name="new2"]', 'Willow-stone-4471')
        p2.click('form button[type=submit]')
        p2.wait_for_selector('#app-shell')
        p2.goto(self.S.base + '/#/students')
        p2.wait_for_selector('tr[data-id]')
        text = p2.inner_text('#view')
        self.assertIn('Synthetic Pupil 1', text)
        self.assertNotIn('Synthetic Pupil 2', text)
        api = self.S.client()
        api.login('teacher.one', 'Willow-stone-4471')
        state = api.get('/api/state')
        self.assertEqual({g['id'] for g in state['groups'] if g['id'].startswith('ca-')}, {'ca-g1'})
        self.assertEqual({s['id'] for s in state['students'] if s['id'].startswith('ca-')}, {'ca-s1'})
        with self.assertRaises(Exception):
            api.get('/api/c/student?id=ca-s2')                                       # the other teacher's student is refused
        ctx.close()

    def test_b_a_deleted_room_comes_back_from_the_recycle_bin(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/settings?tab=lists')
        pg.wait_for_selector('[data-list-new="rooms"]')
        pg.click('[data-list-new="rooms"]')
        pg.wait_for_selector('.drawer.on [name="name"]')
        pg.fill('.drawer.on [name="name"]', 'Synthetic Room Z')
        pg.click('.drawer.on [data-save]')
        pg.wait_for_selector('.drawer', state='detached')
        pg.wait_for_selector('text=Synthetic Room Z')
        pg.click('text=Synthetic Room Z')
        pg.wait_for_selector('.drawer.on [data-delete]')
        pg.click('.drawer.on [data-delete]')
        pg.click('#overlay [data-ok]')
        pg.wait_for_selector('.drawer', state='detached')
        self.assertNotIn('Synthetic Room Z', pg.inner_text('#view'))
        self.assertFalse(any(r['name'] == 'Synthetic Room Z' for r in self.c.get('/api/state')['rooms']))
        pg.goto(self.S.base + '/#/settings?tab=data')
        pg.wait_for_selector('[data-restore]')
        pg.click('[data-restore]')
        pg.wait_for_selector('.toast')
        self.assertTrue(any(r['name'] == 'Synthetic Room Z' for r in self.c.get('/api/state')['rooms']))

    def test_c_student_import_preview_save_and_the_same_file_again(self):
        import tempfile
        path = os.path.join(tempfile.mkdtemp(prefix='hs-imp-'), 'synthetic.csv')
        with open(path, 'w', encoding='utf-8-sig') as f:
            f.write('الاسم,الصف,رقم ولي الأمر,المجموعة\n')
            f.write('Synthetic Import One,ثانية ثانوي,٠١٠١٢٣٤٥٦٧٠,Synthetic Group 1\n')
            f.write('Synthetic Import Two,ثانية ثانوي,01112345670,Synthetic Group 1\n')
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/students/import')
        pg.wait_for_selector('[data-import-form]')
        pg.set_input_files('[data-import-form] input[type=file]', path)
        pg.click('[data-import-form] [type=submit]')
        pg.wait_for_selector('[data-import-save]')
        self.assertEqual(pg.locator('[data-row]').count(), 2)
        pg.check('[data-import-preview] [name="consent"]')
        pg.click('[data-import-save]')
        pg.click('#overlay [data-ok]')
        pg.wait_for_selector('.toast')
        st = [s for s in self.c.get('/api/state')['students'] if s['name'].startswith('Synthetic Import')]
        self.assertEqual(len(st), 2)
        self.assertIn('01012345670', {s.get('parentMobile') for s in st})          # Arabic digits normalised
        en = [e for e in self.c.get('/api/state')['enrollments'] if e['studentId'] in {s['id'] for s in st}]
        self.assertEqual({e['groupId'] for e in en}, {'ca-g1'})
        # the same file again finds both students: nothing new is made
        pg.set_input_files('[data-import-form] input[type=file]', path)
        pg.click('[data-import-form] [type=submit]')
        pg.wait_for_selector('[data-import-save]')
        with open(path, 'rb') as f:
            rows = self.c.call('POST', '/api/import/preview?name=synthetic.csv', raw=f.read(), headers={'Content-Type': 'application/octet-stream'})['rows']
        self.assertTrue(all(r.get('match') for r in rows), rows)
        self.assertEqual(self.errors, [])

    def test_d_every_welcome_slide_shows_in_both_directions(self):
        for lang in ('ar', 'en'):
            pg = self.open({'lang': lang}, width=1800)
            pg.evaluate("() => HS.slides.open()")
            for k in range(6):
                pg.evaluate("(k) => HS.slides._go(k)", k)
                pg.wait_for_timeout(650)
                box = pg.evaluate("(k) => { const r = document.querySelectorAll('#slides section')[k].getBoundingClientRect(); return [r.left, r.right]; }", k)
                self.assertTrue(abs(box[0]) < 2 and abs(box[1] - 1800) < 2, (lang, k, box))

    def test_e_month_report_and_presentation(self):
        self.c.post('/api/c/shift/open', {'opening': 0})
        self.c.post('/api/c/pay', {'studentId': 'ca-s1', 'groupId': 'ca-g1', 'kind': 'fee', 'amount': 120, 'method': 'cash'})
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/reports')
        pg.wait_for_selector('.rep-kpis')
        self.assertIn('120', pg.inner_text('.rep-kpis'))
        self.assertIn('Synthetic Group 1', pg.inner_text('#view'))                  # profitability lists the group
        pg.click('[data-present]')
        pg.wait_for_selector('.present .ps')
        pg.keyboard.press('ArrowRight')
        self.assertIn('2 / ', pg.inner_text('.present .pn'))
        pg.keyboard.press('Escape')
        self.assertEqual(pg.locator('.present').count(), 0)
        self.assertEqual(self.errors, [])

if __name__ == '__main__':
    unittest.main()

