"""Regression tests for the completion review of 2026-10-05 (A04-A07, B01, B02): what the person at the desk sees is what
the centre PC really saved - door switches that work, a lost connection that stops saving, a payment pressed twice that is
taken once, a handout never sold beyond the shelf, and a WhatsApp message counted only when the person says it went."""
import os
import sys
import time
import unittest
from datetime import date

from test_center_api import CenterFixture
from test_e2e_browser import BrowserBase, SKIP

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402


def wait_until(check, seconds=8.0):
    end = time.time() + seconds
    while time.time() < end:
        if check():
            return True
        time.sleep(0.1)
    return check()


class MoneyOnceTest(CenterFixture):
    def test_a_payment_saved_twice_with_the_same_key_is_one_receipt(self):
        self.open_shift()
        first = self.pay(50, key='ab12cd34ef56ab78')
        again = self.pay(50, key='ab12cd34ef56ab78')                  # the answer was lost, the desk pressed Save again
        self.assertEqual(first['no'], again['no'])
        self.assertTrue(again.get('again'))
        mine = [p for p in self.c.get('/api/state')['payments'] if p['studentId'] == self.student]
        self.assertEqual(len(mine), 1)
        other = self.pay(50, key='ff12cd34ef56ab78')                  # a new dialog is a new payment
        self.assertNotEqual(other['no'], first['no'])
        self.pay(50)                                                   # no key (older pages): still works
        self.assertEqual(len([p for p in self.c.get('/api/state')['payments'] if p['studentId'] == self.student]), 3)

    def test_a_bad_key_is_ignored_not_trusted(self):
        self.open_shift()
        a = self.pay(20, key='../../etc')
        b = self.pay(20, key='../../etc')
        self.assertNotEqual(a['id'], b['id'])
        self.assertTrue(a['id'].startswith('pa'))

    def test_family_payment_saved_twice_is_one_batch(self):
        self.open_shift()
        body = {'method': 'cash', 'key': '0123456789abcdef', 'items': [{'studentId': self.student, 'groupId': self.group, 'amount': 30}]}
        a = self.c.post('/api/c/pay/many', body)
        b = self.c.post('/api/c/pay/many', body)
        self.assertEqual([r['no'] for r in a['receipts']], [r['no'] for r in b['receipts']])
        self.assertTrue(b.get('again'))
        self.assertEqual(len([p for p in self.c.get('/api/state')['payments'] if p['studentId'] == self.student]), 1)

    def test_handouts_are_never_sold_beyond_the_shelf(self):
        material = self.p + '-few'
        self.put([('materials', material, {'name': 'Synthetic few', 'teacherId': self.teacher, 'stock': 2, 'price': 20})])
        self.open_shift()
        self.error('/api/c/pay', {'studentId': self.student, 'kind': 'material', 'materialId': material, 'qty': 3, 'amount': 60, 'method': 'cash'}, 'err.noStock')
        self.pay(40, kind='material', materialId=material, qty=2)
        self.error('/api/c/pay', {'studentId': self.student, 'kind': 'material', 'materialId': material, 'qty': 1, 'amount': 20, 'method': 'cash'}, 'err.noStock')
        self.error('/api/c/pay', {'studentId': self.student, 'kind': 'material', 'materialId': material, 'qty': 'x', 'amount': 20, 'method': 'cash'}, 'err.amount')


