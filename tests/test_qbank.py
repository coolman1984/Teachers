"""The question bank (review G03): a question is added, checked and used in an exam; a teacher sees and changes only their own
bank; a change in the bank never changes an exam already made until the teacher chooses "Use the new version"; the paper and
the answer key print; deleting a question keeps the exams' copies and can be undone."""
import unittest

from harness import ApiError
from test_center_api import CenterFixture
from test_e2e_browser import BrowserBase, SKIP
from test_omr import wait_until

PASSWORD = 'Strong-pass1'


def q(teacher, text, answer='B', **more):
    return {'teacherId': teacher, 'text': text, 'choices': ['One', 'Two', 'Three', 'Four'], 'answer': answer, 'explanation': 'Because.', **more}


class BankRulesTest(CenterFixture):
    def test_a_question_is_checked_by_the_server(self):
        for bad in ({'text': ''}, {'choices': ['Only one']}, {'choices': ['A', '', 'C']}, {'answer': 'E'}, {'answer': ''}, {'answer': 'Z'}):
            with self.assertRaises(ApiError, msg=bad) as e:
                self.put([('questions', self.p + '-bad', {**q(self.teacher, 'x'), **bad})])
            self.assertEqual(e.exception.data.get('key'), 'err.question', bad)
        self.put([('questions', self.p + '-q1', {**q(self.teacher, '  What is 2 + 2?  ', 'b'), 'choices': ['3', '4', '', ''], 'source': 'hacker'})])
        row = next(x for x in self.c.get('/api/state')['questions'] if x['id'] == self.p + '-q1')
        self.assertEqual((row['text'], row['choices'], row['answer'], row['source']), ('What is 2 + 2?', ['3', '4'], 'B', 'manual'))

    def test_an_exam_keeps_its_own_copy_and_the_key_follows_the_paper(self):
        qa, qb = self.p + '-qa', self.p + '-qb'
        self.put([('questions', qa, q(self.teacher, 'First question', 'A')), ('questions', qb, q(self.teacher, 'Second question', 'C'))])
        bank = {x['id']: x for x in self.c.get('/api/state')['questions']}
        paper = [{'qid': i, **{k: bank[i][k] for k in ('text', 'choices', 'answer', 'explanation')}} for i in (qa, qb)]
        ex = self.p + '-ex'
        # the page says 9 questions and a wrong key: the server counts them from the paper
        self.put([('exams', ex, {'title': 'Bank Quiz', 'teacherId': self.teacher, 'groupIds': [self.group], 'date': self.day, 'kind': 'weekly',
                                 'maxScore': 10, 'questions': 9, 'choices': 2, 'answerKey': ['D'], 'paper': paper})])
        got = next(x for x in self.c.get('/api/state')['exams'] if x['id'] == ex)
        self.assertEqual((got['questions'], got['choices'], got['answerKey']), (2, 4, ['A', 'C']))
        # the teacher changes the bank: the exam is not touched
        ver = bank[qa]['ver']
        self.c.post('/api/commit', {'label': 'edit', 'ops': [{'e': 'questions', 'id': qa, 'op': 'put', 'ver': ver, 'row': q(self.teacher, 'First question, better', 'D')}]})
        got = next(x for x in self.c.get('/api/state')['exams'] if x['id'] == ex)
        self.assertEqual((got['paper'][0]['text'], got['answerKey']), ('First question', ['A', 'C']))
        # marks from a sheet are counted with the exam's own key
        self.c.post('/api/c/marks', {'examId': ex, 'items': [{'studentId': self.student, 'score': 10, 'answers': ['A', 'B'], 'via': 'omr'}]})
        mark = next(m for m in self.c.get('/api/state')['marks'] if m['examId'] == ex)
        self.assertEqual(mark['score'], 5)
        # deleting the question keeps the exam's copy; the Recycle Bin names it
        bank = {x['id']: x for x in self.c.get('/api/state')['questions']}
        self.c.post('/api/commit', {'label': 'Delete question', 'ops': [{'e': 'questions', 'id': qb, 'op': 'del', 'ver': bank[qb]['ver']}]})
        self.assertNotIn(qb, [x['id'] for x in self.c.get('/api/state')['questions']])
        self.assertEqual(next(x for x in self.c.get('/api/state')['exams'] if x['id'] == ex)['paper'][1]['text'], 'Second question')
        self.assertIn('Second question', str(self.c.get('/api/trash')))
        with self.assertRaises(ApiError) as e:
            self.put([('exams', ex + 'big', {'title': 'Too big', 'teacherId': self.teacher, 'groupIds': [self.group], 'maxScore': 10, 'paper': paper * 38})])
        self.assertEqual(e.exception.data.get('key'), 'err.paper')

    def test_a_teacher_sees_and_changes_only_their_own_bank(self):
        self.put([('questions', self.p + '-mine', q(self.teacher, 'Mine')), ('questions', self.p + '-theirs', q(self.other_teacher, 'Theirs'))])
        profiles = {p['name']: p['perms'] for p in self.c.get('/api/users')['profiles']}
        name = 'qb.' + self.p
        self.c.post('/api/users/save', {'username': name, 'full_name': 'Synthetic Bank Teacher', 'password': PASSWORD, 'must_change': False,
                                         'role': 'Teacher', 'perms': profiles['Teacher'], 'scopes': [self.teacher]})
        t = self.server.client()
        t.login(name, PASSWORD)
        seen = [x['text'] for x in t.get('/api/state')['questions']]
        self.assertIn('Mine', seen)
        self.assertNotIn('Theirs', seen)
        t.post('/api/commit', {'label': 'q', 'ops': [{'e': 'questions', 'id': self.p + '-new', 'op': 'put', 'row': q(self.teacher, 'Written by the teacher')}]})
        with self.assertRaises(ApiError):
            t.post('/api/commit', {'label': 'q', 'ops': [{'e': 'questions', 'id': self.p + '-x', 'op': 'put', 'row': q(self.other_teacher, 'Into the other bank')}]})
        # an assistant (no "Create exams") cannot write questions
        self.c.post('/api/users/save', {'username': name + 'a', 'full_name': 'Synthetic Assistant', 'password': PASSWORD, 'must_change': False,
                                         'role': 'Assistant', 'perms': profiles['Assistant'], 'scopes': None})
        a = self.server.client()
        a.login(name + 'a', PASSWORD)
        with self.assertRaises(ApiError) as e:
            a.post('/api/commit', {'label': 'q', 'ops': [{'e': 'questions', 'id': self.p + '-y', 'op': 'put', 'row': q(self.teacher, 'Assistant question')}]})
        self.assertEqual(e.exception.code, 403)


