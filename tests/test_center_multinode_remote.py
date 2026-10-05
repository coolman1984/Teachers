"""Hessa - two PCs of the same centre (the door laptop and the owner's PC) working at the same time while they
cannot reach each other, then meeting again. Real server processes; the connection is cut and restored."""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_multinode import Base  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402

TODAY = date.today()
SLOTS = [{'day': D.weekday(TODAY), 'start': '00:00', 'end': '23:59'}]


def op(e, rid, **row):
    return {'e': e, 'id': rid, 'op': 'put', 'row': row}


class TwoPcCentre(Base):
    N = 2

    def isolate(self):
        for i in range(self.N):
            self.unplug(i)

    def heal(self):
        for i in range(self.N):
            self.plug(i)
        self.converged()

    def state(self, i):
        return self.clients[i].get('/api/state')

    def test_door_and_owner_pc_offline_together(self):
        owner, door = self.clients
        owner.post('/api/commit', {'label': 'seed', 'ops': [
            op('subjects', 'su1', name='رياضيات'), op('teachers', 'te1', name='أ. المعلم', centerPct=20),
            op('groups', 'gr1', name='ثالثة ثانوي', teacherId='te1', subjectId='su1', gradeCode='S3', system='thanaweya', slots=SLOTS,
               capacity=30, feeType='session', fee=50, active=True, kind='center'),
            op('students', 'st1', name='طالب أول', gradeCode='S3', system='thanaweya', active=True),
            op('students', 'st2', name='طالب ثان', gradeCode='S3', system='thanaweya', active=True),
            op('materials', 'ma1', name='ملزمة', teacherId='te1', price=30, cost=10, stock=10, active=True)]})
        for sid in ('st1', 'st2'):
            owner.post('/api/c/enroll', {'studentId': sid, 'groupId': 'gr1'})
        self.converged()
        sess = D.session_id('gr1', TODAY, '00:00')

        self.isolate()
        # the same student is scanned at the door and also ticked on the owner's PC, at the same time
        owner.post('/api/c/checkin', {'studentId': 'st1', 'sessionId': sess, 'status': 'present'})
        door.post('/api/c/checkin', {'studentId': 'st1', 'sessionId': sess, 'status': 'present'})
        door.post('/api/c/checkin', {'studentId': 'st2', 'sessionId': sess, 'status': 'present'})
        # both PCs take money (each with its own cash shift) and sell handouts
        for c in (owner, door):
            c.post('/api/c/shift/open', {'opening': 100})
        p_owner = owner.post('/api/c/pay', {'studentId': 'st1', 'groupId': 'gr1', 'amount': 50, 'method': 'cash'})
        p_door = door.post('/api/c/pay', {'studentId': 'st2', 'groupId': 'gr1', 'amount': 50, 'method': 'cash'})
        owner.post('/api/c/pay', {'kind': 'material', 'materialId': 'ma1', 'qty': 3, 'amount': 90, 'method': 'cash'})
        door.post('/api/c/pay', {'kind': 'material', 'materialId': 'ma1', 'qty': 2, 'amount': 60, 'method': 'cash'})
        # new students on both PCs get codes from different ranges
        owner.post('/api/commit', {'label': 'new', 'ops': [op('students', 'nw1', name='جديد من المكتب', gradeCode='S3', system='thanaweya', active=True)]})
        door.post('/api/commit', {'label': 'new', 'ops': [op('students', 'nw2', name='جديد من الباب', gradeCode='S3', system='thanaweya', active=True)]})
        self.heal()

        for i in range(self.N):
            st = self.state(i)
            att = [a for a in st['attendance'] if a['sessionId'] == sess]
            self.assertEqual(sorted(a['studentId'] for a in att), ['st1', 'st2'], f'PC {i}: one attendance row per student')
            self.assertEqual(len([s for s in st['sessions'] if s['id'] == sess]), 1)
            self.assertEqual([s['status'] for s in st['sessions'] if s['id'] == sess], ['held'])
            nos = sorted(p['no'] for p in st['payments'] if p['kind'] in ('fee', 'material'))
            self.assertEqual(len(nos), 4, nos)
            self.assertEqual(len(set(nos)), 4, 'receipt numbers are unique across PCs')
            self.assertEqual({n.split('-')[1] for n in nos}, {'A', 'B'})
            self.assertEqual({p_owner['no'].split('-')[1], p_door['no'].split('-')[1]}, {'A', 'B'})
            self.assertEqual(next(m for m in st['materials'] if m['id'] == 'ma1')['stock'], 5, 'both sales of handouts count')
            codes = {s['id']: s['code'] for s in st['students']}
            self.assertEqual(len(set(codes.values())), len(codes), 'no two students share a card code')
            self.assertTrue(10000 <= int(codes['nw1']) <= 49999)
            self.assertTrue(50000 <= int(codes['nw2']) <= 69999)
            self.assertEqual(len([s for s in st['shifts'] if s['status'] == 'open']), 2)
        # money facts are the same on both PCs
        a = owner.get('/api/c/student?id=st1')['enrollments'][0]['money']
        b = door.get('/api/c/student?id=st1')['enrollments'][0]['money']
        self.assertEqual((a['owed'], a['paid'], a['balance']), (b['owed'], b['paid'], b['balance']))
        self.assertEqual((a['owed'], a['paid'], a['balance']), (50, 50, 0))


if __name__ == '__main__':
    unittest.main()
