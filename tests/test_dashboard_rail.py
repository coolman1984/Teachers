"""Owner 2026-10-08: the dashboard's quick-access rail (the left side in Arabic) - grouped shortcuts to every daily form and
today's alerts. Every shortcut opens a working page without a script error, in Arabic and English, and a person only sees
the shortcuts they may use."""
import unittest

from harness import Server, make_authority
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright


@SKIP
class DashboardRailTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = Server('rail').start()
        cls.admin = make_authority(cls.srv)

    @classmethod
    def tearDownClass(cls):
        cls.srv.cleanup()

    def test_every_shortcut_opens_its_page(self):
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        b = pw.chromium.launch(executable_path=CHROMIUM)
        self.addCleanup(b.close)
        for lang in ('ar', 'en'):
            with self.subTest(lang=lang):
                ctx = b.new_context(viewport={'width': 1360, 'height': 900})
                ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: '%s', motion: 'off'}))" % lang)
                pg = ctx.new_page()
                errors = []
                pg.on('pageerror', lambda e: errors.append(str(e)))
                pg.goto(self.srv.base)
                pg.wait_for_selector('#auth-form')
                pg.fill('#username', 'boss')
                pg.fill('#password', 'Strong-pass1')
                pg.click('button[type=submit]')
                pg.wait_for_selector('.rail [data-rail="student"]')
                ids = pg.eval_on_selector_all('.rail [data-rail]', 'els => els.map(e => [e.dataset.rail, e.getAttribute("href")])')
                self.assertTrue({'student', 'group', 'teacher', 'door', 'pay', 'expense', 'shift', 'reports', 'backup'} <= {i for i, _ in ids})
                self.assertFalse({'calls', 'debts', 'marks'} & {i for i, _ in ids})       # extra pages are off in the basic menu
                text = pg.inner_text('.rail')
                self.assertNotIn('ov.', text)
                if lang == 'ar':   # the rail sits on the left of the screen in Arabic
                    box, main = pg.eval_on_selector('.rail', 'e => e.getBoundingClientRect().left'), pg.evaluate('innerWidth')
                    self.assertLess(box, main / 2)
                for rid, href in ids:
                    pg.goto(self.srv.base + '/' + href)
                    pg.wait_for_selector('#view .page-head, #view h1', timeout=8000)
                    pg.goto(self.srv.base + '/#/overview')
                    pg.wait_for_selector('.rail [data-rail="student"]')
                pg.reload()                      # a shortcut may leave its own window open (pay, expense)
                pg.wait_for_selector('.rail [data-rail="student"]')
                pg.click('.rail [data-rail="student"]')
                pg.wait_for_selector('.drawer form, .drawer [name="name"]')
                self.assertEqual(errors, [])
                ctx.close()


if __name__ == '__main__':
    unittest.main()
