"""Work from outside the centre (review D01-D08). A tunnel on the centre PC (Tailscale serve, Cloudflare Tunnel) hands internet
requests to the program from 127.0.0.1 with its own headers. Such a request must never count as "the PC itself", is refused while
the owner has not switched remote work on, and then only people with the remote.use permission can sign in. Every sign-in from
outside is logged; the session cookie is Secure behind HTTPS; a payment retried after a lost answer is taken once."""
import json
import os
import sys
import unittest
import urllib.error
import urllib.request
from datetime import date

from harness import ADMIN, ApiError, Server, make_authority

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402

TUNNEL = {'X-Forwarded-For': '41.33.10.7', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'hessa.example.com', 'Host': 'hessa.example.com'}


class Remote:
    """A phone at home: every request arrives through the tunnel; keeps its cookie itself (it is Secure, the test talks plain HTTP)."""

    def __init__(self, base, extra=None):
        self.base, self.cookie, self.headers, self.last = base, '', {**TUNNEL, **(extra or {})}, None

    def call(self, method, path, body=None, origin=None):
        h = {**self.headers, 'Content-Type': 'application/json'}
        if self.cookie:
            h['Cookie'] = self.cookie
        if origin:
            h['Origin'] = origin
        req = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                self.last = r
                raw, ctype = r.read(), r.headers.get('Content-Type', '')
                set_cookie = r.headers.get('Set-Cookie')
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                data = json.loads(raw)
            except ValueError:
                data = {'html': raw.decode('utf-8', 'replace')}
            raise ApiError(e.code, data.get('error'), data)
        if set_cookie:
            self.set_cookie = set_cookie
            self.cookie = set_cookie.split(';', 1)[0]
        return json.loads(raw) if 'json' in ctype else raw

    def get(self, path):
        return self.call('GET', path)

    def post(self, path, body=None, origin='https://hessa.example.com'):
        return self.call('POST', path, body if body is not None else {}, origin)


class RemoteWorkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server('remote').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = make_authority(cls.s)
        base = ['overview.view', 'door.use', 'students.view', 'attendance.mark', 'money.collect']
        for name, perms in (('home.desk', base), ('home.owner', base + ['remote.use'])):
            cls.admin.post('/api/users/save', {'username': name, 'full_name': 'Synthetic ' + name, 'password': 'Tulip-river-5521',
                                                'must_change': False, 'perms': perms, 'scopes': None})

    def setUp(self):
        self.admin.post('/api/remote', {'on': False})

    def refused(self, fn, code=403, key=None):
        with self.assertRaises(ApiError) as e:
            fn()
        self.assertEqual(e.exception.code, code)
        if key:
            self.assertEqual(e.exception.data.get('key'), key)
        return e.exception

    def test_a_switched_off_by_default_and_the_page_says_so(self):
        self.assertFalse(self.admin.get('/api/remote')['on'])
        r = Remote(self.s.base)
        self.refused(lambda: r.get('/api/auth/status'), key='err.remoteOff')
        e = self.refused(lambda: r.get('/'))
        self.assertIn('العمل من خارج المركز متوقف', e.data['html'])
        self.refused(lambda: r.post('/api/auth/login', {'username': 'home.owner', 'password': 'Tulip-river-5521'}), key='err.remoteOff')

    def test_b_a_tunnel_request_is_never_the_pc_itself(self):
        self.admin.post('/api/remote', {'on': True})
        for extra in ({}, {'X-Forwarded-For': '127.0.0.1'}, {'X-Forwarded-For': 'not an ip'}, {'Cf-Connecting-Ip': '::1', 'X-Forwarded-For': ''}):
            st = Remote(self.s.base, extra).get('/api/auth/status')
            self.assertFalse(st['local'], extra)                                 # first start, joining... stay closed
        self.assertTrue(self.s.client().get('/api/auth/status')['local'])          # the PC's own browser still is local
        r = Remote(self.s.base)
        self.refused(lambda: r.post('/api/join', {'address': 'x', 'code': '1'}))

    def test_c_only_people_with_the_permission_sign_in_and_it_is_logged(self):
        self.admin.post('/api/remote', {'on': True})
        desk = Remote(self.s.base)
        self.refused(lambda: desk.post('/api/auth/login', {'username': 'home.desk', 'password': 'Tulip-river-5521'}))
        self.refused(lambda: desk.get('/api/state'), code=401)                    # the session was ended at once
        owner = Remote(self.s.base)
        owner.post('/api/auth/login', {'username': 'home.owner', 'password': 'Tulip-river-5521'})
        self.assertIn('Secure', owner.set_cookie)
        self.assertIn('HttpOnly', owner.set_cookie)
        self.assertEqual(owner.get('/api/auth/status')['me']['username'], 'home.owner')
        self.assertIn('max-age', owner.last.headers.get('Strict-Transport-Security') or '')
        log = self.admin.get('/api/security?limit=50')
        rows = log['rows'] if isinstance(log, dict) else log
        events = {(x['event'], x['ip']) for x in rows}
        self.assertIn(('remote-refused', '41.33.10.7'), events)                   # the real address, not 127.0.0.1
        self.assertIn(('remote-login', '41.33.10.7'), events)
        # a permission taken away mid-session ends the remote work at the next request
        def save(perms):
            u = next(x for x in self.admin.get('/api/users')['users'] if x['username'] == 'home.owner')
            self.admin.post('/api/users/save', {**{k: u[k] for k in ('id', 'username', 'full_name', 'ver') if k in u}, 'perms': perms, 'scopes': None, 'must_change': False})
        save(['overview.view', 'door.use'])
        self.refused(lambda: owner.get('/api/state'))
        save(['overview.view', 'door.use', 'students.view', 'attendance.mark', 'money.collect', 'remote.use'])

    def test_d_switching_on_happens_at_the_centre_only_off_from_anywhere(self):
        self.admin.post('/api/remote', {'on': True})
        boss = Remote(self.s.base)
        boss.post('/api/auth/login', {'username': ADMIN[0], 'password': ADMIN[1]})
        boss.post('/api/remote', {'on': False})                                     # stopping from home is allowed
        self.assertFalse(self.admin.get('/api/remote')['on'])
        self.admin.post('/api/remote', {'on': True})
        self.refused(lambda: boss.post('/api/remote', {'on': True}))              # already on: still never from outside
        st = self.admin.get('/api/remote')
        self.assertTrue(st['on'] and st['here'])
        self.assertEqual(st['seen']['ip'], '41.33.10.7')
        self.assertIn('Synthetic home.owner', st['people'])

    def test_e_another_web_site_cannot_post_through_the_tunnel(self):
        self.admin.post('/api/remote', {'on': True})
        r = Remote(self.s.base)
        self.refused(lambda: r.post('/api/auth/login', {'username': 'home.owner', 'password': 'Tulip-river-5521'}, origin='https://evil.example'))
        r.post('/api/auth/login', {'username': 'home.owner', 'password': 'Tulip-river-5521'})   # its own address is fine

    def test_f_a_payment_from_home_retried_after_a_lost_answer_is_taken_once(self):
        self.admin.post('/api/remote', {'on': True})
        wd = D.weekday(date.today())
        self.admin.post('/api/commit', {'label': 'fixture', 'ops': [
            {'e': 'teachers', 'id': 'rm-t', 'op': 'put', 'row': {'name': 'Synthetic Remote Teacher'}},
            {'e': 'groups', 'id': 'rm-g', 'op': 'put', 'row': {'name': 'Remote Group', 'teacherId': 'rm-t', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 40,
                                                              'capacity': 20, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}},
            {'e': 'students', 'id': 'rm-s', 'op': 'put', 'row': {'code': '44001', 'name': 'Synthetic Remote Student', 'gradeCode': 'S1', 'consent': True, 'active': True}}]})
        self.admin.post('/api/c/enroll', {'studentId': 'rm-s', 'groupId': 'rm-g'})
        r = Remote(self.s.base)
        r.post('/api/auth/login', {'username': 'home.owner', 'password': 'Tulip-river-5521'})
        r.post('/api/c/shift/open', {'opening': 0})
        body = {'studentId': 'rm-s', 'groupId': 'rm-g', 'kind': 'fee', 'amount': 40, 'method': 'vodafone', 'ref': 'VF-1', 'key': 'aa11bb22cc33dd44'}
        a, b = r.post('/api/c/pay', body), r.post('/api/c/pay', body)
        self.assertEqual(a['no'], b['no'])
        self.assertEqual(len([p for p in self.admin.get('/api/state')['payments'] if p['studentId'] == 'rm-s']), 1)
        self.assertTrue(a['by'].startswith('Synthetic home.owner'))                # the history says who did it


class TailnetTest(unittest.TestCase):
    """A Tailscale device reaching the program straight on its address counts as outside the centre too."""

    def test_tailnet_addresses_are_outside(self):
        import ast
        import ipaddress
        src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server', 'app.py'), encoding='utf-8').read()
        fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == 'in_tailnet')
        scope = {'ipaddress': ipaddress}
        exec(compile(ast.Module([fn], []), 'app.py', 'exec'), scope)
        in_tailnet = scope['in_tailnet']
        for ip in ('100.64.0.1', '100.101.102.103', '100.127.255.254', 'fd7a:115c:a1e0::1', '::ffff:100.100.1.1'):
            self.assertTrue(in_tailnet(ip), ip)
        for ip in ('192.168.1.10', '10.0.0.5', '127.0.0.1', '100.63.255.255', '100.128.0.1', 'nonsense', ''):
            self.assertFalse(in_tailnet(ip), ip)


if __name__ == '__main__':
    unittest.main()
