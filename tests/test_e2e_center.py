"""The daily centre scenarios in a real browser (Playwright + Chromium). Skipped when Playwright or Chromium is missing.
Set HS_CHROMIUM to the browser (the default is the CI path; on Windows the installed Chrome works)."""
import os
import unittest
from datetime import date

from test_e2e_browser import BrowserBase, SKIP

import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server'))
import domain as D


@SKIP
class DoorTest(BrowserBase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.c = cls.S.client()
        cls.c.login('boss', 'Strong-pass1')
        today = D.weekday(date.today())
        ops = [('subjects', 'e2e-sub', {'name': 'Synthetic subject'}), ('rooms', 'e2e-room', {'name': 'Room E2E', 'capacity': 40}),
               ('teachers', 'e2e-t', {'name': 'Synthetic Teacher', 'centerPct': 20}),
               ('groups', 'e2e-g', {'name': 'Synthetic Group', 'teacherId': 'e2e-t', 'subjectId': 'e2e-sub', 'roomId': 'e2e-room', 'gradeCode': 'S1',
                                    'feeType': 'session', 'fee': 60, 'capacity': 40, 'active': True, 'slots': [{'day': today, 'start': '00:00', 'end': '23:59'}]})]
        ops += [('students', f'e2e-s{i}', {'code': str(41000 + i), 'name': f'Synthetic Student {i}', 'gradeCode': 'S1', 'system': 'thanaweya',
                                           'parentMobile': '01000000000', 'consent': True, 'active': True}) for i in range(3)]
        cls.c.post('/api/commit', {'label': 'E2E fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for i in range(3):
            cls.c.post('/api/c/enroll', {'studentId': f'e2e-s{i}', 'groupId': 'e2e-g'})

    def test_scan_checkin_repeat_and_pay_with_shift(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/door')
        q = pg.wait_for_selector('#door-q')
        # a scanner: the code typed fast, then Enter -> the only running session is checked in automatically
        q.type('41000', delay=5)
        pg.keyboard.press('Enter')
        pg.wait_for_selector('.done-banner')
        self.assertIn('Synthetic Student 0', pg.inner_text('[data-card]'))
        # scanning the same card again changes nothing and says so
        pg.fill('#door-q', '41000')
        pg.keyboard.press('Enter')
        pg.wait_for_selector('.toast.bad')
        att = [a for a in self.c.get('/api/state')['attendance'] if a['studentId'] == 'e2e-s0']
        self.assertEqual(len(att), 1)
        # the session fee is owed now: pay it, opening the cash shift on the way
        pg.click('[data-pay]')
        pg.wait_for_selector('#sh-o')
        pg.fill('#sh-o', '500')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('#pay-a')
        self.assertEqual(pg.input_value('#pay-a'), '60')
        pg.click('.dialog [data-m="vodafone"]')
        pg.fill('#pay-r', 'TX-1')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-print]')
        pays = [p for p in self.c.get('/api/state')['payments'] if p['studentId'] == 'e2e-s0']
        self.assertEqual([(p['amount'], p['method'], p['ref']) for p in pays], [(60, 'vodafone', 'TX-1')])
        self.assertIn(pays[0]['no'], pg.inner_text('[data-card]'))
        self.assertEqual(self.errors, [])

    def test_name_search_and_roll_call_panel(self):
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/door')
        pg.wait_for_selector('#door-q').type('Synthetic Student 2')
        pg.wait_for_selector('[data-results] li[data-i]')
        pg.keyboard.press('Enter')
        pg.wait_for_selector('[data-checkin]')
        pg.click('[data-roster]')
        pg.wait_for_selector('.drawer .roll')
        pg.click('.drawer [data-all]')
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.drawer', state='detached')   # the page's CSP forbids wait_for_function strings
        present = {a['studentId'] for a in self.c.get('/api/state')['attendance'] if a['status'] in ('present', 'late')}
        self.assertTrue({'e2e-s0', 'e2e-s1', 'e2e-s2'} <= present)
        self.assertEqual(self.errors, [])

    def test_students_new_enrol_follow_up(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/students')
        pg.wait_for_selector('tr[data-id]')
        pg.click('[data-new]')
        pg.wait_for_selector('[data-sform] [name=name]')
        pg.fill('[data-sform] [name=name]', 'Synthetic Newcomer')
        pg.select_option('[data-sform] [name=gradeCode]', 'S2')
        pg.select_option('[data-sform] [name=system]', 'bac')
        self.assertFalse(pg.is_disabled('[data-sform] [name=track]'))   # 2nd year Baccalaureate has tracks
        pg.select_option('[data-sform] [name=track]', 'med')
        pg.fill('[data-sform] [name=parentMobile]', '٠١٠١٢٣٤٥٦٧٨')     # Arabic digits are normalised by the server
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.drawer [data-enrol]')                  # the new file opens on the Groups tab
        st = next(s for s in self.c.get('/api/state')['students'] if s['name'] == 'Synthetic Newcomer')
        self.assertEqual((st['gradeCode'], st['system'], st['track'], st['parentMobile']), ('S2', 'bac', 'med', '01012345678'))
        self.assertTrue(st['code'])
        pg.click('.drawer [data-enrol]')
        pg.click('.dialog [data-g="e2e-g"]')
        pg.wait_for_selector('.drawer [data-transfer]')
        self.assertTrue(any(e['studentId'] == st['id'] and e['groupId'] == 'e2e-g' for e in self.c.get('/api/state')['enrollments']))
        pg.click('.drawer [data-tab="follow"]')
        pg.fill('.drawer [data-fu] [name=reason]', 'Asked about the timetable')
        pg.select_option('.drawer [data-fu] [name=outcome]', 'reached')
        pg.click('.drawer [data-fu] [type=submit]')
        pg.wait_for_selector('.drawer .timeline li')
        self.assertIn('Asked about the timetable', pg.inner_text('.drawer .timeline'))
        self.assertEqual(self.errors, [])

    def test_phone_has_tab_bar_and_command_centre(self):
        pg = self.open({'lang': 'ar'}, width=390, height=844)
        pg.wait_for_selector('.tabbar')
        self.assertTrue(pg.is_visible('.tabbar'))
        # the side menu is folded away off the screen until "More" is pressed
        self.assertTrue(pg.evaluate("(()=>{const r=document.querySelector('#sidebar').getBoundingClientRect();return r.right<=0||r.left>=innerWidth})()"))
        pg.wait_for_selector('[data-advice] li.adv')
        pg.click('.tabbar a[data-tab="door"]')
        pg.wait_for_selector('#door-q')
        self.assertEqual(pg.evaluate("document.querySelector('.tabbar a[aria-current=page]').dataset.tab"), 'door')
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
