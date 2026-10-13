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


class FakeMono:
    def __init__(self, t=0.0):
        self.t = t

    def __call__(self):
        return self.t

    def advance(self, sec):
        self.t += sec


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

    def test_i_weekend_idle_does_not_charge_the_new_day(self):
        self.lic.activate(self.code(date(2026, 12, 6)))
        self.clock.t = datetime(2026, 11, 7, 18, 0)
        mono = FakeMono()
        lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, monotonic=mono)
        lic.status()
        mono.advance(4 * 3600)
        lic.status()
        self.clock.t = datetime(2026, 11, 10, 9, 0)
        mono.advance(80 * 3600)
        again = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, monotonic=mono)
        st = again.status()
        self.assertIn(st['state'], ('ok', 'warn'))
        self.assertLess(float(again.data['runSec']), L.RUN_LIMIT.total_seconds())

    def test_j_stepping_the_clock_back_across_midnight_keeps_runtime(self):
        self.lic.activate(self.code(date(2026, 12, 6)))
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 20 * 3600)
        lic.status()
        self.clock.t = datetime(2026, 11, 11, 1, 0)
        L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 0).status()
        self.clock.t = datetime(2026, 11, 10, 23, 0)
        lic3 = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 11 * 3600)
        st = lic3.status()
        self.assertEqual(st['state'], 'clock')
        self.assertTrue(lic3.blocked())

    def test_k_runtime_persists_across_two_restarts(self):
        self.lic.activate(self.code(date(2026, 12, 6)))
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        path = os.path.join(self.home, 'license.json')
        L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 15 * 3600).status()
        with open(path, encoding='utf-8') as f:
            saved = json.load(f)
        self.assertAlmostEqual(float(saved['runSec']), 15 * 3600, delta=1)
        mid = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 16 * 3600)
        self.assertEqual(mid.status()['state'], 'clock')
        end = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 0)
        self.assertEqual(end.status()['state'], 'clock')
        self.assertTrue(end.blocked())

    def test_l_status_polls_do_not_rewrite_license_json_every_tick(self):
        self.lic.activate(self.code(date(2026, 12, 6)))
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        path = os.path.join(self.home, 'license.json')
        lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 3600)
        lic.status()
        mtime = os.path.getmtime(path)
        for _ in range(8):
            L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 0).status()
        self.assertEqual(os.path.getmtime(path), mtime)

    def test_m_yesterday_use_then_clock_back_does_not_clear_frozen_lock(self):
        """A normal day before plus a ~1h step back across midnight must not clear a frozen-date lock."""
        serial = 7
        self.lic.activate(self.code(date(2026, 11, 10), serial=serial))
        self.clock.t = datetime(2026, 11, 9, 10, 0)
        L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 10 * 3600).status()
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 31 * 3600).status()
        self.assertEqual(L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock).status()['state'], 'clock')
        self.clock.t = datetime(2026, 11, 11, 0, 30)
        self.assertEqual(L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock).status()['state'], 'clock')
        self.clock.t = datetime(2026, 11, 10, 23, 30)
        self.assertEqual(L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock).status()['state'], 'clock')

    def test_n_runtime_before_the_first_status_counts(self):
        self.lic.activate(self.code(date(2026, 12, 6), serial=3))
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        mono = FakeMono()
        lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, monotonic=mono)
        mono.advance(2 * 3600)
        lic.status()
        self.assertAlmostEqual(float(lic.data['runSec']), 2 * 3600, delta=1)

    def test_o_nightly_shutdowns_accumulate_on_a_frozen_date(self):
        self.lic.activate(self.code(date(2026, 11, 10), serial=4))
        self.clock.t = datetime(2026, 11, 10, 18, 0)
        for _ in range(4):
            lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 8 * 3600)
            lic.status()
            lic.flush_runtime()
        st = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock).status()
        self.assertEqual(st['state'], 'clock')

    def test_p_restoring_old_license_json_cannot_drop_runtime_peak(self):
        serial = 8
        self.lic.activate(self.code(date(2026, 11, 10), serial=serial))
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 31 * 3600).status()
        path = os.path.join(self.home, 'license.json')
        with open(path, encoding='utf-8') as f:
            good = json.load(f)
        stale = {k: v for k, v in good.items() if k not in ('runDay', 'runSec', 'runPeak', 'runPeakEcho', 'runCarry')}
        stale['runDay'] = '2026-11-10'
        stale['runSec'] = 0
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(stale, f)
        self.assertEqual(L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock).status()['state'], 'clock')

    def test_q_reentering_the_same_activation_code_keeps_runtime_peak(self):
        serial = 9
        code = self.code(date(2026, 11, 10), serial=serial)
        self.lic.activate(code)
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 31 * 3600).status()
        again = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock)
        with self.assertRaises(ValueError) as caught:
            again.activate(code)
        self.assertEqual(str(caught.exception), 'clock')
        self.assertEqual(again.status()['state'], 'clock')

    def test_h_freezing_the_wall_clock_date_cannot_keep_a_paid_month(self):
        self.lic.activate(self.code(date(2026, 12, 6)))
        self.clock.t = datetime(2026, 11, 10, 10, 0)
        chunks = iter([12 * 3600, 19 * 3600])

        def elapsed():
            return next(chunks, 0)

        lic = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=elapsed)
        self.assertIn(lic.status()['state'], ('ok', 'warn'))
        st = lic.status()
        self.assertEqual(st['state'], 'clock')
        self.assertTrue(lic.blocked())
        again = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 0)
        self.assertEqual(again.status()['state'], 'clock')
        with self.assertRaises(ValueError) as caught:
            again.activate(self.code(date(2026, 12, 20), serial=2))
        self.assertEqual(str(caught.exception), 'clock')
        self.clock.t = datetime(2026, 11, 11, 10, 0)
        fresh = L.License(self.home, lambda: tuple(self.data), required=True, now=self.clock, elapsed=lambda: 0)
        self.assertEqual(fresh.status()['state'], 'ok')

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
