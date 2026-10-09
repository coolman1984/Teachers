"""Hessa online and the owner's phone (owner's request, 2026-10-07): a real gateway (gateway/dev/server.js, the Worker code on a
local stand-in for Cloudflare D1) run as the seller's service, a real centre server with a subscription, and Chromium as the
owner's phone. The centre joins with its subscription code, the owner's phone sees today's money and what the staff did within
one round, never a phone number, and a removed phone stops at once."""
import json
import os
import subprocess
import sys
import unittest
import urllib.error
import urllib.request
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ApiError, Server, make_authority  # noqa: E402
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright  # noqa: E402
from test_gateway_parent import free_port, node_ok  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))
import domain as D  # noqa: E402
import ed25519  # noqa: E402
import gateway_client as gwc  # noqa: E402
import license as L  # noqa: E402

SEED = ed25519.generate()
PUB = ed25519.public_key(SEED)
HERE_PC = 'synthetic-guid-owner-centre'


class Service:
    """The seller's gateway: no OFFICE_SECRET, only centres that join with a subscription code signed by SEED."""

    def __init__(self, **extra):
        self.port = free_port()
        env = {**os.environ, 'PORT': str(self.port), 'OFFICE_SECRET': '', 'GATEWAY_DB': ':memory:', 'SELLER_PUB': PUB.hex(), **extra}
        self.p = subprocess.Popen(['node', '--no-warnings', os.path.join(ROOT, 'gateway', 'dev', 'server.js')], env=env,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        line = self.p.stdout.readline()
        if 'READY' not in line:
            raise RuntimeError('gateway did not start: ' + line)
        self.url = f'http://127.0.0.1:{self.port}'

    def stop(self):
        if self.p.poll() is None:
            self.p.terminate()
            self.p.wait(10)
        self.p.stdout.close()

    def owner(self, key):
        req = urllib.request.Request(self.url + '/api/owner', headers={'Authorization': 'Bearer ' + key})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}')


