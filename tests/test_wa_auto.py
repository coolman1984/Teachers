"""Automatic WhatsApp to parents through Hessa online (owner's request, 2026-10-07): a real gateway (the Worker on the local D1
stand-in) with a stand-in for Meta's WhatsApp API, and a real centre server. Only parents who agreed get messages, each message
goes once, an absence waits for the end of the class, receipts start from the moment it was switched on, and every message
sent lands in the student's follow-up history. The manual report is the same neat few lines."""
import json
import os
import sys
import threading
import unittest
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import ApiError, Server, make_authority, wait_until  # noqa: E402
from test_gateway_parent import node_ok  # noqa: E402
from test_owner_online import HERE_PC, PUB, SEED, Service  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))
import domain as D  # noqa: E402
import license as L  # noqa: E402


class FakeMeta:
    """Meta's WhatsApp Cloud API: records each template message and answers with a message id."""

    def __init__(self):
        self.sent = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)))
                outer.sent.append({'auth': self.headers.get('Authorization'), 'path': self.path, **body})
                data = json.dumps({'messages': [{'id': f'wamid.{len(outer.sent)}'}]}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = f'http://127.0.0.1:{self.srv.server_address[1]}'
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


@unittest.skipUnless(node_ok(), 'node 22+ with node:sqlite is needed for the local gateway')
class AutoWhatsAppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = {k: os.environ.get(k) for k in ('HS_LICENSE_PUB', 'HS_MACHINE_ID')}
        os.environ['HS_LICENSE_PUB'] = PUB.hex()
        os.environ['HS_MACHINE_ID'] = HERE_PC
        cls.addClassCleanup(cls.restore_env)
        cls.meta = FakeMeta()
        cls.addClassCleanup(cls.meta.close)
        cls.gw = Service(WA_TOKEN='meta-test-token', WA_PHONE_ID='999', WA_API=cls.meta.url)
        cls.addClassCleanup(cls.gw.stop)
        cls.s = Server('waauto', extra_cfg={'license_required': True, 'service_url': cls.gw.url}).start()
        cls.addClassCleanup(cls.s.cleanup)
        cls.c = c = make_authority(cls.s)
        today = date.today()
        c.post('/api/license/activate', {'code': L.make_code(SEED, L.KIND_ACTIVATE, [L.machine_hash(HERE_PC)], until=today + timedelta(days=30), serial=31)})
        wd = D.weekday(today)
        ops = [('settings', 'systemName', {'value': 'Synthetic Centre'}), ('subjects', 'wa-sub', {'name': 'Physics'}), ('teachers', 'wa-t', {'name': 'Synthetic Teacher'}),
               # a class that has already ended today (00:00-00:01) and one that runs all day
               ('groups', 'wa-g', {'name': 'WA Physics', 'teacherId': 'wa-t', 'subjectId': 'wa-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 50,
                                   'capacity': 30, 'active': True, 'slots': [{'day': wd, 'start': '00:00', 'end': '00:01'}]}),
               ('students', 'wa-a', {'code': '61001', 'name': 'Synthetic Came', 'gradeCode': 'S1', 'parentMobile': '01011112222', 'consent': True, 'active': True}),
               ('students', 'wa-b', {'code': '61002', 'name': 'Synthetic Missed', 'gradeCode': 'S1', 'parentMobile': '01233334444', 'consent': True, 'active': True}),
               ('students', 'wa-c', {'code': '61003', 'name': 'Synthetic NoConsent', 'gradeCode': 'S1', 'parentMobile': '01555556666', 'consent': False, 'active': True})]
        c.post('/api/commit', {'label': 'WA fixture', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        for sid in ('wa-a', 'wa-b', 'wa-c'):
            c.post('/api/c/enroll', {'studentId': sid, 'groupId': 'wa-g'})
        c.post('/api/c/shift/open', {'opening': 0})
        c.post('/api/c/pay', {'studentId': 'wa-a', 'groupId': 'wa-g', 'kind': 'fee', 'amount': 30, 'method': 'cash'})   # before switching on
        c.post('/api/c/checkin', {'studentId': 'wa-a', 'sessionId': D.session_id('wa-g', today, '00:00')})

    @classmethod
    def restore_env(cls):
        for k, v in cls.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_a_the_manual_report_is_the_neat_few_lines(self):
        t = self.c.get('/api/c/wa?studentId=wa-a&kind=report&lang=ar')['text']
        self.assertIn('📚 *Synthetic Centre*', t)
        self.assertIn('الحضور: 1 من 1 حصص', t)
        self.assertIn('الحساب:', t)
        t = self.c.get('/api/c/wa?studentId=wa-b&kind=report&lang=en')['text']
        self.assertIn('Attendance: 0 of 1 classes · missed 1', t)

    def test_b_automatic_messages_go_once_to_parents_who_agreed(self):
        c, today = self.c, date.today()
        with self.assertRaises(ApiError):                                  # not before the centre is on Hessa online
            c.post('/api/wa-auto/run', {})
        c.post('/api/gateway/join', {})
        st = c.get('/api/wa-auto')
        self.assertEqual((st['consented'], st['withMobile']), (2, 3))
        self.assertTrue(st['service']['ready'])
        c.post('/api/wa-auto', {'absence': True, 'receipt': True, 'report': 'weekly', 'day': D.weekday(today), 'hour': 0})
        c.post('/api/c/pay', {'studentId': 'wa-a', 'groupId': 'wa-g', 'kind': 'fee', 'amount': 40, 'method': 'cash'})
        c.post('/api/c/pay', {'studentId': 'wa-c', 'groupId': 'wa-g', 'kind': 'fee', 'amount': 50, 'method': 'cash'})
        c.post('/api/wa-auto/run', {})                                       # (the background round may already have sent them)
        wait_until(lambda: len(self.meta.sent) >= 4, 30, what='the four messages')   # absence (b), receipt (a: only the new one), reports (a, b)
        sent = self.meta.sent
        self.assertTrue(all(m['auth'] == 'Bearer meta-test-token' and m['path'] == '/v21.0/999/messages' for m in sent))
        by = {(m['template']['name'], m['to']) for m in sent}
        self.assertEqual(by, {('hessa_absence', '201233334444'), ('hessa_receipt', '201011112222'), ('hessa_report', '201011112222'), ('hessa_report', '201233334444')})
        self.assertNotIn('201555556666', json.dumps(sent), 'no message without the parent\'s consent')
        receipt = next(m for m in sent if m['template']['name'] == 'hessa_receipt')['template']['components'][0]['parameters']
        self.assertEqual([p['text'] for p in receipt][:3], ['Synthetic Centre', '40', 'Synthetic Came'])
        for m in sent:
            for p in m['template']['components'][0]['parameters']:
                self.assertTrue(p['text'] and '\n' not in p['text'], 'WhatsApp values are never empty and never hold a new line')
        # nothing goes twice: not on the next round, not after a restart of the sender's memory
        self.assertEqual(c.post('/api/wa-auto/run', {})['sent'], 0)
        os.remove(os.path.join(self.s.data_dir, 'wa-sent.json'))
        self.assertEqual(len(self.meta.sent), 4)
        c.post('/api/wa-auto/run', {})
        self.assertEqual(len(self.meta.sent), 4)
        hist = [f for f in c.get('/api/state')['followups'] if f.get('by') == 'Hessa online (automatic)']
        self.assertEqual(sorted(f['reason'] for f in hist), ['absence', 'payment', 'report', 'report'])
        log = c.get('/api/wa-auto')['log']
        self.assertEqual(len([x for x in log if x['status'] == 'sent']), 4)

    def test_c_only_administrators(self):
        profiles = {p['name']: p['perms'] for p in self.c.get('/api/users')['profiles']}
        self.c.post('/api/users/save', {'username': 'desk.wa', 'full_name': 'Synthetic Desk', 'password': 'Reception-key-9', 'must_change': False,
                                        'role': 'Front desk', 'perms': profiles['Front desk']})
        desk = self.s.client()
        desk.login('desk.wa', 'Reception-key-9')
        for call in (lambda: desk.get('/api/wa-auto'), lambda: desk.post('/api/wa-auto', {'absence': True}), lambda: desk.post('/api/wa-auto/run', {})):
            with self.assertRaises(ApiError):
                call()
