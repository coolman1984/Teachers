"""The monthly subscription (server/license.py, tools/seller.py): codes that only the seller can make, that work only on
the PC they were made for, that cannot be brought back by moving the clock, and a centre whose data is never held
hostage when the subscription ends (owner's request, 2026-10-07)."""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ApiError, Server, make_authority  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import ed25519  # noqa: E402
import license as L  # noqa: E402

SEED = ed25519.generate()
PUB = ed25519.public_key(SEED)
OTHER = ed25519.generate()
HERE_PC, OTHER_PC = 'synthetic-guid-centre', 'synthetic-guid-elsewhere'


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


class CodesTest(unittest.TestCase):
    def setUp(self):
        os.environ['HS_LICENSE_PUB'] = PUB.hex()
        os.environ['HS_MACHINE_ID'] = HERE_PC
        self.addCleanup(os.environ.pop, 'HS_LICENSE_PUB', None)
        self.addCleanup(os.environ.pop, 'HS_MACHINE_ID', None)
        self.home = tempfile.mkdtemp(prefix='hs-lic-')
        self.addCleanup(shutil.rmtree, self.home, True)
        self.clock = Clock(datetime(2026, 10, 7, 10, 0))
        self.data = [None, None]
        self.lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock)

    def code(self, until, machines=None, seed=SEED, serial=1, issued=date(2026, 10, 7)):
        return L.make_code(seed, L.KIND_ACTIVATE, machines or [L.machine_hash(HERE_PC)], until=until, issued=issued, serial=serial)

    def test_a_codes_survive_dashes_case_and_catch_one_wrong_letter(self):
        c = self.code(date(2026, 11, 6))
        self.assertEqual(L.read_code(c.lower().replace('-', ' '), PUB)['until'], date(2026, 11, 6))
        i = c.index('-') + 2
        bad = c[:i] + ('B' if c[i] != 'B' else 'C') + c[i + 1:]
        with self.assertRaises(ValueError):
            L.read_code(bad, PUB)
        with self.assertRaises(ValueError):                    # made with another key: a "key generator" cannot exist
            L.read_code(self.code(date(2026, 11, 6), seed=OTHER), PUB)
        r = self.lic.request()
        self.assertEqual(L.read_request(r)[1], L.machine_hash(HERE_PC))

    def test_b_trial_then_activation_warning_grace_and_lock(self):
        st = self.lic.status()
        self.assertEqual((st['state'], st['daysLeft']), ('trial', L.TRIAL_DAYS))
        self.clock.t += timedelta(days=L.TRIAL_DAYS)
        self.assertEqual(self.lic.status()['state'], 'trialEnded')
        self.assertTrue(self.lic.blocked())
        self.lic.activate(self.code(date(2026, 11, 13), issued=date(2026, 10, 14)), 'Owner')
        self.assertEqual(self.lic.status()['state'], 'ok')
        self.assertFalse(self.lic.blocked())
        self.clock.t = datetime(2026, 11, 8, 9, 0)
        st = self.lic.status()
        self.assertEqual((st['state'], st['daysLeft']), ('warn', 6))
        self.clock.t = datetime(2026, 11, 14, 9, 0)
        st = self.lic.status()
        self.assertEqual((st['state'], st['graceLeft']), ('grace', 3))   # 14, 15 and 16 November
        self.assertFalse(self.lic.blocked())
        self.clock.t = datetime(2026, 11, 16, 21, 0)
        self.assertEqual(self.lic.status()['state'], 'grace')
        self.clock.t = datetime(2026, 11, 17, 9, 0)
        self.assertEqual(self.lic.status()['state'], 'locked')
        self.assertTrue(self.lic.blocked())
        self.lic.activate(self.code(date(2026, 12, 15), serial=2, issued=date(2026, 11, 17)))
        self.assertEqual(self.lic.status()['state'], 'ok')

    def test_c_another_pc_an_old_code_and_an_ended_code_are_refused(self):
        for code, reason in ((self.code(date(2026, 11, 6), machines=[L.machine_hash(OTHER_PC)]), 'otherPc'),
                             (self.code(date(2026, 10, 1), issued=date(2026, 9, 1)), 'expired'),
                             ('ABCDE-FGHJK', 'typo'),
                             (self.code(date(2026, 11, 6), seed=OTHER), 'forged')):
            with self.assertRaises(ValueError) as caught:
                self.lic.activate(code)
            self.assertEqual(str(caught.exception), reason)
        self.lic.activate(self.code(date(2026, 12, 6), serial=5))
        with self.assertRaises(ValueError) as caught:            # last month's code cannot replace this month's
            self.lic.activate(self.code(date(2026, 11, 6), serial=4))
        self.assertEqual(str(caught.exception), 'older')
        # one code for the two PCs of a centre
        both = L.License(self.home, lambda: (None, None), now=self.clock)
        both.activate(self.code(date(2026, 12, 20), machines=[L.machine_hash(OTHER_PC), L.machine_hash(HERE_PC)], serial=9))
        self.assertEqual(both.status()['until'], '2026-12-20')

    def test_d_the_data_folder_copied_to_another_pc_needs_its_own_code(self):
        self.lic.activate(self.code(date(2026, 11, 6)))
        os.environ['HS_MACHINE_ID'] = OTHER_PC
        copy = L.License(self.home, lambda: (None, None), now=self.clock)
        st = copy.status()
        self.assertFalse(st['machineOk'])
        self.assertIn(st['state'], ('trial', 'trialEnded'))
        self.assertNotEqual(copy.request(), self.lic.request())

    def test_e_moving_the_clock_back_stops_saving_instead_of_giving_days(self):
        self.lic.activate(self.code(date(2026, 11, 6)))
        self.clock.t = datetime(2026, 11, 20, 9, 0)                # time passes: ended
        self.assertTrue(self.lic.blocked())
        self.clock.t = datetime(2026, 10, 20, 9, 0)                # the clock is moved back a month
        st = self.lic.status()
        self.assertEqual(st['state'], 'clock')
        self.assertTrue(self.lic.blocked())
        os.remove(os.path.join(self.home, 'license.json'))         # ... and the license file deleted: the data still remembers
        self.data = ['2026-11-20T09:00:00', '2026-10-01T08:00:00']
        again = L.License(self.home, lambda: tuple(self.data), now=self.clock)
        self.assertEqual(again.status()['state'], 'clock')
        self.clock.t = datetime(2026, 11, 21, 9, 0)                # the clock put right: the trial does not start again either
        self.assertEqual(again.status()['state'], 'trialEnded')     # it started with the oldest data, 2026-10-01

    def test_f_a_reset_code_answers_one_request_once(self):
        req = self.lic.reset_request()
        kind, machine, nonce = L.read_request(req)
        code = L.make_code(SEED, L.KIND_RESET, [machine], nonce=nonce)
        with self.assertRaises(ValueError):
            self.lic.activate(code)                                 # not an activation
        self.assertTrue(self.lic.use_reset(code))
        with self.assertRaises(ValueError) as caught:
            self.lic.use_reset(code)
        self.assertEqual(str(caught.exception), 'used')

    def test_g_the_sellers_tool_makes_codes_only_with_the_matching_key(self):
        import subprocess
        tool = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'seller.py')
        home = tempfile.mkdtemp(prefix='hs-seller-')
        self.addCleanup(shutil.rmtree, home, True)
        with open(os.path.join(home, 'hessa-seller.key'), 'w') as f:
            f.write(SEED.hex())
        env = dict(os.environ, HESSA_SELLER_HOME=home)
        out = subprocess.run([sys.executable, tool, 'issue', self.lic.request(), '--days', '31', '--centre', 'Synthetic Centre'],
                             capture_output=True, text=True, env=env)
        self.assertEqual(out.returncode, 0, out.stderr)
        code = out.stdout.strip().splitlines()[-1]
        self.assertEqual(self.lic.activate(code)['until'], (date.today() + timedelta(days=30)).isoformat())
        self.assertIn('Synthetic Centre', open(os.path.join(home, 'issued.csv'), encoding='utf-8-sig').read())
        with open(os.path.join(home, 'hessa-seller.key'), 'w') as f:
            f.write(OTHER.hex())
        out = subprocess.run([sys.executable, tool, 'issue', self.lic.request()], capture_output=True, text=True, env=env)
        self.assertNotEqual(out.returncode, 0)


