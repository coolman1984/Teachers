"""The link to the seller's Control Center (server/vendorlink.py) against a local stand-in for the Control Center: it is off
until an administrator sets it up on the centre PC itself, a help request leaves the PC without phone numbers or secrets,
only an administrator opens the support window, repairs run only from the short safe list while the window is open, the
heartbeat carries exactly the listed fields, and the install code is never shown again or written in any log."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from harness import ApiError, Server, make_authority

import vendorlink

TOKEN = 'ins_' + 'A' * 40 + 'WXYZ'
HEARTBEAT_FIELDS = {'version', 'licence_state', 'last_backup_at', 'last_sync_at', 'pending_sync', 'error_count', 'disk_free_mb'}


class FakeCenter:
    """Answers the /api/agent/* routes like apps/control-center; .seen keeps every request, .repairs is the approved queue."""

    def __init__(self):
        self.seen, self.repairs, self.results, self.grants = [], [], [], {}
        me = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def body(self):
                n = int(self.headers.get('content-length') or 0)
                return json.loads(self.rfile.read(n)) if n else None

            def handle_any(self, method):
                b = self.body()
                me.seen.append({'method': method, 'path': self.path, 'token': self.headers.get('X-Install-Token'), 'body': b})
                if self.headers.get('X-Install-Token') != TOKEN:
                    return self.reply(401, {'detail': 'install token required'})
                if self.path == '/api/agent/heartbeat':
                    extra = set(b) - HEARTBEAT_FIELDS
                    if extra:
                        return self.reply(422, {'detail': sorted(extra)})
                    return self.reply(200, {'ok': True, 'repairs_waiting': len(me.repairs)})
                if self.path == '/api/agent/tickets' and method == 'POST':
                    return self.reply(201, {'id': 't1', 'status': 'open'})
                if self.path == '/api/agent/tickets':
                    return self.reply(200, [{'id': 't1', 'subject': 'Printer', 'status': 'in_progress', 'vendor_reply': 'We are on it'}])
                if self.path == '/api/agent/grants':
                    me.grants['g1'] = b
                    return self.reply(201, {'id': 'g1', 'code': '123-456-789', 'expires_at': '2999-01-01T00:00:00Z'})
                if self.path.startswith('/api/agent/grants/') and method == 'DELETE':
                    me.grants.pop(self.path.rsplit('/', 1)[1], None)
                    return self.reply(200, {'ok': True})
                if self.path == '/api/agent/repairs':
                    return self.reply(200, me.repairs)
                if self.path.startswith('/api/agent/repairs/'):
                    me.results.append(b)
                    me.repairs = [r for r in me.repairs if r['id'] != self.path.rsplit('/', 1)[1]]
                    return self.reply(200, {'ok': True})
                return self.reply(404, {'detail': 'not found'})

            def do_GET(self):
                self.handle_any('GET')

            def do_POST(self):
                self.handle_any('POST')

            def do_DELETE(self):
                self.handle_any('DELETE')

            def reply(self, code, data):
                raw = json.dumps(data).encode()
                self.send_response(code)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.http = ThreadingHTTPServer(('127.0.0.1', 0), H)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{self.http.server_address[1]}'

    def stop(self):
        self.http.shutdown()
        self.http.server_close()


class SupportLinkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = FakeCenter()
        cls.srv = Server('support').start()
        cls.admin = make_authority(cls.srv)
        profiles = {p['name']: p['perms'] for p in cls.admin.get('/api/users')['profiles']}
        cls.admin.post('/api/users/save', {'username': 'desk', 'full_name': 'Desk', 'password': 'Strong-pass2', 'must_change': False,
                                           'role': 'Front desk', 'perms': profiles['Front desk'], 'scopes': None})
        cls.desk = cls.srv.client()
        cls.desk.login('desk', 'Strong-pass2')

    @classmethod
    def tearDownClass(cls):
        cls.srv.cleanup()
        cls.fake.stop()

    def setUp(self):
        self.fake.seen.clear()

    def link(self):
        self.admin.post('/api/support/link', {'url': self.fake.url, 'token': TOKEN})

    def test_1_off_until_set_up_but_the_self_check_works(self):
        r = self.desk.get('/api/support')
        self.assertFalse(r['configured'])
        self.assertNotIn('link', r)                      # the link settings are for administrators
        ids = {c['id'] for c in r['checks']}
        self.assertTrue({'backup', 'licence', 'sync', 'errors'} <= ids)
        with self.assertRaises(ApiError) as e:
            self.desk.post('/api/support/ticket', {'subject': 'Printer', 'message': 'It stopped'})
        self.assertEqual(e.exception.key, 'sup.err.off')
        self.assertEqual(self.fake.seen, [])            # nothing left the PC

    def test_2_only_an_administrator_sets_it_up_and_the_code_is_never_shown_or_logged(self):
        with self.assertRaises(ApiError) as e:
            self.desk.post('/api/support/link', {'url': self.fake.url, 'token': TOKEN})
        self.assertEqual(e.exception.code, 403)
        for bad, key in (({'url': 'http://example.com', 'token': TOKEN}, 'sup.err.url'), ({'url': self.fake.url, 'token': 'abc'}, 'sup.err.token')):
            with self.assertRaises(ApiError) as e:
                self.admin.post('/api/support/link', bad)
            self.assertEqual(e.exception.key, key)
        self.link()
        st = self.admin.get('/api/support')
        self.assertTrue(st['configured'])
        self.assertEqual(st['link']['ends'], 'WXYZ')
        self.assertNotIn(TOKEN, json.dumps(st))
        sec = json.dumps(self.admin.get('/api/security'))
        self.assertIn('Link to the seller saved', sec)
        self.assertNotIn(TOKEN, sec)
        self.assertNotIn(TOKEN, json.dumps(self.admin.get('/api/state')))     # never in the shared data

    def test_3_help_request_shows_what_leaves_and_removes_phones_and_secrets(self):
        self.link()
        preview = self.desk.get('/api/support')['preview']
        self.assertEqual(set(preview), {'version', 'checks', 'licence', 'lastBackup', 'diskFreeMb', 'sync', 'recentErrors'})
        self.desk.post('/api/support/ticket', {'subject': 'الطابعة واقفة 01012345678', 'attach': True,
                                               'message': 'Call 01112223334 or mona@example.com, password=Secret123, nid 29001011234567'})
        sent = [s for s in self.fake.seen if s['path'] == '/api/agent/tickets'][0]['body']
        raw = json.dumps(sent, ensure_ascii=False)
        for secret in ('01012345678', '01112223334', 'mona@example.com', 'Secret123', '29001011234567'):
            self.assertNotIn(secret, raw)
        self.assertIn('[PHONE]', raw)
        self.assertIn('Desk', sent['message'])           # who asked
        self.assertEqual(sent['bundle']['version'], preview['version'])
        tickets = self.desk.get('/api/support/tickets')['tickets']
        self.assertEqual(tickets[0]['status'], 'in_progress')
        with self.assertRaises(ApiError) as e:
            self.desk.post('/api/support/ticket', {'subject': 'x', 'message': ''})
        self.assertEqual(e.exception.key, 'sup.err.short')

    def test_4_heartbeat_carries_exactly_the_listed_fields(self):
        self.link()
        r = self.admin.post('/api/support/check')
        self.assertTrue(r['answer']['ok'])
        beat = [s for s in self.fake.seen if s['path'] == '/api/agent/heartbeat'][0]['body']
        self.assertTrue(set(beat) <= HEARTBEAT_FIELDS)
        self.assertIn(beat['licence_state'], {'active', 'grace', 'expired', 'invalid', 'none', 'not_yet_valid'})

    def test_5_only_an_administrator_opens_the_window_and_repairs_run_only_while_it_is_open(self):
        self.link()
        with self.assertRaises(ApiError) as e:
            self.desk.post('/api/support/window', {'minutes': 30, 'scopes': ['repair']})
        self.assertEqual(e.exception.code, 403)
        for bad, key in (({'minutes': 600, 'scopes': ['repair']}, 'sup.err.minutes'), ({'minutes': 30, 'scopes': ['root']}, 'sup.err.scopes')):
            with self.assertRaises(ApiError) as e:
                self.admin.post('/api/support/window', bad)
            self.assertEqual(e.exception.key, key)
        self.fake.repairs = [{'id': 'r1', 'action': 'integrity_check'}, {'id': 'r2', 'action': 'run_shell'}]
        self.assertEqual(self.admin.post('/api/support/check')['repairs'], 0)        # no window: nothing runs
        st = self.admin.post('/api/support/window', {'minutes': 30, 'scopes': ['view_diagnostics', 'repair']})
        self.assertTrue(st['window']['open'])
        self.assertEqual(st['window']['code'], '123-456-789')
        self.assertIn('The Admin', self.fake.grants['g1']['approved_by'])
        self.assertEqual(self.admin.post('/api/support/check')['repairs'], 2)
        by_action = {r['result'][:16] for r in self.fake.results}
        self.assertIn('Data check OK', {r['result'] for r in self.fake.results})
        self.assertIn('Not needed in He', by_action)          # an action outside the safe list never runs
        sec = json.dumps(self.admin.get('/api/security'))
        self.assertIn('Seller support window opened for 30 minutes', sec)
        self.assertIn('Seller repair run: integrity_check', sec)
        st = self.admin.post('/api/support/window/end')
        self.assertIsNone(st['window'])
        self.assertNotIn('g1', self.fake.grants)

    def test_6_a_refused_or_unreachable_center_is_explained(self):
        self.admin.post('/api/support/link', {'url': self.fake.url, 'token': 'ins_' + 'B' * 40})
        with self.assertRaises(ApiError) as e:
            self.admin.post('/api/support/check')
        self.assertEqual(e.exception.key, 'sup.err.refused')
        self.admin.post('/api/support/link', {'url': 'http://127.0.0.1:9', 'token': TOKEN})
        with self.assertRaises(ApiError) as e:
            self.admin.post('/api/support/check')
        self.assertEqual(e.exception.key, 'sup.err.unreachable')
        self.admin.post('/api/support/link', {'clear': True})
        self.assertFalse(self.admin.get('/api/support')['configured'])


class RulesTest(unittest.TestCase):
    def test_redaction(self):
        out = vendorlink.redact({'a': ['+201112223334', '٠١٠١٢٣٤٥٦٧٨', 'token: ins_' + 'x' * 30, 'sk-ant-abc123'], 'b': 'mail a@b.co'})
        raw = json.dumps(out)
        for bad in ('1112223334', '01012345678', 'ins_x', 'sk-ant-abc', 'a@b.co'):
            self.assertNotIn(bad, raw)

    def test_self_check_levels(self):
        from datetime import datetime, timedelta
        now = datetime(2026, 10, 8, 12, 0)
        c = {x['id']: x for x in vendorlink.checks({'lastBackup': (now - timedelta(hours=3)).isoformat(), 'diskFreeMb': 300,
                                                    'licence': 'locked', 'sync': 'pending', 'errors': 2}, now)}
        self.assertEqual((c['backup']['level'], c['disk']['level'], c['licence']['level'], c['sync']['level'], c['errors']['level']),
                         ('ok', 'bad', 'bad', 'warn', 'warn'))
        self.assertEqual(vendorlink.checks({}, now)[0]['state'], 'none')
        self.assertEqual(vendorlink.checks({'lastBackup': (now - timedelta(days=3)).isoformat()}, now)[0]['level'], 'bad')

    def test_heartbeat_body_has_only_listed_fields(self):
        link = vendorlink.Link(os.getcwd(), '9.9.9', dict, {})
        body = link.heartbeat_body({'licence': 'grace', 'errors': 1, 'lastBackup': '2026-10-08T10:00:00', 'diskFreeMb': 5000,
                                    'errorSamples': ['secret stuff'], 'sync': 'ok'})
        self.assertTrue(set(body) <= HEARTBEAT_FIELDS)
        self.assertEqual(body['licence_state'], 'grace')


if __name__ == '__main__':
    unittest.main()


try:
    from test_e2e_browser import CHROMIUM, SKIP, sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright, SKIP, CHROMIUM = None, unittest.skip('no browser'), ''


@SKIP
class SupportPageTest(unittest.TestCase):
    """Help -> Contact the seller on a 360 px phone in Arabic and English: the self-check, the preview and the support window."""

    @classmethod
    def setUpClass(cls):
        cls.fake = FakeCenter()
        cls.srv = Server('support-page').start()
        cls.admin = make_authority(cls.srv)
        cls.admin.post('/api/support/link', {'url': cls.fake.url, 'token': TOKEN})

    @classmethod
    def tearDownClass(cls):
        cls.srv.cleanup()
        cls.fake.stop()

    def test_page_in_both_languages(self):
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        b = pw.chromium.launch(executable_path=CHROMIUM)
        self.addCleanup(b.close)
        for lang in ('ar', 'en'):
            with self.subTest(lang=lang):
                ctx = b.new_context(viewport={'width': 360, 'height': 800})
                ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: '%s'}))" % lang)
                pg = ctx.new_page()
                errors = []
                pg.on('pageerror', lambda e: errors.append(str(e)))
                pg.goto(self.srv.base)
                pg.wait_for_selector('#auth-form')
                pg.fill('#username', 'boss')
                pg.fill('#password', 'Strong-pass1')
                pg.click('button[type=submit]')
                pg.wait_for_selector('#app-shell')
                pg.goto(self.srv.base + '/#/help?view=support')
                pg.wait_for_selector('[data-check="backup"]')
                pg.wait_for_selector('[data-supform]')
                text = pg.inner_text('[data-support]')
                self.assertNotIn('sup.', text)                       # no raw dictionary key on screen
                pg.select_option('[data-supwin] [name=minutes]', '60')
                pg.click('[data-supopen]')
                pg.wait_for_selector('.sup-code')
                self.assertIn('123-456-789', pg.inner_text('.sup-code'))
                pg.click('[data-supend]')
                pg.wait_for_selector('[data-supwin]')
                self.assertLessEqual(pg.evaluate('document.documentElement.scrollWidth'), 362)
                self.assertEqual(errors, [])
                ctx.close()