@SKIP
class BankJourneyTest(BrowserBase):
    def test_write_add_to_exam_change_decide_print(self):
        c = self.S.client()
        c.login('boss', PASSWORD)
        ops = [('subjects', 'qj-sub', {'name': 'Synthetic Science'}),
               ('teachers', 'qj-t', {'name': 'Synthetic Bank Teacher'}),
               ('groups', 'qj-g', {'name': 'Bank Group', 'teacherId': 'qj-t', 'subjectId': 'qj-sub', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 10,
                                   'capacity': 10, 'active': True, 'slots': [{'day': 0, 'start': '10:00', 'end': '11:00'}]}),
               ('students', 'qj-s', {'code': '49201', 'name': 'Synthetic Bank Student', 'gradeCode': 'S1', 'consent': True, 'active': True}),
               ('questions', 'qj-q2', q('qj-t', 'Which planet is red?', 'C', subjectId='qj-sub', gradeCode='S1'))]
        c.post('/api/commit', {'label': 'bank', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/exams'); pg.reload()
        # 1. write a question in the bank (Arabic screen)
        pg.click('[data-bank]')
        pg.wait_for_selector('.drawer [data-qnew]')
        self.assertIn('Which planet is red?', pg.inner_text('.drawer [data-qrows]'))
        pg.click('.drawer [data-qnew]')
        pg.wait_for_selector('[data-qform]')
        pg.select_option('[data-qform] [name=teacherId]', 'qj-t')
        pg.fill('[data-qform] [name=text]', 'كم يساوي ٣ × ٤؟')
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('[data-qform] [data-err]:not([hidden])')                 # no choices yet: refused on the page
        for k, v in enumerate(['7', '12', '34']):
            pg.fill(f'[data-qform] [name=c{k}]', v)
        pg.check('[data-qform] [name=answer][value=B]')
        pg.fill('[data-qform] [name=topic]', 'Multiplication')
        pg.click('.drawer [data-save]')
        self.assertTrue(wait_until(lambda: any(x['text'] == 'كم يساوي ٣ × ٤؟' for x in c.get('/api/state')['questions'])))
        mine = next(x for x in c.get('/api/state')['questions'] if x['text'] == 'كم يساوي ٣ × ٤؟')
        self.assertEqual((mine['choices'], mine['answer'], mine['teacherId']), (['7', '12', '34'], 'B', 'qj-t'))
        pg.wait_for_selector('.drawer [data-qrows] >> text=كم يساوي')
        pg.click('.drawer [data-pclose]')
        # 2. a new exam takes two questions from the bank; the key fills itself
        pg.wait_for_timeout(300)
        pg.click('[data-new]')
        pg.wait_for_selector('[data-xform] [name=title]')
        pg.fill('[data-xform] [name=title]', 'Synthetic Bank Exam')
        pg.fill('[data-xform] [name=maxScore]', '10')
        pg.click('[data-paperbox] [data-padd]')
        pg.wait_for_selector('.toast.bad')                                               # groups first
        pg.check('[data-xform] [name=g][value="qj-g"]')
        pg.click('[data-paperbox] [data-padd]')
        pg.wait_for_selector('.dialog [data-plist] input')
        for box in pg.query_selector_all('.dialog [data-plist] input'):
            box.check()
        pg.click('.dialog [data-padd]')
        pg.wait_for_selector('[data-paperbox] .qb-paper li >> nth=1')
        self.assertEqual(pg.input_value('[data-xform] [name=questions]'), '2')
        self.assertTrue(pg.is_disabled('[data-xform] [name=answerKey]'))
        pg.click('[data-paperbox] [data-pdown="0"]')                                    # the planet (first in the bank) goes down
        pg.click('.drawer [data-save]')
        self.assertTrue(wait_until(lambda: any(x['title'] == 'Synthetic Bank Exam' for x in c.get('/api/state')['exams'])))
        ex = next(x for x in c.get('/api/state')['exams'] if x['title'] == 'Synthetic Bank Exam')
        order = [p['qid'] for p in ex['paper']]
        self.assertEqual(order, [mine['id'], 'qj-q2'])                                   # moved: the multiplication first
        self.assertEqual((ex['questions'], ex['answerKey']), (2, ['B', 'C']))
        # 3. the bank changes: the exam is untouched, says so, and the teacher decides
        q2 = next(x for x in c.get('/api/state')['questions'] if x['id'] == 'qj-q2')
        c.post('/api/commit', {'label': 'edit', 'ops': [{'e': 'questions', 'id': 'qj-q2', 'op': 'put', 'ver': q2['ver'],
                                                        'row': q('qj-t', 'Which planet is red? (Mars)', 'A', subjectId='qj-sub', gradeCode='S1')}]})
        self.assertEqual(next(x for x in c.get('/api/state')['exams'] if x['id'] == ex['id'])['answerKey'], ex['answerKey'])
        pg.wait_for_selector('.drawer [data-qprint]')                                    # the new exam opened its sheet
        pg.evaluate("HS.panel.close()")
        pg.evaluate("HS.data.load()")
        pg.wait_for_timeout(300)
        pg.evaluate(f"HS.openExam('{ex['id']}')")
        pg.wait_for_selector('.drawer .tip.warn')                                        # "some questions changed in the bank"
        pg.evaluate('window.print = () => {}')
        pg.click('.drawer [data-qprint]')
        pg.click('.dialog [data-ppaper]')
        pg.wait_for_selector('#print-sheet .qp-q', state='attached')
        sheet = pg.inner_text('#print-sheet')
        self.assertIn('كم يساوي', sheet)
        self.assertIn('Which planet is red?', sheet)
        self.assertNotIn('(Mars)', sheet)                                                 # the exam's own copy is printed
        self.assertEqual(len(pg.query_selector_all('#print-sheet .qp-q')), 2)
        pg.evaluate("document.querySelectorAll('#print-sheet').forEach(e => e.remove())")
        pg.click('.drawer [data-qprint]')
        pg.click('.dialog [data-pkey]')
        pg.wait_for_selector('#print-sheet .ps-list', state='attached')
        self.assertIn('Because.', pg.inner_text('#print-sheet'))
        pg.evaluate("document.querySelectorAll('#print-sheet').forEach(e => e.remove())")
        # marks exist -> taking the new version changes the key only after the teacher confirms
        c.post('/api/c/enroll', {'studentId': 'qj-s', 'groupId': 'qj-g'})
        c.post('/api/c/marks', {'examId': ex['id'], 'items': [{'studentId': 'qj-s', 'score': 5}]})
        pg.evaluate("HS.panel.close()")
        pg.evaluate("HS.data.load()")
        pg.wait_for_timeout(300)
        pg.evaluate(f"HS.openExam('{ex['id']}')")
        pg.wait_for_selector('.drawer [data-xedit]')
        pg.click('.drawer [data-xedit]')
        pg.wait_for_selector('[data-paperbox] [data-pnew]')
        pg.click('[data-paperbox] [data-pnew]')
        self.assertEqual(pg.query_selector('[data-paperbox] [data-pnew]'), None)
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.dialog [data-ok]')                                         # "Change the answer key?"
        pg.click('.dialog [data-ok]')
        new_key = ['A' if k == 'C' else k for k in ex['answerKey']]
        self.assertTrue(wait_until(lambda: next(x for x in c.get('/api/state')['exams'] if x['id'] == ex['id'])['answerKey'] == new_key))
        self.assertIn('(Mars)', str(next(x for x in c.get('/api/state')['exams'] if x['id'] == ex['id'])['paper']))
        self.assertEqual(next(m for m in c.get('/api/state')['marks'] if m['examId'] == ex['id'])['score'], 5)   # not recounted
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