class ServerTest(unittest.TestCase):
    """The running program: an ended subscription stops saving but never reading, backing up or exporting."""

    def setUp(self):
        self.env = {k: os.environ.get(k) for k in ('HS_LICENSE_PUB', 'HS_MACHINE_ID')}
        os.environ['HS_LICENSE_PUB'] = PUB.hex()
        os.environ['HS_MACHINE_ID'] = HERE_PC
        self.s = Server('licence', extra_cfg={'license_required': True})
        self.addCleanup(self.s.cleanup)
        self.addCleanup(self.restore_env)
        os.makedirs(self.s.data_dir, exist_ok=True)
        ended = L.make_code(SEED, L.KIND_ACTIVATE, [L.machine_hash(HERE_PC)], until=date.today() - timedelta(days=10),
                            issued=date.today() - timedelta(days=40), serial=1)
        with open(os.path.join(self.s.data_dir, 'license.json'), 'w') as f:
            json.dump({'code': ended}, f)
        self.s.start()
        self.admin = make_authority(self.s)

    def restore_env(self):
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_locked_reads_backs_up_and_activates(self):
        a = self.admin
        st = a.get('/api/license')
        self.assertEqual(st['state'], 'locked')
        self.assertIn('request', st)
        with self.assertRaises(ApiError) as caught:
            a.post('/api/commit', {'label': 'x', 'ops': [{'e': 'subjects', 'id': 'lc-sub', 'op': 'put', 'row': {'name': 'Locked subject'}}]})
        self.assertEqual(caught.exception.data.get('key'), 'err.license.locked')
        a.get('/api/state')                                            # reading still works
        a.post('/api/backups', {})                                     # so does a backup
        self.assertEqual(a.get('/api/version')['license']['state'], 'locked')
        wrong = L.make_code(SEED, L.KIND_ACTIVATE, [L.machine_hash(OTHER_PC)], until=date.today() + timedelta(days=30), serial=3)
        with self.assertRaises(ApiError) as caught:
            a.post('/api/license/activate', {'code': wrong})
        self.assertEqual(caught.exception.data.get('key'), 'err.code.otherPc')
        good = L.make_code(SEED, L.KIND_ACTIVATE, [L.machine_hash(HERE_PC)], until=date.today() + timedelta(days=30), serial=4)
        self.assertEqual(a.post('/api/license/activate', {'code': good})['state'], 'ok')
        a.post('/api/commit', {'label': 'x', 'ops': [{'e': 'subjects', 'id': 'lc-sub', 'op': 'put', 'row': {'name': 'Unlocked subject'}}]})
        events = [r['event'] for r in a.get('/api/security?limit=50')['rows']]
        self.assertIn('license-activated', events)
        self.assertIn('license-refused', events)

    def test_forgotten_administrator_password(self):
        c = self.s.client()
        req = c.post('/api/auth/forgot/request', {})['request']
        _, machine, nonce = L.read_request(req)
        reset = L.make_code(SEED, L.KIND_RESET, [machine], nonce=nonce)
        with self.assertRaises(ApiError) as caught:                    # a reset code made with another key
            c.post('/api/auth/forgot/reset', {'code': L.make_code(OTHER, L.KIND_RESET, [machine], nonce=nonce), 'username': 'boss', 'password': 'New-Owner-Pass-9'})
        self.assertEqual(caught.exception.data.get('key'), 'err.reset.forged')
        me = c.post('/api/auth/forgot/reset', {'code': reset, 'username': 'boss', 'password': 'New-Owner-Pass-9'})
        self.assertTrue(me['admin'])
        self.s.client().login('boss', 'New-Owner-Pass-9')
        with self.assertRaises(ApiError):                              # one use only
            c.post('/api/auth/forgot/reset', {'code': reset, 'username': 'boss', 'password': 'Other-Owner-Pass-9'})
        with self.assertRaises(ApiError) as caught:                    # never from outside the centre PC
            c.call('POST', '/api/auth/forgot/request', {}, headers={'X-Forwarded-For': '203.0.113.9'})
        self.assertIn(caught.exception.code, (403,))


if __name__ == '__main__':
    unittest.main()
