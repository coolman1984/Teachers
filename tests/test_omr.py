"""Bubble sheets (review G01, G02): sheets are drawn by the program itself with known answers, then "photographed" badly in the
browser - turned, in perspective, blurred, darker, with noise and a table around the paper - and read back by js/omr.js.
The plan's target: at least 98% of the bubbles right; unclear rows (empty, two marks) are flagged, never guessed."""
import random
import unittest
from datetime import date

from harness import ADMIN
from test_e2e_browser import BrowserBase, SKIP

PHOTO = """async ([svg, opts]) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const W = opts.w, H = opts.h, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = opts.table; cx.fillRect(0, 0, W, H);                   // the table around the paper
  cx.save();
  cx.translate(W / 2, H / 2); cx.rotate(opts.angle * Math.PI / 180);
  cx.transform(1, opts.skewY, opts.skewX, 1, 0, 0);                       // the phone was not held straight
  cx.filter = 'blur(' + opts.blur + 'px) brightness(' + opts.light + ')';
  const pw = W * opts.size, ph = pw * 297 / 210;
  cx.fillStyle = '#fff'; cx.fillRect(-pw / 2, -ph / 2, pw, ph);
  cx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
  cx.restore();
  const d = cx.getImageData(0, 0, W, H);
  let seed = opts.seed;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < d.data.length; i += 4) {                              // sensor noise
    const n = (rnd() - 0.5) * opts.noise;
    d.data[i] = Math.max(0, Math.min(255, d.data[i] + n)); d.data[i + 1] = Math.max(0, Math.min(255, d.data[i + 1] + n)); d.data[i + 2] = Math.max(0, Math.min(255, d.data[i + 2] + n));
  }
  return HS.omr.readPixels(d.data, W, H, opts.exam);
}"""


