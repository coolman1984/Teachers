"""Regressions found while integrating all development branches, using real centre HTTP requests."""
from test_center_api import CenterFixture


class IntegrationTest(CenterFixture):
    def test_changed_amount_is_not_reported_as_a_successful_retry(self):
        self.open_shift()
        key = 'f01a0123456789abc'
        self.pay(50, key=key)
        self.error('/api/c/pay', {'key': key, 'studentId': self.student, 'groupId': self.group,
                                'kind': 'fee', 'amount': 75}, 'err.paymentChanged')

    def test_family_retry_cannot_return_only_part_of_the_saved_batch(self):
        self.open_shift()
        body = {'key': 'f02a0123456789abc', 'items': [
            {'studentId': self.student, 'groupId': self.group, 'amount': 30},
            {'studentId': self.other_student, 'groupId': self.other_group, 'amount': 40}]}
        first = self.c.post('/api/c/pay/many', body)
        self.assertEqual(first['total'], 70)
        self.error('/api/c/pay/many', {**body, 'items': body['items'][:1]}, 'err.paymentChanged')
        self.error('/api/c/pay/many', {**body, 'items': list(reversed(body['items']))}, 'err.paymentChanged')
        retry = self.c.post('/api/c/pay/many', body)
        self.assertEqual(retry['total'], 70)
        self.assertEqual([r['id'] for r in retry['receipts']], [r['id'] for r in first['receipts']])

    def test_student_file_does_not_reveal_siblings_outside_teacher_scope(self):
        for sid in (self.student, self.other_student):
            row = next(s for s in self.c.get('/api/state')['students'] if s['id'] == sid)
            self.put([('students', sid, {**row, 'familyKey': self.p + '-family'})])
        name = 'limited' + self.p
        self.c.post('/api/users/save', {'username': name, 'full_name': 'Synthetic scoped staff',
                     'password': 'River-lake-5541', 'must_change': False,
                     'perms': ['students.view'], 'scopes': [self.teacher]})
        limited = self.server.client()
        limited.login(name, 'River-lake-5541')
        file = limited.get('/api/c/student?id=' + self.student)
        self.assertEqual(file['family'], [])

    def test_roster_hides_parent_link_secrets_and_money_for_attendance_only_staff(self):
        name = 'assistant' + self.p
        self.c.post('/api/users/save', {'username': name, 'full_name': 'Synthetic attendance staff',
                     'password': 'River-lake-5541', 'must_change': False,
                     'perms': ['students.view', 'door.use', 'attendance.mark'], 'scopes': None})
        row = next(s for s in self.c.get('/api/state')['students'] if s['id'] == self.student)
        # Portal fields must never be carried into another staff member's attendance response.
        self.c.post('/api/gateway/save', {'url': 'http://127.0.0.1:1'})
        self.c.post('/api/gateway/generate', {})
        self.c.post('/api/c/portal', {'studentId': row['id']})
        limited = self.server.client()
        limited.login(name, 'River-lake-5541')
        roster = limited.get('/api/c/roster?session=' + self.session)
        student = next(r for r in roster['rows'] if r['student']['id'] == self.student)
        self.assertNotIn('money', student)
        self.assertNotIn('portalNonce', student['student'])
        self.assertNotIn('portalHash', student['student'])