@SKIP
class DoorReviewTest(BrowserBase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.c = cls.S.client()
        cls.c.login('boss', 'Strong-pass1')
        today = D.weekday(date.today())
        ops = [('subjects', 'rv-sub', {'name': 'Synthetic subject'}), ('rooms', 'rv-room', {'name': 'Room RV', 'capacity': 40}),
               ('teachers', 'rv-t', {'name': 'Synthetic Teacher', 'centerPct': 20}),
               ('groups', 'rv-g', {'name': 'Synthetic Review Group', 'teacherId': 'rv-t', 'subjectId': 'rv-sub', 'roomId': 'rv-room', 'gradeCode': 'S1',
                                   'feeType': 'session', 'fee': 60, 'capacity': 40, 'active': True, 'slots': [{'day': today, 'start': '00:00', 'end': '23:59'}]}),
               ('materials', 'rv-m', {'name': 'Synthetic Physics Handout', 'teacherId': 'rv-t', 'gradeCode': 'S1', 'price': 35, 'stock': 5, 'active': True})]
        ops += [('students', f'rv-s{i}', {'code': str(42000 + i), 'name': f'Review Student {i}', 'gradeCode': 'S1', 'system': 'thanaweya',
                                          'parentMobile': '01000000000', 'consent': True, 'active': True}) for i in range(5)]
        cls.c.post('/api/commit', {'label': 'Review fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for i in range(5):
            cls.c.post('/api/c/enroll', {'studentId': f'rv-s{i}', 'groupId': 'rv-g'})

    def setting(self, key, value):
        ver = self.c.get('/api/state')['settingsVer'].get(key)
        self.c.post('/api/commit', {'label': 'Review setting', 'ops': [{'e': 'settings', 'id': key, 'op': 'put', 'ver': ver, 'row': {'value': value}}]})

    def attended(self, sid):
        return [a for a in self.c.get('/api/state')['attendance'] if a['studentId'] == sid]

    def door(self, lang='en'):
        pg = self.open({'lang': lang})
        # count the beeps: the door makes sounds through WebAudio oscillators
        pg.context.add_init_script("""window.__beeps = 0; (function () { const A = window.AudioContext || window.webkitAudioContext;
          window.AudioContext = function () { const a = new A(); const o = a.createOscillator.bind(a);
            a.createOscillator = () => { window.__beeps++; return o(); }; return a; }; })();""")
        pg.goto(self.S.base + '/#/door')
        pg.reload()                                                    # a hash change is not a page load: run the counter script
        pg.wait_for_selector('#door-q')
        return pg

    def scan(self, pg, code):
        pg.fill('#door-q', '')
        pg.type('#door-q', code, delay=5)
        pg.keyboard.press('Enter')

    def test_a04_door_switches_from_settings_are_obeyed(self):
        self.setting('autoCheckin', False)
        self.setting('doorSounds', False)
        try:
            pg = self.door()
            self.scan(pg, '42000')
            pg.wait_for_selector('[data-checkin]')                    # the card is shown, nobody is checked in
            time.sleep(0.6)
            self.assertEqual(self.attended('rv-s0'), [])
            pg.click('[data-checkin]')
            pg.wait_for_selector('.done-banner')
            self.assertEqual(len(self.attended('rv-s0')), 1)
            self.assertEqual(pg.evaluate('window.__beeps'), 0)        # sounds off: silent
            self.setting('autoCheckin', True)
            self.setting('doorSounds', True)
            pg.reload(); pg.wait_for_selector('#door-q')
            pg.evaluate('window.__beeps = 0')
            self.scan(pg, '42001')
            self.assertTrue(wait_until(lambda: len(self.attended('rv-s1')) == 1))   # switched back on: the scan checks in
            pg.wait_for_selector('.done-banner')
            self.assertGreater(pg.evaluate('window.__beeps'), 0)
            self.assertEqual(self.errors, [])
        finally:
            self.setting('autoCheckin', True)
            self.setting('doorSounds', True)

    def test_a07_lost_connection_stops_saving_and_says_so(self):
        pg = self.door('ar')
        self.scan(pg, '42002')
        self.assertTrue(wait_until(lambda: len(self.attended('rv-s2')) == 1))
        pg.wait_for_selector('.done-banner')
        self.assertTrue(pg.is_hidden('.offline-bar'))
        # the centre PC stops answering
        pg.route('**/api/**', lambda route: route.abort())
        pg.wait_for_selector('.offline-bar', state='visible', timeout=8000)
        self.assertIn('انقطع الاتصال', pg.inner_text('.offline-bar'))
        self.assertEqual(pg.evaluate("document.documentElement.hasAttribute('data-offline')"), True)
        # a save tried now is refused at once and says nothing was saved; no hidden queue fires later
        pg.evaluate("HS.post('/api/c/checkin', {studentId: 'rv-s3', sessionId: 'x'}).catch(e => { window.__err = e.data && e.data.key; })")
        self.assertTrue(wait_until(lambda: pg.evaluate('window.__err') == 'err.offline'))
        pg.unroute('**/api/**')
        pg.wait_for_selector('.offline-bar', state='hidden', timeout=8000)
        time.sleep(0.5)
        self.assertEqual(self.attended('rv-s3'), [])
        self.errors = [e for e in self.errors if 'ERR_FAILED' not in e and 'Failed to load' not in e]
        self.assertEqual(self.errors, [])

    def test_b01_b02_handout_and_money_in_advance_from_the_card(self):
        pg = self.door()
        pg.fill('#door-q', 'Review Student 4')
        pg.wait_for_selector('[data-results] li[data-i]')
        pg.keyboard.press('Enter')
        pg.wait_for_selector('[data-sell]')
        pg.click('[data-sell]')
        if pg.wait_for_selector('#sh-o, #in-m').get_attribute('id') == 'sh-o':
            pg.fill('#sh-o', '200'); pg.click('.dialog [data-ok]'); pg.wait_for_selector('#in-m')
        self.assertIn('Review Student 4', pg.inner_text('.dialog'))           # the student is already chosen
        self.assertEqual(pg.input_value('#in-m'), 'rv-m')
        pg.fill('#in-q', '2')
        pg.dispatch_event('#in-q', 'input')
        self.assertEqual(pg.input_value('#in-a'), '70')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-card] [data-print]')
        sold = [p for p in self.c.get('/api/state')['payments'] if p['studentId'] == 'rv-s4' and p['kind'] == 'material']
        self.assertEqual([(p['qty'], p['amount']) for p in sold], [(2, 70)])
        self.assertEqual(next(m for m in self.c.get('/api/state')['materials'] if m['id'] == 'rv-m')['stock'], 3)
        # money in advance
        pg.click('[data-topup]')
        pg.wait_for_selector('#in-a')
        pg.fill('#in-a', '150')
        pg.click('.dialog [data-ok]')
        pg.wait_for_selector('[data-card]:has-text("150")')
        self.assertEqual(self.c.get('/api/c/card?id=rv-s4')['wallet'], 150)
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
