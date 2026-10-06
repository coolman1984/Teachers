"""The owner's watch (server/watch.py) against a desk that tries to steal, the signed-in "last sign-in" notice, the clicks
log and the reasons the screens now insist on (owner's request, 2026-10-06)."""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ApiError, Server, make_authority  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402

PASSWORD = 'Counter-Key-2026!'


class WatchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server('watch').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.admin = a = make_authority(cls.s)
        wd = D.weekday(date.today())
        ops = [('teachers', 'wt-t', {'name': 'Synthetic Watch Teacher'}),
               ('groups', 'wt-g', {'name': 'Watch Group', 'teacherId': 'wt-t', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 100, 'capacity': 20,
                                   'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}),
               ('students', 'wt-s', {'code': '48001', 'name': 'Synthetic Watch Student', 'gradeCode': 'S1', 'parentMobile': '01011112222', 'consent': True, 'active': True}),
               ('students', 'wt-f', {'code': '48002', 'name': 'Synthetic Free Rider', 'gradeCode': 'S1', 'parentMobile': '01011113333', 'consent': True, 'active': True})]
        a.post('/api/commit', {'label': 'watch', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for sid in ('wt-s', 'wt-f'):
            a.post('/api/c/enroll', {'studentId': sid, 'groupId': 'wt-g'})
        profiles = {p['name']: p['perms'] for p in a.get('/api/users')['profiles']}
        a.post('/api/users/save', {'username': 'sara.desk', 'full_name': 'Synthetic Sara', 'password': PASSWORD, 'must_change': False,
                                    'role': 'Custom', 'perms': profiles['Front desk'] + ['money.void', 'students.discount']})
        cls.desk = cls.s.client()
        # two wrong passwords before the real sign-in: the desk is told right after signing in
        for _ in range(2):
            with cls.assertRaises(cls, ApiError):
                cls.s.client().login('sara.desk', 'wrong-password-1')
        cls.first = cls.desk.login('sara.desk', PASSWORD)

    def test_a_a_skim_a_short_drawer_and_a_free_rider_are_on_the_watch(self):
        d = self.desk
        d.post('/api/c/shift/open', {'opening': 0})
        first = d.post('/api/c/pay', {'studentId': 'wt-s', 'groupId': 'wt-g', 'kind': 'fee', 'amount': 300, 'method': 'cash'})
        d.post('/api/c/void', {'id': first['id'], 'reason': 'typed by mistake'})
        d.post('/api/c/pay', {'studentId': 'wt-s', 'groupId': 'wt-g', 'kind': 'fee', 'amount': 200, 'method': 'cash'})
        sid = D.session_id('wt-g', date.today(), '00:00')
        d.post('/api/c/checkin', {'studentId': 'wt-f', 'sessionId': sid})
        shift = d.get('/api/c/shift')
        d.post('/api/c/shift/close', {'shiftId': shift['shift']['id'], 'counted': 150, 'reason': 'do not know'})
        w = self.admin.get('/api/watch')
        rules = {a['rule']: a for a in w['alerts']}
        self.assertEqual(rules['skim']['level'], 'critical')
        self.assertEqual((rules['skim']['vars']['amount'], rules['skim']['vars']['amount2'], rules['skim']['vars']['diff']), (300, 200, 100))
        self.assertIn('sara.desk', rules['skim']['user'])
        self.assertEqual(rules['void']['level'], 'high')               # reversed by the person who took it
        self.assertTrue(rules['void']['vars']['same'])
        self.assertEqual(rules['short']['vars']['diff'], 50)
        self.assertGreaterEqual(w['summary']['critical'], 1)
        self.assertEqual(w['people'][0]['user'], 'Synthetic Sara (sara.desk)')
        # one visit while owing 100 is below the threshold (2 units); the free rider appears only when he owes more
        self.assertNotIn('freeRide', rules)

    def test_b_the_desk_cannot_see_or_quiet_the_watch(self):
        d = self.desk
        for path, body in (('/api/watch', None), ('/api/watch/review', {'keys': ['skim:x'], 'note': 'fine'})):
            with self.assertRaises(ApiError) as caught:
                d.call('POST' if body else 'GET', path, body)
            self.assertEqual(caught.exception.code, 403)
        with self.assertRaises(ApiError) as caught:      # not through the generic save either
            d.post('/api/commit', {'label': 'x', 'ops': [{'e': 'settings', 'id': 'watchReviewed', 'op': 'put', 'row': {'value': {'skim:x': {}}}}]})
        self.assertEqual(caught.exception.code, 403)
        manager = self.s.client()
        profiles = {p['name']: p['perms'] for p in self.admin.get('/api/users')['profiles']}
        self.admin.post('/api/users/save', {'username': 'mgr.watch', 'full_name': 'Synthetic Manager', 'password': PASSWORD, 'must_change': False,
                                            'role': 'Centre manager', 'perms': profiles['Centre manager']})
        manager.login('mgr.watch', PASSWORD)
        with self.assertRaises(ApiError) as caught:      # a manager with settings.edit cannot raise the thresholds to hide things
            manager.post('/api/commit', {'label': 'x', 'ops': [{'e': 'settings', 'id': 'watchBig', 'op': 'put', 'row': {'value': 999999}}]})
        self.assertEqual(caught.exception.code, 403)

    def test_c_a_review_is_kept_with_the_reviewer_and_moves_the_alert(self):
        w = self.admin.get('/api/watch')
        skim = next(a for a in w['alerts'] if a['rule'] == 'skim')
        self.admin.post('/api/watch/review', {'keys': [skim['key']], 'note': 'Asked the parent: paid 300, receipt R-1. Sara warned.'})
        w2 = self.admin.get('/api/watch')
        again = next(a for a in w2['alerts'] if a['key'] == skim['key'])
        self.assertEqual(again['review']['note'], 'Asked the parent: paid 300, receipt R-1. Sara warned.')
        self.assertIn('Admin', again['review']['by'])
        self.assertEqual(w2['summary']['critical'], w['summary']['critical'] - 1)
        audit = self.admin.get('/api/audit?q=watchReviewed')
        self.assertGreaterEqual(audit['total'], 1)                      # the review itself is a logged change

    def test_d_discounts_need_a_reason_and_show_on_the_watch(self):
        row = self.desk.get('/api/c/student?id=wt-f')['student']
        with self.assertRaises(ApiError) as caught:
            self.desk.post('/api/commit', {'label': 'disc', 'ops': [{'e': 'students', 'id': 'wt-f', 'op': 'put', 'ver': row['ver'], 'row': {**row, 'discountPct': 50}}]})
        self.assertEqual(caught.exception.data.get('key'), 'err.discountReason')
        self.desk.post('/api/commit', {'label': 'disc', 'ops': [{'e': 'students', 'id': 'wt-f', 'op': 'put', 'ver': row['ver'],
                                                                 'row': {**row, 'discountPct': 50, 'discountReason': 'friend of mine'}}]})
        alert = next(a for a in self.admin.get('/api/watch')['alerts'] if a['rule'] == 'discount')
        self.assertEqual(alert['level'], 'high')                         # not an administrator
        self.assertEqual(float(alert['vars']['pct']), 50)

    def test_e_last_sign_in_and_wrong_passwords_are_told_at_sign_in(self):
        self.assertEqual(self.first['welcome']['failed'], 2)
        again = self.s.client().login('sara.desk', PASSWORD)
        self.assertEqual(again['welcome']['failed'], 0)
        self.assertTrue(again['welcome']['last'])

    def test_f_clicks_are_kept_under_the_real_name_for_administrators_only(self):
        self.desk.post('/api/log', {'events': [{'type': 'click', 'action': 'void=pa1', 'target': 'Reverse', 'user': 'Someone Else'}]})
        self.desk.post('/api/log', {'events': [{'type': 'page', 'action': 'money', 'target': 'Money'}]})
        rows = self.admin.get('/api/activity?user=' + 'Synthetic%20Sara%20(sara.desk)')['rows']
        self.assertTrue(any(r['action'] == 'void=pa1' and r['type'] == 'click' for r in rows))
        self.assertFalse(self.admin.get('/api/activity?user=Someone%20Else')['rows'])
        with self.assertRaises(ApiError) as caught:
            self.desk.get('/api/activity')
        self.assertEqual(caught.exception.code, 403)

    def test_g_a_click_from_a_pc_with_a_wrong_clock_gets_the_server_time(self):
        self.desk.post('/api/log', {'events': [{'type': 'click', 'action': 'clock-test', 'target': 'x', 'ts': '2020-01-01T08:00:00'}]})
        row = next(r for r in self.admin.get('/api/activity?q=clock-test')['rows'])
        self.assertEqual(row['ts'][:10], date.today().isoformat())


if __name__ == '__main__':
    unittest.main()
