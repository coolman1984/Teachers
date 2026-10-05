"""Partitioned centre nodes: deterministic attendance, receipt ranges, additive handout stock."""
import unittest
from datetime import date, datetime, timedelta
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

    def test_offline_free_trials_in_different_sessions_charge_all_but_the_earliest(self):
        """Two PCs cannot see each other's trial, so both may record one in a different session. After syncing both
        rows stay (nothing is lost) but only the earliest trial of the student in the group is free, on every PC."""
        cluster = Cluster(2)
        try:
            a, b = cluster.peers
            today = date.today()
            days = [(today - timedelta(days=3)).isoformat(), (today - timedelta(days=1)).isoformat()]
            a.commit('Synthetic centre', [
                {'e': 'teachers', 'id': 't1', 'op': 'put', 'row': {'name': 'Synthetic Teacher'}},
                {'e': 'students', 'id': 's9', 'op': 'put', 'row': {'name': 'Synthetic Trial', 'code': '10009', 'gradeCode': 'S1'}},
                {'e': 'groups', 'id': 'g1', 'op': 'put', 'row': {'name': 'Synthetic Group', 'teacherId': 't1', 'subjectId': 'sub1', 'fee': 50,
                    'feeType': 'session', 'slots': [{'day': D.weekday(today - timedelta(days=3)), 'start': '10:00', 'end': '11:00'},
                                                     {'day': D.weekday(today - timedelta(days=1)), 'start': '10:00', 'end': '11:00'}]}}])
            cluster.converge()
            for peer, day in zip((a, b), days):    # offline: each PC sees no earlier trial
                ctx = center.Ctx(peer.store, peer.journal, peer.node.id, peer.name, '127.0.0.1', peer.name, None, ALL)
                r = center.checkin(ctx, 's9', D.session_id('g1', day, '10:00'), now=datetime.combine(date.fromisoformat(day), datetime.min.time().replace(hour=10)), trial=True)
                self.assertTrue(r['trial'])
            cluster.converge()
            ens = [{'id': 'en9', 'studentId': 's9', 'groupId': 'g1', 'from': days[0], 'status': 'active', 'teacherId': 't1'}]
            for peer in (a, b):
                self.assertEqual(len([x for x in peer.store.rows('attendance') if x.get('trial')]), 2)     # both visits kept
                info = center.balances(peer.store, ens, today)['en9']
                self.assertEqual((info['owed'], info['units']), (50, 1))       # the earlier trial is free, the later one is charged
        finally:
            cluster.close()

    def test_a_search_key_follows_its_name_when_two_pcs_rename_the_same_student(self):
        """The owner is asked about the NAME only; the derived search key travels with whichever name wins, on every PC."""
        cluster = Cluster(2)
        try:
            a, b = cluster.peers
            a.commit('Synthetic student', [{'e': 'students', 'id': 's1', 'op': 'put', 'row': {'name': 'Synthetic Start', 'code': '10001', 'gradeCode': 'S1'}}])
            cluster.converge()
            for peer, name in ((a, 'Ahmed Mohamed Ali'), (b, 'Ahmed Mahmoud Ali')):     # both offline: neither sees the other's edit
                row = peer.store.row('students', 's1')
                ver = row.pop('ver')
                row['name'] = name
                ops = center.normalize_ops(peer.store, [{'e': 'students', 'id': 's1', 'op': 'put', 'ver': ver, 'row': row}])
                peer.commit('Rename', ops)
            cluster.converge()
            self.assertEqual(len(set(cluster.fingerprints())), 1)
            for peer in (a, b):
                flags = [(c['entity'], c['kind'], sorted(c['detail'])) for c in peer.store.conflicts()]
                self.assertEqual(flags, [('students', 'conflict', ['name'])])               # the owner decides one thing, not two
                row = peer.store.row('students', 's1')
                self.assertEqual(row['nameKey'], D.key_text(row['name']))                   # the key belongs to the name that is shown
            self.assertEqual(a.store.row('students', 's1')['name'], b.store.row('students', 's1')['name'])
        finally:
            cluster.close()


if __name__ == '__main__':
    unittest.main()
