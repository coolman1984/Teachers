"""The parent link from the centre PC to the parent's phone (review C06): a real gateway (gateway/dev/server.js - the Worker code
on a local stand-in for Cloudflare D1), a real centre server, and Chromium as the phone. One child per link, unpublished marks
hidden, no phone numbers, updates arrive, a replaced link stops and its saved copy is wiped, the last copy opens offline, and the
centre keeps working when the internet mailbox is down."""
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import date

from harness import Server, make_authority
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))
import domain as D  # noqa: E402


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Gateway:
    def __init__(self, secret, port=None, db=None):
        self.port, self.db = port or free_port(), db or os.path.join(tempfile.mkdtemp(prefix='hs-gw-'), 'gw.db')
        env = {**os.environ, 'PORT': str(self.port), 'OFFICE_SECRET': secret, 'GATEWAY_DB': self.db}
        self.p = subprocess.Popen(['node', '--no-warnings', os.path.join(ROOT, 'gateway', 'dev', 'server.js')], env=env,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        line = self.p.stdout.readline()
        if 'READY' not in line:
            raise RuntimeError('gateway did not start: ' + line)
        self.url = f'http://127.0.0.1:{self.port}'

    def stop(self):
        if self.p.poll() is None:
            self.p.terminate()
            self.p.wait(10)
        self.p.stdout.close()


def node_ok():
    try:
        out = subprocess.run(['node', '-e', "require('node:sqlite')"], capture_output=True, timeout=20)
        return out.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


@unittest.skipUnless(node_ok(), 'node 22+ with node:sqlite is needed for the local gateway')
class ParentJourneyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Server('parent').start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.c = make_authority(cls.s)
        c, today = cls.c, date.today()
        wd = D.weekday(today)
        ops = [('subjects', 'pg-sub', {'name': 'فيزياء', 'nameEn': 'Physics'}),
               ('teachers', 'pg-t', {'name': 'Synthetic Teacher', 'centerPct': 20, 'mobile': '01099999999'}),
               ('groups', 'pg-g', {'name': 'Physics S1 Sat', 'teacherId': 'pg-t', 'subjectId': 'pg-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 80,
                                   'capacity': 30, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '23:59'}, {'day': (wd + 2) % 7, 'start': '17:00', 'end': '18:30'}]}),
               ('students', 'pg-a', {'code': '43001', 'name': 'Synthetic Child Alpha', 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '01012121212', 'consent': True, 'active': True}),
               ('students', 'pg-b', {'code': '43002', 'name': 'Synthetic Child Beta', 'gradeCode': 'S1', 'system': 'thanaweya', 'parentMobile': '01034343434', 'consent': True, 'active': True}),
               ('exams', 'pg-x1', {'title': 'Published Quiz', 'teacherId': 'pg-t', 'groupIds': ['pg-g'], 'date': today.isoformat(), 'kind': 'weekly', 'maxScore': 20, 'published': True}),
               ('exams', 'pg-x2', {'title': 'Secret Draft Quiz', 'teacherId': 'pg-t', 'groupIds': ['pg-g'], 'date': today.isoformat(), 'kind': 'weekly', 'maxScore': 20})]
        c.post('/api/commit', {'label': 'Parent fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for sid in ('pg-a', 'pg-b'):
            c.post('/api/c/enroll', {'studentId': sid, 'groupId': 'pg-g'})
        c.post('/api/c/checkin', {'studentId': 'pg-a', 'sessionId': D.session_id('pg-g', today, '00:00')})
        c.post('/api/c/marks', {'examId': 'pg-x1', 'items': [{'studentId': 'pg-a', 'score': 17}, {'studentId': 'pg-b', 'score': 19}]})
        c.post('/api/c/marks', {'examId': 'pg-x2', 'items': [{'studentId': 'pg-a', 'score': 3}]})
        c.post('/api/c/shift/open', {'opening': 0})
        c.post('/api/c/pay', {'studentId': 'pg-a', 'groupId': 'pg-g', 'kind': 'fee', 'amount': 50, 'method': 'cash'})
        # the owner follows the setup page: address, secrets, the office secret on "Cloudflare", test
        c.post('/api/gateway/save', {'url': 'http://127.0.0.1:1', 'pollSeconds': 600})
        c.post('/api/gateway/generate', {})
        secret = c.get('/api/gateway/secret')['secret']
        cls.gw = Gateway(secret)
        cls.addClassCleanup(lambda: cls.gw.stop())
        c.post('/api/gateway/save', {'url': cls.gw.url, 'pollSeconds': 600})
        assert c.post('/api/gateway/test', {})['ok']

    def link(self, sid, replace=False):
        return self.c.post('/api/c/portal', {'studentId': sid, 'replace': replace})['url']

    def send(self):
        return self.c.post('/api/gateway/send', {})

    def browser(self):
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        b = pw.chromium.launch(executable_path=CHROMIUM)
        self.addCleanup(b.close)
        return b

    def test_a_the_server_side_of_the_journey(self):
        url_a = self.link('pg-a')
        st = self.send()
        self.assertEqual((st['links'], st['cards']), (1, 1))
        self.assertIsNone(st['lastError'])
        import json
        import urllib.request
        card = json.loads(urllib.request.urlopen(url_a.replace('/t/', '/api/card/')).read())['card']
        self.assertEqual(card['name'], 'Synthetic Child Alpha')
        self.assertEqual([m['title'] for m in card['marks']], ['Published Quiz'])          # the draft never leaves the centre
        self.assertEqual(card['marks'][0]['rank'], 2)
        raw = json.dumps(card, ensure_ascii=False)
        for secret in ('0101212', '0103434', '0109999', 'Beta'):                              # no phone number, no other child
            self.assertNotIn(secret, raw)
        self.assertTrue(card['week'])                                                         # the timetable of the coming days
        self.assertEqual(card['groups'][0]['balance'], -30)                                   # 80 owed - 50 paid

    @SKIP
    def test_b_the_phone(self):
        b = self.browser()
        url_a, url_b = self.link('pg-a'), self.link('pg-b')
        self.send()
        ctx = b.new_context(viewport={'width': 360, 'height': 740}, service_workers='allow')
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(url_a)
        pg.wait_for_selector('.who h1')
        text = pg.inner_text('#app')
        self.assertIn('Synthetic Child Alpha', text)
        self.assertIn('Published Quiz', text)
        self.assertNotIn('Secret Draft', text)
        self.assertIn('الترتيب 2 من 2', text)
        self.assertEqual(pg.evaluate('document.documentElement.dir'), 'rtl')
        self.assertLessEqual(pg.evaluate('document.documentElement.scrollWidth'), 361)        # nothing wider than a small phone
        self.assertEqual(pg.query_selector_all('form, input, textarea'), [])                  # nothing to change from here
        # the second child's link shows the second child only
        pg2 = ctx.new_page()
        pg2.goto(url_b)
        pg2.wait_for_selector('.who h1')
        self.assertIn('Synthetic Child Beta', pg2.inner_text('#app'))
        self.assertNotIn('Alpha', pg2.inner_text('#app'))
        pg2.close()
        # English
        pg.click('[data-lang]')
        pg.wait_for_selector('html[dir="ltr"]')
        self.assertIn('Rank 2 of 2', pg.inner_text('#app'))
        # the centre publishes the other exam -> after the next send the parent sees it
        ver = next(x for x in self.c.get('/api/state')['exams'] if x['id'] == 'pg-x2')['ver']
        self.c.post('/api/commit', {'label': 'publish', 'ops': [{'e': 'exams', 'id': 'pg-x2', 'op': 'put', 'ver': ver, 'row': {
            'title': 'Secret Draft Quiz', 'teacherId': 'pg-t', 'groupIds': ['pg-g'], 'date': date.today().isoformat(), 'kind': 'weekly', 'maxScore': 20, 'published': True}}]})
        self.send()
        pg.click('[data-refresh]')
        pg.wait_for_selector('text=Secret Draft Quiz')
        # offline: the service worker answers the last copy and the page says it may be old
        for _ in range(30):                                  # the first visit installs the worker; it controls the page after a reload
            if pg.evaluate('!!navigator.serviceWorker.controller'):
                break
            time.sleep(0.5)
            pg.reload()
            pg.wait_for_selector('.who h1')
        self.assertTrue(pg.evaluate('!!navigator.serviceWorker.controller'))
        pg.click('[data-refresh]')                            # this answer is saved by the worker
        time.sleep(0.5)
        # the internet is gone (the mailbox cannot be reached): the phone shows its last copy and says it may be old
        secret, port, db = self.c.get('/api/gateway/secret')['secret'], self.gw.port, self.gw.db
        self.gw.stop()
        pg.reload()
        pg.wait_for_selector('.note.warn')
        self.assertIn('Synthetic Child Alpha', pg.inner_text('#app'))
        type(self).gw = Gateway(secret, port, db)
        # the link reached the wrong person: replace it -> the old one stops and its saved copy is wiped
        self.link('pg-a', replace=True)
        self.send()
        pg.reload()
        pg.wait_for_selector('.msg.revoked')
        self.gw.stop()                                        # offline again: the wiped copy does not come back
        pg.reload()
        pg.wait_for_selector('.msg')
        self.assertNotIn('Synthetic Child Alpha', pg.inner_text('#app'))                    # nothing of the child stays on the phone
        type(self).gw = Gateway(secret, port, db)
        self.assertEqual(errors, [])

    def test_c_the_centre_keeps_working_when_the_mailbox_is_down(self):
        self.link('pg-b')
        self.gw.stop()
        try:
            r = self.c.post('/api/c/checkin', {'studentId': 'pg-b', 'sessionId': D.session_id('pg-g', date.today(), '00:00')})
            self.assertIn(r['status'], ('present', 'late'))
            with self.assertRaises(Exception) as e:
                self.send()
            self.assertEqual(e.exception.data.get('key'), 'gw.err.unreachable')               # said in the person's language
            st = self.c.get('/api/gateway')
            self.assertEqual(st['lastErrorKey'], 'gw.err.unreachable')
        finally:
            type(self).gw = Gateway(self.c.get('/api/gateway/secret')['secret'])
            self.c.post('/api/gateway/save', {'url': self.gw.url, 'pollSeconds': 600})
        st = self.send()
        self.assertIsNone(st['lastError'])


if __name__ == '__main__':
    unittest.main()
