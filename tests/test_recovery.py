"""Disaster drill (review E10): the only PC of a centre died. A new PC with a fresh installation restores the newest backup copied
from the second backup folder, and the centre's records, money and attendance are back - as one new change, not a rollback."""
import glob
import os
import shutil
import unittest
from datetime import date

from harness import Server, make_authority

import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402


class DeadDiskTest(unittest.TestCase):
    def test_a_new_pc_restores_the_backup_from_the_usb_folder(self):
        old = Server('old-pc').start()
        self.addCleanup(old.cleanup)
        usb = os.path.join(old.root, 'usb')
        os.makedirs(usb)
        c = make_authority(old)
        c.post('/api/backups/folder', {'path': usb})                          # the second backup folder (USB / other disk)
        wd = D.weekday(date.today())
        c.post('/api/commit', {'label': 'centre', 'ops': [
            {'e': 'teachers', 'id': 'dr-t', 'op': 'put', 'row': {'name': 'Synthetic Drill Teacher'}},
            {'e': 'groups', 'id': 'dr-g', 'op': 'put', 'row': {'name': 'Drill Group', 'teacherId': 'dr-t', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 70,
                                                              'capacity': 20, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}},
            {'e': 'students', 'id': 'dr-s', 'op': 'put', 'row': {'code': '46001', 'name': 'Synthetic Drill Student', 'gradeCode': 'S1', 'consent': True, 'active': True}}]})
        c.post('/api/c/enroll', {'studentId': 'dr-s', 'groupId': 'dr-g'})
        c.post('/api/c/checkin', {'studentId': 'dr-s', 'sessionId': D.session_id('dr-g', date.today(), '00:00')})
        c.post('/api/c/shift/open', {'opening': 0})
        receipt = c.post('/api/c/pay', {'studentId': 'dr-s', 'groupId': 'dr-g', 'kind': 'fee', 'amount': 70, 'method': 'cash'})
        c.post('/api/backups', {})
        copies = glob.glob(os.path.join(usb, '**', 'to_*.db'), recursive=True)
        self.assertTrue(copies, 'the backup reached the second folder')
        old.stop()                                                                # the disk died

        new = Server('new-pc').start()
        self.addCleanup(new.cleanup)
        n = make_authority(new)
        dest = os.path.join(new.root, 'backups', 'db')
        os.makedirs(dest, exist_ok=True)
        newest = max(copies, key=os.path.getmtime)
        shutil.copy(newest, dest)                                                 # copied by hand from the USB disk
        names = [b['name'] for b in n.get('/api/backups')]
        self.assertIn(os.path.basename(newest), names)
        n.post('/api/backups/restore', {'name': os.path.basename(newest)})
        st = n.get('/api/state')
        self.assertTrue(any(s['id'] == 'dr-s' for s in st['students']))
        self.assertEqual([(p['no'], p['amount']) for p in st['payments'] if p['studentId'] == 'dr-s'], [(receipt['no'], 70)])
        self.assertEqual(len([a for a in st['attendance'] if a['studentId'] == 'dr-s']), 1)
        card = n.get('/api/c/card?id=dr-s')
        self.assertEqual(card['enrollments'][0]['money']['balance'], 0)            # 70 owed, 70 paid: computed again, not stored
        self.assertTrue(n.post('/api/devices/verify', {'all': True})['ok'])       # the restore is one signed change in the history


if __name__ == '__main__':
    unittest.main()
