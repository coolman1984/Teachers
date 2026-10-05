"""Hessa - the centre's daily scenarios through the real HTTP API (a real server process, like the browser uses)."""
import os
import sys
import time
import unittest
import urllib.parse
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ApiError, Server, make_authority  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402

TODAY = date.today()
WD = D.weekday(TODAY)
ALL_DAY = [{'day': WD, 'start': '00:00', 'end': '23:59'}]
PW = 'Strong-pass2'


def op(e, rid, **row):
    return {'e': e, 'id': rid, 'op': 'put', 'row': row}


class Base(unittest.TestCase):
    srv = None
    admin = None
    n = 0

    @classmethod
    def setUpClass(cls):
        cls.srv = Server('center').start()
        cls.admin = make_authority(cls.srv)

    @classmethod
    def tearDownClass(cls):
        cls.srv.cleanup()

    def uid(self, prefix):
        Base.n += 1
        return f'{prefix}{Base.n:04d}'

    def commit(self, *ops, client=None):
        return (client or self.admin).post('/api/commit', {'label': 'test', 'ops': list(ops)})

    def teacher(self, **kw):
        tid = self.uid('t')
        self.commit(op('teachers', tid, name=kw.pop('name', 'معلم ' + tid), active=True, **kw))
        return tid

    def group(self, teacher, subject='sub-math', fee_type='session', fee=50, slots=None, **kw):
        gid = self.uid('g')
        self.commit(op('groups', gid, name=kw.pop('name', 'مجموعة ' + gid), teacherId=teacher, subjectId=subject, gradeCode=kw.pop('gradeCode', 'S3'),
                       system='thanaweya', slots=slots if slots is not None else ALL_DAY, capacity=kw.pop('capacity', 30), feeType=fee_type, fee=fee,
                       active=True, kind=kw.pop('kind', 'center'), **kw))
        return gid

    def student(self, name=None, **kw):
        sid = self.uid('s')
        self.commit(op('students', sid, name=name or 'طالب ' + sid, gradeCode=kw.pop('gradeCode', 'S3'), system='thanaweya', active=True, **kw))
        return sid

    def enroll(self, sid, gid, frm=None, client=None):
        return (client or self.admin).post('/api/c/enroll', {'studentId': sid, 'groupId': gid, 'from': frm or TODAY.isoformat()})

    def session_id(self, gid, d=TODAY, start='00:00'):
        return D.session_id(gid, d, start)

    def checkin(self, sid, gid, d=TODAY, **kw):
        return self.admin.post('/api/c/checkin', {'studentId': sid, 'sessionId': self.session_id(gid, d), **kw})

    def open_shift(self, client=None, opening=0):
        c = client or self.admin
        sh = c.get('/api/c/shift')
        if sh.get('shift'):
            return sh['shift']
        c.post('/api/c/shift/open', {'opening': opening})
        return c.get('/api/c/shift')['shift']

    def close_open_shift(self):
        sh = self.admin.get('/api/c/shift')
        if sh.get('shift'):
            self.admin.post('/api/c/shift/close', {'shiftId': sh['shift']['id'], 'counted': sh['expected'], 'reason': ''})

    def user(self, username, perms, scopes=None):
        self.admin.post('/api/users/save', {'full_name': 'User ' + username, 'username': username, 'perms': perms, 'scopes': scopes,
                                            'password': PW, 'must_change': False, 'role': 'Custom'})
        c = self.srv.client()
        c.login(username, PW)
        return c

    def expect_error(self, fn, key=None, code=400):
        with self.assertRaises(ApiError) as cm:
            fn()
        self.assertEqual(cm.exception.code, code, cm.exception)
        if key:
            self.assertEqual(cm.exception.key, key, cm.exception)
        return cm.exception


