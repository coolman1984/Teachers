"""The AI question generator (review G04) against a local stand-in for the AI service - no real account, no money: the key stays
on this PC (not in the shared data, the state sent to pages or the logs), only the lesson details are sent (never a student),
every failure says what to do, nothing is saved before the teacher adds it, and the whole teacher journey works in Chromium."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from harness import ApiError, Server, make_authority
from test_e2e_browser import CHROMIUM, SKIP, sync_playwright

KEY = 'sk-ant-api03-' + 'x' * 40 + 'WXYZ'
PASSWORD = 'Strong-pass1'
GOOD = [{'text': 'What is the unit of force?', 'choices': ['Joule', 'Newton', 'Watt', 'Pascal'], 'answer': 'B', 'explanation': 'Force is measured in newtons.'},
        {'text': 'Speed is distance divided by...', 'choices': ['mass', 'time', 'area', 'force'], 'answer': 'B', 'explanation': 'v = d / t.'},
        {'text': 'Broken question', 'choices': ['only one'], 'answer': 'A', 'explanation': ''},
        {'text': 'Which is a vector?', 'choices': ['Mass', 'Time', 'Velocity', 'Energy'], 'answer': 'C', 'explanation': 'It has a direction.'}]


class FakeAI:
    """Answers POST /v1/messages like the Messages API; .mode chooses the answer, .seen keeps every request."""

    def __init__(self):
        self.mode, self.seen = 'ok', []
        me = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['content-length'])))
                me.seen.append({'headers': {k.lower(): v for k, v in self.headers.items()}, 'body': body})
                if me.mode in ('401', '429'):
                    return self.reply(int(me.mode), {'type': 'error', 'error': {'type': 'x', 'message': 'no'}})
                if me.mode == 'credit':
                    return self.reply(400, {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low'}})
                stop = {'refusal': 'refusal', 'cut': 'max_tokens'}.get(me.mode, 'end_turn')
                return self.reply(200, {'type': 'message', 'model': body['model'], 'stop_reason': stop,
                                        'content': [{'type': 'thinking', 'thinking': ''}, {'type': 'text', 'text': json.dumps({'questions': GOOD})}]})

            def reply(self, code, data):
                raw = json.dumps(data).encode()
                self.send_response(code)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.http = ThreadingHTTPServer(('127.0.0.1', 0), H)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.url = f'http://127.0.0.1:{self.http.server_address[1]}'

    def stop(self):
        self.http.shutdown()
        self.http.server_close()


class AiSetup:
    @classmethod
    def start(cls, name):
        cls.ai = FakeAI()
        os.environ['HS_AI_URL'] = cls.ai.url
        try:
            cls.s = Server(name).start()
        finally:
            os.environ.pop('HS_AI_URL', None)
        cls.c = make_authority(cls.s)
        ops = [('subjects', 'ai-sub', {'name': 'Physics'}), ('teachers', 'ai-t1', {'name': 'Synthetic AI Teacher'}), ('teachers', 'ai-t2', {'name': 'Other Teacher'}),
               ('groups', 'ai-g', {'name': 'AI Group', 'teacherId': 'ai-t1', 'subjectId': 'ai-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 10,
                                   'capacity': 10, 'active': True, 'slots': [{'day': 0, 'start': '10:00', 'end': '11:00'}]}),
               ('students', 'ai-s', {'code': '48001', 'name': 'Synthetic Secret Student', 'gradeCode': 'S1', 'parentMobile': '01077777777', 'consent': True, 'active': True})]
        cls.c.post('/api/commit', {'label': 'ai', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        cls.c.post('/api/c/enroll', {'studentId': 'ai-s', 'groupId': 'ai-g'})

    @classmethod
    def stop(cls):
        cls.s.cleanup()
        cls.ai.stop()

    def ask(self, client=None, **more):
        return (client or self.c).post('/api/c/ai/questions', {'teacherId': 'ai-t1', 'subjectId': 'ai-sub', 'gradeCode': 'S1', 'topic': 'Forces and motion',
                                                               'count': 3, 'lang': 'en', 'notes': 'Short questions', **more})

    def person(self, role, scopes=None):
        profiles = {p['name']: p['perms'] for p in self.c.get('/api/users')['profiles']}
        name = 'ai.' + role.lower().replace(' ', '') + str(len(self.c.get('/api/users')['users']))
        self.c.post('/api/users/save', {'username': name, 'full_name': 'Synthetic ' + role, 'password': PASSWORD, 'must_change': False,
                                         'role': role, 'perms': profiles[role], 'scopes': scopes})
        p = self.s.client()
        p.login(name, PASSWORD)
        return p


class AiServerTest(AiSetup, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.start('ai')

    @classmethod
    def tearDownClass(cls):
        cls.stop()

    def error(self, **more):
        with self.assertRaises(ApiError) as e:
            self.ask(**more)
        return e.exception.data.get('key')

    def test_a_without_a_key_it_says_so(self):
        self.assertFalse(self.c.get('/api/ai')['configured'])
        self.assertEqual(self.error(), 'ai.err.noKey')
        self.assertEqual(self.ai.seen, [])                                              # nothing left the centre

    def test_b_the_key_stays_on_this_pc(self):
        with self.assertRaises(ApiError) as e:
            self.c.post('/api/ai/key', {'key': 'hello'})
        self.assertEqual(e.exception.data.get('key'), 'ai.err.keyShape')
        teacher = self.person('Teacher', ['ai-t1'])
        with self.assertRaises(ApiError) as e:
            teacher.post('/api/ai/key', {'key': KEY})                                   # only an administrator
        self.assertEqual(e.exception.code, 403)
        st = self.c.post('/api/ai/key', {'key': KEY})
        self.assertEqual((st['configured'], st['ends']), (True, 'WXYZ'))
        self.assertNotIn(KEY, json.dumps(self.c.get('/api/ai')))
        self.assertNotIn(KEY, json.dumps(self.c.get('/api/state')))
        with open(os.path.join(self.s.data_dir, 'ai.json')) as f:
            self.assertEqual(json.load(f)['key'], KEY)
        if os.name == 'posix':
            self.assertEqual(os.stat(os.path.join(self.s.data_dir, 'ai.json')).st_mode & 0o077, 0)   # only this account can read it
        for root, _, files in os.walk(self.s.data_dir):
            for n in files:
                if n != 'ai.json':
                    with open(os.path.join(root, n), 'rb') as f:
                        self.assertNotIn(KEY.encode(), f.read(), n)                     # not in the databases or the logs
        self.assertNotIn(KEY, ''.join(self.s.out))
        self.assertIn('AI key saved', json.dumps(self.c.get('/api/security')))

    def test_c_questions_come_back_checked_and_nothing_is_saved(self):
        self.c.post('/api/ai/key', {'key': KEY})
        self.ai.mode, self.ai.seen[:] = 'ok', []
        got = self.ask()
        self.assertEqual([q['answer'] for q in got['questions']], ['B', 'B', 'C'])       # the broken one is dropped, not guessed
        self.assertEqual(len(got['questions']), 3)
        req = self.ai.seen[-1]
        self.assertEqual(req['headers']['x-api-key'], KEY)
        self.assertEqual(req['headers']['anthropic-version'], '2023-06-01')
        self.assertEqual(req['body']['model'], 'claude-sonnet-5-5')
        self.assertEqual(req['body']['output_config']['format']['type'], 'json_schema')
        sent = json.dumps(req['body'])
        self.assertIn('Forces and motion', sent)
        self.assertIn('Physics', sent)
        self.assertIn('Secondary 1', sent)
        for secret in ('Synthetic Secret Student', '48001', '0107777', 'Synthetic AI Teacher'):
            self.assertNotIn(secret, sent)                                              # no student, no parent, no name
        self.assertEqual(self.c.get('/api/state')['questions'], [])                     # the teacher adds them, one by one
        self.assertIn('AI questions: 3', json.dumps(self.c.get('/api/activity')))

    def test_d_every_failure_says_what_to_do(self):
        self.c.post('/api/ai/key', {'key': KEY})
        for mode, key in (('401', 'ai.err.key'), ('429', 'ai.err.busy'), ('credit', 'ai.err.credit'), ('refusal', 'ai.err.refused'), ('cut', 'ai.err.cut')):
            self.ai.mode = mode
            self.assertEqual(self.error(), key, mode)
        self.ai.mode = 'ok'
        self.assertEqual(self.error(topic=' '), 'ai.err.topic')
        self.ai.stop()                                                                  # the internet is gone
        try:
            self.assertEqual(self.error(), 'ai.err.offline')
        finally:
            type(self).ai = FakeAI()                  # tearDownClass stops something; later tests never reach the service

    def test_e_only_for_own_teachers_and_never_for_an_assistant(self):
        self.c.post('/api/ai/key', {'key': KEY})
        teacher = self.person('Teacher', ['ai-t1'])
        with self.assertRaises(ApiError) as e:
            self.ask(teacher, teacherId='ai-t2')
        self.assertEqual(e.exception.data.get('key'), 'err.scope')
        assistant = self.person('Assistant')
        with self.assertRaises(ApiError) as e:
            self.ask(assistant)
        self.assertIn(e.exception.code, (400, 403))


@SKIP
class AiJourneyTest(AiSetup, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.start('ai-browser')

    @classmethod
    def tearDownClass(cls):
        cls.stop()

    def test_admin_sets_the_key_teacher_checks_and_adds(self):
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        b = pw.chromium.launch(executable_path=CHROMIUM)
        self.addCleanup(b.close)
        ctx = b.new_context(viewport={'width': 1360, 'height': 860})
        ctx.add_init_script("localStorage.setItem('hs.prefs', JSON.stringify({welcomed: true, lang: 'en'}))")
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'status of 4' not in m.text else None)
        pg.goto(self.s.base)
        pg.wait_for_selector('#auth-form')
        pg.fill('#username', 'boss')
        pg.fill('#password', PASSWORD)
        pg.click('button[type=submit]')
        pg.wait_for_selector('#app-shell')
        # before the key: the bank explains how to switch it on
        pg.goto(self.s.base + '/#/exams')
        pg.click('[data-bank]')
        pg.click('.drawer [data-qai]')
        pg.wait_for_selector('.dialog [data-goai]')
        pg.click('.dialog [data-goai]')
        # the administrator pastes the key in Settings
        pg.wait_for_selector('[data-aiform]')
        pg.fill('[data-aiform] [name=key]', 'not a key')
        pg.click('[data-aisave]')
        pg.wait_for_selector('.toast.bad')
        pg.fill('[data-aiform] [name=key]', KEY)
        pg.click('[data-aisave]')
        pg.wait_for_selector('text=sk-ant-…WXYZ')
        self.assertNotIn(KEY, pg.content())
        # the teacher asks for questions, checks them one by one
        pg.goto(self.s.base + '/#/exams')
        pg.wait_for_selector('[data-bank]')
        pg.click('[data-bank]')
        pg.click('.drawer [data-qai]')
        pg.wait_for_selector('[data-aiq]')
        pg.select_option('[data-aiq] [name=teacherId]', 'ai-t1')
        pg.select_option('[data-aiq] [name=subjectId]', 'ai-sub')
        pg.select_option('[data-aiq] [name=gradeCode]', 'S1')
        pg.click('.dialog [data-aigo]')
        pg.wait_for_selector('.dialog [data-err]:not([hidden])')                       # no lesson written yet
        pg.fill('[data-aiq] [name=topic]', 'Forces and motion')
        pg.click('.dialog [data-aigo]')
        pg.wait_for_selector('.dialog [data-aiadd="2"]')
        self.assertEqual(self.c.get('/api/state')['questions'], [])
        pg.click('.dialog [data-aiedit="1"]')                                          # a correction is started...
        pg.fill('.dialog [data-aied="1"] [data-k=text]', 'Speed equals distance divided by what?')
        pg.click('.dialog [data-aiadd="0"]')                                           # ...another one is added as it is
        pg.wait_for_selector('.dialog .qb-done')                                       # the list was drawn again (CI regression)
        self.assertEqual(pg.input_value('.dialog [data-aied="1"] [data-k=text]'), 'Speed equals distance divided by what?')
        pg.click('.dialog [data-aiadd="1"]')
        pg.click('.dialog [data-aidrop="2"]')                                          # not good enough
        pg.wait_for_selector('.dialog >> text=0 of 3 still to check')
        bank = self.c.get('/api/state')['questions']
        self.assertEqual(sorted(q['text'] for q in bank), ['Speed equals distance divided by what?', 'What is the unit of force?'])
        self.assertEqual({(q['source'], q['teacherId'], q['subjectId'], q['gradeCode'], q['topic']) for q in bank}, {('ai', 'ai-t1', 'ai-sub', 'S1', 'Forces and motion')})
        self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
