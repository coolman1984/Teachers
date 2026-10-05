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

    def test_group_clash_is_blocked_then_saved_and_bulk_enrol(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/groups?tab=list')
        pg.wait_for_selector('tr[data-id]')
        pg.click('[data-new]')
        pg.wait_for_selector('[data-gform]')
        pg.fill('[data-gform] [name=name]', 'Synthetic Clash Group')
        pg.select_option('[data-gform] [name=teacherId]', 'e2e-t')
        today = D.weekday(date.today())
        pg.select_option('[data-gform] .slot-row [data-s=day]', str(today))
        pg.fill('[data-gform] .slot-row [data-s=start]', '10:00')
        pg.fill('[data-gform] .slot-row [data-s=end]', '11:00')
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.drawer [data-err]:not([hidden])')
        self.assertIn('Teacher already teaching', pg.inner_text('.drawer [data-err]'))
        self.assertFalse(any(g['name'] == 'Synthetic Clash Group' for g in self.c.get('/api/state')['groups']))
        other = (today + 1) % 7   # the fixture group only meets today
        pg.select_option('[data-gform] .slot-row [data-s=day]', str(other))
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.drawer', state='detached')
        g = next(g for g in self.c.get('/api/state')['groups'] if g['name'] == 'Synthetic Clash Group')
        self.assertEqual(g['slots'][0]['day'], other)
        pg.click('[data-gtab="timetable"]')
        pg.wait_for_selector('.tt-block[data-id="%s"]' % g['id'])
        pg.click('.tt-block[data-id="%s"]' % g['id'])
        pg.click('.drawer [data-bulk]')
        pg.fill('.dialog [data-codes]', '41000\n٤١٠٠١\n99999')
        pg.click('.dialog [data-go]')
        pg.wait_for_selector('.dialog [data-res] li')
        res = pg.inner_text('.dialog [data-res]')
        self.assertIn('Synthetic Student 0', res); self.assertIn('Synthetic Student 1', res); self.assertIn('99999', res)
        ens = {e['studentId'] for e in self.c.get('/api/state')['enrollments'] if e['groupId'] == g['id']}
        self.assertEqual(ens, {'e2e-s0', 'e2e-s1'})
        self.assertEqual(self.errors, [])

    def test_money_shift_income_expense_reversal_and_count(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/money?tab=shift')
        mine = self.c.get('/api/c/shift')
        if mine.get('shift') and mine['shift'].get('status') == 'open':   # another scenario may have opened it
            self.c.post('/api/c/shift/close', {'shiftId': mine['shift']['id'], 'counted': mine['expected']})
            pg.reload()
        pg.click('[data-openshift]')
        pg.fill('#sh-o', '500')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.shift-card')
        pg.click('[data-income]')
        pg.click('.dialog [data-seg="kind"] [data-v="other"]')
        pg.fill('#in-a', '100')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-void]')
        pg.click('[data-expense]')
        pg.fill('#ex-a', '30')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-evoid]')
        pg.click('[data-void]')
        pg.fill('#cf-reason', 'Typed by mistake')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.badge.bad:has-text("Reversal")')
        s = self.c.get('/api/c/shift')
        self.assertEqual(s['expected'], 470)                 # 500 + 100 - 100 (reversal) - 30
        pg.click('[data-close-shift]')
        pg.fill('[data-note="200"]', '2'); pg.fill('[data-note="50"]', '1'); pg.fill('[data-note="20"]', '1')
        self.assertTrue(pg.is_hidden('[data-reason]'))       # no difference -> no reason needed
        pg.evaluate("window.print = () => {}")               # the shift report would open the print dialog
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-openshift]')
        closed = [x for x in self.c.get('/api/c/shifts') if x['id'] == s['shift']['id']][0]
        self.assertEqual((closed['status'], closed['countedCash'], closed['diff']), ('closed', 470, 0))
        self.assertEqual(self.errors, [])

    def test_absentee_message_is_opened_one_by_one_and_logged(self):
        # the roll call marks e2e-s2 absent; the Messages tab finds him among today's absentees
        session = D.session_id('e2e-g', date.today(), '00:00')
        self.c.post('/api/c/roll', {'sessionId': session, 'marks': {'e2e-s0': 'present', 'e2e-s1': 'present', 'e2e-s2': 'absent'}})
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/followup?tab=messages')
        pg.wait_for_selector('#m-a')
        pg.select_option('#m-k', 'absence')
        pg.select_option('#m-a', 'absent')
        pg.evaluate("window.open = (u) => { window.__opened = u; return null; }")   # WhatsApp would open in a new tab
        pg.wait_for_selector('[data-count]:has-text("1")')                     # absentees are computed on the server
        pg.click('[data-start]')
        pg.wait_for_selector('.dialog [data-text]')
        text = pg.input_value('.dialog [data-text]')
        self.assertIn('Synthetic Student 2', text)
        self.assertIn('غياب', text)                                            # the Arabic absence template
        pg.click('.dialog [data-open]')
        pg.wait_for_selector('.dialog .empty')                                   # one student -> the queue is done
        self.assertTrue(pg.evaluate('window.__opened').startswith('https://wa.me/201000000000?text='))
        logged = [f for f in self.c.get('/api/state')['followups'] if f['studentId'] == 'e2e-s2' and f['type'] == 'whatsapp']
        self.assertEqual([f['reason'] for f in logged], ['absence'])
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
