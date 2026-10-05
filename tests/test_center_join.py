"""A new PC (the door laptop) joins the centre PC from its own first-start screens: find or type the address, check it
live, join, receive the first full copy, sign in with the centre's accounts. Real server processes, real browser."""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ADMIN, ApiError, Server, make_authority, wait_until  # noqa: E402
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import sync  # noqa: E402


class JoinApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a = Server('join-a').start()
        cls.admin = make_authority(cls.a)
        cls.admin.post('/api/commit', {'label': 'Synthetic centre', 'ops': [
            {'e': 'students', 'id': 'jn-s', 'op': 'put', 'row': {'name': 'Synthetic Join Student', 'gradeCode': 'S1', 'code': '10001'}}]})
        cls.b = Server('join-b').start()
        cls.addClassCleanup(cls.a.cleanup)
        cls.addClassCleanup(cls.b.cleanup)

    def test_typed_addresses_are_understood(self):
        parse = lambda text: sync.SyncService.parse_address(types.SimpleNamespace(port=8463), text)
        self.assertEqual(parse('192.168.1.10'), ('192.168.1.10', 8463))
        self.assertEqual(parse(' ADMIN-PC '), ('ADMIN-PC', 8463))
        self.assertEqual(parse('192.168.1.10:9000'), ('192.168.1.10', 9000))
        self.assertEqual(parse('http://192.168.1.10:8095/'), ('192.168.1.10', 8463))   # the web address of Settings: share on the sync port
        for bad in ('', '   ', 'two words'):
            with self.assertRaises(ValueError):
                parse(bad)

    def test_probe_join_and_receive_the_first_copy(self):
        bc = self.b.client()
        self.assertEqual(bc.get('/api/auth/status')['node']['role'], 'unconfigured')
        with self.assertRaises(ApiError) as nobody:                          # nothing answers: a plain sentence, not a stack trace
            bc.post('/api/join/probe', {'address': 'no-such-pc.invalid'})
        self.assertEqual(nobody.exception.code, 400)
        self.assertIn('Nothing answers', str(nobody.exception))
        with self.assertRaises(ApiError) as itself:                          # typing this PC's own address must not look like a missing PC
            bc.post('/api/join/probe', {'address': self.b.sync_address})
        self.assertIn('this PC itself', str(itself.exception))
        with self.assertRaises(ApiError):
            bc.post('/api/join/probe', {'address': ''})
        found = bc.post('/api/join/probe', {'address': self.a.sync_address})
        self.assertTrue(found['ok'])
        self.assertEqual(found['address'], self.a.sync_address)
        # the centre PC does not accept probes or joins on its own, already set up, screens
        with self.assertRaises(ApiError) as done:
            self.admin.post('/api/join/probe', {'address': self.a.sync_address})
        self.assertEqual(done.exception.code, 403)
        # the door is closed until the owner presses "Add a PC" on the centre PC
        with self.assertRaises(ApiError) as closed:
            bc.post('/api/join', {'address': self.a.sync_address, 'code': '', 'name': 'Door laptop'})
        self.assertIn('not adding new PCs', str(closed.exception))
        self.assertEqual(self.admin.get('/api/devices')['adding_until'], '')
        self.assertTrue(any(a['kind'] == 'pairing' for a in self.admin.get('/api/devices')['alerts']))   # the owner is told about the attempt
        with self.assertRaises(ApiError) as scoped:
            self.b.client().post('/api/devices/adding-open', {})                                          # only a signed-in administrator can open it
        self.assertEqual(scoped.exception.code, 401)
        until = self.admin.post('/api/devices/adding-open', {})['until']
        self.assertEqual(self.admin.get('/api/devices')['adding_until'], until)
        bc.post('/api/join', {'address': self.a.sync_address, 'code': '', 'name': 'Door laptop'})
        self.assertEqual(self.admin.get('/api/devices')['adding_until'], '')                              # one PC per opening
        wait_until(lambda: bc.get('/api/auth/status')['hasUsers'], 60, what='the first copy to arrive')
        bc.post('/api/auth/login', {'username': ADMIN[0], 'password': ADMIN[1]})
        wait_until(lambda: any(s['id'] == 'jn-s' for s in bc.get('/api/state')['students']), 60, what='the data of the centre PC')
        nodes = {n['name']: n for n in self.admin.get('/api/devices')['nodes']}
        self.assertIn('Door laptop', nodes)
        self.assertEqual(nodes['Door laptop']['status'], 'active')
        self.assertTrue(bc.post('/api/devices/verify', {'all': True})['ok'])
        # a second PC cannot slip in through the same opening
        third = Server('join-c').start()
        self.addCleanup(third.cleanup)
        with self.assertRaises(ApiError) as late:
            third.client().post('/api/join', {'address': self.a.sync_address, 'code': '', 'name': 'Late PC'})
        self.assertIn('not adding new PCs', str(late.exception))


@SKIP
class JoinBrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a = Server('join-ba').start()
        cls.admin = make_authority(cls.a)
        cls.admin.post('/api/commit', {'label': 'Synthetic centre', 'ops': [
            {'e': 'students', 'id': 'jb-s', 'op': 'put', 'row': {'name': 'Synthetic Browser Student', 'gradeCode': 'S1', 'code': '10002'}}]})
        cls.b = Server('join-bb').start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=CHROMIUM)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.a.cleanup()
        cls.b.cleanup()

    def test_first_start_choose_join_wait_and_sign_in(self):
        ctx = self.browser.new_context(viewport={'width': 1360, 'height': 860})
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: 'en', motion: 'off'}))")
        pg = ctx.new_page()
        errors = []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'status of 400' not in m.text else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(self.b.base)
        # a brand-new PC offers the two ways first
        pg.wait_for_selector('.choice-list')
        self.assertIn('first (main) PC', pg.inner_text('.choice-list'))
        pg.click('[data-c="create"]')                                   # the administrator form, with a way back
        pg.wait_for_selector('#auth-form [data-back]')
        pg.click('#auth-form [data-back]')
        pg.click('[data-c="join"]')
        pg.wait_for_selector('#j-addr')
        # a wrong address is explained in plain words while typing, the right one is recognised
        pg.fill('#j-addr', 'no-such-pc.invalid')
        pg.wait_for_selector('#j-check.bad')
        self.assertIn('Nothing answers', pg.inner_text('#j-check'))
        pg.fill('#j-addr', self.a.sync_address)
        pg.wait_for_selector('#j-check.ok')
        self.assertIn('Found the centre PC', pg.inner_text('#j-check'))
        pg.fill('#j-name', 'Browser door laptop')
        pg.click('#j-form [type=submit]')
        pg.wait_for_selector('#j-err:not([hidden])')                   # the centre PC is not adding PCs yet: said in plain words, nothing is lost
        self.assertIn('not adding new PCs', pg.inner_text('#j-err'))
        self.admin.post('/api/devices/adding-open', {})
        pg.click('#j-form [type=submit]')
        # the first copy arrives, then the sign-in screen says the PC is ready
        pg.wait_for_selector('#auth-form', timeout=90000)
        self.assertIn('This PC is ready', pg.inner_text('.auth-box, .panel'))
        pg.fill('#username', ADMIN[0])
        pg.fill('#password', ADMIN[1])
        pg.click('#auth-form [type=submit]')
        pg.wait_for_selector('#app-shell')
        member = self.b.client()
        member.login(*ADMIN)
        wait_until(lambda: any(s['id'] == 'jb-s' for s in member.get('/api/state')['students']), 60, what='the student on the joined PC')
        self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
