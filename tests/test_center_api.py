"""Real HTTP regression coverage for centre daily operations and access boundaries."""
import os
import sys
import time
import unittest
from datetime import date, timedelta

from harness import ApiError, Server, make_authority

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server'))
import domain as D


class CenterFixture(unittest.TestCase):
    """One server and an administrator; every test gets its own teachers, groups and students."""
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


    def scoped_client(self, perms=None):
        username = self.p + '.scoped'
        self.c.post('/api/users/save', {'username': username, 'full_name': 'Synthetic scoped user',
            'password': 'Strong-pass1', 'must_change': False, 'scopes': [self.teacher],
            'perms': perms or ['students.view', 'door.use', 'groups.view', 'attendance.mark', 'followup.view', 'reports.view']})
        client = self.server.client()
        client.login(username, 'Strong-pass1')
        return client

class CenterApiTest(CenterFixture):
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
            self.assertTrue(first['url'].startswith('http://127.0.0.1:1/t/'), first['url'])   # the path the gateway serves (a #fragment never reaches it)
            self.assertNotIn('#', first['url'])
            token = first['url'].rsplit('/', 1)[1]
            row = next(s for s in self.c.get('/api/state')['students'] if s['id'] == self.student)
            self.assertNotIn('portalHash', row)
            self.assertNotIn('portalNonce', row)
            import sqlite3
            db = sqlite3.connect(os.path.join(self.server.data_dir, 'center.db'))
            try:
                saved = db.execute('SELECT portal_hash FROM students WHERE id=?', (self.student,)).fetchone()[0]
            finally:
                db.close()
            self.assertEqual(saved, gwc.token_hash(token))
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

    def test_22b_the_menu_extras_accept_only_known_pages(self):
        for value in ['exams', ['exams', 'money'], [{'id': 'exams'}]]:
            self.error('/api/commit', {'ops':[{'e':'settings','id':'extras','op':'put','row':{'value':value}}]}, 'err.setting')
        ver = self.c.get('/api/state').get('settingsVer', {}).get('extras')
        self.c.post('/api/commit', {'ops':[{'e':'settings','id':'extras','op':'put','ver':ver,'row':{'value':['devices', 'exams', 'exams']}}]})
        self.assertEqual(self.c.get('/api/state')['settings']['extras'], ['exams', 'devices'])   # known order, no repeats

    def test_24_absentees_are_computed_not_stored(self):
        third, fourth = self.p + '-s3', self.p + '-s4'
        self.put([('students', sid, {'code': str(20000 + type(self).serial * 10 + i), 'name': 'Absent Candidate ' + sid, 'gradeCode': 'S1',
                                     'system': 'thanaweya', 'active': True}) for i, sid in enumerate((third, fourth))])
        for sid in (third, fourth):
            self.c.post('/api/c/enroll', {'studentId': sid, 'groupId': self.group})
        names = lambda: {r['studentId'] for r in self.c.get('/api/c/absent')['rows']}   # noqa: E731
        self.assertFalse({self.student, third, fourth} & names())        # nobody came yet: the session was not held
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': self.session})
        self.c.post('/api/c/roll', {'sessionId': self.session, 'marks': {fourth: 'excused'}})
        got = names()
        self.assertIn(third, got)                                        # enrolled, no mark -> absent (never stored)
        self.assertNotIn(self.student, got)                              # present
        self.assertNotIn(fourth, got)                                    # excused is not chased
        self.assertFalse([a for a in self.c.get('/api/state')['attendance'] if a['studentId'] == third])
        self.c.post('/api/c/followup', {'studentId': third, 'type': 'whatsapp', 'reason': 'absence'})
        row = next(r for r in self.c.get('/api/c/absent')['rows'] if r['studentId'] == third)
        self.assertTrue(row['told'])                                     # the parent is not messaged twice the same day
        scoped = self.scoped_client(['followup.view'])
        self.assertIn(third, {r['studentId'] for r in scoped.get('/api/c/absent')['rows']})

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


