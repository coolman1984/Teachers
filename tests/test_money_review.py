"""Full review of the money and attendance core (2026-10-07): each test is a mistake a real centre could make that used to
lose money, charge twice, or make a debt disappear."""
import os
import sys
import unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ApiError, Server, make_authority  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402


class MoneyReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server('money-review').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.c = c = make_authority(cls.s)
        today = date.today()
        slot = [{'day': D.weekday(today), 'start': '00:00', 'end': '23:59'}]
        ops = [('subjects', 'mr-sub', {'name': 'Math'}), ('teachers', 'mr-t', {'name': 'Synthetic Teacher'}),
               ('groups', 'mr-gs', {'name': 'MR session', 'teacherId': 'mr-t', 'subjectId': 'mr-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 50,
                                    'capacity': 100, 'active': True, 'slots': slot}),
               ('groups', 'mr-gm', {'name': 'MR month', 'teacherId': 'mr-t', 'subjectId': 'mr-sub', 'gradeCode': 'S1', 'feeType': 'month', 'fee': 300,
                                    'capacity': 100, 'active': True, 'slots': []}),
               ('groups', 'mr-gm2', {'name': 'MR month 2', 'teacherId': 'mr-t', 'subjectId': 'mr-sub', 'gradeCode': 'S1', 'feeType': 'month', 'fee': 300,
                                     'capacity': 100, 'active': True, 'slots': []})]
        for i in range(1, 7):
            ops.append(('students', f'mr-s{i}', {'code': f'7700{i}', 'name': f'Synthetic Student {i}', 'gradeCode': 'S1', 'active': True}))
        c.post('/api/commit', {'label': 'fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        c.post('/api/c/shift/open', {'opening': 0})

    def key(self, call, key):
        with self.assertRaises(ApiError) as caught:
            call()
        self.assertEqual(caught.exception.data.get('key'), key)

    def enrolment(self, sid, gid):
        return next(e['id'] for e in self.c.get('/api/state')['enrollments'] if e['studentId'] == sid and e['groupId'] == gid and e.get('status') == 'active')

    def test_a_spent_credit_cannot_be_given_back(self):
        c = self.c
        top = c.post('/api/c/pay', {'studentId': 'mr-s1', 'kind': 'wallet_topup', 'amount': 100, 'method': 'cash'})
        c.post('/api/c/enroll', {'studentId': 'mr-s1', 'groupId': 'mr-gs'})
        c.post('/api/c/pay', {'studentId': 'mr-s1', 'groupId': 'mr-gs', 'kind': 'fee', 'amount': 100, 'method': 'wallet'})
        self.key(lambda: c.post('/api/c/void', {'id': top['id'], 'reason': 'parent wanted the cash back'}), 'err.walletSpent')

    def test_b_today_money_counts_credit_once(self):
        d = self.c.get('/api/c/dashboard')
        self.assertNotIn('wallet', d['todayMoney'])                   # the 100 came in once, as cash (test a)
        self.assertEqual(d['todayTotal'], sum(d['todayMoney'].values()))

    def test_c_leaving_or_moving_twice_is_refused(self):
        c, first = self.c, date.today().replace(day=1)
        c.post('/api/c/enroll', {'studentId': 'mr-s2', 'groupId': 'mr-gm', 'from': (first - timedelta(days=70)).isoformat()})
        e = self.enrolment('mr-s2', 'mr-gm')
        c.post('/api/c/transfer', {'enrollmentId': e, 'groupId': 'mr-gm2', 'from': (first - timedelta(days=40)).isoformat()})
        before = c.get('/api/c/balances')['students']['mr-s2']
        self.key(lambda: c.post('/api/c/leave', {'enrollmentId': e, 'reason': 'double click'}), 'err.notActive')
        self.key(lambda: c.post('/api/c/transfer', {'enrollmentId': e, 'groupId': 'mr-gs'}), 'err.notActive')
        self.assertEqual(c.get('/api/c/balances')['students']['mr-s2'], before, 'nothing was charged again')

    def test_d_moving_into_a_group_the_student_is_already_in_is_refused(self):
        c = self.c
        c.post('/api/c/enroll', {'studentId': 'mr-s3', 'groupId': 'mr-gs'})
        c.post('/api/c/enroll', {'studentId': 'mr-s3', 'groupId': 'mr-gm'})
        self.key(lambda: c.post('/api/c/transfer', {'enrollmentId': self.enrolment('mr-s3', 'mr-gs'), 'groupId': 'mr-gm'}), 'err.alreadyEnrolled')

    def test_e_dates_in_another_shape_are_refused(self):
        c = self.c
        self.key(lambda: c.post('/api/c/enroll', {'studentId': 'mr-s4', 'groupId': 'mr-gm', 'from': '20260901'}), 'err.date')
        c.post('/api/c/enroll', {'studentId': 'mr-s4', 'groupId': 'mr-gs'})
        self.key(lambda: c.post('/api/c/leave', {'enrollmentId': self.enrolment('mr-s4', 'mr-gs'), 'to': 'tomorrow', 'reason': 'x'}), 'err.date')

    def test_f_a_group_with_students_or_debts_cannot_be_deleted(self):
        c = self.c
        c.post('/api/c/enroll', {'studentId': 'mr-s5', 'groupId': 'mr-gm2'})
        g = next(x for x in c.get('/api/state')['groups'] if x['id'] == 'mr-gm2')
        self.key(lambda: c.post('/api/commit', {'label': 'del', 'ops': [{'e': 'groups', 'id': 'mr-gm2', 'op': 'del', 'ver': g['ver']}]}), 'err.groupInUse')
        self.assertIn('mr-s5', c.get('/api/c/balances')['students'])


class SharedConnectionTest(unittest.TestCase):
    """Full review: /api/c/status failed now and then with KeyError 'node' - journal.meta() read the one shared database
    connection without the lock, so under load it could receive another thread's row. Many pages at once must never fail."""

    def test_status_and_pages_at_the_same_time(self):
        import threading
        s = Server('shared-conn').start()
        self.addCleanup(s.cleanup)
        make_authority(s)
        errors = []

        def hammer(path):
            c = s.client()
            c.login('boss', 'Strong-pass1')
            for _ in range(40):
                try:
                    c.get(path)
                except ApiError as e:
                    errors.append((path, e.code, str(e)[:120]))
        threads = [threading.Thread(target=hammer, args=(p,)) for p in ('/api/c/status', '/api/c/status', '/api/state', '/api/version', '/api/c/dashboard', '/api/c/status')]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])


class SamplePasswordTest(unittest.TestCase):
    """Review of PR 20: a sample load that stopped half way left the demo accounts behind; the next load showed a new
    password that none of them accepted. Every demo account takes the password the administrator is shown."""

    def test_the_shown_password_always_opens_the_demo_accounts(self):
        s = Server('sample-pw').start()
        self.addCleanup(s.cleanup)
        c = make_authority(s)
        first = c.post('/api/c/sample', {})['password']
        settings = c.get('/api/state')['settingsVer']
        # what a load that stopped before its data looks like: the accounts exist, the sample centre does not
        c.post('/api/commit', {'label': 'x', 'ops': [{'e': 'settings', 'id': 'smp-centre', 'op': 'del', 'ver': settings.get('smp-centre')}]})
        second = c.post('/api/c/sample', {})['password']
        self.assertNotEqual(first, second)
        self.assertTrue(s.client().login('desk1', second))
        with self.assertRaises(ApiError):
            s.client().login('desk1', first)
