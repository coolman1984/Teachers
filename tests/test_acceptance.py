"""Acceptance checks on a full sample centre (review E03, E04, E05, E11): every page on a 360 px phone, in both languages, in the dark
theme and the largest font, opens without an error and without anything wider than the screen; a check-in on one screen reaches
another screen within 3 seconds without reloading everything; and the door's peak (30 cards) fits the plan's 90 seconds."""
import time
import unittest

from harness import ADMIN
from test_e2e_browser import BrowserBase, SKIP

PAGES = ['overview', 'door', 'students', 'groups', 'money', 'exams', 'followup', 'settlements', 'reports', 'activity', 'watch', 'devices',
         'settings', 'settings?tab=rules', 'settings?tab=lists', 'settings?tab=messages', 'settings?tab=gateway', 'settings?tab=remote',
         'settings?tab=access', 'settings?tab=data', 'help', 'students/import']


@SKIP
class SampleCentreTest(BrowserBase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.c = cls.S.client()
        cls.c.login(*ADMIN)
        cls.c.post('/api/first-run', {})
        t = time.time()
        cls.c.post('/api/c/sample', {})
        cls.sample_seconds = time.time() - t
        cls.state = cls.c.get('/api/state')

    def test_a0_the_sessions_now_list_never_widens_a_phone(self):
        """Regression (2026-10-06): during the day the overview lists the sessions running now; a long group, teacher and room
        made the row wider than a 360 px phone at the largest font. The page test above only sees it at those hours."""
        pg = self.open({'lang': 'en', 'size': 'xl'}, width=360, height=740)
        pg.goto(self.S.base + '/#/overview')
        pg.wait_for_selector('#view > *')
        wide = pg.evaluate("""() => { const v = document.querySelector('#view'); v.insertAdjacentHTML('afterbegin', '<section class="card"><ul class="now-list">' +
            '<li><span class="now-time"><bdi>15:00</bdi><small><bdi>16:30</bdi></small></span><span class="now-bar"></span><div class="grow">' +
            '<b class="ellipsis" style="display:block">A very long group name for the secondary third year revision</b>' +
            '<span class="muted">Mr Abdelrahman Mostafa Abdelrahman Ibrahim · Laboratory room number two</span><div class="meter"><i style="width:40%"></i></div></div>' +
            '<span class="now-count"><b class="num">121</b><span class="faint num"> / 124</span></span></li></ul></section>');
            return document.documentElement.scrollWidth; }""")
        self.assertLessEqual(wide, 362)
        pg.context.close()

    def test_a_every_page_fits_a_phone_in_both_languages_dark_and_xl(self):
        problems = []
        for lang in ('ar', 'en'):
            pg = self.open({'lang': lang, 'theme': 'night', 'size': 'xl'}, width=360, height=740)
            for page in PAGES:
                self.errors.clear()
                pg.goto(self.S.base + '/#/' + page)
                pg.wait_for_selector('#view > *')
                pg.wait_for_timeout(700)                                   # the page loads its own numbers after the shell
                if pg.query_selector('#view .skeleton') and page not in ('door',):
                    pg.wait_for_timeout(1500)
                wide = pg.evaluate('document.documentElement.scrollWidth')
                if wide > 362:
                    culprit = pg.evaluate("""() => { const w = innerWidth; for (const e of document.querySelectorAll('#view *')) {
                        const r = e.getBoundingClientRect(); if (r.right > w + 2 || r.left < -2) return e.tagName + '.' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right); } return ''; }""")
                    problems.append((lang, page, 'width', wide, culprit))
                errs = [e for e in self.errors if 'favicon' not in e]
                if errs:
                    problems.append((lang, page, 'errors', errs[:2]))
            pg.context.close()
        self.maxDiff = None
        self.assertEqual(problems, [])

    def test_a2_settings_fit_a_phone_with_a_wide_linux_font(self):
        """With the system font, Linux PCs show DejaVu Sans, which is much wider than the fonts here: the backup and data-check
        buttons left the card headers and a gateway button grew wider than a 360 px phone (seen on the CI runner only)."""
        problems = []
        for lang in ('ar', 'en'):
            pg = self.open({'lang': lang, 'theme': 'night', 'size': 'xl'}, width=360, height=740)
            for page in [p for p in PAGES if p.startswith('settings')]:
                pg.goto(self.S.base + '/#/' + page)
                pg.wait_for_selector('#view > *')
                pg.wait_for_timeout(700)
                pg.add_style_tag(content="body, body * { font-family: 'DejaVu Sans' !important; }")
                pg.wait_for_timeout(200)
                wide = pg.evaluate('document.documentElement.scrollWidth')
                if wide > 362:
                    problems.append((lang, page, wide))
            pg.context.close()
        self.assertEqual(problems, [])

    def test_b_a_check_in_reaches_another_screen_within_3_seconds_without_a_full_reload(self):
        watcher = self.open({'lang': 'ar'})
        watcher.goto(self.S.base + '/#/door')
        watcher.wait_for_selector('[data-today] .today-strip, [data-today] .empty')
        full = []
        watcher.on('request', lambda r: full.append(r.url) if r.url.endswith('/api/state') else None)
        sess = next((s for s in self.c.get('/api/c/today')['sessions'] if s.get('status') != 'cancelled'), None)
        if not sess:
            self.skipTest('the sample centre has no session today')
        roster = self.c.get('/api/c/roster?session=' + sess['id'])
        sid = next(r['student']['id'] for r in roster['rows'] if not r.get('status') or r['status'] == 'absent')
        before = watcher.inner_text('[data-today]')
        t = time.time()
        self.c.post('/api/c/checkin', {'studentId': sid, 'sessionId': sess['id']})
        changed = None
        while time.time() - t < 6:
            if watcher.inner_text('[data-today]') != before:
                changed = time.time() - t
                break
            time.sleep(0.1)
        self.assertIsNotNone(changed, 'the other screen never showed the check-in')
        self.assertLess(changed, 3.0)
        self.assertEqual(full, [], 'only the change travelled, not the whole state')

    def test_c_door_peak_thirty_cards_well_inside_ninety_seconds(self):
        """30 students arrive for one group in a busy sample centre: each card is opened (what the scanner does) and checked in."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
        import domain as D
        from datetime import date
        wd = D.weekday(date.today())
        ops = [{'e': 'groups', 'id': 'peak-g', 'op': 'put', 'row': {'name': 'Peak Group', 'teacherId': self.state['teachers'][0]['id'], 'gradeCode': 'S3',
                'subjectId': self.state['subjects'][0]['id'], 'feeType': 'session', 'fee': 60, 'capacity': 40, 'active': True,
                'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}]}}]
        ops += [{'e': 'students', 'id': f'peak-s{i}', 'op': 'put', 'row': {'code': str(48000 + i), 'name': f'Peak Student {i}', 'gradeCode': 'S3',
                 'system': 'thanaweya', 'track': 'science', 'consent': True, 'active': True}} for i in range(30)]
        self.c.post('/api/commit', {'label': 'peak', 'ops': ops})
        for i in range(30):
            self.c.post('/api/c/enroll', {'studentId': f'peak-s{i}', 'groupId': 'peak-g'})
        sess = D.session_id('peak-g', date.today(), '00:00')
        t = time.time()
        for i in range(30):
            found = self.c.get(f'/api/c/find?q={48000 + i}')                  # the scanner types the code
            card = self.c.get('/api/c/card?id=' + found[0]['id'])
            self.assertEqual(card['suggested'], sess)
            self.c.post('/api/c/checkin', {'studentId': found[0]['id'], 'sessionId': sess, 'via': 'scan'})
        took = time.time() - t
        self.assertLess(took, 30, f'30 cards took {took:.1f} s on this machine')        # the plan allows 90 s with people at the desk
        again = self.c.post('/api/c/checkin', {'studentId': 'peak-s0', 'sessionId': sess, 'via': 'scan'})
        self.assertTrue(again.get('already'))                                # a second scan never records twice
        att = [a for a in self.c.get('/api/state')['attendance'] if a['sessionId'] == sess]
        self.assertEqual(len(att), 30)
        print(f'\n  door peak: 30 cards (find + card + check-in) in {took:.2f} s with {len(self.state["students"])} students and '
              f'{len(self.state["groups"])} groups; sample centre built in {self.sample_seconds:.1f} s')

    def test_d_sample_data_is_marked_and_removed_without_touching_real_records(self):
        self.c.post('/api/commit', {'label': 'real', 'ops': [{'e': 'subjects', 'id': 'real-sub', 'op': 'put', 'row': {'name': 'A real subject'}}]})
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/settings?tab=data')
        pg.wait_for_selector('#view > *')
        self.assertTrue(any(s['id'].startswith('smp-') for s in self.c.get('/api/state')['students']))
        self.c.post('/api/c/sample/delete', {})
        st = self.c.get('/api/state')
        self.assertFalse(any(s['id'].startswith('smp-') for s in st['students']))
        self.assertTrue(any(s['id'] == 'real-sub' for s in st['subjects']))
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
