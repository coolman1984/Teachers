"""Partitioned centre nodes: deterministic attendance, receipt ranges, additive handout stock."""
import unittest
from datetime import date, datetime
from cluster import Cluster
import center
import domain as D
from auth import ALL


class CenterTwoPcTest(unittest.TestCase):
    def test_offline_checkin_receipts_codes_and_handout_counter(self):
        cluster = Cluster(2)
        try:
            a, b = cluster.peers
            day = date.today().isoformat()
            a.commit('Synthetic centre', [
                {'e': 'teachers', 'id': 't1', 'op': 'put', 'row': {'name': 'Synthetic Teacher'}},
                {'e': 'students', 'id': 's1', 'op': 'put', 'row': {'name': 'Synthetic Student', 'code': '10001', 'gradeCode': 'S1'}},
                {'e': 'groups', 'id': 'g1', 'op': 'put', 'row': {'name': 'Synthetic Group', 'teacherId': 't1', 'subjectId': 'sub1', 'fee': 50,
                    'feeType': 'session', 'slots': [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'}]}},
                {'e': 'enrollments', 'id': 'en1', 'op': 'put', 'row': {'studentId': 's1', 'groupId': 'g1', 'teacherId': 't1', 'from': day, 'status': 'active'}},
                {'e': 'materials', 'id': 'mat1', 'op': 'put', 'row': {'name': 'Synthetic Handout', 'teacherId': 't1', 'stock': 10, 'price': 20}}])
            cluster.converge()
            receipts, codes = [], []
            for peer in (a, b):
                ctx = center.Ctx(peer.store, peer.journal, peer.node.id, peer.name, '127.0.0.1', peer.name, None, ALL)
                first = center.checkin(ctx, 's1', D.session_id('g1', day, '00:00'), now=datetime.combine(date.today(), datetime.min.time()))
                again = center.checkin(ctx, 's1', D.session_id('g1', day, '00:00'), now=datetime.combine(date.today(), datetime.max.time()))
                self.assertTrue(again['already'])
                self.assertEqual(first['status'], again['status'])
                center.open_shift(ctx, 0)
                receipts.append(center.pay(ctx, {'studentId': 's1', 'kind': 'material', 'materialId': 'mat1', 'amount': 60, 'qty': 3})['no'])
                ops = center.normalize_ops(peer.store, [{'e': 'students', 'id': 'new-'+peer.name, 'op': 'put',
                    'row': {'name': 'Synthetic '+peer.name, 'gradeCode': 'S1'}}], ctx.pc_index())
                codes.append(ops[0]['row']['code'])
                peer.commit('Synthetic student', ops)
            self.assertNotEqual(receipts[0], receipts[1])
            self.assertEqual({no.split('-')[1] for no in receipts}, {'A', 'B'})
            self.assertTrue(all(no.startswith('R'+day[2:4]+'-') for no in receipts))
            self.assertNotEqual(codes[0], codes[1])
            cluster.converge()
            self.assertEqual(len(set(cluster.fingerprints())), 1)
            for peer in (a, b):
                self.assertEqual(len(peer.store.rows('attendance')), 1)
                self.assertEqual(len(peer.store.rows('sessions')), 1)
                self.assertEqual(len(peer.store.rows('payments')), 2)
                self.assertEqual(peer.store.row('materials', 'mat1')['stock'], 4)
                self.assertTrue(peer.journal.verify(all_signatures=True)['ok'])
        finally:
            cluster.close()


if __name__ == '__main__':
    unittest.main()