@unittest.skipUnless(node_ok(), 'node 22+ with node:sqlite is needed for the local gateway')
class OwnerOnlineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = {k: os.environ.get(k) for k in ('HS_LICENSE_PUB', 'HS_MACHINE_ID')}
        os.environ['HS_LICENSE_PUB'] = PUB.hex()
        os.environ['HS_MACHINE_ID'] = HERE_PC
        cls.addClassCleanup(cls.restore_env)
        cls.gw = Service()
        cls.addClassCleanup(cls.gw.stop)
        cls.s = Server('owner', extra_cfg={'license_required': True, 'service_url': cls.gw.url}).start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.c = make_authority(cls.s)
        c, today = cls.c, date.today()
        code = L.make_code(SEED, L.KIND_ACTIVATE, [L.machine_hash(HERE_PC)], until=today + timedelta(days=30), serial=77)
        assert c.post('/api/license/activate', {'code': code})['state'] == 'ok'
        wd = D.weekday(today)
        ops = [('subjects', 'ow-sub', {'name': 'Physics'}), ('teachers', 'ow-t', {'name': 'Synthetic Teacher', 'mobile': '01099999998'}),
               ('groups', 'ow-g', {'name': 'Owner Physics S1', 'teacherId': 'ow-t', 'subjectId': 'ow-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 80,
                                   'capacity': 30, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}),
               ('students', 'ow-a', {'code': '51001', 'name': 'Synthetic Owner Child', 'gradeCode': 'S1', 'parentMobile': '01055556666', 'active': True})]
        c.post('/api/commit', {'label': 'Owner fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        c.post('/api/c/enroll', {'studentId': 'ow-a', 'groupId': 'ow-g'})
        c.post('/api/c/checkin', {'studentId': 'ow-a', 'sessionId': D.session_id('ow-g', today, '00:00')})
        c.post('/api/c/shift/open', {'opening': 100})
        c.post('/api/c/pay', {'studentId': 'ow-a', 'groupId': 'ow-g', 'kind': 'fee', 'amount': 160, 'method': 'cash'})

    @classmethod
    def restore_env(cls):
        for k, v in cls.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_a_join_then_the_owner_phone_sees_the_centre_live(self):
        c = self.c
        st = c.get('/api/gateway')
        self.assertTrue(st['service'] and st['licensed'] and not st['centre'])
        with self.assertRaises(ApiError) as caught:                  # a phone before the centre is online
            c.post('/api/owner/phones', {'label': 'Too early'})
        self.assertEqual(caught.exception.data.get('key'), 'own.err.noGateway')
        c.post('/api/gateway/join', {})
        st = c.get('/api/gateway')
        self.assertTrue(st['centre'] and st['configured'])
        c.post('/api/gateway/send', {})
        self.assertEqual(c.get('/api/gateway')['until'], (date.today() + timedelta(days=30)).isoformat())

        r = c.post('/api/owner/phones', {'label': 'My phone'})
        self.assertTrue(r['link'].startswith(self.gw.url + '/o/#k=Ow_'))
        key = r['link'].split('#k=', 1)[1]
        self.assertEqual(c.get('/api/owner/phones')['phones'][0]['label'], 'My phone')
        self.assertNotIn(key, json.dumps(c.get('/api/state')), 'the key itself is never kept in the shared data')
        c.post('/api/gateway/send', {})
        code, j = self.gw.owner(key)
        self.assertEqual(code, 200)
        s = j['state']
        self.assertEqual(s['today']['income'], 160)
        self.assertEqual(s['today']['receipts'], 1)
        self.assertGreaterEqual(s['today']['checkedIn'], 1)
        self.assertEqual(s['drawers'][0]['cash'], 260)                 # opening 100 + 160 cash
        texts = ' '.join(f['ar'] for f in s['feed'])
        self.assertIn('Synthetic Owner Child', texts)
        self.assertIn('إيصال', texts)
        self.assertIn('حضر', texts)
        self.assertTrue(any(n['group'] == 'Owner Physics S1' and n['present'] == 1 for n in s['now']))
        self.assertEqual(s['owing'], [])                                # paid two sessions ahead
        dump = json.dumps(j, ensure_ascii=False)
        for secret in ('01055556666', '01099999998'):
            self.assertNotIn(secret, dump, 'no phone numbers on the owner page')

        # a change reaches the phone on the next round; another PC of the centre gets the centre id in the setup code
        c.post('/api/c/expense', {'amount': 25, 'category': 'other', 'note': 'Synthetic chalk', 'method': 'cash'})
        c.post('/api/gateway/send', {})
        s = self.gw.owner(key)[1]['state']
        self.assertEqual(s['today']['expenses'], 25)
        self.assertEqual(s['today']['net'], 135)
        self.assertIn('Synthetic chalk', ' '.join(f['en'] for f in s['feed']))
        code_text = c.get('/api/gateway/code')['code']
        other = gwc.Secrets(os.path.join(self.s.root, 'other-gateway.json'))
        other.from_code(code_text)
        self.assertRegex(other.centre, r'^[0-9a-f]{32}$')

        # removing the phone stops it at once
        pid = c.get('/api/owner/phones')['phones'][0]['id']
        c.post('/api/owner/phones/remove', {'id': pid})
        c.post('/api/gateway/send', {})
        self.assertEqual(self.gw.owner(key)[0], 401)
        events = [r['event'] for r in c.get('/api/security?limit=50')['rows']]
        self.assertIn('owner-phone', events)

    def test_b_only_administrators_manage_the_owner_phones(self):
        c = self.c
        profiles = {p['name']: p['perms'] for p in c.get('/api/users')['profiles']}
        c.post('/api/users/save', {'username': 'desk.ow', 'full_name': 'Synthetic Desk', 'password': 'Reception-key-9', 'must_change': False,
                                   'role': 'Front desk', 'perms': profiles['Front desk']})
        desk = self.s.client()
        desk.login('desk.ow', 'Reception-key-9')
        for call in (lambda: desk.get('/api/owner/phones'), lambda: desk.post('/api/owner/phones', {'label': 'x'}),
                     lambda: desk.post('/api/owner/phones/remove', {'id': 'x'})):
            with self.assertRaises(ApiError) as caught:
                call()
            self.assertIn(caught.exception.code, (400, 403))
        # not even an administrator writes them through the general save (a non-administrator with "settings" could add his phone)
        for sid in ('ownerPhones', 'waAuto'):
            for who in (self.c, desk):
                with self.assertRaises(ApiError):
                    who.post('/api/commit', {'label': 'x', 'ops': [{'e': 'settings', 'id': sid, 'op': 'put', 'row': {'value': {'phones': []}}}]})

    @SKIP
    def test_c_the_phone_page(self):
        c = self.c
        if not c.get('/api/gateway')['centre']:
            c.post('/api/gateway/join', {})
        key = c.post('/api/owner/phones', {'label': 'Browser phone'})['link'].split('#k=', 1)[1]
        c.post('/api/gateway/send', {})
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        b = pw.chromium.launch(executable_path=CHROMIUM)
        self.addCleanup(b.close)
        page = b.new_page(viewport={'width': 360, 'height': 740})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(self.gw.url + '/o/#k=' + key)
        page.wait_for_selector('text=دخل اليوم', timeout=15000)
        self.assertEqual(page.evaluate('location.hash'), '', 'the key leaves the address bar at once')
        self.assertIn('Synthetic Owner Child', page.inner_text('main'))
        self.assertEqual(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), True, 'no sideways scrolling on a phone')
        page.click('[data-lang]')
        page.wait_for_selector("text=Today's income")
        page.reload()
        page.wait_for_selector("text=Today's income")            # the key and the language stay on the phone
        self.assertEqual(errors, [])
