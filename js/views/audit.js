/* Hessa - the permanent history made readable: one place that turns a history entry (who, when, what, before -> after) into
   words a centre owner understands, in both languages. Used by the Activity log, the "history of this record" panel and the
   conflict screen, so every screen says the same thing in the same way. Nothing here changes data. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var A = HS.audit = {};

  var HIDDEN = { nameKey: 1, familyKey: 1, portalHash: 1, portalNonce: 1, importKey: 1 };        // derived or secret: never shown to people
  var SKIP = { id: 1, ver: 1, deleted: 1, created_at: 1, created_by: 1, updated_at: 1, updated_by: 1 };
  var OPAQUE = { feeHistory: 1, tempSlots: 1, slots: 1, questions: 1, choices: 1, answerKey: 1, answers: 1, detail: 1 };   // lists: said in one sentence
  var MONEY = { amount: 1, fee: 1, price: 1, cost: 1, costPerHour: 1, rentMonth: 1, rentSession: 1, rentStudent: 1, openingCash: 1, expectedCash: 1,
    countedCash: 1, diff: 1, revenue: 1, centerShare: 1, teacherShare: 1, deductions: 1, paid: 1 };
  var PHONE = { mobile: 1, parentMobile: 1, parentMobile2: 1 };
  var IDS = { teacherId: 'teachers', subjectId: 'subjects', roomId: 'rooms', groupId: 'groups', studentId: 'students', materialId: 'materials', examId: 'exams',
    sessionId: 'sessions', groupIds: 'groups', subjectIds: 'subjects' };
  var FAMILY = { gradeCode: 'grade.', gradeCodes: 'grade.', feeType: 'fee.', method: 'pay.method.', category: 'exp.cat.', system: 'system.', track: 'track.' };
  var BY_ENTITY = { groups: { kind: 'kind.' }, payments: { kind: 'pay.kind.' }, expenses: { kind: 'pay.kind.' }, exams: { kind: 'exam.kind.' }, attendance: { status: 'att.' } };
  var HIDDEN_MARK = '•••';

  A.entity = function (e) { var k = 'ent.' + e; return HS.has(k) ? HS.t(k) : String(e || ''); };
  A.field = function (f) { var k = 'fld.' + f; return HS.has(k) ? HS.t(k) : String(f); };
  A.opLabel = function (op) { var k = 'act.op.' + op; return HS.has(k) ? HS.t(k) : String(op || ''); };
  A.parse = function (s) {
    if (s && typeof s === 'object') return s;
    try { var v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  };
  function sentence(row) { return String(row.name || row.title || row.no || row.code || ''); }

  /* the name of the thing an entry is about: from the entry itself, else from the record as it is now */
  A.name = function (r) {
    var after = A.parse(r.after), before = A.parse(r.before);
    var n = sentence(after || {}) || sentence(before || {});
    if (!n && D && D.get) n = sentence(D.get(r.entity, r.entity_id) || {});
    return n;
  };

  function plainOne(entity, field, v) {
    if (v === HIDDEN_MARK) return HIDDEN_MARK;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') return HS.t(v ? 'common.yes' : 'common.no');
    if (IDS[field] && typeof v === 'string') {
      var r = D && D.get ? D.get(IDS[field], v) : null;
      return r ? sentence(r) || HS.t('dev.unknown') : HS.t('dev.unknown');
    }
    var fam = (BY_ENTITY[entity] || {})[field] || FAMILY[field];
    if (fam && typeof v === 'string' && HS.has(fam + v)) return HS.t(fam + v);
    if (typeof v === 'number') return HS.fmt.num(v);
    return String(v);
  }
  /* plain text of one value (the spreadsheet and the screen reader use this) */
  A.text = function (entity, field, v, full) {       // full: show lists as they are (a person deciding between two versions needs to see them)
    if (OPAQUE[field] && !full) return HS.t('act.opaque');
    if (Array.isArray(v)) {
      if (!v.length) return '';
      if (v.every(function (x) { return x === null || typeof x !== 'object'; })) return v.map(function (x) { return plainOne(entity, field, x); }).join(', ');
      return full ? JSON.stringify(v) : HS.t('act.items', { n: HS.fmt.num(v.length) });
    }
    if (v && typeof v === 'object') return JSON.stringify(v);
    return plainOne(entity, field, v);
  };
  /* the same value for the screen: HTML, already escaped */
  A.html = function (entity, field, v) {
    var t = A.text(entity, field, v);
    if (t === HIDDEN_MARK) return '<span class="badge" title="' + HS.esc(HS.t('act.hidden')) + '">' + HS.icon('lock', 'sm') + HS.esc(HS.t('act.hidden.s')) + '</span>';
    if (t === '') return '<span class="faint">' + HS.esc(HS.t('dev.empty')) + '</span>';
    if (MONEY[field] && !isNaN(Number(v))) return U.money(v);
    if (PHONE[field]) return U.bdi(t);                     // a number reads left to right and never breaks in the middle
    return HS.esc(t);
  };

  /* [{ f, label, from, to, opaque }] - what a history entry says happened */
  A.rows = function (r) {
    var out = [], changes = A.parse(r.changes) || {}, i;
    function add(f, from, to) { if (!HIDDEN[f] && !SKIP[f]) out.push({ f: f, label: A.field(f), from: from, to: to, opaque: !!OPAQUE[f] }); }
    if (r.op === 'update') {
      Object.keys(changes).forEach(function (f) { var c = changes[f]; add(f, Array.isArray(c) ? c[0] : undefined, Array.isArray(c) ? c[1] : c); });
    } else {
      var row = A.parse(r.op === 'delete' ? r.before : r.after) || {};
      Object.keys(row).forEach(function (f) {
        var v = row[f];
        if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length) || v === false) return;     // an empty field says nothing
        add(f, r.op === 'delete' ? v : undefined, r.op === 'delete' ? undefined : v);
      });
    }
    for (i = 0; i < out.length; i++) out[i].order = i;
    return out;
  };

  /* one line saying what happened, e.g. "Changed: Name, Parent mobile (+2 more)" */
  A.summary = function (r, rows) {
    rows = rows || A.rows(r);
    if (r.op === 'insert') return HS.t('act.sum.added');
    if (r.op === 'delete') return HS.t('act.sum.deleted');
    if (!rows.length) return '';
    var shown = rows.slice(0, 3).map(function (x) { return x.label; }).join(HS.lang === 'ar' ? '، ' : ', ');
    if (rows.length > 3) shown += ' ' + HS.t('act.sum.more', { n: HS.fmt.num(rows.length - 3) });
    return HS.t('act.sum.changed', { fields: shown });
  };

  /* the before/after table of an entry (HTML) */
  A.detailHTML = function (r, rows) {
    rows = rows || A.rows(r);
    if (!rows.length) return '';
    var one = r.op === 'update' ? null : r.op;       // insert and delete have a single column of values
    var head = '<th>' + HS.esc(HS.t('act.col.field')) + '</th>' + (one ? '<th>' + HS.esc(HS.t('act.col.value')) + '</th>' :
      '<th>' + HS.esc(HS.t('act.col.before')) + '</th><th>' + HS.esc(HS.t('act.col.after')) + '</th>');
    return '<div class="table-wrap"><table class="tbl log-diff"><thead><tr>' + head + '</tr></thead><tbody>' + rows.map(function (x) {
      if (x.opaque) return '<tr><td>' + HS.esc(x.label) + '</td><td colspan="' + (one ? 1 : 2) + '" class="faint">' + HS.esc(HS.t('act.opaque')) + '</td></tr>';
      return '<tr><td>' + HS.esc(x.label) + '</td>' + (one ? '<td>' + A.html(r.entity, x.f, one === 'delete' ? x.from : x.to) + '</td>' :
        '<td class="was">' + A.html(r.entity, x.f, x.from) + '</td><td class="now">' + A.html(r.entity, x.f, x.to) + '</td>') + '</tr>';
    }).join('') + '</tbody></table></div>';
  };

  /* plain-text lines of an entry: "Parent mobile: 010… → 011…" (spreadsheet export) */
  A.lines = function (r) {
    return A.rows(r).map(function (x) {
      if (x.opaque) return x.label + ': ' + HS.t('act.opaque');
      var a = A.text(r.entity, x.f, x.from), b = A.text(r.entity, x.f, x.to);
      return x.label + ': ' + (r.op === 'update' ? (a || HS.t('dev.empty')) + ' → ' + (b || HS.t('dev.empty')) : (r.op === 'delete' ? a : b));
    });
  };

  /* ---------- one entry of the history, the same everywhere ---------- */
  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  var HISTORY = { students: 1, teachers: 1, groups: 1, rooms: 1, subjects: 1, materials: 1, exams: 1, enrollments: 1, sessions: 1, settings: 0 };
  /* opts: { hist: show the link "history of this record", undo: show "undo this change" when it can be undone } */
  A.entryHTML = function (r, opts) {
    opts = opts || {};
    var rows = A.rows(r), name = A.name(r), sum = A.summary(r, rows), detail = A.detailHTML(r, rows);
    var kind = r.kind === 'restore' || r.kind === 'imported' ? ' <span class="badge info">' + HS.esc(HS.t('act.kind.' + r.kind)) + '</span>' : '';
    var actions = (opts.hist && HISTORY[r.entity] && r.entity_id ? '<button type="button" class="btn ghost sm" data-hist="' + HS.esc(r.entity + '|' + r.entity_id) + '">' + HS.icon('activity', 'sm') + HS.esc(HS.t('hist.link')) + '</button>' : '') +
      (opts.undo && A.undoFields(r).length ? '<button type="button" class="btn sm" data-undo="' + HS.esc(String(r.id)) + '">' + HS.icon('refresh', 'sm') + HS.esc(HS.t('hist.undo')) + '</button>' : '');
    return '<li class="log-row"><div class="log-head"><span class="badge ' + A.opTone(r.op) + '">' + HS.esc(A.opLabel(r.op)) + '</span><b>' + HS.esc(A.entity(r.entity)) + '</b>' +
      (name ? '<span class="log-name">' + HS.esc(short(name, 60)) + '</span>' : '') + kind + '<span class="grow"></span><time class="faint num">' + HS.esc(A.when(r.ts)) + '</time></div>' +
      '<div class="log-sub faint">' + HS.esc(r.label || '') + ' · ' + HS.esc(r.user || '') + ' · ' + HS.esc(r.node_name || '') + '</div>' +
      (detail ? '<details class="log-more"><summary>' + HS.esc(sum) + '</summary>' + detail + '</details>' : sum ? '<div class="log-sum">' + HS.esc(sum) + '</div>' : '') +
      (actions ? '<div class="row wrap" style="margin-top:.3rem">' + actions + '</div>' : '') + '</li>';
  };

  /* ---------- undo a change: the earlier values are saved again as a NEW change (nothing is ever removed from the history) ---------- */
  var UNDO = {
    students: 'name gradeCode system track school gender mobile parentName parentMobile parentMobile2 discountPct discountReason exempt active notes joinedAt',
    teachers: 'name mobile subjectIds gradeCodes settleModel rentMonth rentSession rentStudent centerPct color bio active notes',
    rooms: 'name capacity costPerHour active notes', subjects: 'name nameEn color order active', materials: 'name price cost active',
    groups: 'name subjectId gradeCode system track roomId capacity color active notes kind startDate endDate'
  };   // codes, money, fee history and timetables are changed by their own screens, which keep their rules
  var UNDO_PERM = { students: 'students.manage', teachers: 'teachers.manage', rooms: 'rooms.manage', subjects: 'rooms.manage', groups: 'groups.manage', materials: 'materials.manage' };
  var DISCOUNT = { discountPct: 1, discountReason: 1, exempt: 1 };
  A.undoFields = function (r) {
    if (r.op !== 'update' || !UNDO[r.entity] || !HS.can(UNDO_PERM[r.entity]) || !(D && D.get && D.get(r.entity, r.entity_id))) return [];
    var allowed = UNDO[r.entity].split(' ');
    return A.rows(r).filter(function (x) {
      return !x.opaque && allowed.indexOf(x.f) >= 0 && x.from !== HIDDEN_MARK && x.to !== HIDDEN_MARK && (!DISCOUNT[x.f] || HS.can('students.discount'));
    });
  };
  function same(a, b) { var e = function (v) { return v === undefined || v === '' ? null : v; }; return JSON.stringify(e(a)) === JSON.stringify(e(b)); }
  A.undo = function (r) {
    var fields = A.undoFields(r), cur = D.get(r.entity, r.entity_id);
    if (!fields.length || !cur) return Promise.resolve(false);
    var again = fields.some(function (x) { return !same(cur[x.f], x.to); });
    var list = '<ul class="steps">' + fields.map(function (x) {
      return '<li>' + HS.t('hist.undo.line', { f: A.field(x.f), now: A.text(r.entity, x.f, cur[x.f]) || HS.t('dev.empty'), was: A.text(r.entity, x.f, x.from) || HS.t('dev.empty') }) + '</li>'; }).join('') + '</ul>';
    return U.confirm({ title: HS.t('hist.undo.title'), ok: HS.t('hist.undo'),
      bodyHtml: '<p>' + HS.esc(HS.t('hist.undo.body')) + '</p>' + list + (again ? '<p class="tip warn">' + HS.esc(HS.t('hist.undo.again')) + '</p>' : '') }).then(function (yes) {
      if (!yes) return false;
      var row = {}; Object.keys(cur).forEach(function (k) { row[k] = cur[k]; });
      fields.forEach(function (x) { if (x.from === undefined || x.from === null) delete row[x.f]; else row[x.f] = x.from; });
      return U.run(D.save(r.entity, r.entity_id, row, HS.t('hist.label')), 'hist.undo.done').then(function () { return true; });
    });
  };

  /* ---------- the history of one record, in any panel ---------- */
  A.history = function (host, entity, id, after) {
    host.innerHTML = '<div class="skeleton" style="height:8rem"></div>';
    var rows = [];
    if (!host._wired) {
      host._wired = true;
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-undo]'); if (!b) return;
        var r = rows.filter(function (x) { return String(x.id) === b.dataset.undo; })[0];
        if (r) A.undo(r).then(function (done) { if (done) { if (after) after(); A.history(host, entity, id, after); } }, function () { /* the toast says why */ });
      });
    }
    return HS.get('/api/audit?limit=100&entity=' + encodeURIComponent(entity) + '&id=' + encodeURIComponent(id)).then(function (r) {
      if (!host.isConnected) return;
      rows = r.rows || [];
      host.innerHTML = !rows.length ? U.empty('activity', HS.t('hist.none'), HS.t('hist.none.b')) :
        '<ol class="log-list">' + rows.map(function (x) { return A.entryHTML(x, { undo: true }); }).join('') + '</ol>' +
        (r.total > rows.length ? '<p class="faint" style="margin-top:.8rem">' + HS.esc(HS.t('hist.more', { n: HS.fmt.num(rows.length) })) + '</p>' : '') +
        '<p class="faint" style="margin-top:.8rem">' + HS.icon('lock', 'sm') + ' ' + HS.esc(HS.t('act.kept')) + '</p>';
    }, function (e) { host.innerHTML = U.empty('lock', HS.t('common.error'), U.errorText(e)); });
  };
  A.historyDialog = function (entity, id) {
    var el = HS.dialog({ title: HS.t('hist.title'), body: '<div data-hist-host></div>', footer: '<button class="btn" data-close>' + HS.esc(HS.t('common.close')) + '</button>' });
    return A.history(el.querySelector('[data-hist-host]'), entity, id, function () { HS.rerender && HS.rerender(); });
  };

  A.when = function (ts) { return String(ts || '').replace('T', ' ').slice(0, 16); };
  A.opTone = function (op) { return op === 'delete' ? 'bad' : op === 'insert' ? 'ok' : 'info'; };
})();
