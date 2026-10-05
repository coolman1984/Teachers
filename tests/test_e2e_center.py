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
        if pg.wait_for_selector('#sh-o, #pay-a').get_attribute('id') == 'sh-o':   # another scenario of this class may have opened the shift
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
        pg.wait_for_selector('.dialog [data-sent]')                              # opening a chat is not sending (review A05)
        self.assertTrue(pg.evaluate('window.__opened').startswith('https://wa.me/201000000000?text='))
        sent = lambda: [f['reason'] for f in self.c.get('/api/state')['followups'] if f['studentId'] == 'e2e-s2' and f['type'] == 'whatsapp']  # noqa: E731
        self.assertEqual(sent(), [])
        pg.click('.dialog [data-sent]')
        pg.wait_for_selector('.dialog .empty')                                   # one student -> the queue is done
        self.assertIn('1', pg.inner_text('.dialog .empty'))
        self.assertEqual(sent(), ['absence'])
        self.assertEqual(self.errors, [])

    def test_exam_paste_column_ranks_ties_and_saves(self):
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/exams')
        pg.click('[data-new]')
        pg.fill('[data-xform] [name=title]', 'Synthetic weekly test')
        pg.fill('[data-xform] [name=maxScore]', '20')
        pg.check('[data-xform] [name=g][value="e2e-g"]')
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.drawer [data-mark]')                             # the marks sheet opens by itself
        # paste a column copied from Excel: Arabic digits, an absence and a tie
        pg.evaluate("""() => { const i = document.querySelector('.drawer [data-mark]'); const dt = new DataTransfer();
          dt.setData('text/plain', '١٨\\r\\n18\\r\\nA\\r\\n'); i.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true})); }""")
        ranks = pg.eval_on_selector_all('.drawer tr[data-sid] .rank', 'els => els.map(e => e.textContent)')
        self.assertEqual(sorted(ranks), ['1', '1'])                             # equal marks share first place
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.toast:has-text("Marks saved")')
        ex = next(x for x in self.c.get('/api/state')['exams'] if x['title'] == 'Synthetic weekly test')
        res = self.c.get('/api/c/exam?id=' + ex['id'])
        self.assertEqual(sorted((r['mark'] or {}).get('score') for r in res['rows'] if r['mark'] and not r['mark'].get('absent')), [18, 18])
        self.assertEqual(sum(1 for r in res['rows'] if r['mark'] and r['mark'].get('absent')), 1)
        self.assertEqual(self.errors, [])

    def test_walk_in_enrol_cash_change_typo_guard_day_off_and_price_rise(self):
        from datetime import timedelta
        tomorrow = date.today() + timedelta(days=1)
        self.c.post('/api/commit', {'label': 'E2E walk-in', 'ops': [
            {'e': 'students', 'id': 'e2e-walk', 'op': 'put', 'row': {'code': '41900', 'name': 'Synthetic Walk In', 'gradeCode': 'S1',
                                                                    'system': 'thanaweya', 'consent': True, 'active': True}},
            {'e': 'teachers', 'id': 'e2e-t2', 'op': 'put', 'row': {'name': 'Synthetic Second Teacher'}},
            {'e': 'groups', 'id': 'e2e-g2', 'op': 'put', 'row': {'name': 'Synthetic Monthly Group', 'teacherId': 'e2e-t2', 'gradeCode': 'S1',
                'feeType': 'month', 'fee': 300, 'capacity': 20, 'active': True, 'slots': [{'day': D.weekday(tomorrow), 'start': '09:00', 'end': '09:45'}]}}]})
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/door')
        pg.wait_for_selector('#door-q').type('41900', delay=5)
        pg.keyboard.press('Enter')
        # a walk-in with no group is enrolled from the door card without leaving the page
        pg.click('[data-card] [data-enrol]')
        pg.click('.dialog [data-g="e2e-g"]')
        pg.wait_for_selector('[data-card] [data-pay]')
        pg.click('[data-checkin]')
        pg.wait_for_selector('.done-banner')
        pg.click('[data-card] [data-pay]')
        if pg.wait_for_selector('#sh-o, #pay-a').get_attribute('id') == 'sh-o':
            pg.fill('#sh-o', '500')
            pg.click('.dialog [data-ok]')
            pg.wait_for_selector('#pay-a')
        # a typed extra zero is stopped once before a receipt that can only be reversed is written
        pg.fill('#pay-a', '600')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.dialog [data-err]:not([hidden])')
        self.assertIn('much more than the fee', pg.inner_text('.dialog [data-err]'))
        self.assertFalse([p for p in self.c.get('/api/state')['payments'] if p['studentId'] == 'e2e-walk'])
        # the parent hands over 100 for 60: the dialog says what to give back
        pg.fill('#pay-a', '60')
        pg.fill('#pay-g', '100')
        self.assertIn('Give back 40', pg.inner_text('.dialog [data-change]'))
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-print]')
        self.assertEqual([p['amount'] for p in self.c.get('/api/state')['payments'] if p['studentId'] == 'e2e-walk'], [60])
        # tomorrow is an official holiday: every session of the day is cancelled in one step
        pg.click('[data-dayoff]')
        pg.fill('.dialog #off-d', tomorrow.isoformat())
        pg.click('.dialog [data-r="holiday"]')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.toast')
        day = {s['id']: s for s in self.c.get('/api/c/today?date=' + tomorrow.isoformat())['sessions']}
        self.assertEqual(day[D.session_id('e2e-g2', tomorrow.isoformat(), '09:00')]['status'], 'cancelled')
        # raising the monthly price asks from when; earlier months keep the old price
        pg.goto(self.S.base + '/#/groups?tab=list')
        pg.click('tr[data-id="e2e-g2"]')
        pg.click('.drawer [data-edit]')
        pg.wait_for_selector('[data-gform]')
        self.assertTrue(pg.is_hidden('[data-feefrom]'))
        pg.fill('[data-gform] [name=fee]', '350')
        pg.wait_for_selector('[data-feefrom]:not([hidden])')
        first = pg.input_value('#gf-feeFrom')
        self.assertTrue(first.endswith('-01') or first == date.today().isoformat())
        pg.click('.drawer:last-of-type [data-save]')
        pg.wait_for_selector('[data-gform]', state='detached')
        g = next(g for g in self.c.get('/api/state')['groups'] if g['id'] == 'e2e-g2')
        self.assertEqual((g['fee'], g['feeHistory'][0]['fee']), (350, 300))
        self.assertEqual(self.errors, [])

    def test_repeated_transfer_reference_warns_again_when_the_reference_is_edited(self):
        self.c.post('/api/commit', {'label': 'E2E dup', 'ops': [{'e': 'students', 'id': 'e2e-dup', 'op': 'put', 'row': {
            'code': '41950', 'name': 'Synthetic Dup Payer', 'gradeCode': 'S1', 'system': 'thanaweya', 'consent': True, 'active': True}}]})
        self.c.post('/api/c/enroll', {'studentId': 'e2e-dup', 'groupId': 'e2e-g'})
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/door')
        pg.wait_for_selector('#door-q').type('41950', delay=5)
        pg.keyboard.press('Enter')

        def pay(ref):
            pg.click('[data-card] [data-pay]')
            if pg.wait_for_selector('#sh-o, #pay-a').get_attribute('id') == 'sh-o':
                pg.fill('#sh-o', '100')
                pg.click('.dialog [data-ok]')
                pg.wait_for_selector('#pay-a')
            pg.fill('#pay-a', '10')
            pg.click('.dialog [data-m="instapay"]')
            pg.fill('#pay-r', ref)

        def count(ref):
            return len([p for p in self.c.get('/api/state')['payments'] if p['studentId'] == 'e2e-dup' and p['ref'] == ref])
        pay('DUP-1')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-print]')
        self.assertEqual(count('DUP-1'), 1)
        pay('DUP-1')                                   # the same number again: warned, nothing saved
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.dialog [data-err]:not([hidden])')
        self.assertIn('already on receipt', pg.inner_text('.dialog [data-err]'))
        self.assertEqual(count('DUP-1'), 1)
        pg.fill('#pay-r', 'DUP-1')                     # the operator edits the field (to a value that is also used): warned AGAIN
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.dialog [data-err]:not([hidden])')
        self.assertEqual(count('DUP-1'), 1)
        pg.click('.dialog [data-ok]')                  # pressing Save again for the exact value that was shown confirms it
        pg.wait_for_selector('.dialog', state='detached')
        self.assertEqual(count('DUP-1'), 2)
        # the two warnings are answered with HTTP 400 by design (the browser logs them); nothing else may be logged
        self.assertEqual([e for e in self.errors if 'status of 400' not in e], [])
        self.assertEqual(len(self.errors), 2)

    def test_family_payment_extra_session_temporary_times_and_school_name(self):
        from datetime import timedelta
        today, tomorrow = date.today(), date.today() + timedelta(days=1)
        self.c.post('/api/commit', {'label': 'E2E family', 'ops': [{'e': 'students', 'id': f'e2e-fam{i}', 'op': 'put', 'row': {
            'code': str(41960 + i), 'name': f'Synthetic Fam Child {i}', 'gradeCode': 'S1', 'system': 'thanaweya', 'school': 'Synthetic Nile School',
            'familyKey': 'fam-e2e', 'consent': True, 'active': True}} for i in (1, 2)]})
        sess = D.session_id('e2e-g', today.isoformat(), '00:00')
        for i in (1, 2):
            self.c.post('/api/c/enroll', {'studentId': f'e2e-fam{i}', 'groupId': 'e2e-g'})
            self.c.post('/api/c/checkin', {'studentId': f'e2e-fam{i}', 'sessionId': sess, 'status': 'present'})
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/door')
        # two children with the same first names are told apart by the school in the search results
        pg.wait_for_selector('#door-q').type('Synthetic Fam Child', delay=5)
        pg.wait_for_selector('[data-results] li[data-i]')
        self.assertIn('Synthetic Nile School', pg.inner_text('[data-results]'))
        pg.keyboard.press('Enter')
        pg.wait_for_selector('[data-card] [data-family]')
        pg.click('[data-card] [data-family]')
        if pg.wait_for_selector('#sh-o, .fam-lines').get_attribute('id') == 'sh-o':
            pg.fill('#sh-o', '100')
            pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.fam-lines')
        self.assertEqual(pg.locator('.fam-line').count(), 2)
        self.assertIn('120', pg.inner_text('[data-total]'))            # both children owe one session (60) each
        pg.fill('#fam-g', '200')
        self.assertIn('Give back 80', pg.inner_text('.dialog [data-change]'))
        pg.click('.dialog [data-m="instapay"]')
        pg.fill('#fam-r', 'FAM-1')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-printfam]')
        paid = [x for x in self.c.get('/api/state')['payments'] if x['ref'] == 'FAM-1']
        self.assertEqual(sorted((x['studentId'], x['amount']) for x in paid), [('e2e-fam1', 60), ('e2e-fam2', 60)])
        self.assertEqual(len({x['batch'] for x in paid}), 1)
        # an extra session of the group, from the group panel
        pg.goto(self.S.base + '/#/groups?tab=list')
        pg.click('tr[data-id="e2e-g"]')
        pg.click('.drawer [data-extra]')
        pg.fill('#xs-d', tomorrow.isoformat())
        pg.fill('#xs-a', '18:00')
        pg.fill('#xs-b', '19:00')
        pg.fill('#xs-t', 'Revision')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.toast')
        day = {x['id']: x for x in self.c.get('/api/c/today?date=' + tomorrow.isoformat())['sessions']}
        self.assertEqual(day[D.session_id('e2e-g', tomorrow.isoformat(), '18:00')]['kind'], 'extra')
        # a temporary timetable (Ramadan) saved from the group form, in a period that does not touch today
        pg.click('.drawer [data-pclose]')                             # the group panel is still open after the dialog
        pg.wait_for_selector('.drawer', state='detached')
        pg.click('tr[data-id="e2e-g"]')
        pg.click('.drawer [data-edit]')
        pg.wait_for_selector('[data-gform]')
        pg.fill('[data-gform] [name=tempFrom]', (today + timedelta(days=10)).isoformat())
        pg.click('[data-addtslot]')
        pg.click('.drawer:last-of-type [data-save]')                 # a half-filled period is refused, not saved
        pg.wait_for_selector('.drawer [data-err]:not([hidden])')
        self.assertIn('Write both days', pg.inner_text('.drawer [data-err]'))
        pg.fill('[data-gform] [name=tempTo]', (today + timedelta(days=30)).isoformat())
        pg.click('.drawer:last-of-type [data-save]')
        pg.wait_for_selector('[data-gform]', state='detached')
        g = next(g for g in self.c.get('/api/state')['groups'] if g['id'] == 'e2e-g')
        self.assertEqual((g['tempSlots']['from'], len(g['tempSlots']['slots'])), ((today + timedelta(days=10)).isoformat(), 1))
        self.assertEqual([x for x in self.errors if 'status of 400' not in x and 'status of 409' not in x], [])

    def test_zz_settlement_approve_payout_and_reports(self):
        # runs last (zz): a fee of the fixture group is collected, then the teacher is settled and paid
        mine = self.c.get('/api/c/shift')
        if not (mine.get('shift') and mine['shift'].get('status') == 'open'):
            self.c.post('/api/c/shift/open', {'opening': 0})
        self.c.post('/api/c/pay', {'studentId': 'e2e-s1', 'groupId': 'e2e-g', 'kind': 'fee', 'amount': 100, 'method': 'cash'})
        ym = date.today().strftime('%Y-%m')
        before = next(s for s in self.c.get('/api/c/settlements?ym=' + ym) if s['teacherId'] == 'e2e-t')
        self.assertGreater(before['remaining'], 0)
        pg = self.open({'lang': 'en'})
        pg.goto(self.S.base + '/#/settlements')
        pg.wait_for_selector('[data-approve="e2e-t"]')
        self.assertIn('20% of', pg.inner_text('.set-card:has([data-approve="e2e-t"])'))   # the formula in words
        pg.click('[data-approve="e2e-t"]')
        pg.wait_for_selector('.set-card:has([data-approve="e2e-t"]) .badge.ok')
        pg.click('[data-payout="e2e-t"]')
        pg.wait_for_selector('#ex-a')
        self.assertEqual(float(pg.input_value('#ex-a')), before['remaining'])
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.set-card:has([data-print="e2e-t"]) .set-line.ok')
        after = next(s for s in self.c.get('/api/c/settlements?ym=' + ym) if s['teacherId'] == 'e2e-t')
        self.assertEqual((after['remaining'], after['saved']['status']), (0, 'approved'))
        pg.goto(self.S.base + '/#/reports')
        pg.wait_for_selector('.rep-kpis')
        self.assertIn('Synthetic Group', pg.inner_text('[data-rep]'))
        pg.click('[data-present]')
        pg.wait_for_selector('.present')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('.present', state='detached')
        self.assertEqual(self.errors, [])

    def test_help_for_this_page_and_arabic_search(self):
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/money')
        pg.wait_for_selector('[data-mtab]')
        pg.click('[data-act="help-here"]')                                  # "?" opens the topic of the current page
        pg.wait_for_selector('#topic-money details[open]')
        pg.fill('#help-q', 'الوردیه')                                        # Persian yeh + taa marbuta spelled as heh
        pg.wait_for_timeout(300)
        visible = pg.eval_on_selector_all('.help-topic details:not([hidden]) summary', 'els => els.map(e => e.textContent)')
        self.assertTrue(any('وردية' in v for v in visible), visible)
        self.assertEqual(self.errors, [])

    def test_journey_a_day_at_the_front_desk(self):
        """The core journey with the built-in Front desk profile (not the administrator): the advisor says what to do,
        the shift is opened, a scanned student is checked in and pays, the parents of an absent student are told,
        and the drawer is counted and closed with no difference."""
        ops = [('students', 'e2e-j1', {'code': '42001', 'name': 'Journey Present', 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '01011111111', 'consent': True, 'active': True}),
               ('students', 'e2e-j2', {'code': '42002', 'name': 'Journey Absent', 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '01022222222', 'consent': True, 'active': True}),
               ('groups', 'e2e-jg', {'name': 'Journey Group', 'teacherId': 'e2e-t', 'subjectId': 'e2e-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 75,
                                     'capacity': 30, 'active': True, 'slots': [{'day': D.weekday(date.today()), 'start': '00:01', 'end': '23:58'}]})]
        self.c.post('/api/commit', {'label': 'Journey fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for sid in ('e2e-j1', 'e2e-j2'):
            self.c.post('/api/c/enroll', {'studentId': sid, 'groupId': 'e2e-jg'})
        perms = next(p for p in self.c.get('/api/users')['profiles'] if p['id'] == 'secretary')['perms']
        self.c.post('/api/users/save', {'username': 'desk.journey', 'full_name': 'Desk Journey', 'password': 'Strong-pass1', 'must_change': False, 'perms': perms, 'scopes': None})
        ctx = self.browser.new_context(viewport={'width': 1360, 'height': 860})
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: 'en'}))")
        pg = ctx.new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(self.S.base)
        pg.fill('#username', 'desk.journey'); pg.fill('#password', 'Strong-pass1'); pg.click('button[type=submit]')
        pg.wait_for_selector('#app-shell')
        self.assertFalse(pg.is_visible('#sidebar a[data-page="reports"]'))         # the desk does not see the centre's reports
        # 1. the advisor tells the desk to open its shift; its button leads there
        pg.wait_for_selector('.adv:has-text("Open the cash shift") a')
        pg.click('.adv:has-text("Open the cash shift") a')
        pg.click('[data-openshift]'); pg.fill('#sh-o', '300'); pg.click('.dialog [data-ok]')
        pg.wait_for_selector('.shift-card')
        # 2. a scanned card checks the present student in; he pays the session fee in cash
        pg.goto(self.S.base + '/#/door')
        pg.wait_for_selector('#door-q').type('42001', delay=5); pg.keyboard.press('Enter')
        pg.wait_for_selector('.done-banner')
        pg.click('[data-pay]'); pg.wait_for_selector('#pay-a')
        self.assertEqual(pg.input_value('#pay-a'), '75')
        pg.click('.dialog [data-ok]'); pg.wait_for_selector('[data-print]')
        # 3. the session is held and the other student never came: the advisor offers to tell his parents
        pg.goto(self.S.base + '/#/overview')
        pg.wait_for_selector('.adv:has-text("absent today") a')
        pg.click('.adv:has-text("absent today") a')
        pg.select_option('#m-a', 'absent')
        pg.wait_for_selector('[data-count]:not(:has-text("0"))')
        pg.evaluate("window.open = () => null")
        pg.click('[data-start]')
        for _ in range(8):                                                   # other absentees may come first: skip them
            pg.wait_for_selector('.dialog [data-text], .dialog .empty')
            if 'Journey Absent' in pg.inner_text('.dialog [data-q]'):
                break
            pg.click('.dialog [data-skip]')
        pg.click('.dialog [data-open]')
        pg.click('.dialog [data-sent]'); pg.wait_for_selector('.dialog [data-text], .dialog .empty')
        pg.click('.dialog [data-close]')
        # 4. closing: 300 opening + 75 cash = 375 counted exactly
        pg.goto(self.S.base + '/#/money')
        pg.wait_for_selector('[data-close-shift]'); pg.click('[data-close-shift]')
        pg.fill('[data-note="200"]', '1'); pg.fill('[data-note="100"]', '1'); pg.fill('[data-note="50"]', '1'); pg.fill('[data-note="20"]', '1'); pg.fill('[data-note="5"]', '1')
        self.assertTrue(pg.is_hidden('[data-reason]'))
        pg.evaluate("window.print = () => {}")
        pg.click('.dialog [data-ok]'); pg.wait_for_selector('[data-openshift]')
        state = self.c.get('/api/state')
        self.assertTrue(any(a['studentId'] == 'e2e-j1' and a['status'] in ('present', 'late') for a in state['attendance']))
        self.assertEqual([(p['amount'], p['method'], p['by'].startswith('Desk Journey')) for p in state['payments'] if p['studentId'] == 'e2e-j1'], [(75, 'cash', True)])
        self.assertTrue(any(f['studentId'] == 'e2e-j2' and f['reason'] == 'absence' for f in state['followups']))
        shift = [s for s in self.c.get('/api/c/shifts') if str(s.get('user')).startswith('Desk Journey')][0]
        self.assertEqual((shift['status'], shift['expectedCash'], shift['diff']), ('closed', 375, 0))
        self.assertEqual(errors, [])
        ctx.close()

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
