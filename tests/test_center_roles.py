"""Every built-in profile tries, by direct requests to the server, what its screens never offer (review E02). The server refuses
each one: permissions are enforced per request, not by hiding buttons."""
import os
import sys
import unittest
from datetime import date

from harness import ApiError, Server, make_authority

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402

PASSWORD = 'Granite-lake-6630'


class RolesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server('roles').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = a = make_authority(cls.s)
        wd = D.weekday(date.today())
        ops = []
        for t in ('1', '2'):
            ops += [('teachers', 'rl-t' + t, {'name': 'Synthetic Role Teacher ' + t}),
                    ('groups', 'rl-g' + t, {'name': 'Role Group ' + t, 'teacherId': 'rl-t' + t, 'gradeCode': 'S1', 'feeType': 'session', 'fee': 50,
                                           'capacity': 20, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}),
                    ('students', 'rl-s' + t, {'code': '4700' + t, 'name': 'Synthetic Role Student ' + t, 'gradeCode': 'S1', 'parentMobile': '0101111222' + t,
                                             'consent': True, 'active': True})]
        ops.append(('exams', 'rl-x1', {'title': 'Role Quiz', 'teacherId': 'rl-t1', 'groupIds': ['rl-g1'], 'date': date.today().isoformat(), 'kind': 'weekly', 'maxScore': 10}))
        a.post('/api/commit', {'label': 'roles', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for t in ('1', '2'):
            a.post('/api/c/enroll', {'studentId': 'rl-s' + t, 'groupId': 'rl-g' + t})
        a.post('/api/c/shift/open', {'opening': 0})
        cls.receipt = a.post('/api/c/pay', {'studentId': 'rl-s1', 'groupId': 'rl-g1', 'kind': 'fee', 'amount': 50, 'method': 'cash'})
        profiles = {p['name']: p['perms'] for p in a.get('/api/users')['profiles']}
        cls.people = {}
        for role, scopes in (('Front desk', None), ('Teacher', ['rl-t1']), ('Assistant', None), ('Accountant', None), ('Viewer', None)):
            name = 'role.' + role.split()[0].lower()
            a.post('/api/users/save', {'username': name, 'full_name': 'Synthetic ' + role, 'password': PASSWORD, 'must_change': False,
                                        'role': role, 'perms': profiles[role], 'scopes': scopes})
            c = cls.s.client()
            c.login(name, PASSWORD)
            cls.people[role] = c

    def no(self, role, method, path, body=None, codes=(403,), key=None):
        c = self.people[role]
        with self.assertRaises(ApiError, msg=f'{role} {method} {path}') as e:
            c.get(path) if method == 'GET' else c.post(path, body or {})
        refused = e.exception.code in codes or (e.exception.code == 400 and e.exception.data.get('key') in ('err.perm', 'err.scope'))
        self.assertTrue(refused, f'{role} {method} {path}: {e.exception}')       # centre operations answer err.perm / err.scope
        if key:
            self.assertEqual(e.exception.data.get('key'), key, f'{role} {path}')

    def session(self, t):
        return D.session_id('rl-g' + t, date.today(), '00:00')

    def test_front_desk(self):
        r = 'Front desk'
        self.no(r, 'POST', '/api/c/void', {'id': self.receipt['id'], 'reason': 'try'})
        self.no(r, 'POST', '/api/c/settlement/approve', {'teacherId': 'rl-t1', 'ym': date.today().isoformat()[:7]})
        self.no(r, 'GET', '/api/c/reports?ym=' + date.today().isoformat()[:7])
        self.no(r, 'GET', '/api/export.xlsx')
        self.no(r, 'GET', '/api/users')
        self.no(r, 'GET', '/api/security')
        self.no(r, 'POST', '/api/c/marks', {'examId': 'rl-x1', 'items': [{'studentId': 'rl-s1', 'score': 9}]})
        pay = next(p for p in self.admin.get('/api/state')['payments'] if p['id'] == self.receipt['id'])
        self.no(r, 'POST', '/api/commit', {'label': 'edit', 'ops': [{'e': 'payments', 'id': pay['id'], 'op': 'put', 'ver': pay['ver'],
                                                                      'row': {**{k: v for k, v in pay.items() if k not in ('id', 'ver')}, 'amount': 5}}]})
        self.no(r, 'POST', '/api/remote', {'on': True})
        self.no(r, 'GET', '/api/gateway/secret')

    def test_teacher_limited_to_one_teacher(self):
        r = 'Teacher'
        self.no(r, 'POST', '/api/c/checkin', {'studentId': 'rl-s2', 'sessionId': self.session('2')}, codes=(400, 403))
        self.no(r, 'GET', '/api/c/student?id=rl-s2', codes=(400, 403))
        self.no(r, 'GET', '/api/c/money?from=2026-01-01&to=2030-01-01')
        self.no(r, 'POST', '/api/c/pay', {'studentId': 'rl-s1', 'groupId': 'rl-g1', 'kind': 'fee', 'amount': 1, 'method': 'cash'})
        self.no(r, 'GET', '/api/export.xlsx')
        state = self.people[r].get('/api/state')
        self.assertEqual({s['id'] for s in state['students'] if s['id'].startswith('rl-')}, {'rl-s1'})
        self.assertEqual({t['id'] for t in state['teachers'] if t['id'].startswith('rl-')}, {'rl-t1'})
        own = [s['teacherId'] for s in self.people[r].get('/api/c/settlements?ym=' + date.today().isoformat()[:7])]
        self.assertTrue(set(own) <= {'rl-t1'})
        self.people[r].post('/api/c/checkin', {'studentId': 'rl-s1', 'sessionId': self.session('1')})   # his own group: allowed

    def test_assistant_sees_no_money(self):
        r = 'Assistant'
        self.no(r, 'POST', '/api/c/pay', {'studentId': 'rl-s1', 'groupId': 'rl-g1', 'kind': 'fee', 'amount': 1, 'method': 'cash'})
        self.no(r, 'GET', '/api/c/money?from=2026-01-01&to=2030-01-01')
        self.no(r, 'GET', '/api/c/reports?ym=' + date.today().isoformat()[:7])
        self.no(r, 'POST', '/api/c/void', {'id': self.receipt['id'], 'reason': 'try'})
        f = self.people[r].get('/api/c/student?id=rl-s1')
        self.assertEqual(f['payments'], [])                                       # the student file without money
        self.assertFalse(any('money' in e for e in f['enrollments']))
        card = self.people[r].get('/api/c/card?id=rl-s1')                         # the door card too (found by this test)
        self.assertFalse(any('money' in e for e in card['enrollments']))
        self.assertNotIn('wallet', card)
        self.people[r].post('/api/c/marks', {'examId': 'rl-x1', 'items': [{'studentId': 'rl-s1', 'score': 8}]})   # allowed

    def test_accountant_does_not_take_attendance_or_marks(self):
        r = 'Accountant'
        self.no(r, 'POST', '/api/c/checkin', {'studentId': 'rl-s1', 'sessionId': self.session('1')})
        self.no(r, 'POST', '/api/c/marks', {'examId': 'rl-x1', 'items': [{'studentId': 'rl-s1', 'score': 9}]})
        self.no(r, 'POST', '/api/c/pay', {'studentId': 'rl-s1', 'groupId': 'rl-g1', 'kind': 'fee', 'amount': 1, 'method': 'cash'})

    def test_viewer_only_reads_and_sees_no_phone_numbers(self):
        r = 'Viewer'
        for path, body in (('/api/c/checkin', {'studentId': 'rl-s1', 'sessionId': self.session('1')}),
                           ('/api/c/enroll', {'studentId': 'rl-s2', 'groupId': 'rl-g1'}),
                           ('/api/c/followup', {'studentId': 'rl-s1', 'type': 'call'}),
                           ('/api/commit', {'label': 'x', 'ops': [{'e': 'students', 'id': 'rl-new', 'op': 'put', 'row': {'name': 'X', 'gradeCode': 'S1'}}]})):
            self.no(r, 'POST', path, body)
        state = self.people[r].get('/api/state')
        self.assertFalse(any(s.get('parentMobile') for s in state['students']), 'parents\' numbers need contacts.view')

    def test_signing_out_ends_the_session(self):
        c = self.s.client()
        c.login('role.viewer', PASSWORD)
        c.get('/api/state')
        c.post('/api/auth/logout', {})
        with self.assertRaises(ApiError) as e:
            c.get('/api/state')
        self.assertEqual(e.exception.code, 401)


if __name__ == '__main__':
    unittest.main()
