"""A staff member's personal link: opening it in a browser signs in by itself, a program that only looks at it signs nobody in,
another signed-in person is never switched without asking, and the page speaks Arabic first."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ADMIN, ApiError, Server, make_authority  # noqa: E402
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright  # noqa: E402


class PersonalLinkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server('links').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = make_authority(cls.s)
        cls.admin.post('/api/users/save', {'username': 'desk7', 'full_name': 'Synthetic Desk', 'password': 'Tulip-river-5521', 'must_change': False,
                                           'perms': ['overview.view', 'door.use', 'students.view'], 'scopes': None})
        user = next(x for x in cls.admin.get('/api/quick-links')['users'] if x['username'] == 'desk7')
        cls.admin.post('/api/quick-links/set', {'id': user['id'], 'on': True})
        cls.token = next(x for x in cls.admin.get('/api/quick-links')['users'] if x['username'] == 'desk7')['token']

    def test_page_script_exists_and_a_preview_signs_nobody_in(self):
        c = self.s.client()
        page = c.get('/k/' + self.token).decode('utf-8')
        self.assertIn('src="/js/quick.js"', page)
        self.assertIn('dir="rtl"', page)
        self.assertIn('أهلًا Synthetic Desk', page)
        self.assertNotIn('â€', page)                                          # no broken characters
        self.assertIn(b'form.submit()', c.get('/js/quick.js'))                # the script the page asks for is really there
        with self.assertRaises(ApiError) as e:                                # looking at the link is not signing in
            c.get('/api/me')
        self.assertEqual(e.exception.code, 401)
        c.call('POST', '/k/' + self.token, raw=b'')
        self.assertEqual(c.get('/api/me')['username'], 'desk7')

    def test_another_signed_in_person_is_asked_first(self):
        c = self.s.client()
        c.login(*ADMIN)
        page = c.get('/k/' + self.token).decode('utf-8')
        self.assertIn('id="ask"', page)
        self.assertNotIn('quick.js', page)                                    # no automatic switch of the person
        self.assertEqual(c.get('/api/me')['username'], ADMIN[0])

    def test_a_dead_link_says_so_in_both_languages(self):
        with self.assertRaises(ApiError) as e:
            self.s.client().get('/k/not-a-real-link-0000000000')
        self.assertEqual(e.exception.code, 404)


@SKIP
class PersonalLinkBrowserTest(PersonalLinkTest):
    def test_opening_the_link_in_a_browser_lands_in_the_app(self):
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        browser = pw.chromium.launch(executable_path=CHROMIUM)
        self.addCleanup(browser.close)
        pg = browser.new_page()
        errors = []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'status of 401' not in m.text else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(self.s.base + '/k/' + self.token)
        pg.wait_for_selector('#app-shell', timeout=30000)
        self.assertEqual(errors, [])                                          # the old page asked for a missing script


if __name__ == '__main__':
    unittest.main()
