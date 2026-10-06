/* Hessa - exams and marks: the exam list with averages, a new exam for one or more groups (its questions can come from the
   question bank, js/views/qbank.js), and the marks sheet:
   type a mark and Enter moves down, paste a whole column from Excel, mark absent with A, live ranking with ties
   (1, 2, 2, 4), statistics, results to parents one chat at a time, and a printable results sheet. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var KINDS = ['quiz', 'weekly', 'monthly', 'comprehensive', 'mock'];

  function opt(v, l, cur) { return '<option value="' + HS.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + HS.esc(l) + '</option>'; }
  function digits(s) { return String(s || '').replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).replace(/[٫,]/g, '.').trim(); }

  /* ---------- new / edit exam ---------- */
  function editExam(id) {
    if (!HS.can('exams.manage')) return;
    var cur = id ? D.get('exams', id) : null, x = cur || { kind: 'weekly', date: U.today(), maxScore: 20, groupIds: [] };
    var groups = D.list('groups').filter(function (g) { return g.active !== false; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
    HS.panel.open({ title: HS.t(cur ? 'ex.edit' : 'ex.new'), body:
      '<form class="grid cols-2 form-grid" data-xform autocomplete="off">' +
        '<div class="field wide"><label for="xf-t">' + HS.esc(HS.t('ex.title')) + '</label><input class="input" id="xf-t" name="title" required value="' + HS.esc(x.title || '') + '"></div>' +
        '<div class="field"><label for="xf-k">' + HS.esc(HS.t('ex.kind')) + '</label><select class="input" id="xf-k" name="kind">' + KINDS.map(function (k) { return opt(k, HS.t('exam.kind.' + k), x.kind); }).join('') + '</select></div>' +
        '<div class="field"><label for="xf-d">' + HS.esc(HS.t('f.date')) + '</label><input class="input" id="xf-d" name="date" type="date" value="' + HS.esc(x.date || '') + '"></div>' +
        '<div class="field"><label for="xf-m">' + HS.esc(HS.t('ex.max')) + '</label><input class="input" id="xf-m" name="maxScore" type="number" min="1" step="any" dir="ltr" value="' + HS.esc(x.maxScore || '') + '"></div>' +
        '<div class="field"><label for="xf-q">' + HS.esc(HS.t('omr.questions')) + '</label><input class="input" id="xf-q" name="questions" type="number" min="0" max="' + HS.omr.MAX_Q + '" dir="ltr" value="' + HS.esc(x.questions || '') + '"><span class="help">' + HS.esc(HS.t('omr.questions.h')) + '</span></div>' +
        '<div class="field"><label for="xf-c">' + HS.esc(HS.t('omr.choices')) + '</label><select class="input" id="xf-c" name="choices">' + [2, 3, 4, 5].map(function (n) { return opt(n, String(n), x.choices || 4); }).join('') + '</select></div>' +
        '<div class="field wide" data-keyfield><label for="xf-k2">' + HS.esc(HS.t('omr.key')) + '</label><input class="input" id="xf-k2" name="answerKey" dir="ltr" autocomplete="off" spellcheck="false" placeholder="ABCDA BCDAB …" value="' + HS.esc((x.answerKey || []).join('')) + '"><span class="help" data-keycount></span></div>' +
        '<div class="field wide" data-paperbox></div>' +
        '<div class="field wide"><span class="lbl">' + HS.esc(HS.t('ex.groups')) + '</span><div class="check-list">' + groups.map(function (g) {
          return '<label class="choice"><input type="checkbox" name="g" value="' + HS.esc(g.id) + '"' + ((x.groupIds || []).indexOf(g.id) >= 0 ? ' checked' : '') + '><span><b>' + HS.esc(g.name) + '</b><small>' + HS.esc(D.teacherName(g.teacherId)) + '</small></span></label>'; }).join('') + '</div>' +
          '<span class="help">' + HS.esc(HS.t('ex.groups.b')) + '</span></div>' +
        '<div class="tip bad wide" data-err hidden></div></form>',
      footer: '<button class="btn primary" data-save>' + HS.icon('check', 'sm') + HS.esc(HS.t(cur ? 'common.save' : 'ex.create')) + '</button>',
      mount: function (p) {
        var form = p.querySelector('[data-xform]'), paper = (x.paper || []).map(function (q) { return Object.assign({}, q); });
        function teacherOfGroups() {
          var t = {}; Array.prototype.forEach.call(form.querySelectorAll('[name=g]:checked'), function (c) { t[(D.get('groups', c.value) || {}).teacherId] = 1; });
          var ids = Object.keys(t); return ids.length === 1 ? ids[0] : (cur && !ids.length ? cur.teacherId : null);
        }
        function paintPaper() {   // questions taken from the bank: the count, the choices and the key follow them
          var box = p.querySelector('[data-paperbox]'), L = HS.omr.LETTERS[HS.lang === 'ar' ? 'ar' : 'en'];
          box.innerHTML = '<span class="lbl">' + HS.esc(HS.t('qb.paper')) + '</span>' +
            (paper.length ? '<ol class="qb-paper">' + paper.map(function (q, i) {
              var newer = HS.qbank.changed(q);
              return '<li><span class="grow"><span class="qb-text">' + HS.esc(q.text) + '</span><small class="faint">' + HS.esc(HS.t('qb.right')) + ': <b>' + HS.esc(L[HS.omr.LETTERS.en.indexOf(q.answer)] || '') + '</b>' +
                (newer ? ' <span class="badge warn">' + HS.esc(HS.t('qb.changed')) + '</span> <button type="button" class="link" data-pnew="' + i + '">' + HS.esc(HS.t('qb.takeNew')) + '</button>' : '') + '</small></span>' +
                '<span class="qb-acts"><button type="button" class="icon-btn" data-pup="' + i + '" aria-label="' + HS.esc(HS.t('qb.up')) + '"' + (i ? '' : ' disabled') + '>↑</button>' +
                '<button type="button" class="icon-btn" data-pdown="' + i + '" aria-label="' + HS.esc(HS.t('qb.down')) + '"' + (i < paper.length - 1 ? '' : ' disabled') + '>↓</button>' +
                '<button type="button" class="icon-btn" data-prm="' + i + '" aria-label="' + HS.esc(HS.t('qb.remove')) + '">' + HS.icon('x', 'sm') + '</button></span></li>'; }).join('') + '</ol>' : '') +
            '<button type="button" class="btn" data-padd>' + HS.icon('book', 'sm') + HS.esc(HS.t('qb.add')) + '</button>' +
            '<span class="help">' + HS.esc(HS.t('qb.paper.h')) + '</span>';
          var on = paper.length > 0;
          form.questions.disabled = form.choices.disabled = form.answerKey.disabled = on;
          if (on) {
            form.questions.value = paper.length;
            form.choices.value = String(Math.max.apply(null, paper.map(function (q) { return q.choices.length; })));
            form.answerKey.value = paper.map(function (q) { return q.answer; }).join('');
          }
          keyCount();
        }
        p.querySelector('[data-paperbox]').addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-padd')) {
            var t = teacherOfGroups();
            if (!t) { HS.toast(HS.t('qb.pickGroups'), 'bad', 5000); return; }
            HS.qbank.pick(t, paper.map(function (q) { return q.qid; }), function (list) {
              if (paper.length + list.length > HS.omr.MAX_Q) { HS.toast(HS.t('omr.tooMany', { n: HS.omr.MAX_Q }), 'bad', 5000); return; }
              paper = paper.concat(list); paintPaper();
            });
            return;
          }
          var i;
          if (b.dataset.pup) { i = Number(b.dataset.pup); paper.splice(i - 1, 0, paper.splice(i, 1)[0]); }
          else if (b.dataset.pdown) { i = Number(b.dataset.pdown); paper.splice(i + 1, 0, paper.splice(i, 1)[0]); }
          else if (b.dataset.prm) paper.splice(Number(b.dataset.prm), 1);
          else if (b.dataset.pnew) { i = Number(b.dataset.pnew); var nb = HS.qbank.changed(paper[i]); if (nb) paper[i] = HS.qbank.copy(nb); }
          else return;
          paintPaper();
        });
        function keyCount() {   // "12 of 20" as the key is typed: the printed sheet and the marking both need it complete
          var n = Number(digits(form.questions.value)) || 0, k = HS.omr.parseKey(form.answerKey.value), bad = k.indexOf('?') >= 0;
          p.querySelector('[data-keyfield]').hidden = !n;
          var out = p.querySelector('[data-keycount]');
          out.textContent = n ? HS.t('omr.keyCount', { k: k.length, n: n }) + (bad ? ' · ' + HS.t('omr.keyBad') : '') : '';
          out.className = 'help' + (n && (k.length !== n || bad) ? ' neg' : '');
        }
        form.addEventListener('input', keyCount); paintPaper();
        function save() {
          var gids = Array.prototype.filter.call(form.querySelectorAll('[name=g]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
          var err = p.querySelector('[data-err]'), title = form.title.value.trim(), max = Number(digits(form.maxScore.value));
          var miss = [];
          if (!title) miss.push(HS.t('ex.title'));
          if (!gids.length) miss.push(HS.t('ex.groups'));
          if (!(max > 0)) miss.push(HS.t('ex.max'));
          var nq = Number(digits(form.questions.value)) || 0, key = HS.omr.parseKey(form.answerKey.value);
          if (nq > HS.omr.MAX_Q || nq < 0) { err.hidden = false; err.textContent = HS.t('omr.tooMany', { n: HS.omr.MAX_Q }); return; }
          if (nq && (key.length !== nq || key.indexOf('?') >= 0)) { err.hidden = false; err.textContent = HS.t('omr.keyCount', { k: key.length, n: nq }) + ' · ' + HS.t('omr.keyBad'); return; }
          if (miss.length) { err.hidden = false; err.textContent = HS.t('form.missing', { f: miss.join(', ') }); return; }
          var teachers = {}; gids.forEach(function (g) { teachers[(D.get('groups', g) || {}).teacherId] = 1; });
          if (Object.keys(teachers).length > 1) { err.hidden = false; err.textContent = HS.t('ex.oneTeacher'); return; }   // marks belong to one teacher's scope
          var row = Object.assign({}, cur || {}, { title: title, kind: form.kind.value, date: form.date.value, maxScore: max, groupIds: gids, teacherId: Object.keys(teachers)[0],
            questions: nq || null, choices: Number(form.choices.value) || 4, answerKey: nq ? key : [], paper: paper });
          delete row.id; delete row.ver;
          if (paper.length && paper.some(function (q) { var b = q.qid && D.get('questions', q.qid); return b && b.teacherId !== row.teacherId; })) { err.hidden = false; err.textContent = HS.t('qb.otherTeacher'); return; }
          var xid = id || D.newId('ex');
          // a new answer key for an exam that already has marks is the teacher's decision: saved marks are not recounted
          var keyMoved = cur && (cur.answerKey || []).join('') && (cur.answerKey || []).join('') !== row.answerKey.join('') && D.list('marks').some(function (m) { return m.examId === id; });
          (keyMoved ? U.confirm({ title: HS.t('qb.keyChanged'), body: HS.t('qb.keyChanged.b'), ok: HS.t('common.save') }) : Promise.resolve(true)).then(function (yes) { if (yes) go(); });
          function go() { U.run(D.save('exams', xid, row, (cur ? 'Edit exam ' : 'New exam ') + title), 'common.saved', p.querySelector('[data-save]')).then(function () {
            HS.panel.close(); HS.rerender(); setTimeout(function () { openSheet(xid); }, 280);
          }, function (e) { err.hidden = false; err.textContent = U.errorText(e); }); }
        }
        p.querySelector('[data-save]').addEventListener('click', save);
        form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
      } });
  }

  /* ---------- the marks sheet ---------- */
  function rankOf(rows) {
    // competition ranking: equal marks share a place, the next place is skipped (1, 2, 2, 4)
    var sat = rows.filter(function (r) { return !r.absent && r.score !== '' && r.score !== null && !isNaN(Number(r.score)); })
      .sort(function (a, b) { return Number(b.score) - Number(a.score); });
    var rank = {}, last = null, pos = 0;
    sat.forEach(function (r, i) { if (Number(r.score) !== last) { pos = i + 1; last = Number(r.score); } rank[r.id] = pos; });
    return { rank: rank, sat: sat };
  }
  function statsHTML(rows, max) {
    var s = rankOf(rows).sat, vals = s.map(function (r) { return Number(r.score); });
    if (!vals.length) return '<p class="muted">' + HS.esc(HS.t('ex.noMarks')) + '</p>';
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length, pass = vals.filter(function (v) { return v >= max / 2; }).length;
    var bins = [0, 0, 0, 0, 0]; vals.forEach(function (v) { bins[Math.min(4, Math.floor(v * 5 / (max || 1)))]++; });
    var top = Math.max.apply(null, bins.concat([1]));
    return '<div class="mini-kpis">' +
      '<div><small>' + HS.esc(HS.t('ex.sat')) + '</small><b class="num">' + vals.length + ' / ' + rows.length + '</b></div>' +
      '<div><small>' + HS.esc(HS.t('ex.avg')) + '</small><b class="num">' + HS.fmt.num(Math.round(avg * 10) / 10) + ' <span class="faint">(' + Math.round(avg * 100 / (max || 1)) + '%)</span></b></div>' +
      '<div class="' + (pass / vals.length >= .7 ? 'ok' : pass / vals.length < .5 ? 'bad' : '') + '"><small>' + HS.esc(HS.t('ex.pass')) + '</small><b class="num">' + Math.round(pass * 100 / vals.length) + '%</b></div>' +
      '<div><small>' + HS.esc(HS.t('ex.range')) + '</small><b class="num">' + HS.fmt.num(Math.min.apply(null, vals)) + ' – ' + HS.fmt.num(Math.max.apply(null, vals)) + '</b></div></div>' +
      '<div class="histo" aria-label="' + HS.esc(HS.t('ex.histo')) + '">' + bins.map(function (n, i) { return '<div><i style="height:' + Math.round(n * 100 / top) + '%"></i><span class="num">' + (i * 20) + '–' + ((i + 1) * 20) + '%</span><b class="num">' + n + '</b></div>'; }).join('') + '</div>';
  }
  /* ---------- bubble sheets: print (named or blank) and read the photos, then a person checks before anything is saved ---------- */
  function bubbleMenu(ex, rows) {
    var el = HS.dialog({ title: HS.t('omr.print'), body: '<p class="muted">' + HS.esc(HS.t('omr.print.b')) + '</p>' +
        '<div class="seg" role="group" data-lang><button type="button" data-v="ar" aria-pressed="' + (HS.lang === 'ar') + '">' + HS.esc(HS.t('omr.lettersAr')) + '</button><button type="button" data-v="en" aria-pressed="' + (HS.lang !== 'ar') + '">A B C D</button></div>',
      footer: '<button class="btn" data-blank>' + HS.esc(HS.t('omr.blank')) + '</button><button class="btn primary" data-named>' + HS.icon('printer', 'sm') + HS.esc(HS.t('omr.named', { n: rows.length })) + '</button>' });
    var lang = HS.lang === 'ar' ? 'ar' : 'en';
    el.querySelector('[data-lang]').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; lang = b.dataset.v; el.querySelectorAll('[data-v]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); });
    el.querySelector('[data-blank]').addEventListener('click', function () { HS.overlay.close(); HS.printBubbleSheets(ex, null, lang); });
    el.querySelector('[data-named]').addEventListener('click', function () { HS.overlay.close(); HS.printBubbleSheets(ex, rows.map(function (r) { return { name: r.name, code: r.code }; }), lang); });
  }
  function readSheets(ex, rows, done) {
    var byCode = {}; rows.forEach(function (r) { if (r.code) byCode[String(r.code)] = r; });
    var results = [];
    var el = HS.dialog({ title: HS.t('omr.read'), wide: true, body:
        '<p class="muted">' + HS.esc(HS.t('omr.read.b')) + '</p>' +
        '<label class="btn primary" style="width:max-content">' + HS.icon('camera', 'sm') + HS.esc(HS.t('omr.pick')) + '<input type="file" accept="image/*" capture="environment" multiple hidden data-files></label>' +
        '<div data-res></div>',
      footer: '<span class="grow faint" data-sum></span><button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-save disabled>' + HS.icon('check', 'sm') + HS.esc(HS.t('omr.save')) + '</button>' });
    var box = el.querySelector('[data-res]');
    function paint() {
      if (!results.length) { box.innerHTML = ''; return; }
      box.innerHTML = U.table([
        { h: 'omr.photo', cell: function (r) { return '<span class="faint">' + HS.esc(r.file) + '</span>'; } },
        { h: 'f.name', cell: function (r) {
          if (!r.ok) return '<span class="badge bad">' + HS.esc(HS.t('omr.noCorners')) + '</span>';
          return '<select class="input" data-who="' + r.i + '">' + '<option value="">' + HS.esc(HS.t('omr.whoUnknown', { code: r.codeRead })) + '</option>' + rows.map(function (x) {
            return '<option value="' + HS.esc(x.id) + '"' + (r.studentId === x.id ? ' selected' : '') + '>' + HS.esc(x.name + ' · ' + (x.code || '')) + '</option>'; }).join('') + '</select>'; } },
        { h: 'f.score', cls: 'end', cell: function (r) { return r.ok ? '<b class="num">' + HS.fmt.num(r.score) + '</b> <span class="faint num">/ ' + HS.fmt.num(ex.maxScore) + '</span>' : ''; } },
        { h: 'omr.check', cell: function (r) {
          if (!r.ok) return '';
          var f = [];
          if (r.blank.length) f.push('<span class="badge warn">' + HS.esc(HS.t('omr.blankQ', { q: r.blank.join(', ') })) + '</span>');
          if (r.multi.length) f.push('<span class="badge bad">' + HS.esc(HS.t('omr.multiQ', { q: r.multi.join(', ') })) + '</span>');
          return f.join(' ') || '<span class="badge ok">' + HS.icon('check', 'sm') + HS.esc(HS.t('omr.clean')) + '</span>'; } }
      ], results);
      var ready = results.filter(function (r) { return r.ok && r.studentId; });
      el.querySelector('[data-sum]').textContent = HS.t('omr.ready', { n: ready.length, m: results.length });
      el.querySelector('[data-save]').disabled = !ready.length;
    }
    el.addEventListener('change', function (e) {
      if (e.target.matches('[data-files]')) {
        var files = Array.prototype.slice.call(e.target.files || []);
        box.innerHTML = '<div class="skeleton" style="height:6rem"></div>';
        files.reduce(function (chain, file) {
          return chain.then(function () {
            return HS.omr.readImage(file, ex).then(function (r) {
              r.file = file.name; r.i = results.length;
              if (r.ok) { var who = r.code && byCode[r.code]; r.studentId = who ? who.id : ''; var g = HS.omr.grade(ex.answerKey, r.answers, ex.maxScore); r.score = g.score; r.right = g.right; }
              results.push(r);
            }, function () { results.push({ ok: false, file: file.name, i: results.length }); });
          });
        }, Promise.resolve()).then(paint);
        return;
      }
      var who = e.target.closest('[data-who]'); if (who) { results[Number(who.dataset.who)].studentId = who.value; paint(); }
    });
    el.querySelector('[data-save]').addEventListener('click', function () {
      var ready = results.filter(function (r) { return r.ok && r.studentId; }), seen = {};
      var items = ready.filter(function (r) { if (seen[r.studentId]) return false; seen[r.studentId] = 1; return true; })
        .map(function (r) { return { studentId: r.studentId, score: r.score, answers: r.answers, via: 'omr' }; });
      U.run(HS.post('/api/c/marks', { examId: ex.id, items: items }), 'ex.saved', this).then(function () { HS.overlay.close(); done(); }, function () {});
    });
  }

  /* ---------- honours: the top students as a picture to share, and certificates to print (review G05) ----------
     Only from an exam the teacher showed to parents (published), never sent anywhere by itself; first names only by default. */
  function honours(ex, rows) {
    if (ex.published !== true) { HS.toast(HS.t('hon.unpublished'), 'bad', 5000); return; }
    var top = rankOf(rows).sat.slice(0, 10).map(function (r) { return { name: r.name, score: Number(r.score), rank: rankOf(rows).rank[r.id] }; });
    if (!top.length) { HS.toast(HS.t('ex.noMarks'), 'bad'); return; }
    var first = true;
    var el = HS.dialog({ title: HS.t('hon.title'), wide: true, body: '<p class="muted">' + HS.esc(HS.t('hon.b')) + '</p>' +
        '<label class="row" style="gap:.4rem"><input type="checkbox" data-first checked> ' + HS.esc(HS.t('hon.firstOnly')) + '</label>' +
        '<div class="hon-preview"><canvas data-canvas width="1080" height="1350" aria-label="' + HS.esc(HS.t('hon.title')) + '"></canvas></div>',
      footer: '<button class="btn" data-cert>' + HS.icon('printer', 'sm') + HS.esc(HS.t('hon.certs', { n: Math.min(3, top.length) })) + '</button>' +
        '<button class="btn primary" data-png>' + HS.icon('download', 'sm') + HS.esc(HS.t('hon.download')) + '</button>' });
    var cv = el.querySelector('[data-canvas]');
    function shown(n) { return first ? String(n).trim().split(/\s+/).slice(0, 2).join(' ') : n; }   // first + father's name
    function draw() {
      var cx = cv.getContext('2d'), W = 1080, H = 1350, rtl = HS.lang === 'ar', css = getComputedStyle(document.documentElement);
      var brand = '#13294b', signal = (css.getPropertyValue('--signal') || '#f2a900').trim() || '#f2a900';
      var font = '"HS Plex Arabic","HS Plex","Segoe UI",Tahoma,sans-serif';
      cx.direction = rtl ? 'rtl' : 'ltr';
      cx.fillStyle = brand; cx.fillRect(0, 0, W, H);
      cx.fillStyle = signal; cx.fillRect(0, 0, W, 18); cx.fillRect(0, H - 18, W, 18);
      cx.textAlign = 'center'; cx.fillStyle = '#fff';
      cx.font = '600 40px ' + font; cx.fillText(((HS.data.state || {}).settings || {}).systemName || HS.t('app.name'), W / 2, 110);
      cx.font = '800 76px ' + font; cx.fillStyle = signal; cx.fillText(HS.t('hon.headline'), W / 2, 210);
      cx.font = '600 40px ' + font; cx.fillStyle = '#fff'; cx.fillText(ex.title, W / 2, 280);
      cx.font = '400 32px ' + font; cx.fillStyle = '#c9d4ea'; cx.fillText([HS.data.teacherName(ex.teacherId), ex.date].filter(Boolean).join('  ·  '), W / 2, 330);
      var y = 420, rowH = (H - 470) / Math.max(5, top.length);
      top.forEach(function (r, i) {
        var mid = y + i * rowH + rowH / 2, medal = r.rank === 1 ? '#f2c94c' : r.rank === 2 ? '#d7dde8' : r.rank === 3 ? '#e0a46b' : 'rgba(255,255,255,.18)';
        cx.fillStyle = 'rgba(255,255,255,' + (i % 2 ? '.04' : '.08') + ')'; cx.fillRect(70, mid - rowH / 2 + 6, W - 140, rowH - 12);
        var cxX = rtl ? W - 130 : 130;
        cx.beginPath(); cx.arc(cxX, mid, 34, 0, Math.PI * 2); cx.fillStyle = medal; cx.fill();
        cx.fillStyle = r.rank <= 3 ? brand : '#fff'; cx.font = '800 36px ' + font; cx.textAlign = 'center'; cx.fillText(String(r.rank), cxX, mid + 13);
        cx.fillStyle = '#fff'; cx.font = '700 42px ' + font; cx.textAlign = rtl ? 'right' : 'left';
        cx.fillText(shown(r.name), rtl ? W - 190 : 190, mid + 15, W - 520);
        cx.textAlign = rtl ? 'left' : 'right'; cx.fillStyle = signal; cx.font = '800 42px ' + font;
        cx.direction = 'ltr'; cx.fillText(HS.fmt.num(r.score) + ' / ' + HS.fmt.num(ex.maxScore), rtl ? 110 : W - 110, mid + 15); cx.direction = rtl ? 'rtl' : 'ltr';
      });
    }
    draw();
    el.querySelector('[data-first]').addEventListener('change', function (e) { first = e.target.checked; draw(); });
    el.querySelector('[data-png]').addEventListener('click', function () {
      cv.toBlob(function (b) { U.download(HS.t('hon.file', { t: ex.title }) + '.png', b, 'image/png'); HS.toast(HS.t('hon.saved')); }, 'image/png');
    });
    el.querySelector('[data-cert]').addEventListener('click', function () {
      var centre = ((HS.data.state || {}).settings || {}).systemName || HS.t('app.name');
      HS.printHTML(top.filter(function (r) { return r.rank <= 3; }).map(function (r) {
        return '<div class="cert"><div class="cert-in"><div class="ps-org">' + HS.esc(centre) + '</div><h1>' + HS.esc(HS.t('hon.certTitle')) + '</h1>' +
          '<p>' + HS.esc(HS.t('hon.certFor')) + '</p><h2>' + HS.esc(r.name) + '</h2>' +
          '<p>' + HS.esc(HS.t('hon.certText', { rank: r.rank, exam: ex.title, score: HS.fmt.num(r.score), max: HS.fmt.num(ex.maxScore) })) + '</p>' +
          '<div class="cert-sign"><span>' + HS.esc(HS.t('hon.teacher')) + ': ' + HS.esc(HS.data.teacherName(ex.teacherId)) + '</span><span>' + HS.esc(HS.t('hon.manager')) + '</span></div>' +
          '<p class="cert-date">' + HS.esc(ex.date || '') + '</p></div></div>';
      }).join(''));
    });
  }

  function openSheet(id) {
    HS.get('/api/c/exam?id=' + encodeURIComponent(id)).then(function (res) {
      var ex = res.exam, max = Number(ex.maxScore) || 0, can = HS.can('marks.enter');
      var rows = res.rows.map(function (r) { var m = r.mark || {}; return { id: r.student.id, name: r.student.name, code: r.student.code, groupId: r.groupId, score: m.score === undefined || m.score === null ? '' : m.score, absent: !!m.absent, orig: (m.score === undefined || m.score === null ? '' : m.score) + '|' + !!m.absent }; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
      var dirty = false;
      function rowHTML(r, rank) {
        var bad = r.score !== '' && !r.absent && (isNaN(Number(r.score)) || Number(r.score) < 0 || (max && Number(r.score) > max));
        return '<tr data-sid="' + HS.esc(r.id) + '"><td class="num faint">' + U.bdi(r.code || '') + '</td><td><b>' + HS.esc(r.name) + '</b> <span class="faint">' + HS.esc(D.groupName(r.groupId)) + '</span></td>' +
          '<td><input class="input mark' + (bad ? ' invalid' : '') + '" inputmode="decimal" dir="ltr" data-mark value="' + HS.esc(r.absent ? '' : r.score) + '"' + (r.absent || !can ? ' disabled' : '') + ' aria-label="' + HS.esc(HS.t('f.score') + ' ' + r.name) + '"></td>' +
          '<td><label class="row" style="gap:.3rem"><input type="checkbox" data-abs' + (r.absent ? ' checked' : '') + (can ? '' : ' disabled') + '><span class="muted">' + HS.esc(HS.t('att.absent')) + '</span></label></td>' +
          '<td class="num">' + (rank ? '<span class="rank r' + Math.min(rank, 4) + '">' + rank + '</span>' : '') + '</td></tr>';
      }
      function tableHTML() {
        var rk = rankOf(rows).rank;
        return '<div class="table-wrap"><table class="tbl marks"><thead><tr><th>' + HS.esc(HS.t('f.code')) + '</th><th>' + HS.esc(HS.t('f.name')) + '</th><th>' + HS.esc(HS.t('f.score')) + ' / ' + HS.fmt.num(max) + '</th><th></th><th>' + HS.esc(HS.t('f.rank')) + '</th></tr></thead><tbody>' +
          rows.map(function (r) { return rowHTML(r, rk[r.id]); }).join('') + '</tbody></table></div>';
      }
      var el = HS.panel.open({ title: ex.title, body:
        '<div class="row wrap"><span class="badge">' + HS.esc(HS.t('exam.kind.' + ex.kind)) + '</span><span class="badge">' + HS.esc(U.day(ex.date).replace(/<[^>]+>/g, '')) + '</span><span class="badge">' + HS.esc(D.teacherName(ex.teacherId)) + '</span></div>' +
        ((ex.paper || []).some(function (q) { return HS.qbank.changed(q); }) ? '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('qb.changedTip')) + '</span></div>' : '') +
        '<div data-stats>' + statsHTML(rows, max) + '</div>' +
        (can ? '<div class="tip">' + HS.icon('keyboard') + '<span>' + HS.esc(HS.t('ex.keys')) + '</span></div>' : '') +
        '<div data-sheet>' + (rows.length ? tableHTML() : U.empty('users', HS.t('roll.empty'), HS.t('roll.empty.b'))) + '</div>',
        footer: (HS.can('exams.manage') ? '<button class="btn" data-xedit>' + HS.icon('settings', 'sm') + HS.esc(HS.t('ex.edit')) + '</button>' : '') +
          (HS.can('exams.manage') ? '<button class="btn" data-publish aria-pressed="' + (ex.published === true) + '">' + HS.icon(ex.published === true ? 'eye' : 'lock', 'sm') + HS.esc(HS.t(ex.published === true ? 'ex.shown' : 'ex.hidden')) + '</button>' : '') +
          '<button class="btn" data-print>' + HS.icon('printer', 'sm') + HS.esc(HS.t('ex.print')) + '</button>' +
          ((ex.paper || []).length ? '<button class="btn" data-qprint>' + HS.icon('book', 'sm') + HS.esc(HS.t('qb.print')) + '</button>' : '') +
          '<button class="btn" data-honours>' + HS.icon('star', 'sm') + HS.esc(HS.t('hon.btn')) + '</button>' +
          (ex.questions && (ex.answerKey || []).length ? '<button class="btn" data-bubbles>' + HS.icon('doc', 'sm') + HS.esc(HS.t('omr.print')) + '</button>' +
            (can ? '<button class="btn" data-omr>' + HS.icon('camera', 'sm') + HS.esc(HS.t('omr.read')) + '</button>' : '') : '') +
          (HS.can('messages.send') && HS.can('contacts.view') ? '<button class="btn" data-send>' + HS.icon('chat', 'sm') + HS.esc(HS.t('ex.send')) + '</button>' : '') +
          (can ? '<button class="btn primary" data-save>' + HS.icon('check', 'sm') + HS.esc(HS.t('ex.saveMarks')) + '</button>' : ''),
        mount: function (p) {
          var sheet = p.querySelector('[data-sheet]');
          function refresh() {
            var rk = rankOf(rows).rank;
            p.querySelectorAll('tr[data-sid]').forEach(function (tr) {
              var r = rows.filter(function (x) { return x.id === tr.dataset.sid; })[0];
              tr.lastChild.innerHTML = rk[r.id] ? '<span class="rank r' + Math.min(rk[r.id], 4) + '">' + rk[r.id] + '</span>' : '';
              var inp = tr.querySelector('[data-mark]'), bad = r.score !== '' && !r.absent && (isNaN(Number(r.score)) || Number(r.score) < 0 || (max && Number(r.score) > max));
              inp.classList.toggle('invalid', bad);
            });
            p.querySelector('[data-stats]').innerHTML = statsHTML(rows, max);
          }
          function find(tr) { return rows.filter(function (x) { return x.id === tr.dataset.sid; })[0]; }
          sheet.addEventListener('input', function (e) {
            var inp = e.target.closest('[data-mark]'); if (!inp) return;
            var v = digits(inp.value);
            if (/^[aAغ]$/.test(v)) { var r0 = find(inp.closest('tr')); r0.absent = true; r0.score = ''; inp.value = ''; inp.disabled = true; inp.closest('tr').querySelector('[data-abs]').checked = true; dirty = true; refresh(); moveFrom(inp); return; }
            find(inp.closest('tr')).score = v; dirty = true; refresh();
          });
          sheet.addEventListener('change', function (e) {
            var c = e.target.closest('[data-abs]'); if (!c) return;
            var tr = c.closest('tr'), r = find(tr), inp = tr.querySelector('[data-mark]');
            r.absent = c.checked; if (c.checked) { r.score = ''; inp.value = ''; } inp.disabled = c.checked; dirty = true; refresh();
          });
          function inputs() { return Array.prototype.slice.call(sheet.querySelectorAll('[data-mark]')); }
          function moveFrom(inp, back) {
            var list = inputs(), i = list.indexOf(inp);
            for (var k = i + (back ? -1 : 1); k >= 0 && k < list.length; k += back ? -1 : 1) if (!list[k].disabled) { list[k].focus(); list[k].select(); return; }
          }
          sheet.addEventListener('keydown', function (e) {
            var inp = e.target.closest('[data-mark]'); if (!inp) return;
            if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); moveFrom(inp); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveFrom(inp, true); }
          });
          // a column copied from Excel fills this row and the ones below it
          sheet.addEventListener('paste', function (e) {
            var inp = e.target.closest('[data-mark]'), text = (e.clipboardData || window.clipboardData).getData('text');
            if (!inp || !/[\r\n\t]/.test(text)) return;
            e.preventDefault();
            var vals = text.split(/\r?\n/).map(function (l) { return digits(l.split('\t')[0]); }).filter(function (v, i, a) { return v !== '' || i < a.length - 1; });
            var list = inputs().slice(inputs().indexOf(inp)).filter(function (x) { return !x.disabled; });
            vals.forEach(function (v, i) {
              var target = list[i]; if (!target) return;
              var r = find(target.closest('tr'));
              if (/^[aAغ]$/.test(v)) { r.absent = true; r.score = ''; target.value = ''; target.disabled = true; target.closest('tr').querySelector('[data-abs]').checked = true; }
              else { r.score = v; target.value = v; }
            });
            dirty = true; refresh();
            HS.toast(HS.t('ex.pasted', { n: Math.min(vals.length, list.length) }));
          });
          p.addEventListener('click', function (e) {
            if (e.target.closest('[data-print]')) { HS.printResults(ex, rows, rankOf(rows).rank); return; }
            if (e.target.closest('[data-bubbles]')) { bubbleMenu(ex, rows); return; }
            if (e.target.closest('[data-honours]')) { honours(ex, rows); return; }
            if (e.target.closest('[data-qprint]')) { HS.qbank.printMenu(ex); return; }
            if (e.target.closest('[data-xedit]')) {
              var go = function () { HS.panel.close(); setTimeout(function () { editExam(id); }, 260); };
              if (dirty) U.confirm({ title: HS.t('ex.unsaved'), body: HS.t('ex.unsaved.b'), danger: true, ok: HS.t('ex.edit') }).then(function (yes) { if (yes) go(); });
              else go();
              return;
            }
            if (e.target.closest('[data-omr]')) { readSheets(ex, rows, function () { HS.panel.close(); setTimeout(function () { openSheet(id); }, 260); }); return; }
            var pub = e.target.closest('[data-publish]');
            if (pub) {   // marks reach the parents' page only after the teacher says so (a half-entered exam never shows)
              var cur = D.get('exams', id); if (!cur) return;
              var on = cur.published !== true;
              U.run(D.save('exams', id, Object.assign({}, cur, { published: on }), (on ? 'Show exam to parents: ' : 'Hide exam from parents: ') + cur.title), on ? 'ex.shownDone' : 'ex.hiddenDone', pub).then(function () {
                ex.published = on; pub.disabled = false; pub.setAttribute('aria-pressed', on);
                pub.innerHTML = HS.icon(on ? 'eye' : 'lock', 'sm') + HS.esc(HS.t(on ? 'ex.shown' : 'ex.hidden'));
              }, function () {});
              return;
            }
            if (e.target.closest('[data-send]')) {
              var who = rows.filter(function (r) { return !r.absent && r.score !== ''; }).map(function (r) { return { id: r.id, name: r.name }; });
              HS.waQueue(who, 'exam', null); return;
            }
            var sv = e.target.closest('[data-save]');
            if (sv) {
              if (p.querySelector('.mark.invalid')) { HS.toast(HS.t('err.scoreRange', { max: max }), 'bad', 5000); p.querySelector('.mark.invalid').focus(); return; }
              var items = rows.filter(function (r) { return (r.score + '|' + r.absent) !== r.orig; }).map(function (r) { return { studentId: r.id, score: r.absent ? null : r.score, absent: r.absent }; });
              if (!items.length) { HS.toast(HS.t('ex.nothing')); return; }
              U.run(HS.post('/api/c/marks', { examId: id, items: items }), 'ex.saved', sv).then(function () {
                rows.forEach(function (r) { r.orig = r.score + '|' + r.absent; }); dirty = false; HS.emit('marks-saved', id);
              }, function () {});
            }
          });
          var first = inputs().filter(function (x) { return !x.disabled && x.value === ''; })[0]; if (first) setTimeout(function () { first.focus(); }, 300);
        } });
      return el;
    }, function (e) { HS.toast(U.errorText(e), 'bad', 5000); });
  }
  HS.openExam = openSheet;

  /* ---------- the page ---------- */
  var F = { q: '', group: '', kind: '' };
  HS.views.exams = HS.withData({
    render: function () {
      var groups = D.list('groups').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.exams')) + '</h1><p>' + HS.esc(HS.t('page.exams.d')) + '</p></div>' +
          '<div class="row wrap"><button class="btn" data-bank>' + HS.icon('book', 'sm') + HS.esc(HS.t('qb.bank')) + '</button>' +
          (HS.can('exams.manage') ? '<button class="btn primary" data-new>' + HS.icon('plus', 'sm') + HS.esc(HS.t('ex.new')) + '</button>' : '') + '</div></div>' +
        '<div class="toolbar"><input class="input" type="search" data-f="q" value="' + HS.esc(F.q) + '" placeholder="' + HS.esc(HS.t('ex.search')) + '" style="max-width:20rem">' +
          '<select class="input" data-f="group" style="width:auto;max-width:16rem">' + opt('', HS.t('f.group') + ': ' + HS.t('common.all'), F.group) + groups.map(function (g) { return opt(g.id, g.name, F.group); }).join('') + '</select>' +
          '<select class="input" data-f="kind" style="width:auto">' + opt('', HS.t('ex.kind') + ': ' + HS.t('common.all'), F.kind) + KINDS.map(function (k) { return opt(k, HS.t('exam.kind.' + k), F.kind); }).join('') + '</select></div>' +
        '<div data-xrows></div>';
    },
    mount: function (root) {
      function paint() {
        var n = U.key(F.q), marks = {};
        D.list('marks').forEach(function (m) { var x = marks[m.examId] = marks[m.examId] || { n: 0, sum: 0, abs: 0 }; if (m.absent) x.abs++; else if (m.score !== null && m.score !== undefined) { x.n++; x.sum += Number(m.score); } });
        var rows = D.list('exams').filter(function (x) { return (!F.group || (x.groupIds || []).indexOf(F.group) >= 0) && (!F.kind || x.kind === F.kind) && (!n || U.key(x.title).indexOf(n) >= 0); })
          .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        root.querySelector('[data-xrows]').innerHTML = rows.length ? U.table([
          { h: 'ex.title', cell: function (x) { return '<b>' + HS.esc(x.title) + '</b>'; } },
          { h: 'f.date', cell: function (x) { return U.day(x.date); } },
          { h: 'ex.kind', cell: function (x) { return '<span class="badge">' + HS.esc(HS.t('exam.kind.' + x.kind)) + '</span>'; } },
          { h: 'ex.groups', cell: function (x) { return '<span class="chip-row">' + (x.groupIds || []).map(function (g) { return '<span class="chip">' + HS.esc(D.groupName(g)) + '</span>'; }).join('') + '</span>'; } },
          { h: 'ex.sat', cell: function (x) { var m = marks[x.id]; return m ? '<span class="num">' + m.n + '</span>' + (m.abs ? ' <span class="faint">+' + m.abs + ' ' + HS.esc(HS.t('att.absent')) + '</span>' : '') : '<span class="badge warn">' + HS.esc(HS.t('ex.pending')) + '</span>'; } },
          { h: 'ex.avg', cls: 'end', cell: function (x) { var m = marks[x.id]; return m && m.n ? '<b class="num">' + Math.round(m.sum * 100 / m.n / (x.maxScore || 1)) + '%</b>' : '–'; } }
        ], rows.slice(0, 300), { click: true, rowAttr: function (x) { return 'data-id="' + HS.esc(x.id) + '"'; } })
          : U.empty('star', HS.t('ex.none'), HS.t('ex.none.b'), HS.can('exams.manage') ? '<button class="btn primary" data-new>' + HS.icon('plus', 'sm') + HS.esc(HS.t('ex.new')) + '</button>' : '');
      }
      paint();
      root.addEventListener('input', HS.debounce(function (e) { if (e.target.dataset.f === 'q') { F.q = e.target.value; paint(); } }, 120));
      root.addEventListener('change', function (e) { var k = e.target.dataset.f; if (k && k !== 'q') { F[k] = e.target.value; paint(); } });
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-new]')) { editExam(null); return; }
        if (e.target.closest('[data-bank]')) { HS.qbank.open(); return; }
        var tr = e.target.closest('tr[data-id]'); if (tr) openSheet(tr.dataset.id);
      });
      root.addEventListener('keydown', function (e) { var tr = e.key === 'Enter' && e.target.closest('tr[data-id]'); if (tr) openSheet(tr.dataset.id); });
    }
  });
})();
