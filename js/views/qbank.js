/* Hessa - the question bank (review G03): multiple-choice questions written once per teacher (subject, grade, lesson, the
   choices, the right answer and an explanation) and added to any exam. An exam keeps its own copy of each question, so a later
   change in the bank never changes an exam by itself - the teacher decides ("Use the new version"). Prints the question paper
   and the answer key with the explanations. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'M3', 'S1', 'S2', 'S3'];
  var Q = HS.qbank = {};

  function opt(v, l, cur) { return '<option value="' + HS.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + HS.esc(l) + '</option>'; }
  function letters(lang) { return HS.omr.LETTERS[(lang || HS.lang) === 'ar' ? 'ar' : 'en']; }
  function letterOf(answer, lang) { var k = HS.omr.LETTERS.en.indexOf(answer); return k >= 0 ? letters(lang)[k] : ''; }
  function sameQuestion(a, b) {   // the exam's copy against the bank's current version
    return !!a && !!b && a.text === b.text && a.answer === b.answer && (a.explanation || '') === (b.explanation || '') &&
      JSON.stringify(a.choices || []) === JSON.stringify(b.choices || []);
  }
  Q.copy = function (q) { return { qid: q.id, text: q.text, choices: (q.choices || []).slice(), answer: q.answer, explanation: q.explanation || '' }; };
  Q.changed = function (item) { var b = item.qid && D.get('questions', item.qid); return b && !sameQuestion(item, b) ? b : null; };
  Q.list = function (f) {
    var n = U.key(f.q || '');
    return D.list('questions').filter(function (q) {
      return q.active !== false && (!f.teacherId || q.teacherId === f.teacherId) && (!f.subjectId || q.subjectId === f.subjectId) &&
        (!f.gradeCode || q.gradeCode === f.gradeCode) && (!n || U.key([q.text, q.topic].concat(q.choices || []).join(' ')).indexOf(n) >= 0);
    });
  };
  function subjects() { return D.list('subjects').filter(function (s) { return s.active !== false; }); }
  function teachers() { return D.list('teachers').filter(function (t) { return t.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); }); }
  function filters(f, withTeacher) {
    var ts = teachers();
    return '<div class="toolbar"><input class="input" type="search" data-qf="q" value="' + HS.esc(f.q || '') + '" placeholder="' + HS.esc(HS.t('qb.search')) + '" style="max-width:16rem">' +
      (withTeacher && ts.length > 1 ? '<select class="input" data-qf="teacherId" style="width:auto;max-width:14rem">' + opt('', HS.t('f.teacherId') + ': ' + HS.t('common.all'), f.teacherId) + ts.map(function (t) { return opt(t.id, t.name, f.teacherId); }).join('') + '</select>' : '') +
      '<select class="input" data-qf="subjectId" style="width:auto;max-width:12rem">' + opt('', HS.t('qb.subject') + ': ' + HS.t('common.all'), f.subjectId) + subjects().map(function (s) { return opt(s.id, D.subjectName(s.id), f.subjectId); }).join('') + '</select>' +
      '<select class="input" data-qf="gradeCode" style="width:auto">' + opt('', HS.t('f.gradeCode') + ': ' + HS.t('common.all'), f.gradeCode) + GRADES.map(function (g) { return opt(g, HS.t('grade.' + g), f.gradeCode); }).join('') + '</select></div>';
  }
  function qLine(q) {
    var meta = [D.subjectName(q.subjectId), q.gradeCode ? HS.t('grade.' + q.gradeCode) : '', q.topic].filter(Boolean).join(' · ');
    return '<span class="qb-text">' + HS.esc(q.text) + '</span>' +
      '<small class="faint">' + HS.esc(meta) + (meta ? ' · ' : '') + HS.esc(HS.t('qb.right')) + ': <b>' + HS.esc(letterOf(q.answer)) + '</b>' +
      (q.source === 'ai' ? ' <span class="badge info">' + HS.esc(HS.t('qb.ai')) + '</span>' : '') + '</small>';
  }

  /* ---------- the bank: list with filters ---------- */
  var BF = { q: '', teacherId: '', subjectId: '', gradeCode: '' };
  Q.open = function () {
    var can = HS.can('exams.manage');
    HS.panel.open({ title: HS.t('qb.bank'), body: '<p class="muted">' + HS.esc(HS.t('qb.bank.d')) + '</p>' + filters(BF, true) + '<div data-qrows></div>',
      footer: '<span class="grow faint" data-qcount></span>' + (can ? '<button class="btn" data-qai>' + HS.icon('spark', 'sm') + HS.esc(HS.t('ai.gen')) + '</button>' : '') + (can ? '<button class="btn primary" data-qnew>' + HS.icon('plus', 'sm') + HS.esc(HS.t('qb.new')) + '</button>' : ''),
      mount: function (p) {
        function paint() {
          var rows = Q.list(BF);
          p.querySelector('[data-qcount]').textContent = HS.t('qb.count', { n: rows.length });
          p.querySelector('[data-qrows]').innerHTML = rows.length ? '<ul class="qb-list">' + rows.slice(0, 400).map(function (q) {
            return '<li><button type="button" class="qb-item" data-qid="' + HS.esc(q.id) + '"' + (can ? '' : ' disabled') + '>' + qLine(q) + '</button></li>'; }).join('') + '</ul>'
            : U.empty('book', HS.t('qb.none'), HS.t('qb.none.b'));
        }
        paint();
        p.addEventListener('input', HS.debounce(function (e) { if (e.target.dataset.qf === 'q') { BF.q = e.target.value; paint(); } }, 120));
        p.addEventListener('change', function (e) { var k = e.target.dataset.qf; if (k && k !== 'q') { BF[k] = e.target.value; paint(); } });
        p.addEventListener('click', function (e) {
          if (e.target.closest('[data-qai]')) { Q.generate({ teacherId: BF.teacherId, subjectId: BF.subjectId, gradeCode: BF.gradeCode }, paint); return; }
          if (e.target.closest('[data-qnew]')) { Q.edit(null, { teacherId: BF.teacherId, subjectId: BF.subjectId, gradeCode: BF.gradeCode }, paint); return; }
          var it = e.target.closest('[data-qid]'); if (it && can) Q.edit(it.dataset.qid, null, paint);
        });
      } });
  };

  /* ---------- one question ---------- */
  Q.edit = function (id, defaults, done) {
    if (!HS.can('exams.manage')) return;
    var cur = id ? D.get('questions', id) : null, x = cur || Object.assign({ choices: ['', '', '', ''], answer: '' }, defaults || {});
    var ts = teachers(), L = letters(), ch = (x.choices || []).slice();
    while (ch.length < 5) ch.push('');
    if (!x.teacherId && ts.length === 1) x.teacherId = ts[0].id;
    var used = cur ? D.list('exams').filter(function (ex) { return (ex.paper || []).some(function (it) { return it.qid === cur.id; }); }).length : 0;
    HS.panel.open({ title: HS.t(cur ? 'qb.edit' : 'qb.new'), body:
      (used ? '<div class="tip">' + HS.icon('info') + '<span>' + HS.esc(HS.t('qb.used', { n: used })) + '</span></div>' : '') +
      '<form class="grid cols-2 form-grid" data-qform autocomplete="off">' +
        '<div class="field"><label for="qf-t">' + HS.esc(HS.t('f.teacherId')) + '</label><select class="input" id="qf-t" name="teacherId" required>' + opt('', '—', x.teacherId) + ts.map(function (t) { return opt(t.id, t.name, x.teacherId); }).join('') + '</select></div>' +
        '<div class="field"><label for="qf-s">' + HS.esc(HS.t('qb.subject')) + '</label><select class="input" id="qf-s" name="subjectId">' + opt('', '—', x.subjectId) + subjects().map(function (s) { return opt(s.id, D.subjectName(s.id), x.subjectId); }).join('') + '</select></div>' +
        '<div class="field"><label for="qf-g">' + HS.esc(HS.t('f.gradeCode')) + '</label><select class="input" id="qf-g" name="gradeCode">' + opt('', '—', x.gradeCode) + GRADES.map(function (g) { return opt(g, HS.t('grade.' + g), x.gradeCode); }).join('') + '</select></div>' +
        '<div class="field"><label for="qf-o">' + HS.esc(HS.t('qb.topic')) + '</label><input class="input" id="qf-o" name="topic" value="' + HS.esc(x.topic || '') + '"></div>' +
        '<div class="field wide"><label for="qf-x">' + HS.esc(HS.t('qb.text')) + '</label><textarea class="input" id="qf-x" name="text" rows="3" dir="auto" required>' + HS.esc(x.text || '') + '</textarea></div>' +
        '<fieldset class="field wide qb-choices"><legend class="lbl">' + HS.esc(HS.t('qb.choices')) + '</legend>' + ch.map(function (c, k) {
          return '<div class="qb-choice"><label class="row" style="gap:.3rem" title="' + HS.esc(HS.t('qb.right')) + '"><input type="radio" name="answer" value="' + HS.omr.LETTERS.en[k] + '"' + (x.answer === HS.omr.LETTERS.en[k] ? ' checked' : '') + ' aria-label="' + HS.esc(HS.t('qb.right') + ' ' + L[k]) + '"><b>' + HS.esc(L[k]) + '</b></label>' +
            '<input class="input" name="c' + k + '" dir="auto" value="' + HS.esc(c) + '" aria-label="' + HS.esc(HS.t('qb.choice', { l: L[k] })) + '"' + (k >= 2 ? ' placeholder="' + HS.esc(HS.t('qb.optional')) + '"' : '') + '></div>'; }).join('') + '</fieldset>' +
        '<div class="field wide"><label for="qf-e">' + HS.esc(HS.t('qb.explain')) + '</label><textarea class="input" id="qf-e" name="explanation" rows="2" dir="auto">' + HS.esc(x.explanation || '') + '</textarea></div>' +
        '<div class="tip bad wide" data-err hidden></div></form>',
      footer: (cur ? '<button class="btn danger" data-qdel>' + HS.icon('x', 'sm') + HS.esc(HS.t('common.delete')) + '</button><span class="grow"></span>' : '') +
        '<button class="btn primary" data-save>' + HS.icon('check', 'sm') + HS.esc(HS.t('common.save')) + '</button>',
      mount: function (p) {
        var form = p.querySelector('[data-qform]'), err = p.querySelector('[data-err]');
        function save() {
          var choices = [0, 1, 2, 3, 4].map(function (k) { return form['c' + k].value.trim(); });
          while (choices.length && !choices[choices.length - 1]) choices.pop();
          var picked = form.querySelector('[name=answer]:checked'), answer = picked ? picked.value : '';
          var text = form.text.value.trim();
          if (!form.teacherId.value) { err.hidden = false; err.textContent = HS.t('form.missing', { f: HS.t('f.teacherId') }); return; }
          if (!text || choices.length < 2 || choices.indexOf('') >= 0 || !answer || HS.omr.LETTERS.en.indexOf(answer) >= choices.length) {
            err.hidden = false; err.textContent = HS.t('err.question'); return;
          }
          var row = Object.assign({}, cur || {}, { teacherId: form.teacherId.value, subjectId: form.subjectId.value || null, gradeCode: form.gradeCode.value || null,
            topic: form.topic.value.trim(), text: text, choices: choices, answer: answer, explanation: form.explanation.value.trim(),
            source: cur ? cur.source || 'manual' : (defaults && defaults.source) || 'manual', active: true });
          delete row.id; delete row.ver;
          var qid = id || D.newId('q');
          U.run(D.save('questions', qid, row, (cur ? 'Edit question: ' : 'New question: ') + text.slice(0, 50)), 'common.saved', p.querySelector('[data-save]')).then(function () {
            HS.panel.close(); if (done) done(qid);
          }, function (e) { err.hidden = false; err.textContent = U.errorText(e); });
        }
        p.querySelector('[data-save]').addEventListener('click', save);
        form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
        var del = p.querySelector('[data-qdel]');
        if (del) del.addEventListener('click', function () {
          U.confirm({ title: HS.t('qb.deleteQ'), body: HS.t('qb.deleteQ.b'), danger: true, ok: HS.t('common.delete') }).then(function (yes) {
            if (!yes) return;
            U.run(D.remove('questions', id, 'Delete question: ' + String(cur.text).slice(0, 50)), 'qb.deleted', del).then(function () { HS.panel.close(); if (done) done(null); }, function () {});
          });
        });
      } });
  };

  /* ---------- the AI question generator (review G04): optional, each question is read and added by the teacher ---------- */
  Q.generate = function (f, done) {
    HS.get('/api/ai').then(function (st) {
      if (!st.configured) {
        var el0 = HS.dialog({ title: HS.t('ai.gen'), body: '<p>' + HS.esc(HS.t('ai.notSet')) + '</p><p class="muted">' + HS.esc(HS.t(st.admin ? 'ai.notSet.admin' : 'ai.notSet.ask')) + '</p>',
          footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.close')) + '</button>' + (st.admin ? '<a class="btn primary" href="#/settings?tab=ai" data-goai>' + HS.esc(HS.t('ai.title')) + '</a>' : '') });
        var go = el0.querySelector('[data-goai]'); if (go) go.addEventListener('click', function () { HS.overlay.close(); HS.panel.close(); });
        return;
      }
      ask(f, done);
    }, function (e) { HS.toast(U.errorText(e), 'bad', 5000); });
  };
  function ask(f, done) {
    var ts = teachers(), x = Object.assign({ count: 5, lang: HS.lang === 'en' ? 'en' : 'ar' }, f);
    if (!x.teacherId && ts.length === 1) x.teacherId = ts[0].id;
    var found = [];
    var el = HS.dialog({ title: HS.t('ai.gen'), wide: true, body:
        '<form class="grid cols-2 form-grid" data-aiq autocomplete="off">' +
          '<div class="field"><label for="ai-t">' + HS.esc(HS.t('f.teacherId')) + '</label><select class="input" id="ai-t" name="teacherId">' + opt('', '—', x.teacherId) + ts.map(function (t) { return opt(t.id, t.name, x.teacherId); }).join('') + '</select></div>' +
          '<div class="field"><label for="ai-s">' + HS.esc(HS.t('qb.subject')) + '</label><select class="input" id="ai-s" name="subjectId">' + opt('', '—', x.subjectId) + subjects().map(function (s) { return opt(s.id, D.subjectName(s.id), x.subjectId); }).join('') + '</select></div>' +
          '<div class="field"><label for="ai-g">' + HS.esc(HS.t('f.gradeCode')) + '</label><select class="input" id="ai-g" name="gradeCode">' + opt('', '—', x.gradeCode) + GRADES.map(function (g) { return opt(g, HS.t('grade.' + g), x.gradeCode); }).join('') + '</select></div>' +
          '<div class="field"><label for="ai-n">' + HS.esc(HS.t('ai.count')) + '</label><input class="input" id="ai-n" name="count" type="number" min="1" max="20" dir="ltr" value="' + x.count + '"></div>' +
          '<div class="field wide"><label for="ai-o">' + HS.esc(HS.t('qb.topic')) + '</label><input class="input" id="ai-o" name="topic" required value="' + HS.esc(x.topic || '') + '"></div>' +
          '<div class="field wide"><label for="ai-x">' + HS.esc(HS.t('ai.notes')) + '</label><textarea class="input" id="ai-x" name="notes" rows="2" placeholder="' + HS.esc(HS.t('ai.notes.h')) + '"></textarea></div>' +
          '<div class="field"><span class="lbl">' + HS.esc(HS.t('ai.lang')) + '</span><div class="seg" role="group" data-ailang><button type="button" data-v="ar" aria-pressed="' + (x.lang === 'ar') + '">العربية</button><button type="button" data-v="en" aria-pressed="' + (x.lang === 'en') + '">English</button></div></div>' +
          '<div class="tip wide">' + HS.icon('shield') + '<span>' + HS.esc(HS.t('ai.sent')) + '</span></div>' +
          '<div class="tip bad wide" data-err hidden></div></form>' +
        '<div data-found></div>',
      footer: '<span class="grow faint" data-aisum></span><button class="btn ghost" data-close>' + HS.esc(HS.t('common.close')) + '</button><button class="btn primary" data-aigo>' + HS.icon('spark', 'sm') + HS.esc(HS.t('ai.go')) + '</button>' });
    var form = el.querySelector('[data-aiq]'), err = el.querySelector('[data-err]'), box = el.querySelector('[data-found]');
    el.querySelector('[data-ailang]').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; x.lang = b.dataset.v; el.querySelectorAll('[data-ailang] [data-v]').forEach(function (y) { y.setAttribute('aria-pressed', y === b); }); });
    function meta() { return { teacherId: form.teacherId.value, subjectId: form.subjectId.value || null, gradeCode: form.gradeCode.value || null, topic: form.topic.value.trim(), source: 'ai' }; }
    function paint() {
      var left = found.filter(function (q) { return !q.done; }).length;
      el.querySelector('[data-aisum]').textContent = found.length ? HS.t('ai.left', { n: left, m: found.length }) : '';
      var L = letters(x.lang);
      box.innerHTML = found.length ? '<h3 class="sec">' + HS.esc(HS.t('ai.check')) + '</h3><ol class="qb-paper">' + found.map(function (q, i) {
        if (q.editing) return '<li class="qb-editing"><span class="grow stack" data-aied="' + i + '"><textarea class="input" rows="2" dir="auto" data-k="text" aria-label="' + HS.esc(HS.t('qb.text')) + '">' + HS.esc(q.text) + '</textarea>' +
          [0, 1, 2, 3, 4].map(function (k) { var c = q.choices[k] || ''; return '<span class="qb-choice"><label class="row" style="gap:.3rem"><input type="radio" name="aians' + i + '" value="' + HS.omr.LETTERS.en[k] + '"' + (q.answer === HS.omr.LETTERS.en[k] ? ' checked' : '') + ' aria-label="' + HS.esc(HS.t('qb.right') + ' ' + L[k]) + '"><b>' + HS.esc(L[k]) + '</b></label><input class="input" dir="auto" data-c="' + k + '" value="' + HS.esc(c) + '" aria-label="' + HS.esc(HS.t('qb.choice', { l: L[k] })) + '"></span>'; }).join('') +
          '<textarea class="input" rows="2" dir="auto" data-k="explanation" aria-label="' + HS.esc(HS.t('qb.explain')) + '">' + HS.esc(q.explanation || '') + '</textarea></span>' +
          '<span class="qb-acts"><button type="button" class="btn primary" data-aiadd="' + i + '">' + HS.esc(HS.t('ai.add')) + '</button></span></li>';
        return '<li class="' + (q.done ? 'qb-done' : '') + '"><span class="grow"><span dir="auto"><b>' + HS.esc(q.text) + '</b></span>' +
          '<small dir="auto">' + q.choices.map(function (c, k) { var ok = HS.omr.LETTERS.en[k] === q.answer; return (ok ? '<b class="pos">✓ ' : '<span>') + HS.esc(L[k] + ') ' + c) + (ok ? '</b>' : '</span>'); }).join(' · ') + '</small>' +
          (q.explanation ? '<small class="faint" dir="auto">' + HS.esc(q.explanation) + '</small>' : '') + '</span>' +
          '<span class="qb-acts">' + (q.done ? '<span class="badge ' + (q.done === 'added' ? 'ok' : '') + '">' + HS.esc(HS.t(q.done === 'added' ? 'ai.added' : 'ai.dropped')) + '</span>'
            : '<button type="button" class="btn" data-aiedit="' + i + '">' + HS.esc(HS.t('ai.edit')) + '</button><button type="button" class="btn primary" data-aiadd="' + i + '">' + HS.esc(HS.t('ai.add')) + '</button>' +
              '<button type="button" class="icon-btn" data-aidrop="' + i + '" aria-label="' + HS.esc(HS.t('ai.drop')) + '">' + HS.icon('x', 'sm') + '</button>') + '</span></li>'; }).join('') + '</ol>' : '';
      found.forEach(function (q, i) {        // a correction still being saved stays frozen when another save redraws the list
        if (!q.saving) return;
        box.querySelectorAll('[data-aied="' + i + '"] input, [data-aied="' + i + '"] textarea, [data-aiadd="' + i + '"]').forEach(function (x) { x.disabled = true; });
      });
    }
    el.querySelector('[data-aigo]').addEventListener('click', function () {
      var m = meta(), b = this;
      err.hidden = true;
      if (!m.teacherId || !m.topic) { err.hidden = false; err.textContent = HS.t('form.missing', { f: [!m.teacherId ? HS.t('f.teacherId') : '', !m.topic ? HS.t('qb.topic') : ''].filter(Boolean).join(', ') }); return; }
      box.innerHTML = '<div class="skeleton" style="height:8rem"></div><p class="muted">' + HS.esc(HS.t('ai.wait')) + '</p>';
      U.run(HS.post('/api/c/ai/questions', { teacherId: m.teacherId, subjectId: m.subjectId, gradeCode: m.gradeCode, topic: m.topic, count: Number(form.count.value) || 5, lang: x.lang, notes: form.notes.value.trim() }), null, b)
        .then(function (r) { b.disabled = false; found = found.concat(r.questions); paint(); }, function (e) { box.innerHTML = ''; paint(); err.hidden = false; err.textContent = U.errorText(e); });
    });
    // every keystroke of a correction is kept in the question itself: a list redrawn by another save never wipes it
    function keep(e) {
      var ed = e.target.closest('[data-aied]'); if (!ed) return;
      var q = found[Number(ed.dataset.aied)], t = e.target;
      if (q.saving) return;                 // what is being saved is what the list shows
      if (t.dataset.k) q[t.dataset.k] = t.value;
      else if (t.dataset.c !== undefined) { var ch = q.choices.slice(); while (ch.length < 5) ch.push(''); ch[Number(t.dataset.c)] = t.value; q.choices = ch; }
      else if (t.type === 'radio' && t.checked) q.answer = t.value;
    }
    box.addEventListener('input', keep);
    box.addEventListener('change', keep);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var i = Number(b.dataset.aiadd !== undefined ? b.dataset.aiadd : b.dataset.aiedit !== undefined ? b.dataset.aiedit : b.dataset.aidrop), q = found[i]; if (!q) return;
      if (b.dataset.aidrop !== undefined) { q.done = 'dropped'; paint(); return; }
      if (b.dataset.aiedit !== undefined) { q.editing = true; paint(); return; }
      var ed = box.querySelector('[data-aied="' + i + '"]');
      if (ed) {           // the teacher's corrections
        q.text = ed.querySelector('[data-k=text]').value.trim(); q.explanation = ed.querySelector('[data-k=explanation]').value.trim();
        q.choices = Array.prototype.map.call(ed.querySelectorAll('[data-c]'), function (c) { return c.value.trim(); });
        while (q.choices.length && !q.choices[q.choices.length - 1]) q.choices.pop();
        var pick = ed.querySelector('input[type=radio]:checked'); q.answer = pick ? pick.value : '';
        if (!q.text || q.choices.length < 2 || q.choices.indexOf('') >= 0 || !q.answer || HS.omr.LETTERS.en.indexOf(q.answer) >= q.choices.length) { HS.toast(HS.t('err.question'), 'bad', 5000); return; }
      }
      var row = Object.assign(meta(), { text: q.text, choices: q.choices.slice(), answer: q.answer, explanation: q.explanation, active: true });
      // from here the correction is frozen until the save answers: later typing would show text the bank never got
      q.saving = true;
      if (ed) Array.prototype.forEach.call(ed.querySelectorAll('input, textarea'), function (x) { x.disabled = true; });
      U.run(D.save('questions', D.newId('q'), row, 'AI question added: ' + q.text.slice(0, 50)), 'ai.addedOne', b).then(function () { q.saving = false; q.done = 'added'; q.editing = false; paint(); if (done) done(); },
        function () { q.saving = false; if (ed) Array.prototype.forEach.call(ed.querySelectorAll('input, textarea'), function (x) { x.disabled = false; }); });
    });
    paint();
  }

  /* ---------- choose questions for an exam (only the exam teacher's bank) ---------- */
  Q.pick = function (teacherId, taken, done) {
    var f = { q: '', teacherId: teacherId, subjectId: '', gradeCode: '' }, chosen = {};
    if (!Q.list({ teacherId: teacherId }).length) { HS.toast(HS.t('qb.noneForTeacher'), 'bad', 5000); return; }
    var el = HS.dialog({ title: HS.t('qb.add'), wide: true, body: filters(f, false) + '<div data-plist class="qb-pick"></div>',
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-padd disabled>' + HS.icon('plus', 'sm') + '<span data-plabel>' + HS.esc(HS.t('qb.addN', { n: 0 })) + '</span></button>' });
    function paint() {
      var rows = Q.list(f).filter(function (q) { return taken.indexOf(q.id) < 0; });
      el.querySelector('[data-plist]').innerHTML = rows.length ? rows.slice(0, 400).map(function (q) {
        return '<label class="choice qb-pickrow"><input type="checkbox" value="' + HS.esc(q.id) + '"' + (chosen[q.id] ? ' checked' : '') + '><span>' + qLine(q) + '</span></label>'; }).join('')
        : '<p class="muted">' + HS.esc(HS.t('qb.none')) + '</p>';
    }
    function count() { var n = Object.keys(chosen).length; el.querySelector('[data-plabel]').textContent = HS.t('qb.addN', { n: n }); el.querySelector('[data-padd]').disabled = !n; }
    paint();
    el.addEventListener('input', HS.debounce(function (e) { if (e.target.dataset.qf === 'q') { f.q = e.target.value; paint(); } }, 120));
    el.addEventListener('change', function (e) {
      var k = e.target.dataset.qf; if (k && k !== 'q') { f[k] = e.target.value; paint(); return; }
      if (e.target.type === 'checkbox') { if (e.target.checked) chosen[e.target.value] = 1; else delete chosen[e.target.value]; count(); }
    });
    el.querySelector('[data-padd]').addEventListener('click', function () {
      var order = D.list('questions').filter(function (q) { return chosen[q.id]; });   // the bank's order
      HS.overlay.close(); done(order.map(Q.copy));
    });
  };

  /* ---------- print the question paper or the answer key ---------- */
  Q.printMenu = function (ex) {
    var el = HS.dialog({ title: HS.t('qb.print'), body: '<p class="muted">' + HS.esc(HS.t('qb.print.b')) + '</p>' +
        '<div class="seg" role="group" data-lang><button type="button" data-v="ar" aria-pressed="' + (HS.lang === 'ar') + '">' + HS.esc(HS.t('omr.lettersAr')) + '</button><button type="button" data-v="en" aria-pressed="' + (HS.lang !== 'ar') + '">A B C D</button></div>',
      footer: '<button class="btn" data-pkey>' + HS.icon('check', 'sm') + HS.esc(HS.t('qb.printKey')) + '</button><button class="btn primary" data-ppaper>' + HS.icon('printer', 'sm') + HS.esc(HS.t('qb.printPaper')) + '</button>' });
    var lang = HS.lang === 'ar' ? 'ar' : 'en';
    el.querySelector('[data-lang]').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; lang = b.dataset.v; el.querySelectorAll('[data-v]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); });
    el.querySelector('[data-ppaper]').addEventListener('click', function () { HS.overlay.close(); HS.printHTML(Q.paperHTML(ex, lang, false)); });
    el.querySelector('[data-pkey]').addEventListener('click', function () { HS.overlay.close(); HS.printHTML(Q.paperHTML(ex, lang, true)); });
  };
  Q.paperHTML = function (ex, lang, key) {
    var L = letters(lang), centre = ((D.state || {}).settings || {}).systemName || HS.t('app.name');
    var head = '<div class="ps-head"><div><div class="ps-org">' + HS.esc(centre) + '</div><h1>' + HS.esc(ex.title) + (key ? ' — ' + HS.esc(HS.t('qb.printKey')) : '') + '</h1>' +
      '<div>' + HS.esc([D.teacherName(ex.teacherId), ex.date, HS.t('ex.max') + ' ' + ex.maxScore].filter(Boolean).join(' · ')) + '</div></div>' +
      (key ? '' : '<div class="qp-who"><div>' + HS.esc(HS.t('f.name')) + ': ....................................</div><div>' + HS.esc(HS.t('f.code')) + ': ..............</div></div>') + '</div>';
    var items = (ex.paper || []).map(function (q, i) {
      var k = HS.omr.LETTERS.en.indexOf(q.answer);
      if (key) return '<tr><td class="num">' + (i + 1) + '</td><td><b>' + HS.esc(L[k] || '') + '</b> ' + HS.esc(q.choices[k] || '') + '</td><td>' + HS.esc(q.explanation || '') + '</td></tr>';
      return '<li class="qp-q"><p dir="auto">' + HS.esc(q.text) + '</p><ol class="qp-ch">' + q.choices.map(function (c, j) { return '<li><b>' + HS.esc(L[j]) + ')</b> <span dir="auto">' + HS.esc(c) + '</span></li>'; }).join('') + '</ol></li>';
    }).join('');
    return '<div class="qp" dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '">' + head + (key
      ? '<table class="ps-list"><thead><tr><th>#</th><th>' + HS.esc(HS.t('qb.right')) + '</th><th>' + HS.esc(HS.t('qb.explainShort')) + '</th></tr></thead><tbody>' + items + '</tbody></table>'
      : '<ol class="qp-list">' + items + '</ol>') + '</div>';
  };
})();