@SKIP
class BubbleSheetTest(BrowserBase):
    def test_reading_bent_blurred_photos_of_printed_sheets(self):
        pg = self.open({'lang': 'ar'})
        rng = random.Random(2026)
        exam = {'id': 'x', 'title': 'Synthetic Quiz', 'date': date.today().isoformat(), 'questions': 40, 'choices': 4}
        letters = ['A', 'B', 'C', 'D']
        right = total = 0
        problems = []
        conditions = [  # angle, skew, blur, light, noise, size of the paper in the photo, table colour
            (0, 0, 0.0, 1.0, 10, 0.92, '#6b4f2a'), (3, 0.01, 0.6, 0.95, 24, 0.86, '#2b2b2b'), (-5, -0.015, 0.9, 0.85, 30, 0.82, '#8a8a8a'),
            (7, 0.02, 0.7, 0.9, 20, 0.8, '#3d2b1f'), (-2, 0.03, 1.1, 1.05, 34, 0.88, '#505a66'), (10, -0.01, 0.5, 0.8, 18, 0.78, '#222')]
        for n, (angle, skew, blur, light, noise, size, table) in enumerate(conditions):
            truth = []
            for q in range(exam['questions']):
                r = rng.random()
                truth.append('' if r < 0.05 else [rng.choice(letters), rng.choice(letters)] if r < 0.08 else rng.choice(letters))
            truth = [t if not isinstance(t, list) or t[0] != t[1] else t[0] for t in truth]
            code = str(rng.randint(10000, 99999))
            svg = pg.evaluate("([ex, code, ans]) => HS.omr.sheet(ex, null, 'Synthetic Centre', 'ar', {code: code, answers: ans})", [exam, code, truth])
            if n % 2:   # a pen, not a printer: a smaller, greyer mark that does not fill the circle
                svg = svg.replace('r="2.6" fill="#000"', 'r="1.9" fill="#4a4a4a"')
            got = pg.evaluate(PHOTO, [svg, {'w': 1200, 'h': 1600, 'angle': angle, 'skewX': skew, 'skewY': -skew / 2, 'blur': blur, 'light': light,
                                            'noise': noise, 'size': size, 'table': table, 'seed': 7 + n, 'exam': exam}])
            self.assertTrue(got['ok'], (n, got))
            self.assertEqual(got['code'], code, (n, got['codeRead']))
            for q, t in enumerate(truth):
                for k, letter in enumerate(letters):
                    total += 1
                    want = letter in t if isinstance(t, list) else letter == t
                    if isinstance(t, list):
                        ok = (q + 1) in got['multi']
                    elif t == '':
                        ok = (q + 1) in got['blank']
                    else:
                        ok = (got['answers'][q] == letter) == want
                    right += ok
                    if not ok:
                        problems.append((n, q + 1, t, got['answers'][q]))
        accuracy = right / total
        print(f'\n  bubble sheets: {right}/{total} bubbles right ({accuracy:.2%}) over {len(conditions)} bad photos')
        self.assertGreaterEqual(accuracy, 0.98, problems[:10])
        self.assertEqual(self.errors, [])

    def test_a_photo_without_the_corners_is_refused_not_guessed(self):
        pg = self.open({'lang': 'en'})
        got = pg.evaluate("""() => { const W = 400, H = 500, d = new Uint8ClampedArray(W * H * 4).fill(255);
          return HS.omr.readPixels(d, W, H, {questions: 10, choices: 4}); }""")
        self.assertEqual(got, {'ok': False, 'reason': 'corners'})

    def test_marks_from_a_sheet_are_counted_by_the_server(self):
        c = self.S.client()
        c.login(*ADMIN)
        ops = [('teachers', 'om-t', {'name': 'Synthetic OMR Teacher'}),
               ('groups', 'om-g', {'name': 'OMR Group', 'teacherId': 'om-t', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 10, 'capacity': 10, 'active': True,
                                   'slots': [{'day': 0, 'start': '10:00', 'end': '11:00'}]}),
               ('students', 'om-s', {'code': '49001', 'name': 'Synthetic OMR Student', 'gradeCode': 'S1', 'consent': True, 'active': True}),
               ('exams', 'om-x', {'title': 'OMR Quiz', 'teacherId': 'om-t', 'groupIds': ['om-g'], 'date': date.today().isoformat(), 'kind': 'weekly',
                                  'maxScore': 20, 'questions': 4, 'choices': 4, 'answerKey': ['A', 'B', 'C', 'D']})]
        c.post('/api/commit', {'label': 'omr', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        c.post('/api/c/enroll', {'studentId': 'om-s', 'groupId': 'om-g'})
        # the page claims 20/20, but only three answers are right: the server counts 15
        c.post('/api/c/marks', {'examId': 'om-x', 'items': [{'studentId': 'om-s', 'score': 20, 'answers': ['A', 'B', 'C', 'A'], 'via': 'omr'}]})
        mark = next(m for m in c.get('/api/state')['marks'] if m['studentId'] == 'om-s')
        self.assertEqual((mark['score'], mark['via'], mark['answers']), (15, 'omr', ['A', 'B', 'C', 'A']))

    def test_the_teacher_journey_key_print_photo_check_save(self):
        import base64
        import os
        import tempfile
        c = self.S.client()
        c.login(*ADMIN)
        ops = [('teachers', 'oj-t', {'name': 'Synthetic Sheet Teacher'}),
               ('groups', 'oj-g', {'name': 'Sheet Group', 'teacherId': 'oj-t', 'gradeCode': 'S1', 'feeType': 'session', 'fee': 10, 'capacity': 10, 'active': True,
                                   'slots': [{'day': 0, 'start': '10:00', 'end': '11:00'}]}),
               ('students', 'oj-s', {'code': '49101', 'name': 'Synthetic Sheet Student', 'gradeCode': 'S1', 'consent': True, 'active': True})]
        c.post('/api/commit', {'label': 'omr', 'ops': [{'e': e, 'id': i, 'op': 'put', 'row': r} for e, i, r in ops]})
        c.post('/api/c/enroll', {'studentId': 'oj-s', 'groupId': 'oj-g'})
        pg = self.open({'lang': 'ar'})
        pg.goto(self.S.base + '/#/exams')
        pg.wait_for_selector('[data-new], #view')
        pg.evaluate("HS.data.load()")
        pg.click('[data-new]')
        pg.wait_for_selector('[data-xform] [name=title]')
        pg.fill('[data-xform] [name=title]', 'Synthetic Sheet Quiz')
        pg.fill('[data-xform] [name=maxScore]', '10')
        pg.fill('[data-xform] [name=questions]', '5')
        pg.fill('[data-xform] [name=answerKey]', 'أ ب ج د أ')                    # typed in Arabic letters
        self.assertIn('5 من 5', pg.inner_text('[data-keycount]'))
        pg.check('[data-xform] [name=g][value="oj-g"]')
        pg.click('.drawer [data-save]')
        pg.wait_for_selector('.drawer [data-bubbles]')                         # the new exam opens its sheet
        ex = next(x for x in c.get('/api/state')['exams'] if x['title'] == 'Synthetic Sheet Quiz')
        self.assertEqual(ex['answerKey'], ['A', 'B', 'C', 'D', 'A'])
        pg.evaluate("window.print = () => {}")
        pg.click('.drawer [data-bubbles]')
        pg.click('.dialog [data-named]')
        pg.wait_for_selector('#print-sheet .omr-page svg', state='attached')
        self.assertIn('Synthetic Sheet Student', pg.inner_text('#print-sheet'))
        pg.evaluate("document.querySelectorAll('#print-sheet').forEach(e => e.remove())")
        # the student answered A B C A A (4 of 5 right); a photo of it is taken and read
        png = pg.evaluate("""async (ex) => { const svg = HS.omr.sheet(ex, null, 'C', 'ar', {code: '49101', answers: ['A','B','C','A','A']});
            const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
            const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 1400; const cx = cv.getContext('2d');
            cx.fillStyle = '#444'; cx.fillRect(0, 0, 1000, 1400); cx.translate(500, 700); cx.rotate(0.05); cx.drawImage(img, -430, -608, 860, 1216);
            return cv.toDataURL('image/png'); }""", {'questions': 5, 'choices': 4, 'title': 'x', 'date': ''})
        path = os.path.join(tempfile.mkdtemp(prefix='hs-omr-'), 'sheet-1.png')
        with open(path, 'wb') as f:
            f.write(base64.b64decode(png.split(',', 1)[1]))
        pg.click('.drawer [data-omr]')
        pg.set_input_files('.dialog [data-files]', path)
        pg.wait_for_selector('.dialog [data-who]')
        self.assertEqual(pg.input_value('.dialog [data-who]'), 'oj-s')            # found by the code bubbles
        self.assertIn('8', pg.inner_text('.dialog tbody'))                       # 4 of 5 x 10/5
        pg.click('.dialog [data-save]')
        self.assertTrue(wait_until(lambda: any(m['studentId'] == 'oj-s' and m['score'] == 8 and m['via'] == 'omr' for m in c.get('/api/state')['marks'])))
        self.assertEqual(self.errors, [])


def wait_until(check, seconds=8.0):
    import time
    end = time.time() + seconds
    while time.time() < end:
        if check():
            return True
        time.sleep(0.1)
    return check()


if __name__ == '__main__':
    unittest.main()