class SetupTest(Base):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.admin.post('/api/commit', {'label': 'seed', 'ops': [op('subjects', 'sub-math', name='رياضيات', nameEn='Maths'),
                                                              op('subjects', 'sub-sci', name='علوم', nameEn='Science'),
                                                              op('rooms', 'r1', name='A', capacity=40, costPerHour=30)]})

    # ------------------------------------------------------------------ the door
    def test_01_peak_day_at_the_door(self):
        t = self.teacher()
        groups = [self.group(t, fee=40) for _ in range(4)]
        ids = []
        ops = []
        for i in range(200):
            sid = f'pk{i:03d}'
            ids.append(sid)
            ops.append(op('students', sid, name=f'طالب الذروة {i}', gradeCode='S3', system='thanaweya', active=True))
        self.commit(*ops)
        self.commit(*[op('enrollments', f'enpk{i:03d}', studentId=sid, groupId=groups[i % 4], teacherId=t, **{'from': TODAY.isoformat()}, status='active')
                      for i, sid in enumerate(ids)])
        t0 = time.time()
        results = [self.checkin(sid, groups[i % 4]) for i, sid in enumerate(ids)]
        took = time.time() - t0
        self.assertLess(took, 90, f'200 check-ins took {took:.1f}s')
        self.assertEqual({r['already'] for r in results}, {False})
        # second scan of everybody: nothing changes
        again = [self.checkin(sid, groups[i % 4]) for i, sid in enumerate(ids[:20])]
        self.assertEqual({r['already'] for r in again}, {True})
        # exactly one session row per group, attendance rows have deterministic ids
        st = self.admin.get('/api/state')
        sess = [s for s in st['sessions'] if s['groupId'] in groups]
        self.assertEqual(sorted(s['groupId'] for s in sess), sorted(groups))
        self.assertEqual({s['status'] for s in sess}, {'held'})
        att = [a for a in st['attendance'] if a['groupId'] in groups]
        self.assertEqual(len(att), 200)
        self.assertIn('at-' + self.session_id(groups[0])[3:] + '-pk000', {a['id'] for a in att})
        # lateness follows the clock: the session starts at 00:00
        now_min = datetime.now().hour * 60 + datetime.now().minute
        self.assertEqual({a['status'] for a in att}, {'late' if now_min > 15 else 'present'})
        roster = self.admin.get('/api/c/roster?session=' + self.session_id(groups[0]))
        self.assertEqual(len([r for r in roster['rows'] if r['status'] in ('present', 'late')]), 50)
        today = next(x for x in self.admin.get('/api/c/today')['sessions'] if x['id'] == self.session_id(groups[0]))
        self.assertEqual((today['present'], today['enrolled']), (50, 50))

    def test_02_find_card_and_makeup(self):
        t1, t2 = self.teacher(), self.teacher()
        ga, gb = self.group(t1, subject='sub-math'), self.group(t2, subject='sub-math')
        gc = self.group(t1, subject='sub-sci')
        s = self.student('أحمد عبد الله', parentMobile='٠١٠٠١٢٣٤٥٦٧', mobile='01111111111')
        code = self.admin.get('/api/state')['students']
        code = next(x for x in code if x['id'] == s)['code']
        self.assertRegex(code, r'^\d{5}$')
        self.assertEqual(next(x for x in self.admin.get('/api/state')['students'] if x['id'] == s)['parentMobile'], '01001234567')
        self.enroll(s, ga)
        # find by code, mobile digits and part of the name (Arabic spelling variants)
        for q in (code, '01001234567', '1234567', 'احمد عبدالله', 'أحمد'):
            self.assertIn(s, [x['id'] for x in self.admin.get('/api/c/find?q=' + urllib.parse.quote(q))], q)
        card = self.admin.get('/api/c/card?id=' + s)
        self.assertEqual(card['student']['id'], s)
        own = [c for c in card['candidates'] if c['own']]
        self.assertEqual([c['session']['groupId'] for c in own], [ga])
        self.assertEqual(card['suggested'], self.session_id(ga))
        self.assertTrue(any(c['makeup'] and c['session']['groupId'] == gb for c in card['candidates']))
        # a make-up in the other group of the same subject: attendance stays with his own group
        r = self.checkin(s, gb)
        self.assertTrue(r['makeup'])
        att = next(a for a in self.admin.get('/api/state')['attendance'] if a['id'] == r['id'])
        self.assertEqual((att['groupId'], att['makeup']), (ga, True))
        # not enrolled in that subject at all
        self.expect_error(lambda: self.checkin(s, gc), 'err.notEnrolled')

    # ------------------------------------------------------------------ money
    def test_03_money_receipts_reversals_and_the_drawer(self):
        self.close_open_shift()
        t = self.teacher()
        g = self.group(t, fee=100)
        s = self.student()
        self.enroll(s, g)
        self.expect_error(lambda: self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': 100, 'method': 'cash'}), 'err.noShift')
        self.admin.post('/api/c/shift/open', {'opening': 500})
        self.expect_error(lambda: self.admin.post('/api/c/shift/open', {'opening': 5}), 'err.shiftOpen')
        p1 = self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': 100, 'method': 'cash'})
        p2 = self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': 50, 'method': 'vodafone', 'ref': '0100'})
        self.assertRegex(p1['no'], r'^R\d{2}-A-\d{6}$')
        self.assertLess(p1['no'], p2['no'])
        shift = self.admin.get('/api/c/shift')
        self.assertEqual(shift['expected'], 600)                  # 500 opening + 100 cash (the 50 e-wallet is not in the drawer)
        self.assertEqual(shift['byMethod'], {'cash': 100, 'vodafone': 50})
        # a receipt is reversed, never edited
        v = self.admin.post('/api/c/void', {'id': p1['id'], 'reason': 'taken twice'})
        self.assertRegex(v['no'], r'^R\d{2}-A-\d{6}$')
        self.expect_error(lambda: self.admin.post('/api/c/void', {'id': p1['id'], 'reason': 'again'}), 'err.voided')
        self.expect_error(lambda: self.admin.post('/api/c/void', {'id': v['id'], 'reason': 'again'}), 'err.voidVoid')
        self.expect_error(lambda: self.admin.post('/api/c/void', {'id': p2['id'], 'reason': ''}), 'err.reason')
        rows = {x['id']: x for x in self.admin.get('/api/c/money')['payments']}
        self.assertEqual((rows[v['id']]['amount'], rows[v['id']]['voidOf']), (-100, p1['id']))
        # nobody can change the ledger through the generic save, not even the administrator
        self.expect_error(lambda: self.commit(op('payments', p1['id'], no='x', amount=1)), code=403)
        self.expect_error(lambda: self.admin.post('/api/commit', {'label': 't', 'ops': [{'e': 'payments', 'id': p1['id'], 'op': 'del'}]}), code=403)
        self.expect_error(lambda: self.commit(op('shifts', shift['shift']['id'], status='closed')), code=403)
        shift = self.admin.get('/api/c/shift')
        self.assertEqual(shift['expected'], 500)                  # the cash receipt was reversed
        # closing the drawer: a difference needs a reason and is kept
        self.expect_error(lambda: self.admin.post('/api/c/shift/close', {'shiftId': shift['shift']['id'], 'counted': 480}), 'err.diffReason')
        res = self.admin.post('/api/c/shift/close', {'shiftId': shift['shift']['id'], 'counted': 480, 'reason': 'change given'})
        self.assertEqual((res['expected'], res['counted'], res['diff']), (500, 480, -20))
        self.expect_error(lambda: self.admin.post('/api/c/shift/close', {'shiftId': shift['shift']['id'], 'counted': 480, 'reason': 'x'}), 'err.shiftClosed')
        closed = next(x for x in self.admin.get('/api/c/shifts') if x['id'] == shift['shift']['id'])
        self.assertEqual((closed['status'], closed['diff'], closed['diffReason']), ('closed', -20, 'change given'))

    def test_04_fees_per_session_month_and_package(self):
        t = self.teacher()
        self.open_shift()
        s = self.student()
        gs = self.group(t, fee_type='session', fee=50)
        gm = self.group(t, fee_type='month', fee=300, subject='sub-sci')
        gp = self.group(t, fee_type='package', fee=400, packageSessions=8, subject='sub-math')
        past = [TODAY - timedelta(days=7 * k) for k in (1, 2, 3)]
        start = (TODAY - timedelta(days=40)).isoformat()
        month_start = (TODAY.replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()       # first day of last month
        self.enroll(s, gs, start)
        self.enroll(s, gm, month_start)
        self.enroll(s, gp, start)
        for d in past:
            self.checkin(s, gs, d)
            self.checkin(s, gp, d)
        self.admin.post('/api/c/pay', {'studentId': s, 'groupId': gs, 'amount': 100, 'method': 'cash'})
        self.admin.post('/api/c/pay', {'studentId': s, 'groupId': gp, 'amount': 400, 'method': 'cash'})
        f = self.admin.get('/api/c/student?id=' + s)
        money = {e['groupId']: e['money'] for e in f['enrollments']}
        self.assertEqual((money[gs]['owed'], money[gs]['balance'], money[gs]['due']), (150, -50, 50))
        self.assertEqual((money[gm]['units'], money[gm]['owed'], money[gm]['balance']), (2, 600, -600))
        self.assertEqual((money[gp]['owed'], money[gp]['balance'], money[gp]['sessionsLeft']), (150, 250, 5))
        # the past sessions were recorded on dates before today (allowed for the administrator)
        self.assertEqual(len([a for a in f['attendance'] if a['groupId'] == gs]), 3)

    def test_05_wallet(self):
        t = self.teacher()
        self.open_shift()
        g = self.group(t, fee=120)
        s = self.student()
        self.enroll(s, g)
        self.admin.post('/api/c/pay', {'studentId': s, 'kind': 'wallet_topup', 'amount': 300, 'method': 'cash'})
        self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': 120, 'method': 'wallet'})
        self.assertEqual(self.admin.get('/api/c/student?id=' + s)['wallet'], 180)
        e = self.expect_error(lambda: self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': 500, 'method': 'wallet'}), 'err.walletLow')
        self.assertEqual(e.data['vars']['have'], 180)
        self.expect_error(lambda: self.admin.post('/api/c/pay', {'studentId': s, 'kind': 'wallet_topup', 'amount': 10, 'method': 'wallet'}), code=400)
        self.expect_error(lambda: self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': -5, 'method': 'cash'}), 'err.amount')

    def test_06_transfer_capacity_and_school_groups(self):
        t = self.teacher()
        a, b = self.group(t, capacity=2, name='A'), self.group(t, capacity=1, name='B')
        s1, s2, s3 = self.student(), self.student(), self.student()
        e1 = self.enroll(s1, a)['id']
        self.enroll(s2, a)
        self.expect_error(lambda: self.enroll(s3, a), 'err.groupFull')
        self.expect_error(lambda: self.enroll(s1, a), 'err.alreadyEnrolled')
        self.enroll(s3, b)
        self.expect_error(lambda: self.admin.post('/api/c/transfer', {'enrollmentId': e1, 'groupId': b}), 'err.groupFull')
        self.expect_error(lambda: self.admin.post('/api/c/transfer', {'enrollmentId': e1, 'groupId': a}), 'err.sameGroup')
        c = self.group(t, capacity=5, name='C')
        day = (TODAY + timedelta(days=3)).isoformat()
        self.admin.post('/api/c/transfer', {'enrollmentId': e1, 'groupId': c, 'from': day, 'reason': 'time'})
        ens = [e for e in self.admin.get('/api/state')['enrollments'] if e['studentId'] == s1]
        old = next(e for e in ens if e['groupId'] == a)
        new = next(e for e in ens if e['groupId'] == c)
        self.assertEqual((old['status'], old['to']), ('moved', (TODAY + timedelta(days=2)).isoformat()))
        self.assertEqual((new['status'], new['from']), ('active', day))
        # school support groups follow decree 149/2024
        self.expect_error(lambda: self.group(t, kind='school', fee=150, capacity=20), 'err.schoolFee')
        self.expect_error(lambda: self.group(t, kind='school', fee=60, capacity=40), 'err.schoolSize')
        ok = self.group(t, kind='school', fee=60, capacity=25)
        self.assertEqual(next(x for x in self.admin.get('/api/state')['groups'] if x['id'] == ok)['feeType'], 'session')

    def test_07_a_limited_teacher_sees_only_his_own_work(self):
        mine, other = self.teacher(name='أ. الأول'), self.teacher(name='أ. الثاني')
        gm, go = self.group(mine), self.group(other)
        sm, so = self.student('طالبي', parentMobile='01012345678'), self.student('طالب آخر', parentMobile='01099999999')
        self.enroll(sm, gm)
        self.enroll(so, go)
        self.open_shift()
        self.admin.post('/api/c/pay', {'studentId': so, 'groupId': go, 'amount': 40, 'method': 'cash'})
        perms = ['overview.view', 'students.view', 'groups.view', 'attendance.mark', 'students.manage', 'exams.view', 'reports.view']
        c = self.user('teacher.' + mine[-4:], perms, [mine])
        st = c.get('/api/state')
        self.assertEqual([x['id'] for x in st['teachers']], [mine])
        self.assertEqual({x['teacherId'] for x in st['groups']}, {mine})
        self.assertIn(sm, {x['id'] for x in st['students']})
        self.assertNotIn(so, {x['id'] for x in st['students']})
        self.assertEqual([p for p in st['payments'] if p.get('teacherId') == other], [])
        # no phone numbers without the permission, no other teacher's session or student
        self.assertNotIn('parentMobile', next(x for x in st['students'] if x['id'] == sm))
        self.expect_error(lambda: c.post('/api/c/checkin', {'studentId': so, 'sessionId': self.session_id(go)}), code=400)
        self.expect_error(lambda: c.get('/api/c/card?id=' + so), code=400)
        self.expect_error(lambda: c.post('/api/c/pay', {'studentId': sm, 'groupId': gm, 'amount': 10, 'method': 'cash'}), 'err.perm')
        self.expect_error(lambda: c.get('/api/c/money'), code=403)
        gver = next(x for x in self.admin.get('/api/state')['groups'] if x['id'] == go)['ver']
        self.expect_error(lambda: c.post('/api/commit', {'label': 't', 'ops': [{'e': 'groups', 'id': go, 'op': 'put', 'ver': gver, 'row': {'name': 'stolen'}}]}), code=403)
        r = c.post('/api/c/checkin', {'studentId': sm, 'sessionId': self.session_id(gm)})
        self.assertFalse(r['already'])
        # editing a student without seeing the numbers must not erase them
        row = {k: v for k, v in next(x for x in st['students'] if x['id'] == sm).items() if k not in ('id', 'ver')}
        row['notes'] = 'edited by the teacher'
        c.post('/api/commit', {'label': 't', 'ops': [{'e': 'students', 'id': sm, 'op': 'put', 'ver': next(x for x in st['students'] if x['id'] == sm)['ver'], 'row': row}]})
        full = next(x for x in self.admin.get('/api/state')['students'] if x['id'] == sm)
        self.assertEqual((full['parentMobile'], full['notes']), ('01012345678', 'edited by the teacher'))
        d = c.get('/api/delta?since=0')
        self.assertTrue(d.get('full') or 'parentMobile' not in str(d.get('rows', {}).get('students', [])))

    # ------------------------------------------------------------------ settlements, handouts
    def test_08_teacher_settlement(self):
        self.open_shift()
        t = self.teacher(name='أ. الحساب', rentSession=100)
        slots = [{'day': WD, 'start': f'{h:02d}:00', 'end': f'{h:02d}:50'} for h in range(4)]
        g = self.group(t, fee=250, slots=slots)
        s = self.student()
        self.enroll(s, g)
        for h in range(4):
            self.admin.post('/api/c/checkin', {'studentId': s, 'sessionId': D.session_id(g, TODAY, f'{h:02d}:00'), 'status': 'present'})
        for _ in range(4):
            self.admin.post('/api/c/pay', {'studentId': s, 'groupId': g, 'amount': 250, 'method': 'cash'})
        ym = TODAY.strftime('%Y-%m')
        s1 = next(x for x in self.admin.get('/api/c/settlements?ym=' + ym) if x['teacherId'] == t)
        self.assertEqual((s1['revenue'], s1['sessions'], s1['visits'], s1['centerShare']), (1000, 4, 4, 400))
        self.assertEqual((s1['teacherShare'], s1['net'], s1['remaining']), (600, 600, 600))
        self.admin.post('/api/c/expense', {'category': 'teacher_payout', 'amount': 250, 'method': 'cash', 'teacherId': t, 'note': 'first part'})
        s2 = next(x for x in self.admin.get('/api/c/settlements?ym=' + ym) if x['teacherId'] == t)
        self.assertEqual((s2['paid'], s2['remaining'], s2['deductions']), (250, 350, 0))
        self.admin.post('/api/c/settlement/approve', {'teacherId': t, 'ym': ym})
        self.admin.post('/api/c/settlement/approve', {'teacherId': t, 'ym': ym})
        rows = [x for x in self.admin.get('/api/state')['settlements'] if x['teacherId'] == t]
        self.assertEqual([x['id'] for x in rows], [f'st-{t}-{ym}'])
        self.assertEqual((rows[0]['status'], rows[0]['centerShare']), ('approved', 400))
        self.expect_error(lambda: self.admin.get('/api/c/settlements?ym=2026-13'), 'err.month')

    def test_09_handouts_stock_and_reversal(self):
        self.open_shift()
        t = self.teacher()
        mid = self.uid('m')
        self.commit(op('materials', mid, name='ملزمة الباب الأول', teacherId=t, price=35, cost=12, stock=10, active=True))
        s = self.student()
        p = self.admin.post('/api/c/pay', {'kind': 'material', 'materialId': mid, 'qty': 3, 'amount': 105, 'method': 'cash', 'studentId': s})
        stock = lambda: next(x for x in self.admin.get('/api/state')['materials'] if x['id'] == mid)['stock']  # noqa: E731
        self.assertEqual(stock(), 7)
        self.admin.post('/api/c/void', {'id': p['id'], 'reason': 'returned'})
        self.assertEqual(stock(), 10)
        ym = TODAY.strftime('%Y-%m')
        self.admin.post('/api/c/pay', {'kind': 'material', 'materialId': mid, 'qty': 2, 'amount': 70, 'method': 'cash'})
        sett = next(x for x in self.admin.get('/api/c/settlements?ym=' + ym) if x['teacherId'] == t)
        self.assertEqual((sett['materials'], sett['materialsCost']), (70, 24))        # handouts: sold - reversed, printing cost deducted

    def test_10_import_students_from_a_csv(self):
        t = self.teacher()
        g = self.group(t, name='ثالثة ثانوي - السبت 5م')
        csv = ('الاسم,الصف,رقم ولي الأمر,المجموعة,المدرسة\n'
               'محمد أحمد علي,اولى ثانوى,٠١٠١٢٣٤٥٦٧٨,ثالثة ثانوي - السبت 5م,مدرسة النصر\n'
               'سارة محمود,3 ثانوي,+201112345678,ثالثة ثانوي - السبت 5م,\n'
               'منى,تالته اعدادي,12345,مجموعة مجهولة,\n'
               ',,,,\n').encode('utf-8-sig')
        pre = self.admin.call('POST', '/api/import/preview?name=students.csv', raw=csv)
        rows = pre['rows']
        self.assertEqual(len(rows), 3)
        self.assertEqual([r['gradeCode'] for r in rows], ['S1', 'S3', 'M3'])
        self.assertEqual(rows[0]['parentMobile'], '01012345678')
        self.assertEqual(rows[1]['parentMobile'], '01112345678')
        self.assertEqual(rows[0]['groupId'], g)
        self.assertIn('imp.badMobile', rows[2]['warnings'])
        self.assertIn('imp.noGroup', rows[2]['warnings'])
        before = len(self.admin.get('/api/state')['students'])
        # The combined server rejects mismatched grades and invalid phones atomically.
        self.expect_error(lambda: self.admin.post('/api/c/import', {'rows': rows}), 'err.grade')
        self.assertEqual(len(self.admin.get('/api/state')['students']), before)
        first_grade_group = self.group(t, name='أولى ثانوي - مجموعة تجريبية', gradeCode='S1')
        rows[0]['groupId'] = first_grade_group
        self.expect_error(lambda: self.admin.post('/api/c/import', {'rows': rows}), 'err.mobile')
        self.assertEqual(len(self.admin.get('/api/state')['students']), before)
        rows[2]['parentMobile'] = ''
        res = self.admin.post('/api/c/import', {'rows': rows})
        self.assertEqual(res['students'], 3)
        st = self.admin.get('/api/state')
        self.assertEqual(len(st['students']), before + 3)
        names = {x['name']: x for x in st['students']}
        self.assertEqual(names['محمد أحمد علي']['gradeCode'], 'S1')
        self.assertEqual(len({x['code'] for x in st['students']}), len(st['students']))        # every card code is unique
        self.assertEqual(len([e for e in st['enrollments'] if e['groupId'] == g]), 1)
        self.assertEqual(len([e for e in st['enrollments'] if e['groupId'] == first_grade_group]), 1)
        # importing the same file again recognises everybody
        again = self.admin.call('POST', '/api/import/preview?name=students.csv', raw=csv)
        again['rows'][0]['groupId'] = first_grade_group
        again['rows'][2]['parentMobile'] = ''
        # The invalid original phone cannot match the corrected profile; commit still deduplicates it.
        res2 = self.admin.post('/api/c/import', {'rows': again['rows']})
        self.assertEqual(len(self.admin.get('/api/state')['students']), before + 3)
        self.assertEqual(res2['students'], 0)
        self.assertEqual(len([e for e in self.admin.get('/api/state')['enrollments'] if e['groupId'] == g]), 1)
        self.expect_error(lambda: self.admin.call('POST', '/api/import/preview?name=x.csv', raw='a,b\n1,2\n'.encode()), 'err.noRows')

    def test_11_delta_returns_only_what_changed(self):
        t = self.teacher()
        g = self.group(t)
        s = self.student()
        self.enroll(s, g)
        v = self.admin.get('/api/version')['version']
        self.assertEqual(self.admin.get(f'/api/delta?since={v}')['rows'], {})
        r = self.checkin(s, g)
        d = self.admin.get(f'/api/delta?since={v}')
        self.assertEqual(sorted(d['rows']), ['attendance', 'sessions'])
        self.assertEqual([a['id'] for a in d['rows']['attendance']], [r['id']])
        self.assertEqual(d['gone'], {})
        self.assertGreater(d['version'], v)
        self.assertEqual(self.admin.get('/api/delta?since=999999')['full'], True)

    def test_12_early_warning_and_followup(self):
        t = self.teacher()
        g = self.group(t, fee=60)
        good, bad = self.student(), self.student()
        for s in (good, bad):
            self.enroll(s, g, (TODAY - timedelta(days=60)).isoformat())
        days = [TODAY - timedelta(days=7 * k) for k in range(1, 7)]
        for d in days:
            self.admin.post('/api/c/session', {'sessionId': self.session_id(g, d), 'status': 'held'})
            self.checkin(good, g, d)
        for d in days[:2]:
            pass
        risk = self.admin.get('/api/c/risk')
        mine = {r['studentId']: r for r in risk if r['groupId'] == g}
        self.assertNotIn(good, mine)
        self.assertIn(bad, mine)
        self.assertGreaterEqual(mine[bad]['score'], 50)
        self.assertIn('risk.absent3', mine[bad]['why'])
        before = mine[bad]['score']
        self.admin.post('/api/c/followup', {'studentId': bad, 'type': 'call', 'reason': 'absence', 'outcome': 'will come on Saturday'})
        after = {r['studentId']: r for r in self.admin.get('/api/c/risk') if r['groupId'] == g}[bad]
        self.assertTrue(after['followed'])
        self.assertEqual(after['score'], before - 10)


if __name__ == '__main__':
    unittest.main()
