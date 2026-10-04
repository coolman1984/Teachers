"""Two real centre servers keep working while their TLS sync links are unplugged."""
from datetime import date
from test_multinode import Base
import domain as D


class CenterTwoPcTest(Base):
    N = 2

    @classmethod
    def setUpClass(cls):
        cls.addClassCleanup(cls.cleanup_cluster)
        super().setUpClass()

    @classmethod
    def cleanup_cluster(cls):
        for proxy in getattr(cls, 'proxies', []):
            proxy.close()
        for server in getattr(cls, 'servers', []):
            server.cleanup()

    def test_offline_door_money_stock_and_student_ranges(self):
        a, b = self.clients
        day = date.today().isoformat()
        records = [
            ('teachers','net-t', {'name':'Synthetic Network Teacher'}),
            ('students','net-s', {'name':'Synthetic Network Student', 'gradeCode':'S1', 'code':'10001'}),
            ('groups','net-g', {'name':'Synthetic Network Group', 'teacherId':'net-t', 'subjectId':'net-sub',
                'gradeCode':'S1', 'feeType':'session', 'fee':50, 'slots':[{'day':D.weekday(date.today()),'start':'00:00','end':'23:59'}]}),
            ('materials','net-m', {'name':'Synthetic Network Handout', 'teacherId':'net-t', 'price':20, 'stock':10})]
        a.post('/api/commit', {'label':'Synthetic network centre', 'ops':[{'e':e,'id':rid,'op':'put','row':row} for e,rid,row in records]})
        a.post('/api/c/enroll', {'studentId':'net-s','groupId':'net-g'})
        self.converged()
        numbers, codes = [], []
        for i in range(2):
            self.unplug(i)
        try:
            for i,c in enumerate(self.clients):
                out=c.post('/api/c/checkin', {'studentId':'net-s','sessionId':D.session_id('net-g',day,'00:00')})
                self.assertFalse(out['already'])
                c.post('/api/c/shift/open', {'opening':0})
                receipt=c.post('/api/c/pay', {'studentId':'net-s','kind':'material','materialId':'net-m','qty':3,'amount':60})
                letter=c.get('/api/state')['node']['letter']
                self.assertTrue(receipt['no'].startswith('R'+day[2:4]+'-'+letter+'-'))
                numbers.append(receipt['no'])
                sid='net-new-'+str(i)
                c.post('/api/commit', {'label':'Offline synthetic student','ops':[{'e':'students','id':sid,'op':'put','row':{'name':'Synthetic Offline '+str(i),'gradeCode':'S1'}}]})
                codes.append(next(s['code'] for s in c.get('/api/state')['students'] if s['id']==sid))
                self.assertEqual(next(m['stock'] for m in c.get('/api/state')['materials'] if m['id']=='net-m'),7)
            self.assertEqual(len(set(numbers)),2)
            self.assertEqual(len(set(codes)),2)
        finally:
            for i in range(2):
                self.plug(i)
        self.converged(timeout=60)
        for c in self.clients:
            state=c.get('/api/state')
            self.assertEqual(len([r for r in state['attendance'] if r['studentId']=='net-s']),1)
            self.assertEqual(len([r for r in state['sessions'] if r['groupId']=='net-g']),1)
            self.assertEqual({r['no'] for r in state['payments'] if r['studentId']=='net-s'},set(numbers))
            self.assertEqual(next(m['stock'] for m in state['materials'] if m['id']=='net-m'),4)
            self.assertTrue(c.post('/api/devices/verify', {'all':True})['ok'])
