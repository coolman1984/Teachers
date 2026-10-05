"""Real HTTP regression coverage for centre daily operations and access boundaries."""
import os
import sys
import time
import unittest
from datetime import date, timedelta

from harness import ApiError, Server, make_authority

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server'))
import domain as D


class CenterApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = Server('centre-api').start()
        cls.admin = make_authority(cls.server)
        cls.serial = 0

    @classmethod
    def tearDownClass(cls):
        cls.server.cleanup()

    def setUp(self):
        type(self).serial += 1
        self.p = 'test' + str(type(self).serial)
        self.c = self.admin
        self.day = date.today().isoformat()
        self.teacher = self.p + '-t1'
        self.other_teacher = self.p + '-t2'
        self.group = self.p + '-g1'
        self.other_group = self.p + '-g2'
        self.student = self.p + '-s1'
        self.other_student = self.p + '-s2'
        subject = self.p + '-subject'
        room = self.p + '-room'
        self.put([
            ('subjects', subject, {'name': 'Subject ' + self.p}),
            ('rooms', room, {'name': 'Room ' + self.p, 'capacity': 300}),
            ('teachers', self.teacher, {'name': 'Teacher One ' + self.p, 'centerPct': 20, 'rentSession': 50}),
            ('teachers', self.other_teacher, {'name': 'Teacher Two ' + self.p}),
            ('groups', self.group, {'name': 'Group One ' + self.p, 'teacherId': self.teacher, 'subjectId': subject,
                'roomId': room, 'gradeCode': 'S1', 'feeType': 'session', 'fee': 50, 'capacity': 300,
                'active': True, 'slots': [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'}]}),
            ('groups', self.other_group, {'name': 'Group Two ' + self.p, 'teacherId': self.other_teacher, 'subjectId': subject,
                'gradeCode': 'S1', 'feeType': 'session', 'fee': 50, 'capacity': 300, 'active': True,
                'slots': [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'}]}),
            ('students', self.student, {'code': str(10000 + type(self).serial * 500), 'name': 'Student One ' + self.p,
                'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '01012345678', 'consent': True, 'active': True}),
            ('students', self.other_student, {'code': str(10001 + type(self).serial * 500), 'name': 'Student Two ' + self.p,
                'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '01112345678', 'consent': True, 'active': True})
        ])
        self.enrollment = self.c.post('/api/c/enroll', {'studentId': self.student, 'groupId': self.group})['id']
        self.c.post('/api/c/enroll', {'studentId': self.other_student, 'groupId': self.other_group})
        self.session = D.session_id(self.group, self.day, '00:00')
        self.other_session = D.session_id(self.other_group, self.day, '00:00')
        shift = self.c.get('/api/c/shift').get('shift')
        if shift and shift.get('status') == 'open':
            summary = self.c.get('/api/c/shift')
            self.c.post('/api/c/shift/close', {'shiftId': shift['id'], 'counted': summary['expected']})

    def put(self, records):
        return self.c.post('/api/commit', {'label': 'Synthetic test fixture',
            'ops': [{'e': e, 'id': rid, 'op': 'put', 'ver': row.get('ver'), 'row': row} for e, rid, row in records]})

    def error(self, path, body, key, code=400, client=None):
        with self.assertRaises(ApiError) as caught:
            (client or self.c).post(path, body)
        self.assertEqual(caught.exception.code, code)
        if key:
            self.assertEqual(caught.exception.data.get('key'), key)

    def open_shift(self, amount=500):
        return self.c.post('/api/c/shift/open', {'opening': amount})

    def pay(self, amount=100, method='cash', **extra):
        return self.c.post('/api/c/pay', {'studentId': self.student, 'groupId': self.group,
            'kind': 'fee', 'amount': amount, 'method': method, **extra})

    def test_01_door_peak_and_delta(self):
        students = [( 'students', self.p + '-peak-' + str(i),
                     {'code': str(30000+i), 'name': 'Synthetic Peak ' + str(i), 'gradeCode': 'S1',
                      'system': 'thanaweya', 'active': True}) for i in range(200)]
        students += [('enrollments', self.p + '-en-' + str(i), {'studentId': self.p + '-peak-' + str(i),
                      'groupId': self.group, 'teacherId': self.teacher, 'from': self.day, 'status': 'active'}) for i in range(200)]
        self.put(students)
        before = self.c.get('/api/version')['version']
        started = time.monotonic()
        for i in range(200):
            out = self.c.post('/api/c/checkin', {'studentId': self.p+'-peak-'+str(i), 'sessionId': self.session})
            self.assertFalse(out['already'])
            self.assertEqual(out['id'], D.attendance_id(self.session, self.p+'-peak-'+str(i)))
        self.assertLess(time.monotonic()-started, 60)
        out = self.c.post('/api/c/checkin', {'studentId': self.p+'-peak-0', 'sessionId': self.session})
        self.assertTrue(out['already'])
        if D.hm('00:00') + 15 < D.hm(time.strftime('%H:%M')):
            self.assertEqual(out['status'], 'late')
        state = self.c.get('/api/state')
        self.assertEqual(len([s for s in state['sessions'] if s['id'] == self.session]), 1)
        delta = self.c.get('/api/delta?since='+str(before))
        self.assertEqual(len(delta['rows']['attendance']), 200)
        self.assertEqual(len(delta['rows']['sessions']), 1)

    def test_02_makeup_keeps_home_group(self):
        out = self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': self.other_session})
        self.assertTrue(out['makeup'])
        attendance = next(a for a in self.c.get('/api/state')['attendance'] if a['id'] == out['id'])
        self.assertEqual(attendance['groupId'], self.group)
        third = self.p + '-no-enrollment'
        self.put([('students', third, {'name': 'Unenrolled ' + self.p, 'gradeCode': 'S1', 'system': 'thanaweya'})])
        self.error('/api/c/checkin', {'studentId': third, 'sessionId': self.session}, 'err.notEnrolled')

    def test_03_receipts_reversals_and_drawer_count(self):
        self.error('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'amount': 100}, 'err.noShift')
        shift = self.open_shift()
        receipt = self.pay(100)
        self.pay(50, 'vodafone')
        self.c.post('/api/c/void', {'id': receipt['id'], 'reason': 'Synthetic correction'})
        self.error('/api/c/void', {'id': receipt['id'], 'reason': 'Duplicate correction'}, 'err.voided')
        rows = self.c.get('/api/c/shift')['payments']
        reverse = next(p for p in rows if p.get('voidOf') == receipt['id'])
        self.assertEqual(reverse['amount'], -100)
        self.assertEqual(next(p for p in rows if p['id'] == receipt['id'])['amount'], 100)
        self.assertEqual(self.c.get('/api/c/shift')['expected'], 500)
        self.error('/api/c/shift/close', {'shiftId': shift['id'], 'counted': 480}, 'err.diffReason')
        self.c.post('/api/c/shift/close', {'shiftId': shift['id'], 'counted': 480, 'reason': 'Test shortage'})
        self.assertEqual(self.c.get('/api/c/shift?id='+shift['id'])['shift']['diff'], -20)

    def test_04_generic_money_edit_is_forbidden_even_for_admin(self):
        self.open_shift()
        receipt = self.pay()
        row = next(p for p in self.c.get('/api/state')['payments'] if p['id'] == receipt['id'])
        for op in [{'e': 'payments', 'id': row['id'], 'op': 'put', 'ver': row['ver'], 'row': {**row, 'amount': 1}},
                   {'e': 'payments', 'id': row['id'], 'op': 'del', 'ver': row['ver']}]:
            self.error('/api/commit', {'label': 'Forbidden ledger change', 'ops': [op]}, None, 403)

    def test_05_wallet(self):
        self.open_shift()
        self.pay(300, kind='wallet_topup')
        self.pay(120, 'wallet')
        self.assertEqual(self.c.get('/api/c/card?id='+self.student)['wallet'], 180)
        self.error('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'amount': 500, 'method': 'wallet'}, 'err.walletLow')

    def test_06_transfer_capacity_and_school_limits(self):
        state = self.c.get('/api/state')
        other = next(g for g in state['groups'] if g['id'] == self.other_group)
        other['capacity'] = 1
        self.put([('groups', self.other_group, other)])
        self.error('/api/c/transfer', {'enrollmentId': self.enrollment, 'groupId': self.other_group}, 'err.groupFull')
        other = next(g for g in self.c.get('/api/state')['groups'] if g['id'] == self.other_group)
        other['capacity'] = 5
        self.put([('groups', self.other_group, other)])
        self.c.post('/api/c/transfer', {'enrollmentId': self.enrollment, 'groupId': self.other_group})
        ens = self.c.get('/api/c/student?id='+self.student)['enrollments']
        old = next(e for e in ens if e['id'] == self.enrollment)
        self.assertEqual(old['status'], 'moved')
        self.assertEqual(old['to'], (date.today()-timedelta(days=1)).isoformat())
        self.assertEqual(len([e for e in ens if e.get('status') == 'active']), 1)
        for fee, cap, error in [(101, 25, 'err.schoolFee'), (100, 26, 'err.schoolSize')]:
            self.error('/api/commit', {'ops': [{'e': 'groups', 'id': self.p+'-school', 'op': 'put',
                'row': {'name': 'School ' + self.p, 'teacherId': self.teacher, 'kind': 'school', 'fee': fee, 'capacity': cap}}]}, error)

    def scoped_client(self, perms=None):
        username = self.p + '.scoped'
        self.c.post('/api/users/save', {'username': username, 'full_name': 'Synthetic scoped user',
            'password': 'Strong-pass1', 'must_change': False, 'scopes': [self.teacher],
            'perms': perms or ['students.view', 'door.use', 'groups.view', 'attendance.mark', 'followup.view', 'reports.view']})
        client = self.server.client()
        client.login(username, 'Strong-pass1')
        return client

    def test_07_teacher_scope_and_contact_privacy(self):
        client = self.scoped_client()
        state = client.get('/api/state')
        self.assertEqual({g['teacherId'] for g in state['groups']}, {self.teacher})
        self.assertNotIn(self.other_student, {s['id'] for s in state['students']})
        for student in state['students']:
            self.assertNotIn('parentMobile', student)
        card = client.get('/api/c/card?id='+self.student)
        self.assertNotIn('parentMobile', card['student'])
        self.assertTrue(all(e['teacherId'] == self.teacher for e in card['enrollments']))
        self.assertTrue(all(c['session']['teacherId'] == self.teacher for c in card['candidates']))
        self.error('/api/c/checkin', {'studentId': self.student, 'sessionId': self.other_session}, 'err.scope', client=client)
        self.assertNotIn('parentMobile', client.get('/api/c/student?id='+self.student)['student'])

    def test_08_settlement_and_approval(self):
        self.open_shift()
        self.pay(1000)
        for i in range(4):
            self.put([('sessions', self.p+'-held-'+str(i), {'groupId': self.group, 'teacherId': self.teacher,
                'date': self.day, 'start': '17:00', 'end': '18:00', 'status': 'held'})])
        month = self.day[:7]
        statement = next(s for s in self.c.get('/api/c/settlements?ym='+month) if s['teacherId'] == self.teacher)
        self.assertEqual(statement['centerShare'], 400)
        self.c.post('/api/c/expense', {'category': 'teacher_payout', 'teacherId': self.teacher, 'amount': 200, 'method': 'cash'})
        statement = next(s for s in self.c.get('/api/c/settlements?ym='+month) if s['teacherId'] == self.teacher)
        self.assertEqual(statement['remaining'], 400)
        for _ in range(2):
            self.c.post('/api/c/settlement/approve', {'teacherId': self.teacher, 'ym': month})
        rows = self.c.get('/api/state')['settlements']
        self.assertEqual(len([s for s in rows if s['id'] == 'st-'+self.teacher+'-'+month]), 1)

    def test_09_handout_sale_and_reversal_restore_stock(self):
        material = self.p+'-material'
        self.put([('materials', material, {'name': 'Synthetic handout', 'teacherId': self.teacher, 'stock': 10, 'price': 20})])
        self.open_shift()
        receipt = self.pay(60, kind='material', materialId=material, qty=3)
        state = self.c.get('/api/state')
        self.assertEqual(next(m for m in state['materials'] if m['id'] == material)['stock'], 7)
        self.c.post('/api/c/void', {'id': receipt['id'], 'reason': 'Test stock return'})
        self.assertEqual(next(m for m in self.c.get('/api/state')['materials'] if m['id'] == material)['stock'], 10)

    def test_10_import_arabic_and_idempotency(self):
        data = ('الاسم,الصف,رقم ولي الأمر,المجموعة\nطالب تجريبي,اولى ثانوى,٠١٠١٢٣٤٥٦٧٨,Group One '+self.p+'\n').encode('utf-8-sig')
        path = '/api/import/preview?name=test.csv'
        preview = self.c.call('POST', path, raw=data)
        row = preview['rows'][0]
        self.assertEqual(row['gradeCode'], 'S1')
        self.assertEqual(row['parentMobile'], '01012345678')
        self.assertEqual(row['groupId'], self.group)
        version = self.c.get('/api/version')['version']
        result = self.c.post('/api/c/import', {'rows': preview['rows']})
        self.assertEqual(result['students'], 1)
        self.assertEqual(self.c.get('/api/version')['version'], version+1)
        preview = self.c.call('POST', path, raw=data)
        self.assertEqual(preview['new'], 0)
        self.assertEqual(self.c.post('/api/c/import', {'rows': preview['rows']})['changes'], 0)

    def test_11_delta_has_only_checkin_rows(self):
        version = self.c.get('/api/version')['version']
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': self.session})
        delta = self.c.get('/api/delta?since='+str(version))
        self.assertEqual(set(delta['rows']), {'attendance', 'sessions'})
        self.assertEqual(len(delta['rows']['attendance']), 1)
        self.assertEqual(delta['gone'], {})

    def test_import_preview_is_scoped_and_requires_contact_access(self):
        path='/api/import/preview?name=test.csv'
        data=('Name,Grade,Parent mobile,Group\nStudent Two '+self.p+',S1,01112345678,Group Two '+self.p+'\n').encode()
        hidden=self.scoped_client(['students.manage','students.view'])
        with self.assertRaises(ApiError) as caught:
            hidden.call('POST',path,raw=data)
        self.assertEqual(caught.exception.code,403)
        self.error('/api/c/import',{'rows':[{'name':'Synthetic','gradeCode':'S1'}]},'err.perm',client=hidden)
        # Grant contact access to the same scoped account, then verify matches stay scoped.
        user=next(u for u in self.c.get('/api/users')['users'] if u['username']==self.p+'.scoped')
        self.c.post('/api/users/save',dict(user,perms=['students.manage','students.view','contacts.view']))
        version=self.c.get('/api/version')['version']
        row=hidden.call('POST',path,raw=data)['rows'][0]
        self.assertEqual(row['match'],'')
        self.assertEqual(row['groupId'],'')
        self.assertEqual(self.c.get('/api/version')['version'],version)
        self.error('/api/c/import',{'rows':[dict(row,match=self.other_student)]},'err.scope',client=hidden)
        self.error('/api/c/import',{'rows':[dict(row,groupId=self.other_group)]},'err.scope',client=hidden)
        self.error('/api/c/import',{'rows':[row]},'err.scope',client=hidden)

    def test_import_deduplicates_batch_preserves_consent_and_is_atomic(self):
        row={'name':'Synthetic repeated '+self.p,'gradeCode':'S1','parentMobile':'٠١٠٩٠٠٠٠٠٠٠','groupId':self.group,'consent':True}
        version=self.c.get('/api/version')['version']
        self.error('/api/c/import',{'rows':[row,dict(row,name='Invalid grade '+self.p,gradeCode='')]},'err.grade')
        self.assertEqual(self.c.get('/api/version')['version'],version)
        result=self.c.post('/api/c/import',{'rows':[row,row]})
        self.assertEqual(result['students'],1)
        state=self.c.get('/api/state')
        student=next(s for s in state['students'] if s['name']==row['name'])
        self.assertTrue(student['consent'])
        self.assertEqual(student['consentAt'],self.day)
        self.assertEqual(student['parentMobile'],'01090000000')
        self.assertEqual(len([e for e in state['enrollments'] if e['studentId']==student['id']]),1)
        self.assertEqual(self.c.post('/api/c/import',{'rows':[row,row]})['changes'],0)
        self.error('/api/c/import',{'rows':[dict(row,match=self.student)]},'err.importMatch')
        self.error('/api/c/import',{'rows':[dict(row,gradeCode='P4')]},'err.grade')
        group=next(g for g in self.c.get('/api/state')['groups'] if g['id']==self.group)
        self.put([('groups',self.group,dict(group,capacity=2))])
        version=self.c.get('/api/version')['version']
        self.error('/api/c/import',{'rows':[dict(row,name='Over capacity '+self.p)]},'err.groupFull')
        self.assertEqual(self.c.get('/api/version')['version'],version)

    def test_12_generic_batch_assigns_distinct_student_codes(self):
        ids = [self.p+'-auto-'+str(i) for i in range(2)]
        self.put([('students', sid, {'name': 'Synthetic Auto '+sid, 'gradeCode': 'S1', 'system': 'thanaweya'}) for sid in ids])
        codes = [s['code'] for s in self.c.get('/api/state')['students'] if s['id'] in ids]
        self.assertEqual(len(set(codes)), 2)


    def test_13_message_permissions_templates_and_no_get_write(self):
        self.put([('settings', 'waTemplates', {'value': {'monthly': {'en': '{student}: {balance} / {center}', 'ar': '{student}'}}}),
                  ('settings', 'systemName', {'value': 'Synthetic Centre'})])
        before = self.c.get('/api/version')['version']
        msg = self.c.get('/api/c/wa?studentId='+self.student+'&lang=en&kind=monthly')
        self.assertEqual(msg['to'], '201012345678')
        self.assertIn('Synthetic Centre', msg['text'])
        self.assertNotIn('{student}', msg['text'])
        self.assertEqual(self.c.get('/api/version')['version'], before)
        client = self.scoped_client(['messages.send', 'students.view'])
        with self.assertRaises(ApiError) as caught:
            client.get('/api/c/wa?studentId='+self.student)
        self.assertEqual(caught.exception.code, 403)
        self.error('/api/c/portal', {'studentId': self.student}, 'err.noGateway')

    def test_14_delta_redacts_contacts_and_cached_dashboard_invalidates(self):
        client = self.scoped_client()
        v = self.c.get('/api/version')['version']
        row = next(s for s in self.c.get('/api/state')['students'] if s['id'] == self.student)
        row['parentMobile'] = '01112345678'
        self.put([('students', self.student, row)])
        delta = client.get('/api/delta?since='+str(v))
        self.assertNotIn('parentMobile', delta['rows']['students'][0])
        old = self.c.get('/api/c/dashboard')['checkedIn']
        self.assertEqual(self.c.get('/api/c/dashboard')['checkedIn'], old)
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': self.session})
        self.assertEqual(self.c.get('/api/c/dashboard')['checkedIn'], old+1)


    def test_15_three_fee_models_through_http(self):
        self.open_shift()
        self.pay(100)
        row = next(e for e in self.c.get('/api/state')['enrollments'] if e['id'] == self.enrollment)
        row['from'] = (date.today()-timedelta(days=90)).isoformat()
        self.put([('enrollments', self.enrollment, row)])
        for i in range(3):
            day = (date.today()-timedelta(days=i)).isoformat()
            sid = self.p+'-fee-session-'+str(i)
            self.put([('sessions', sid, {'groupId': self.group, 'teacherId': self.teacher, 'date': day,
                                        'start': '10:00', 'end': '11:00', 'status': 'held'})])
            self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': sid, 'status': 'present'})
        info = self.c.get('/api/c/student?id='+self.student)['enrollments'][0]['money']
        self.assertEqual(info['balance'], -50)
        group = next(g for g in self.c.get('/api/state')['groups'] if g['id'] == self.group)
        group.update(feeType='package', fee=400, packageSessions=8)
        self.put([('groups', self.group, group)])
        self.pay(300)
        info = self.c.get('/api/c/student?id='+self.student)['enrollments'][0]['money']
        self.assertEqual(info['sessionsLeft'], 5)
        group = next(g for g in self.c.get('/api/state')['groups'] if g['id'] == self.group)
        group.update(feeType='month', fee=300)
        row = next(e for e in self.c.get('/api/state')['enrollments'] if e['id'] == self.enrollment)
        row['from'] = (date.today().replace(day=1)-timedelta(days=1)).replace(day=1).isoformat()
        self.put([('groups', self.group, group), ('enrollments', self.enrollment, row)])
        info = self.c.get('/api/c/student?id='+self.student)['enrollments'][0]['money']
        self.assertEqual(info['owed'], 600)
        self.assertEqual(info['balance'], -200)

    def test_16_simultaneous_wallet_spending_cannot_overdraw(self):
        from concurrent.futures import ThreadPoolExecutor
        self.open_shift()
        self.pay(100, kind='wallet_topup')
        def spend(_):
            try:
                self.pay(80, method='wallet')
                return 'paid'
            except ApiError as e:
                return e.data.get('key')
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(spend, range(2)))
        self.assertCountEqual(results, ['paid', 'err.walletLow'])
        self.assertEqual(self.c.get('/api/c/student?id='+self.student)['wallet'], 20)

    def test_17_numeric_and_material_scope_validation(self):
        self.open_shift()
        for amount in ('NaN', 'Infinity', '-Infinity'):
            self.error('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'amount': amount}, 'err.amount')
        material = self.p+'-foreign-handout'
        self.put([('materials', material, {'name': 'Foreign handout '+self.p, 'teacherId': self.other_teacher, 'stock': 10, 'price': 20})])
        client = self.scoped_client(['money.collect', 'students.view'])
        client.post('/api/c/shift/open', {'opening': 0})
        self.error('/api/c/pay', {'studentId': self.student, 'kind': 'material', 'materialId': material, 'amount': 20}, 'err.scope', client=client)


    def test_18_parent_link_reuses_then_replaces_nonce(self):
        import gateway_client as gwc
        self.c.post('/api/gateway/save', {'url': 'http://127.0.0.1:1', 'pollSeconds': 600})
        self.c.post('/api/gateway/generate', {})
        try:
            first = self.c.post('/api/c/portal', {'studentId': self.student})
            again = self.c.post('/api/c/portal', {'studentId': self.student})
            self.assertEqual(first['url'], again['url'])
            token = first['url'].split('#')[1]
            row = next(s for s in self.c.get('/api/state')['students'] if s['id'] == self.student)
            self.assertEqual(row['portalHash'], gwc.token_hash(token))
            replacement = self.c.post('/api/c/portal', {'studentId': self.student, 'replace': True})
            self.assertNotEqual(first['url'], replacement['url'])
            client = self.scoped_client(['messages.send', 'students.view'])
            own = client.post('/api/c/portal', {'studentId': self.student})
            self.assertEqual(own['waUrl'], '')
            self.error('/api/c/portal', {'studentId': self.other_student}, 'err.scope', client=client)
        finally:
            self.c.post('/api/gateway/save', {'url': ''})

    def test_19_roll_rejects_unenrolled_students_and_cancelled_sessions(self):
        self.error('/api/c/roll', {'sessionId': self.session, 'marks': {self.other_student: 'present'}}, 'err.notEnrolled')
        self.c.post('/api/c/session', {'sessionId': self.session, 'status': 'cancelled'})
        self.error('/api/c/roll', {'sessionId': self.session, 'marks': {self.student: 'present'}}, 'err.cancelled')


    def test_20_scoped_delta_reloads_when_student_visibility_changes(self):
        client = self.scoped_client()
        before = self.c.get('/api/version')['version']
        self.c.post('/api/c/enroll', {'studentId': self.other_student, 'groupId': self.group})
        self.assertTrue(client.get('/api/delta?since='+str(before))['full'])
        self.assertIn(self.other_student, {s['id'] for s in client.get('/api/state')['students']})


    def test_21_settings_gateway_status_hides_secrets_and_contacts_survive_edit(self):
        status = self.c.get('/api/gateway')
        self.assertNotIn('officeSecret', status)
        self.assertNotIn('linkSecret', status)
        client = self.scoped_client(['students.manage', 'students.view'])
        row = next(s for s in client.get('/api/state')['students'] if s['id'] == self.student)
        row['name'] = 'Renamed synthetic student'
        client.post('/api/commit', {'ops': [{'e':'students', 'id':self.student, 'op':'put', 'ver':row['ver'], 'row':row}]})
        saved = next(s for s in self.c.get('/api/state')['students'] if s['id'] == self.student)
        self.assertEqual(saved['parentMobile'], '01012345678')
        row['ver'] = saved['ver']
        row['parentMobile'] = '01112345678'
        self.error('/api/commit', {'ops': [{'e':'students', 'id':self.student, 'op':'put', 'ver':row['ver'], 'row':row}]}, None, 403, client)
        with self.assertRaises(ApiError) as denied:
            client.get('/api/gateway')
        self.assertEqual(denied.exception.code, 403)


    def test_22_rules_and_settlement_terms_are_validated_before_save(self):
        for key, value in [('riskCall', -1), ('schoolTeacherPct', 101), ('schoolMaxStudents', 0), ('lateMinutes', 'NaN')]:
            self.error('/api/commit', {'ops':[{'e':'settings','id':key,'op':'put','row':{'value':value}}]}, 'err.setting')
        row = next(t for t in self.c.get('/api/state')['teachers'] if t['id'] == self.teacher)
        for key, value in [('rentMonth', -1), ('centerPct', 101), ('rentSession', 'Infinity')]:
            changed = {**row, key:value}
            self.error('/api/commit', {'ops':[{'e':'teachers','id':self.teacher,'op':'put','ver':row['ver'],'row':changed}]}, 'err.amount')

    def test_23_advisor_ranks_problems_and_respects_permissions(self):
        clash = self.p + '-clash'
        self.put([('groups', clash, {'name': 'Clash ' + self.p, 'teacherId': self.teacher, 'gradeCode': 'S1', 'feeType': 'session',
                   'fee': 50, 'capacity': 30, 'active': True, 'slots': [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'}]}),
                  ('materials', self.p + '-low', {'name': 'Synthetic low handout', 'teacherId': self.teacher, 'stock': 2, 'price': 20})])
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': self.session})   # a session fee nobody paid yet
        before = self.c.get('/api/version')['version']
        advice = self.c.get('/api/c/advice')
        self.assertEqual(self.c.get('/api/version')['version'], before)   # reading advice never writes
        ids = [a['id'] for a in advice]
        for expected in ('clashes', 'debts', 'stockLow'):
            self.assertIn(expected, ids)
        self.assertEqual(advice[0]['level'], 'bad')
        levels = [a['level'] for a in advice]
        self.assertEqual(levels, sorted(levels, key=['bad', 'warn', 'info', 'ok'].index))
        self.assertNotIn('allGood', ids)
        debts = next(a for a in advice if a['id'] == 'debts')
        self.assertGreaterEqual(debts['vars']['amount'], 50)
        # a teacher-scoped user without money permissions hears about his clash but nothing about money
        scoped = [a['id'] for a in self.scoped_client(['overview.view', 'groups.view', 'door.use', 'followup.view']).get('/api/c/advice')]
        self.assertIn('clashes', scoped)
        for hidden in ('debts', 'openShift', 'stockLow', 'staleShifts', 'settle'):
            self.assertNotIn(hidden, scoped)
        # the drawer: work today without an open shift is flagged, and disappears once the shift is open
        if any(s['enrolled'] for s in self.c.get('/api/c/today')['sessions']):
            self.assertIn('openShift', ids)
            self.open_shift()
            self.assertNotIn('openShift', [a['id'] for a in self.c.get('/api/c/advice')])


if __name__ == '__main__':
    unittest.main()