class CenterMoneyEdgeTest(CenterFixture):
    """Money edge cases of a real Egyptian school year: price rises, students who leave and come back, mid-month moves."""
    def visit(self, days_ago, group=None, teacher=None, start='10:00'):
        day = (date.today() - timedelta(days=days_ago)).isoformat()
        sid = D.session_id(group or self.group, day, start)
        self.put([('sessions', sid, {'groupId': group or self.group, 'teacherId': teacher or self.teacher, 'date': day,
                                     'start': start, 'end': '11:00', 'status': 'held'})])
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': sid, 'status': 'present'})

    def group_row(self, gid=None):
        return next(g for g in self.c.get('/api/state')['groups'] if g['id'] == (gid or self.group))

    def backdate(self, eid, day):
        row = next(e for e in self.c.get('/api/state')['enrollments'] if e['id'] == eid)
        row['from'] = day
        self.put([('enrollments', eid, row)])

    def money(self):
        return {e['id']: e['money'] for e in self.c.get('/api/c/student?id=' + self.student)['enrollments']}

    def test_25_price_rise_keeps_what_was_owed_before(self):
        self.backdate(self.enrollment, (date.today() - timedelta(days=30)).isoformat())
        self.visit(10)
        self.visit(5)
        g = self.group_row()
        g.update(fee=80, feeHistory=[{'to': '2099-12-31', 'fee': 0, 'type': 'session'}])   # a page cannot forge old prices
        self.c.post('/api/commit', {'label': 'Price rise', 'ops': [{'e': 'groups', 'id': self.group, 'op': 'put', 'ver': g['ver'],
                                                                   'row': g, 'feeFrom': date.today().isoformat()}]})
        g = self.group_row()
        self.assertEqual(g['fee'], 80)
        self.assertEqual(g['feeHistory'], [{'to': (date.today() - timedelta(days=1)).isoformat(), 'fee': 50, 'type': 'session'}])
        self.visit(0)
        self.assertEqual(self.money()[self.enrollment]['owed'], 180)   # 50 + 50 + 80, not 3 x 80
        g.update(fee=90)    # corrected the same day: the price before stays 50
        self.c.post('/api/commit', {'label': 'Price fix', 'ops': [{'e': 'groups', 'id': self.group, 'op': 'put', 'ver': g['ver'], 'row': g,
                                                                 'feeFrom': date.today().isoformat()}]})
        self.assertEqual(self.money()[self.enrollment]['owed'], 190)

    def test_26_leaving_never_wipes_a_debt_and_coming_back_continues_it(self):
        self.backdate(self.enrollment, (date.today() - timedelta(days=30)).isoformat())
        self.visit(10)
        self.visit(5)
        self.c.post('/api/c/leave', {'enrollmentId': self.enrollment, 'to': (date.today() - timedelta(days=2)).isoformat()})
        bal = self.c.get('/api/c/balances')
        self.assertEqual(bal['students'][self.student], -100)
        self.assertIn(self.student, bal['left'])
        self.assertTrue(bal['enrollments'][self.enrollment]['left'])
        self.assertGreaterEqual(self.c.get('/api/c/dashboard')['owed'], 100)
        back = self.c.post('/api/c/enroll', {'studentId': self.student, 'groupId': self.group})['id']
        self.open_shift()
        self.pay(50)
        self.visit(0)
        money = self.money()
        self.assertEqual((money[back]['owed'], money[back]['balance']), (150, -100))   # one account, nothing counted twice
        self.assertTrue(money[self.enrollment]['carried'])
        self.assertEqual(self.c.get('/api/c/balances')['students'][self.student], -100)

    def test_27_mid_month_move_between_month_groups_charges_the_month_once(self):
        month = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)          # first day of last month
        before = (month - timedelta(days=1)).replace(day=1)                              # first day of the month before
        for gid in (self.group, self.other_group):
            g = self.group_row(gid)
            g.update(feeType='month', fee=300, teacherId=self.teacher)
            self.put([('groups', gid, g)])
        self.backdate(self.enrollment, before.isoformat())
        self.c.post('/api/c/transfer', {'enrollmentId': self.enrollment, 'groupId': self.other_group, 'from': month.replace(day=15).isoformat()})
        money = self.c.get('/api/c/student?id=' + self.student)['enrollments']
        new = next(e for e in money if e['status'] == 'active')
        self.assertEqual(new['billFrom'], date.today().replace(day=1).isoformat())
        self.assertEqual(sum(e['money']['owed'] for e in money), 900)                    # 3 months, not 4
        self.error('/api/c/enroll', {'studentId': self.student, 'groupId': self.group, 'billFrom': '2000-01-01'}, 'err.billFrom')

    def test_28_advisor_finds_monthly_students_who_stopped_coming(self):
        g = self.group_row()
        g.update(feeType='month', fee=300)
        self.put([('groups', self.group, g)])
        self.backdate(self.enrollment, (date.today() - timedelta(days=60)).isoformat())
        for ago in (3, 10):
            day = (date.today() - timedelta(days=ago)).isoformat()
            self.put([('sessions', D.session_id(self.group, day, '10:00'), {'groupId': self.group, 'teacherId': self.teacher, 'date': day,
                                                                          'start': '10:00', 'end': '11:00', 'status': 'held'})])
        ids = lambda: {a['id']: a for a in self.c.get('/api/c/advice')}
        self.assertGreaterEqual(ids()['ghosts']['vars']['n'], 1)
        day = (date.today() - timedelta(days=3)).isoformat()
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': D.session_id(self.group, day, '10:00'), 'status': 'present'})
        self.assertNotIn('ghosts', ids())

    def test_29_day_off_cancels_the_day_but_keeps_attended_sessions(self):
        tomorrow = date.today() + timedelta(days=1)
        g = self.group_row()
        g['slots'] = [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'},
                      {'day': D.weekday(tomorrow), 'start': '09:00', 'end': '10:00'}]
        self.put([('groups', self.group, g)])
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': self.session})
        self.error('/api/c/dayoff', {'date': tomorrow.isoformat(), 'reason': ''}, 'err.reason')
        scoped = self.scoped_client(['attendance.mark', 'groups.view'])
        self.error('/api/c/dayoff', {'date': '2000-01-01', 'reason': 'Holiday'}, 'err.pastDay', client=scoped)
        res = self.c.post('/api/c/dayoff', {'date': date.today().isoformat(), 'reason': 'Power cut'})
        self.assertGreaterEqual(res['kept'], 1)              # students were checked in: stays held and charged
        statuses = {s['id']: s['status'] for s in self.c.get('/api/c/today')['sessions']}
        self.assertEqual(statuses[self.session], 'held')
        self.assertEqual(statuses[self.other_session], 'cancelled')
        res = self.c.post('/api/c/dayoff', {'date': tomorrow.isoformat(), 'reason': 'Armed Forces Day'})
        planned = D.session_id(self.group, tomorrow.isoformat(), '09:00')
        day = {s['id']: s for s in self.c.get('/api/c/today?date=' + tomorrow.isoformat())['sessions']}
        self.assertEqual((day[planned]['status'], day[planned]['note']), ('cancelled', 'Armed Forces Day'))
        self.assertEqual(scoped.post('/api/c/dayoff', {'date': tomorrow.isoformat(), 'reason': 'Again'})['cancelled'], 0)

    def test_30_free_trial_is_free_once_per_group_and_enrol_continues(self):
        # a student who is not in this subject attends ONE free session of the group; it is never charged or counted as revenue
        newcomer = self.p + '-new'
        self.put([('students', newcomer, {'code': str(20000 + type(self).serial), 'name': 'Trial Student ' + self.p, 'gradeCode': 'S1',
                                          'system': 'thanaweya', 'consent': True, 'active': True})])
        self.error('/api/c/checkin', {'studentId': newcomer, 'sessionId': self.session}, 'err.notEnrolled')
        card = self.c.get('/api/c/card?id=' + newcomer)
        cand = next(x for x in card['candidates'] if x['session']['id'] == self.session)
        self.assertEqual((cand.get('trial'), cand.get('trialUsed')), (True, False))
        r = self.c.post('/api/c/checkin', {'studentId': newcomer, 'sessionId': self.session, 'trial': True})
        self.assertTrue(r['trial'] and not r['already'])
        self.assertTrue(self.c.post('/api/c/checkin', {'studentId': newcomer, 'sessionId': self.session, 'trial': True})['already'])
        roster = self.c.get('/api/c/roster?session=' + self.session)['rows']
        self.assertTrue(next(x for x in roster if x['student']['id'] == newcomer)['trial'])
        # a trial visit is not billed: enrolling afterwards starts at zero
        eid = self.c.post('/api/c/enroll', {'studentId': newcomer, 'groupId': self.group})['id']
        info = next(e for e in self.c.get('/api/c/student?id=' + newcomer)['enrollments'] if e['id'] == eid)['money']
        self.assertEqual((info['owed'], info['balance']), (0, 0))
        # a second trial of the same group (other day) is refused
        other = self.p + '-new2'
        self.put([('students', other, {'code': str(21000 + type(self).serial), 'name': 'Trial Two ' + self.p, 'gradeCode': 'S1',
                                       'system': 'thanaweya', 'consent': True, 'active': True})])
        self.c.post('/api/c/checkin', {'studentId': other, 'sessionId': self.session, 'trial': True})
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        sid = D.session_id(self.group, yesterday, '10:00')
        self.put([('sessions', sid, {'groupId': self.group, 'teacherId': self.teacher, 'date': yesterday, 'start': '10:00', 'end': '11:00', 'status': 'held'})])
        self.error('/api/c/checkin', {'studentId': other, 'sessionId': sid, 'trial': True}, 'err.trialUsed')

    def test_31_credit_moves_between_groups_of_one_teacher_without_touching_the_drawer(self):
        twin = self.p + '-twin'
        g = self.group_row()
        g.pop('id', None); g.pop('ver', None)
        self.put([('groups', twin, {**g, 'name': 'Twin ' + self.p, 'slots': [{'day': (D.weekday(date.today()) + 3) % 7, 'start': '09:00', 'end': '10:00'}]})])
        shift = self.open_shift()
        self.pay(200)
        before = self.c.get('/api/c/shift?id=' + shift['id'])
        self.error('/api/c/credit/move', {'studentId': self.student, 'from': self.group, 'to': self.other_group}, 'err.creditTeacher')
        self.error('/api/c/credit/move', {'studentId': self.student, 'from': self.group, 'to': twin, 'amount': 500}, 'err.amount')
        r = self.c.post('/api/c/credit/move', {'studentId': self.student, 'from': self.group, 'to': twin, 'amount': 150, 'reason': 'Moved to the twin'})
        self.assertEqual(r['amount'], 150)
        after = self.c.get('/api/c/shift?id=' + shift['id'])
        self.assertEqual(after['expected'], before['expected'])               # not cash: the drawer is untouched
        pays = [p for p in self.c.get('/api/state')['payments'] if p['method'] == 'transfer']
        self.assertEqual(sorted(p['amount'] for p in pays), [-150, 150])
        self.assertEqual(len({p['batch'] for p in pays}), 1)
        self.assertEqual(len({p['no'] for p in pays}), 2)
        self.assertEqual(self.money()[self.enrollment]['balance'], 50)
        eid = self.c.post('/api/c/enroll', {'studentId': self.student, 'groupId': twin})['id']
        self.assertEqual(self.money()[eid]['balance'], 150)
        self.error('/api/c/void', {'id': pays[0]['id'], 'reason': 'oops'}, 'err.voidTransfer')
        self.error('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'kind': 'fee', 'amount': 5, 'method': 'transfer'}, None)
        self.assertEqual(self.c.post('/api/c/credit/move', {'studentId': self.student, 'from': twin, 'to': self.group})['amount'], 150)

    def test_32_family_payment_is_one_commit_and_repeated_reference_is_flagged(self):
        sib = self.p + '-sib'
        self.put([('students', sib, {'code': str(22000 + type(self).serial), 'name': 'Sibling ' + self.p, 'gradeCode': 'S1', 'system': 'thanaweya',
                                     'familyKey': 'fam-' + self.p, 'consent': True, 'active': True})])
        self.c.post('/api/c/enroll', {'studentId': sib, 'groupId': self.group})
        self.open_shift()
        r = self.c.post('/api/c/pay/many', {'method': 'instapay', 'ref': 'IP-' + self.p, 'items': [
            {'studentId': self.student, 'groupId': self.group, 'amount': 60}, {'studentId': sib, 'groupId': self.group, 'amount': 40}]})
        self.assertEqual(r['total'], 100)
        nos = [x['no'] for x in r['receipts']]
        self.assertEqual(len(set(nos)), 2)
        self.assertEqual(len({x['batch'] for x in r['receipts']}), 1)
        # an item that fails (unknown group) saves nothing at all
        before = len(self.c.get('/api/state')['payments'])
        self.error('/api/c/pay/many', {'method': 'cash', 'items': [{'studentId': sib, 'groupId': self.group, 'amount': 5},
                                                                   {'studentId': sib, 'groupId': 'missing', 'amount': 5}]}, 'err.chooseGroup')
        self.assertEqual(len(self.c.get('/api/state')['payments']), before)
        # the same reference again is flagged, and saved only when confirmed
        self.error('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'kind': 'fee', 'amount': 10, 'method': 'instapay', 'ref': 'IP-' + self.p}, 'err.refUsed')
        self.c.post('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'kind': 'fee', 'amount': 10, 'method': 'instapay',
                                   'ref': 'IP-' + self.p, 'confirmDuplicate': True})
        # a reversed receipt frees its reference
        one = self.c.post('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'kind': 'fee', 'amount': 7, 'method': 'vodafone', 'ref': 'VF-' + self.p})
        self.c.post('/api/c/void', {'id': one['id'], 'reason': 'typo'})
        self.c.post('/api/c/pay', {'studentId': self.student, 'groupId': self.group, 'kind': 'fee', 'amount': 7, 'method': 'vodafone', 'ref': 'VF-' + self.p})

    def test_33_day_off_keeps_a_held_session_where_everybody_was_absent(self):
        # a roll call with only absent/excused students has no "present" count but is history, never a cancellation
        self.c.post('/api/c/roll', {'sessionId': self.session, 'marks': {self.student: 'absent'}})
        statuses = {s['id']: s['status'] for s in self.c.get('/api/c/today')['sessions']}
        self.assertEqual(statuses[self.session], 'held')
        res = self.c.post('/api/c/dayoff', {'date': date.today().isoformat(), 'reason': 'Power cut'})
        self.assertGreaterEqual(res['kept'], 1)
        statuses = {s['id']: s['status'] for s in self.c.get('/api/c/today')['sessions']}
        self.assertEqual(statuses[self.session], 'held')                                # still held
        absent = self.c.get('/api/c/absent')['rows']
        self.assertIn(self.student, {r['studentId'] for r in absent})                   # still counted as absent for follow-up
        self.assertEqual(statuses[self.other_session], 'cancelled')                     # the untouched session was cancelled

    def test_34_extra_session_clashes_are_refused_and_it_works_like_any_session(self):
        tomorrow = date.today() + timedelta(days=1)
        r = self.c.post('/api/c/session/add', {'groupId': self.group, 'date': tomorrow.isoformat(), 'start': '18:00', 'end': '19:30', 'topic': 'Revision'})
        self.assertEqual(r['id'], D.session_id(self.group, tomorrow.isoformat(), '18:00'))
        day = {x['id']: x for x in self.c.get('/api/c/today?date=' + tomorrow.isoformat())['sessions']}
        self.assertEqual((day[r['id']]['kind'], day[r['id']]['status'], day[r['id']]['topic']), ('extra', 'planned', 'Revision'))
        self.error('/api/c/session/add', {'groupId': self.group, 'date': tomorrow.isoformat(), 'start': '18:00', 'end': '19:00'}, 'err.sessionExists')
        self.error('/api/c/session/add', {'groupId': self.group, 'date': tomorrow.isoformat(), 'start': '19:00', 'end': '20:00'}, 'err.sessionClash')   # same teacher, overlaps
        self.error('/api/c/session/add', {'groupId': self.group, 'date': tomorrow.isoformat(), 'start': '20:00', 'end': '19:00'}, 'err.sessionTime')
        self.error('/api/c/session/add', {'groupId': self.group, 'date': '2000-01-01', 'start': '10:00', 'end': '11:00'}, 'err.pastDay',
                   client=self.scoped_client(['attendance.mark', 'groups.view']))
        # a cancelled extra session can be brought back
        self.c.post('/api/c/session', {'sessionId': r['id'], 'status': 'cancelled'})
        self.c.post('/api/c/session/add', {'groupId': self.group, 'date': tomorrow.isoformat(), 'start': '18:00', 'end': '19:30'})
        day = {x['id']: x for x in self.c.get('/api/c/today?date=' + tomorrow.isoformat())['sessions']}
        self.assertEqual(day[r['id']]['status'], 'planned')

    def test_35_temporary_timetable_is_saved_cleaned_and_drives_the_sessions(self):
        start = date.today() + timedelta(days=10)
        end = start + timedelta(days=20)
        temp_day = start + timedelta(days=2)
        g = self.group_row()
        g['tempSlots'] = {'from': start.isoformat(), 'to': end.isoformat(), 'slots': [{'day': D.weekday(temp_day), 'start': '21:00', 'end': '22:00'}]}
        self.put([('groups', self.group, g)])
        saved = self.group_row()['tempSlots']
        self.assertEqual((saved['from'], saved['slots'][0]['start']), (start.isoformat(), '21:00'))
        planned = {x['id'] for x in self.c.get('/api/c/today?date=' + temp_day.isoformat())['sessions']}
        self.assertIn(D.session_id(self.group, temp_day, '21:00'), planned)
        self.assertNotIn(D.session_id(self.group, temp_day, '00:00'), planned)           # the regular all-day slot is replaced
        # an invalid period is dropped instead of being stored
        g = self.group_row()
        g['tempSlots'] = {'from': end.isoformat(), 'to': start.isoformat(), 'slots': g['tempSlots']['slots']}
        self.put([('groups', self.group, g)])
        self.assertIsNone(self.group_row().get('tempSlots'))

    def test_36_door_card_lists_brothers_and_sisters_with_what_each_owes(self):
        sib = self.p + '-sib'
        self.put([('students', sib, {'code': str(23000 + type(self).serial), 'name': 'Sibling ' + self.p, 'gradeCode': 'S1', 'system': 'thanaweya',
                                     'familyKey': 'fam-' + self.p, 'parentMobile': '01099999999', 'consent': True, 'active': True})])
        s1 = self.c.get('/api/c/student?id=' + self.student)['student']
        s1['familyKey'] = 'fam-' + self.p
        self.put([('students', self.student, s1)])
        self.c.post('/api/c/enroll', {'studentId': sib, 'groupId': self.group})
        self.visit(0)
        self.c.post('/api/c/checkin', {'studentId': sib, 'sessionId': self.session, 'status': 'present'})
        card = self.c.get('/api/c/card?id=' + self.student)
        self.assertEqual([x['id'] for x in card['family']], [sib])
        line = card['family'][0]['lines'][0]
        self.assertEqual((line['groupId'], line['due']), (self.group, 50))
        self.assertNotIn('parentMobile', card['family'][0])                  # no contact details for the siblings
        self.assertEqual(self.c.get('/api/c/card?id=' + sib)['family'][0]['id'], self.student)

    def test_37_brothers_and_sisters_are_found_by_the_parent_mobile(self):
        """Nothing on the screens set a family, so "Pay for brothers and sisters" only appeared for the sample centre:
        students with the same parent mobile (typed any way) are now one family; another number is not."""
        a, b, other = self.p + '-fa', self.p + '-fb', self.p + '-fo'
        mobile = '0109' + str(1000000 + type(self).serial)[-7:]
        self.put([('students', a, {'name': 'Family A ' + self.p, 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': mobile, 'consent': True, 'active': True}),
                  ('students', b, {'name': 'Family B ' + self.p, 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '+20 ' + mobile[1:], 'consent': True, 'active': True}),
                  ('students', other, {'name': 'Other ' + self.p, 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '0128' + mobile[4:], 'consent': True, 'active': True})])
        for sid in (a, b, other):
            self.c.post('/api/c/enroll', {'studentId': sid, 'groupId': self.group})
        self.assertEqual([x['id'] for x in self.c.get('/api/c/card?id=' + a)['family']], [b])
        self.assertEqual([x['id'] for x in self.c.get('/api/c/card?id=' + b)['family']], [a])
        self.assertEqual(self.c.get('/api/c/card?id=' + other)['family'], [])
        self.assertFalse(self.c.get('/api/c/student?id=' + a)['student'].get('familyKey'))   # never a stored copy of the number
        self.assertEqual([x['id'] for x in self.c.get('/api/c/student?id=' + a)['family']], [b])
        # a new number moves the student out of the family
        row = self.c.get('/api/c/student?id=' + b)['student']
        row['parentMobile'] = '0155' + mobile[4:]
        self.put([('students', b, row)])
        self.assertEqual(self.c.get('/api/c/card?id=' + a)['family'], [])

    def test_38_impossible_numbers_are_refused_not_saved(self):
        """float('nan') passed every "< 0" check, a new group took a negative price (the centre would owe its students),
        and text in a discount or a special fee gave a server error instead of a message."""
        g = self.p + '-gx'
        for bad in (-50, 'abc', 'NaN', 'inf'):
            with self.assertRaises(ApiError) as caught:
                self.put([('groups', g, {'name': 'Bad price ' + self.p, 'teacherId': self.teacher, 'gradeCode': 'S1', 'feeType': 'session', 'fee': bad,
                                         'capacity': 10, 'slots': []})])
            self.assertEqual(caught.exception.data.get('key'), 'err.amount', bad)
        self.assertIsNone(next((x for x in self.c.get('/api/state')['groups'] if x['id'] == g), None))
        row = self.c.get('/api/c/student?id=' + self.student)['student']
        for bad in ('NaN', 'ten', 120, -5):
            with self.assertRaises(ApiError) as caught:
                self.put([('students', self.student, {**row, 'discountPct': bad})])
            self.assertEqual(caught.exception.data.get('key'), 'err.discount', bad)
        self.error('/api/c/enroll', {'studentId': self.other_student, 'groupId': self.group, 'fee': -100}, 'err.amount')
        self.error('/api/c/enroll', {'studentId': self.other_student, 'groupId': self.group, 'fee': 'NaN'}, 'err.amount')
        self.open_shift(0)
        shift = self.c.get('/api/c/shift')['shift']
        for bad in ('NaN', 'Infinity', -10):
            self.error('/api/c/shift/close', {'shiftId': shift['id'], 'counted': bad, 'reason': 'test'}, 'err.amount')
        self.c.post('/api/c/shift/close', {'shiftId': shift['id'], 'counted': 0})
        exam = self.p + '-ex'
        self.c.post('/api/commit', {'label': 'exam', 'ops': [{'e': 'exams', 'id': exam, 'op': 'put', 'row': {
            'title': 'Quiz ' + self.p, 'teacherId': self.teacher, 'groupIds': [self.group], 'date': self.day, 'kind': 'monthly', 'maxScore': 20}}]})
        self.error('/api/c/marks', {'examId': exam, 'items': [{'studentId': self.student, 'score': 'NaN'}]}, 'err.score')
        self.c.post('/api/c/marks', {'examId': exam, 'items': [{'studentId': self.student, 'score': 17.5}]})

    def test_39_expense_reversal_returns_cash_into_an_open_drawer_and_dates_are_real(self):
        self.open_shift(100)
        self.error('/api/c/expense', {'category': 'supplies', 'amount': 30, 'date': '2026-13-45'}, 'err.date')
        e = self.c.post('/api/c/expense', {'category': 'supplies', 'amount': 30})
        shift = self.c.get('/api/c/shift')
        self.assertEqual(shift['expected'], 70)
        self.c.post('/api/c/shift/close', {'shiftId': shift['shift']['id'], 'counted': 70})
        # the cash would come back into no drawer at all: refused until a shift is open, then counted in it
        self.error('/api/c/expense/void', {'id': e['id'], 'reason': 'Bought by mistake'}, 'err.noShift')
        self.open_shift(0)
        self.c.post('/api/c/expense/void', {'id': e['id'], 'reason': 'Bought by mistake'})
        self.assertEqual(self.c.get('/api/c/shift')['expected'], 30)

    def test_guide_facts_follow_the_real_records(self):
        """The learning path's "you are here" comes from the rows: what this person did, never a stored tick."""
        import center
        facts = self.c.get('/api/c/guide-facts')
        self.assertEqual(set(facts), set(center.GUIDE_FACTS))
        self.assertTrue(facts['studentsAdded'] and facts['enrolled'] and facts['teachersAdded'] and facts['groupsAdded'])
        self.open_shift(0)
        self.pay(50)
        facts = self.c.get('/api/c/guide-facts')
        self.assertTrue(facts['myShiftOpened'] and facts['myPayment'])
        self.assertTrue(facts['myStudentAdded'] and facts['myEnrolment'])            # the administrator added them
        # a new receptionist in a busy centre still has their own lessons ahead (review: facts per person, not per centre)
        desk = self.scoped_client(['students.view', 'students.manage', 'groups.view', 'door.use'])
        mine = desk.get('/api/c/guide-facts')
        self.assertTrue(mine['studentsAdded'])
        self.assertFalse(mine['myStudentAdded'] or mine['myEnrolment'] or mine['myShiftOpened'] or mine['myPayment'])
