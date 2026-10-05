"""Regression tests for the completion review of 2026-10-05 (A04-A07, B01, B02): what the person at the desk sees is what
the centre PC really saved - door switches that work, a lost connection that stops saving, a payment pressed twice that is
taken once, a handout never sold beyond the shelf, and a WhatsApp message counted only when the person says it went."""
import os
import re
import sys
import time
import unittest
from pathlib import Path
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


ROOT = Path(__file__).resolve().parents[1]


class SchoolStatementTest(CenterFixture):
    """B06: the month of a school support group, split by the centre's rules, computed from attendance and receipts."""

    def test_statement_splits_the_month_and_counts_reversals(self):
        school = self.p + '-school'
        self.put([('groups', school, {'name': 'School Group ' + self.p, 'teacherId': self.teacher, 'subjectId': self.p + '-subject', 'gradeCode': 'S1',
                                      'feeType': 'session', 'fee': 60, 'capacity': 25, 'kind': 'school', 'active': True,
                                      'slots': [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'}]})])
        self.c.post('/api/c/enroll', {'studentId': self.student, 'groupId': school})
        self.c.post('/api/c/checkin', {'studentId': self.student, 'sessionId': D.session_id(school, self.day, '00:00')})
        self.open_shift()
        self.c.post('/api/c/pay', {'studentId': self.student, 'groupId': school, 'kind': 'fee', 'amount': 60, 'method': 'cash'})
        wrong = self.c.post('/api/c/pay', {'studentId': self.student, 'groupId': school, 'kind': 'fee', 'amount': 40, 'method': 'cash'})
        self.c.post('/api/c/void', {'id': wrong['id'], 'reason': 'Typed twice'})
        ym = self.day[:7]
        r = self.c.get(f'/api/c/school?groupId={school}&ym={ym}')
        self.assertEqual(r['collected'], 60)                               # the reversed receipt cancels itself
        self.assertEqual(r['split'], {'treasury': 9.0, 'teacher': 40.8, 'school': 10.2})   # 15% first, then 80% of the rest
        self.assertEqual([(x['code'], x['visits'], x['paid']) for x in r['students']], [(str(10000 + type(self).serial * 500), 1, 60)])
        self.assertEqual(r['held'], 1)
        self.assertTrue(r['checks']['fee'] and r['checks']['students'])
        with self.assertRaises(Exception) as e:
            self.c.get(f'/api/c/school?groupId={self.group}&ym={ym}')      # an ordinary centre group has no school statement
        self.assertEqual(e.exception.data.get('key'), 'err.notSchool')


class SecurityWordsTest(unittest.TestCase):
    """B08: every fixed sentence the server writes in the Logins & security log has a translation in the page."""

    def test_every_fixed_server_sentence_is_translated(self):
        js = (ROOT / 'js' / 'views' / 'activity.js').read_text(encoding='utf-8')
        patterns = [re.compile(p.replace('\\/', '/')) for p in re.findall(r"\[/(\^.*?\$)/, '", js)]
        self.assertGreater(len(patterns), 30)
        sentences = []
        for f in ('auth.py', 'app.py', 'sync.py', 'nodectl.py'):
            src = (ROOT / 'server' / f).read_text(encoding='utf-8')
            # log(..., 'event', target, 'Fixed sentence')  - plain literals only (sentences with values are covered by their pattern below)
            sentences += re.findall(r"log\([^\n]*?, '[a-z-]+', [^\n]*?, '([A-Z][^'{}]+)'\)", src)
        sentences += ['Wrong password (attempt 2 of 5)', 'Locked for 15 minutes after 5 wrong passwords', 'Account is locked until 2026-10-05 10:00',
                      'Changed own password; 1 other session(s) logged out', '3 permission(s); updated for 2 person(s)',
                      'Logged out automatically after 30 minutes without activity', 'Sessions ended by the administrator on PC-A (2 here)',
                      'PC Desk (192.168.1.5) asks to join; confirmation number 123456', '4 records changed back; safety backup: b.zip',
                      'Role: Front desk; active: True; teachers: all; permissions: door.use, students.view']
        self.assertGreater(len(sentences), 25)
        missing = [x for x in sentences if not any(p.match(x) for p in patterns)]
        self.assertEqual(missing, [])
        en = (ROOT / 'js' / 'i18n' / 'en.js').read_text(encoding='utf-8')
        ar = (ROOT / 'js' / 'i18n' / 'ar.js').read_text(encoding='utf-8')
        table = js.split('var DETAIL = [', 1)[1].split('var PART = [', 1)[0]
        keys = set(re.findall(r"\$/, '([A-Za-z]+)'\]", table))
        self.assertEqual([k for k in keys if "'sec.d." + k + "'" not in en or "'sec.d." + k + "'" not in ar], [])


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

    def test_b07_b08_history_buttons_and_security_log_in_arabic(self):
        bad = self.S.client()
        try:
            bad.login('boss', 'not-the-password')
        except Exception:
            pass
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/activity')
        pg.wait_for_selector('[data-tab="security"]')
        pg.click('[data-tab="security"]')
        pg.wait_for_selector('.log-row .log-sum')
        text = pg.inner_text('#view')
        self.assertIn('كلمة مرور خاطئة (المحاولة', text)
        self.assertNotIn('Wrong password (attempt', text)
        # the group panel and a list editor open the history of that one record
        pg.goto(self.S.base + '/#/groups')
        pg.wait_for_selector('[data-open-group], tr[data-id]')
        pg.evaluate("HS.openGroup('rv-g')")
        pg.wait_for_selector('.drawer [data-ghist]')
        pg.click('.drawer [data-ghist]')
        pg.wait_for_selector('.dialog [data-hist-host] li, .dialog [data-hist-host] .empty')
        self.assertIn('Synthetic Review Group', pg.inner_text('.dialog'))
        pg.click('.dialog [data-close]')
        pg.evaluate("HS.lists.edit('teachers', 'rv-t')")
        pg.wait_for_selector('.drawer [data-lhist]')
        pg.click('.drawer [data-lhist]')
        pg.wait_for_selector('.dialog [data-hist-host] li, .dialog [data-hist-host] .empty')
        self.assertEqual(self.errors, [])

    def test_b05_b06_month_report_to_excel_and_school_statement(self):
        import io
        import zipfile
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/reports')
        pg.wait_for_selector('[data-xlsx]')
        pg.wait_for_selector('.rep-kpis')
        with pg.expect_download() as dl:
            pg.click('[data-xlsx]')
        with open(dl.value.path(), 'rb') as f:
            z = zipfile.ZipFile(io.BytesIO(f.read()))
        book = z.read('xl/workbook.xml').decode('utf-8')
        for name in ('الملخص', 'ربحية', 'فروق'):                                 # one sheet per section, in the reader's language
            self.assertIn(name, book)
        self.assertGreaterEqual(book.count('<sheet '), 8)
        # a school support group has its statement in the group panel
        self.c.post('/api/commit', {'label': 'School group', 'ops': [{'e': 'groups', 'id': 'rv-school', 'op': 'put', 'row': {
            'name': 'Synthetic School Group', 'teacherId': 'rv-t', 'subjectId': 'rv-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 50,
            'capacity': 25, 'kind': 'school', 'active': True, 'slots': [{'day': D.weekday(date.today()), 'start': '00:00', 'end': '23:59'}]}}]})
        pg.goto(self.S.base + '/#/groups'); pg.reload()
        pg.wait_for_selector('#view')
        pg.evaluate("HS.data.load().then(() => HS.openGroup('rv-school'))")
        pg.wait_for_selector('.drawer [data-school]')
        pg.click('.drawer [data-school]')
        pg.wait_for_selector('.dialog [data-sch-body] .empty, .dialog .print-preview')
        self.assertIn('كشف مجموعة التقوية', pg.inner_text('.dialog'))
        self.assertEqual(self.errors, [])

    def test_b04_receipt_paper_sizes_render_at_their_width(self):
        """The receipt is rendered to PDF by Chromium with the page size the CSS asks for; the paper width is read back
        from the PDF. A real printer is still to be tried at the centre (TASKS B04)."""
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/settings?tab=appearance')
        pg.wait_for_selector('[data-pref="receiptPaper"]')
        pg.evaluate("window.print = () => {}")
        widths = {}
        for paper, mm in (('80', 80), ('58', 58), ('a5', 148)):
            pg.click(f'[data-pref="receiptPaper"][data-v="{paper}"]')
            pg.evaluate("document.querySelectorAll('#print-sheet').forEach(e => e.remove())")
            pg.click('[data-testprint]')
            pg.wait_for_selector('#print-sheet .ps-receipt', state='attached')
            self.assertEqual(pg.evaluate("document.querySelector('#print-sheet').className"), 'paper-' + paper)
            pdf = pg.pdf(prefer_css_page_size=True, print_background=True)
            box = re.search(rb'/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)', pdf)
            widths[paper] = round(float(box.group(1)) / 72 * 25.4)
            self.assertAlmostEqual(widths[paper], mm, delta=1, msg=widths)
        self.assertEqual(self.errors, [])

    def test_c05_parent_link_setup_page_student_tab_and_exam_publish(self):
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/settings?tab=gateway')
        pg.wait_for_selector('.gw-steps')
        self.assertEqual(len(pg.query_selector_all('.gw-step')), 4)
        self.assertTrue(pg.is_disabled('[data-gw="generate"]'))                 # step 2 waits for step 1
        pg.fill('[data-gw-url] [name=url]', 'http://example.com')               # not https: refused in plain words
        pg.click('[data-gw-url] button')
        pg.wait_for_selector('.toast.bad')
        self.assertIn('https://', pg.inner_text('.toast.bad'))
        # the student file has the parent-link tab and says what to do when links are not set up
        pg.evaluate("HS.openStudent('rv-s0', 'parent')")
        pg.wait_for_selector('.drawer [data-tab="parent"][aria-selected="true"]')
        self.assertIn('غير مُعدّة', pg.inner_text('.drawer'))
        pg.click('.drawer [data-x], .drawer [data-close]') if pg.query_selector('.drawer [data-x], .drawer [data-close]') else pg.keyboard.press('Escape')
        # an exam is hidden from parents until the teacher shows it
        self.c.post('/api/commit', {'label': 'exam', 'ops': [{'e': 'exams', 'id': 'rv-x', 'op': 'put', 'row': {
            'title': 'Review Quiz', 'teacherId': 'rv-t', 'groupIds': ['rv-g'], 'date': date.today().isoformat(), 'kind': 'weekly', 'maxScore': 10}}]})
        pg.goto(self.S.base + '/#/exams'); pg.reload()
        pg.wait_for_selector('#view')
        pg.evaluate("HS.data.load()")
        pg.wait_for_selector('text=Review Quiz')
        pg.click('text=Review Quiz')
        pg.wait_for_selector('.drawer [data-publish]')
        self.assertEqual(pg.get_attribute('.drawer [data-publish]', 'aria-pressed'), 'false')
        pg.click('.drawer [data-publish]')
        self.assertTrue(wait_until(lambda: next(x for x in self.c.get('/api/state')['exams'] if x['id'] == 'rv-x').get('published') is True))
        self.assertEqual([e for e in self.errors if 'status of 400' not in e], [])          # the refused http:// address is the only 400


if __name__ == '__main__':
    unittest.main()
