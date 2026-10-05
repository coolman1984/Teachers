/* Hessa - students: the list with filters, the student file (profile, groups, attendance, money, marks, follow-up),
   new/edit with grade-system-track rules, enrol / transfer / leave, call log, parent message and ID cards with QR. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'M3', 'S1', 'S2', 'S3'];
  var SYSTEMS = { P: ['general', 'azhar', 'language'], M: ['general', 'azhar', 'language'], S: ['thanaweya', 'bac', 'azhar'] };
  var TRACKS = { bac: ['med', 'eng', 'biz', 'arts'], thanaweya: ['science', 'math', 'literary'], azhar: ['scientific', 'literary'] };
  var PAGE = 150;

  /* ---------- shared bits ---------- */
  function opts(list, prefix, cur, blank) {
    return (blank ? '<option value="">' + HS.esc(blank) + '</option>' : '') + list.map(function (v) {
      return '<option value="' + HS.esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + HS.esc(prefix ? HS.t(prefix + v) : v) + '</option>'; }).join('');
  }
  function enrolmentsOf(id) { return D.list('enrollments').filter(function (e) { return e.studentId === id && (e.status || 'active') === 'active'; }); }
  function chips(id) {
    return enrolmentsOf(id).map(function (e) { var g = D.get('groups', e.groupId); return g ? '<span class="chip" style="--c:' + U.groupTone(g) + '">' + HS.esc(g.name) + '</span>' : ''; }).join('');
  }
  HS.studentText = function (s) { return [s.code, s.name, HS.can('contacts.view') ? s.parentMobile : '', s.school].join(' '); };

  /* ---------- the list ---------- */
  var F = { q: '', grade: '', group: '', teacher: '', only: '', limit: PAGE };
  var money = null, risky = null;   // filled from the server: balances and the risk list
  function filtered() {
    var n = U.key(F.q), byGroup = F.group ? {} : null, byTeacher = F.teacher ? {} : null;
    if (byGroup || byTeacher) D.list('enrollments').forEach(function (e) {
      if ((e.status || 'active') !== 'active') return;
      if (byGroup && e.groupId === F.group) byGroup[e.studentId] = 1;
      if (byTeacher && e.teacherId === F.teacher) byTeacher[e.studentId] = 1;
    });
    return D.list('students').filter(function (s) {
      if (F.grade && s.gradeCode !== F.grade) return false;
      if (byGroup && !byGroup[s.id]) return false;
      if (byTeacher && !byTeacher[s.id]) return false;
      if (F.only === 'debt' && !(money && money.students[s.id] < 0)) return false;
      if (F.only === 'risk' && !(risky && risky[s.id])) return false;
      if (F.only === 'parent' && s.parentMobile) return false;
      if (F.only === 'inactive' ? s.active !== false : s.active === false && F.only !== 'all') return false;
      return !n || U.key(HS.studentText(s)).indexOf(n) >= 0;
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
  }
  function table(rows) {
    if (!rows.length) return U.empty('users', HS.t(D.list('students').length ? 'stu.none.filter' : 'stu.none'), HS.t(D.list('students').length ? 'stu.none.filter.b' : 'stu.none.b'),
      !D.list('students').length && HS.can('students.manage') ? '<a class="btn primary" href="#/students/import">' + HS.icon('upload', 'sm') + HS.esc(HS.t('ov.act.import')) + '</a>' : '');
    var cols = [
      { h: 'f.code', cell: function (s) { return '<b class="num">' + U.bdi(s.code || '') + '</b>'; } },
      { h: 'f.name', cell: function (s) { return '<span class="row" style="gap:.5rem">' + (risky && risky[s.id] ? '<span class="trust ' + (risky[s.id] === 'high' ? 'red' : 'yellow') + '" title="' + HS.esc(HS.t('ov.risk')) + '"></span>' : '') + '<b>' + HS.esc(s.name) + '</b></span>'; } },
      { h: 'f.gradeCode', cell: function (s) { return '<span class="muted">' + U.grade(s.gradeCode, s.system, s.track) + '</span>'; } },
      { h: 'f.group', cell: function (s) { return '<span class="chip-row">' + chips(s.id) + '</span>'; } }
    ];
    if (HS.can('contacts.view')) cols.push({ h: 'f.parentMobile', cell: function (s) { return s.parentMobile ? U.bdi(s.parentMobile) : '<span class="badge warn">' + HS.esc(HS.t('stu.noMobile')) + '</span>'; } });
    if (money) cols.push({ h: 'stu.balance', cls: 'end', cell: function (s) { var b = money.students[s.id]; return b === undefined ? '<span class="faint">–</span>' : U.money(b); } });
    return U.table(cols, rows.slice(0, F.limit), { click: true, rowAttr: function (s) { return 'data-id="' + HS.esc(s.id) + '"'; } }) +
      (rows.length > F.limit ? '<div class="row" style="justify-content:center;margin-top:.8rem"><button class="btn" data-more>' + HS.esc(HS.t('stu.more', { n: rows.length - F.limit })) + '</button></div>' : '');
  }
  function summary(rows) {
    var debt = 0, owing = 0;
    if (money) rows.forEach(function (s) { var b = money.students[s.id]; if (b < 0) { debt -= b; owing++; } });
    return '<div class="row wrap" style="gap:.5rem;margin-bottom:.9rem"><span class="badge">' + HS.esc(HS.t('stu.count')) + ' <b class="num">' + HS.fmt.num(rows.length) + '</b></span>' +
      (money ? '<button class="badge bad" data-only="debt" style="border:0;cursor:pointer" aria-pressed="' + (F.only === 'debt') + '">' + HS.esc(HS.t('stu.owing', { n: owing })) + ' ' + U.money(debt) + '</button>' : '') +
      (risky ? '<button class="badge warn" data-only="risk" style="border:0;cursor:pointer" aria-pressed="' + (F.only === 'risk') + '">' + HS.esc(HS.t('stu.atRisk', { n: Object.keys(risky).length })) + '</button>' : '') + '</div>';
  }

  /* ---------- the form ---------- */
  function formHTML(s) {
    var stage = String(s.gradeCode || 'S1').charAt(0), sys = SYSTEMS[stage] || [], tracks = TRACKS[s.system] || [];
    var f = function (key, html, wide) { return '<div class="field' + (wide ? ' wide' : '') + '"><label for="sf-' + key + '">' + HS.esc(HS.t('f.' + key)) + '</label>' + html + '</div>'; };
    var inp = function (key, type, extra) { return '<input class="input" id="sf-' + key + '" name="' + key + '" type="' + (type || 'text') + '" value="' + HS.esc(s[key] === undefined || s[key] === null ? '' : s[key]) + '"' + (extra || '') + '>'; };
    var contacts = HS.can('contacts.view');
    return '<form class="grid cols-2 form-grid" data-sform autocomplete="off">' +
      f('name', inp('name', 'text', ' required'), true) +
      f('gradeCode', '<select class="input" id="sf-gradeCode" name="gradeCode">' + opts(GRADES, 'grade.', s.gradeCode) + '</select>') +
      f('system', '<select class="input" id="sf-system" name="system">' + opts(sys, 'system.', s.system, '–') + '</select>') +
      f('track', '<select class="input" id="sf-track" name="track"' + (tracks.length && !(s.system === 'bac' && s.gradeCode === 'S1') ? '' : ' disabled') + '>' + opts(tracks, 'track.', s.track, '–') + '</select>') +
      f('gender', '<select class="input" id="sf-gender" name="gender">' + opts(['m', 'f'], 'gender.', s.gender, '–') + '</select>') +
      f('school', inp('school')) +
      (contacts ? f('mobile', inp('mobile', 'tel', ' dir="ltr" inputmode="tel"')) + f('parentName', inp('parentName')) +
        f('parentMobile', inp('parentMobile', 'tel', ' dir="ltr" inputmode="tel"')) + f('parentMobile2', inp('parentMobile2', 'tel', ' dir="ltr" inputmode="tel"')) : '') +
      (HS.can('students.discount') ? f('discountPct', inp('discountPct', 'number', ' min="0" max="100" dir="ltr"')) + f('discountReason', inp('discountReason')) +
        '<div class="field"><div class="row"><span class="switch"><input type="checkbox" id="sf-exempt" name="exempt"' + (s.exempt ? ' checked' : '') + '><span></span></span><label for="sf-exempt">' + HS.esc(HS.t('f.exempt')) + '</label></div></div>' : '') +
      '<div class="field wide"><div class="row"><span class="switch"><input type="checkbox" id="sf-consent" name="consent"' + (s.consent ? ' checked' : '') + '><span></span></span><label for="sf-consent">' + HS.esc(HS.t('f.consent')) + '</label></div><span class="help">' + HS.esc(HS.t('stu.consent.help')) + '</span></div>' +
      f('notes', '<textarea class="input" id="sf-notes" name="notes" rows="2">' + HS.esc(s.notes || '') + '</textarea>', true) +
      '<div class="field"><div class="row"><span class="switch"><input type="checkbox" id="sf-active" name="active"' + (s.active !== false ? ' checked' : '') + '><span></span></span><label for="sf-active">' + HS.esc(HS.t('f.active')) + '</label></div></div>' +
      '<div class="tip bad wide" data-err hidden role="alert"></div></form>';
  }
  function wireForm(root) {
    var form = root.querySelector('[data-sform]'), g = form.querySelector('[name=gradeCode]'), sy = form.querySelector('[name=system]'), tr = form.querySelector('[name=track]');
    function sync() {
      var stage = g.value.charAt(0), list = SYSTEMS[stage] || [], cur = sy.value;
      sy.innerHTML = opts(list, 'system.', list.indexOf(cur) >= 0 ? cur : '', '–');
      var tracks = TRACKS[sy.value] || [], t = tr.value;
      tr.innerHTML = opts(tracks, 'track.', tracks.indexOf(t) >= 0 ? t : '', '–');
      tr.disabled = !tracks.length || (sy.value === 'bac' && g.value === 'S1');   // the first Baccalaureate year has no track
      if (tr.disabled) tr.value = '';
    }
    g.addEventListener('change', sync); sy.addEventListener('change', sync);
  }
  function readForm(root, cur) {
    var form = root.querySelector('[data-sform]'), row = Object.assign({}, cur || {});
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      row[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
    });
    if (row.consent && !(cur && cur.consent)) row.consentAt = U.today();
    if (!cur) row.joinedAt = U.today();
    delete row.id; delete row.ver;
    return row;
  }
  function editStudent(id) {
    var cur = id ? D.get('students', id) : null;
    if (!HS.can('students.manage')) return;
    HS.panel.open({ title: HS.t(cur ? 'stu.edit' : 'stu.new'), body: formHTML(cur || { gradeCode: 'S1', active: true }),
      footer: '<span class="grow faint">' + HS.esc(HS.t(cur ? 'stu.edit.hint' : 'stu.new.hint')) + '</span><button class="btn primary" data-save>' + HS.icon('check', 'sm') + HS.esc(HS.t('common.save')) + '</button>',
      mount: function (p) {
        wireForm(p);
        var name = p.querySelector('[name=name]'); setTimeout(function () { name.focus(); }, 50);
        function save() {
          var row = readForm(p, cur), err = p.querySelector('[data-err]');
          if (!row.name) { err.hidden = false; err.textContent = HS.t('form.missing', { f: HS.t('f.name') }); name.focus(); return; }
          var newId = id || D.newId('st');
          U.run(D.save('students', newId, row, (cur ? 'Edit student ' : 'New student ') + row.name), 'common.saved', p.querySelector('[data-save]')).then(function () {
            HS.panel.close();
            if (!cur) setTimeout(function () { openStudent(newId, 'groups'); }, 280); else refresh();
          }, function (e) { err.hidden = false; err.textContent = U.errorText(e); });
        }
        p.querySelector('[data-save]').addEventListener('click', save);
        p.querySelector('[data-sform]').addEventListener('submit', function (e) { e.preventDefault(); save(); });
      } });
  }
  HS.editStudent = editStudent;

  /* ---------- the student file ---------- */
  var TABS = ['profile', 'groups', 'attendance', 'money', 'marks', 'follow'];
  // assistants record attendance and marks without seeing money (product spec, roles table)
  function seesMoney() { return HS.can(['money.view', 'money.collect', 'door.use']); }
  function tabs() { return TABS.filter(function (t) { return t !== 'money' || seesMoney(); }); }
  function kv(k, v) { return '<dt>' + HS.esc(HS.t(k)) + '</dt><dd>' + (v === '' || v === null || v === undefined ? '<span class="faint">–</span>' : v) + '</dd>'; }
  function tabBody(tab, f) {
    var s = f.student;
    if (tab === 'profile') {
      return '<dl class="kv">' + kv('f.code', '<b class="num">' + U.bdi(s.code || '') + '</b>') + kv('f.gradeCode', U.grade(s.gradeCode, s.system, s.track)) + kv('f.school', HS.esc(s.school || '')) +
        (HS.can('contacts.view') ? kv('f.mobile', s.mobile ? U.bdi(s.mobile) : '') + kv('f.parentName', HS.esc(s.parentName || '')) + kv('f.parentMobile', s.parentMobile ? U.bdi(s.parentMobile) : '') : '') +
        kv('f.discountPct', s.discountPct ? U.pct(s.discountPct) + ' ' + HS.esc(s.discountReason || '') : '') + kv('f.exempt', s.exempt ? '<span class="badge ok">' + HS.esc(HS.t('door.exempt')) + '</span>' : '') +
        kv('f.consent', s.consent ? '<span class="badge ok">' + HS.icon('check', 'sm') + U.day(s.consentAt) + '</span>' : '<span class="badge warn">' + HS.esc(HS.t('stu.noConsent')) + '</span>') +
        kv('stu.joined', U.day(s.joinedAt)) + kv('f.notes', HS.esc(s.notes || '')) + '</dl>' +
        (f.family.length ? '<section><h3 class="sec">' + HS.esc(HS.t('stu.family')) + '</h3><div class="chip-row">' + f.family.map(function (x) { return '<button class="chip" data-open="' + HS.esc(x.id) + '">' + HS.esc(x.name) + ' ' + U.bdi(x.code || '') + '</button>'; }).join('') + '</div></section>' : '');
    }
    if (tab === 'groups') {
      var act = f.enrollments.filter(function (e) { return (e.status || 'active') === 'active'; }), old = f.enrollments.filter(function (e) { return (e.status || 'active') !== 'active'; });
      return (act.length ? '<ul class="money-rows">' + act.map(function (e) {
        var m = e.money || {}, g = D.get('groups', e.groupId) || {};
        return '<li><div class="grow"><b>' + HS.esc(g.name || e.groupId) + '</b><span class="muted">' + HS.esc(D.teacherName(g.teacherId)) + ' · ' + HS.esc(HS.t('fee.' + (m.feeType || g.feeType || 'session'))) +
          ' · ' + HS.esc(HS.t('stu.since', { d: U.day(e.from).replace(/<[^>]+>/g, '') })) + ' · ' + HS.esc(HS.t('stu.held', { n: e.held || 0 })) + '</span></div>' +
          (seesMoney() ? '<span class="bal ' + ((m.balance || 0) < 0 ? 'bad' : 'ok') + '">' + U.money(Math.abs(m.balance || 0)) + '<small>' + HS.esc(HS.t((m.balance || 0) < 0 ? 'door.owes' : 'door.credit')) + '</small></span>' : '') +
          (HS.can('students.transfer') ? '<span class="row" style="gap:.3rem"><button class="btn sm" data-transfer="' + HS.esc(e.id) + '">' + HS.esc(HS.t('stu.transfer')) + '</button><button class="btn sm ghost" data-leave="' + HS.esc(e.id) + '">' + HS.esc(HS.t('stu.leave')) + '</button></span>' : '') + '</li>';
      }).join('') + '</ul>' : U.empty('layers', HS.t('door.noGroups'), HS.t('stu.enrol.b'))) +
        (HS.can('students.manage') ? '<button class="btn primary" data-enrol>' + HS.icon('plus', 'sm') + HS.esc(HS.t('stu.enrol')) + '</button>' : '') +
        (old.length ? '<section><h3 class="sec">' + HS.esc(HS.t('stu.history')) + '</h3><ul class="notes">' + old.map(function (e) { return '<li>' + HS.esc(D.groupName(e.groupId)) + ' · ' + HS.esc(HS.t('enr.' + e.status)) + ' ' + U.day(e.to) + '</li>'; }).join('') + '</ul></section>' : '');
    }
    if (tab === 'attendance') {
      var a = f.attendance, pres = a.filter(function (x) { return x.status === 'present' || x.status === 'late'; }).length;
      if (!a.length) return U.empty('clock', HS.t('stu.noAtt'), '');
      return '<div class="row wrap"><span class="badge ok">' + HS.esc(HS.t('stu.rate', { p: a.length ? Math.round(pres * 100 / a.length) : 0 })) + '</span><span class="faint">' + HS.esc(HS.t('stu.sessions', { n: a.length })) + '</span></div>' +
        '<div class="att-dots" aria-hidden="true">' + a.slice(0, 40).reverse().map(function (x) { return '<i class="' + x.status + '" title="' + HS.esc(x.date + ' · ' + HS.t('att.' + x.status)) + '"></i>'; }).join('') + '</div>' +
        U.table([{ h: 'f.date', cell: function (x) { return U.day(x.date) + ' <span class="faint num">' + U.bdi(x.at || '') + '</span>'; } }, { h: 'f.group', cell: function (x) { return HS.esc(D.groupName(x.groupId)) + (x.makeup ? ' <span class="badge info">' + HS.esc(HS.t('door.makeup')) + '</span>' : ''); } },
          { h: 'f.status', cell: function (x) { return U.att(x.status); } }], a.slice(0, 60));
    }
    if (tab === 'money') {
      return '<div class="row wrap">' + (HS.can('money.collect') ? '<a class="btn primary sm" href="#/door">' + HS.icon('sheet', 'sm') + HS.esc(HS.t('door.pay')) + '</a>' : '') +
          (f.wallet ? '<span class="badge info">' + HS.esc(HS.t('door.wallet')) + ' ' + U.money(f.wallet) + '</span>' : '') + '</div>' +
        (f.payments.length ? U.table([{ h: 'f.no', cell: function (p) { return '<b class="num">' + U.bdi(p.no || '') + '</b>' + (p.voidOf ? ' <span class="badge bad">' + HS.esc(HS.t('money.reversal')) + '</span>' : ''); } },
          { h: 'f.date', cell: function (p) { return U.day(p.date); } }, { h: 'f.what', cell: function (p) { return HS.esc(HS.t('pay.kind.' + p.kind)) + (p.groupId ? ' · ' + HS.esc(D.groupName(p.groupId)) : ''); } },
          { h: 'pay.method', cell: function (p) { return HS.esc(HS.t('pay.method.' + p.method)); } }, { h: 'pay.amount', cls: 'end', cell: function (p) { return U.money(p.amount); } }], f.payments.slice(0, 80))
          : U.empty('sheet', HS.t('stu.noPay'), ''));
    }
    if (tab === 'marks') {
      if (!f.marks.length) return U.empty('star', HS.t('stu.noMarks'), '');
      var pts = f.marks.filter(function (m) { return !m.absent && m.score !== null && m.maxScore; }).map(function (m) { return Math.round(m.score * 100 / m.maxScore); });
      return (pts.length > 1 ? '<div class="spark">' + U.spark(pts) + '<span class="muted">' + HS.esc(HS.t('stu.avg', { p: Math.round(pts.reduce(function (a, b) { return a + b; }, 0) / pts.length) })) + '</span></div>' : '') +
        U.table([{ h: 'f.exam', cell: function (m) { return '<b>' + HS.esc(m.title) + '</b> <span class="faint">' + HS.esc(HS.t('exam.kind.' + m.kind)) + '</span>'; } }, { h: 'f.date', cell: function (m) { return U.day(m.date); } },
          { h: 'f.score', cell: function (m) { return m.absent ? U.att('absent') : '<b class="num">' + HS.fmt.num(m.score) + '</b><span class="faint num"> / ' + HS.fmt.num(m.maxScore) + '</span>'; } },
          { h: 'f.rank', cell: function (m) { return m.rank ? HS.esc(HS.t('stu.rank', { r: m.rank, n: m.of })) : '–'; } }], f.marks.slice().reverse());
    }
    // follow-up
    return riskBlock(f.risk) + (HS.can('followup.log') ? '<form class="stack" data-fu style="gap:.6rem"><div class="seg wrap" role="group" data-futype>' + ['call', 'whatsapp', 'meeting', 'note'].map(function (t, i) {
        return '<button type="button" data-t="' + t + '" aria-pressed="' + (i === 0) + '">' + HS.esc(HS.t('fu.type.' + t)) + '</button>'; }).join('') + '</div>' +
        '<input class="input" name="reason" placeholder="' + HS.esc(HS.t('fu.reason')) + '"><select class="input" name="outcome">' + opts(['reached', 'noAnswer', 'promised', 'leaving', 'other'], 'fu.out.', '', HS.t('fu.outcome')) + '</select>' +
        '<button class="btn primary" type="submit">' + HS.icon('check', 'sm') + HS.esc(HS.t('fu.save')) + '</button></form>' : '') +
      (f.followups.length ? '<ol class="timeline">' + f.followups.map(function (x) {
        return HS.followupItem(x);
      }).join('') + '</ol>' : '<p class="muted">' + HS.esc(HS.t('fu.none')) + '</p>');
  }
  // reason: an outcome code from this form, or the message kind of a WhatsApp send (absence, payment...)
  HS.followupItem = function (x) {
    var r = x.reason || '', label = HS.has('fu.out.' + r) ? HS.t('fu.out.' + r) : HS.has('wa.kind.' + r) ? HS.t('wa.kind.' + r) : r;
    return '<li><b>' + HS.esc(HS.t('fu.type.' + (x.type || 'call'))) + '</b> <span class="faint">' + U.day(x.date) + ' · ' + HS.esc(x.by || '') + '</span>' +
      (label ? ' <span class="badge">' + HS.esc(label) + '</span>' : '') + (x.outcome ? '<p class="muted">' + HS.esc(x.outcome) + '</p>' : '') + '</li>';
  };
  function riskBlock(r) {
    if (!r || !r.score) return '<div class="tip">' + HS.icon('check') + '<span>' + HS.esc(HS.t('fu.noRisk')) + '</span></div>';
    return '<div class="tip ' + (r.score >= 60 ? 'bad' : 'warn') + '">' + HS.icon('bell') + '<span><b class="num">' + r.score + '</b> / 100 · ' + (r.why || []).map(function (w) { return HS.esc(HS.t(w)); }).join(' · ') + '</span></div>';
  }
  function fileHTML(f, tab) {
    var s = f.student, total = f.enrollments.reduce(function (a, e) { return a + ((e.money || {}).balance || 0); }, 0);
    return '<div class="stu-head"><span class="avatar">' + HS.esc(String(s.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('')) + '</span><div class="grow">' +
        '<div class="row wrap" style="gap:.4rem"><span class="badge signal num">' + U.bdi(s.code || '') + '</span><span class="badge">' + U.grade(s.gradeCode, s.system, s.track) + '</span>' +
        (s.active === false ? '<span class="badge bad">' + HS.esc(HS.t('f.inactive')) + '</span>' : '') + '</div></div>' +
        (seesMoney() ? '<span class="bal ' + (total < 0 ? 'bad' : 'ok') + '">' + U.money(Math.abs(total)) + '<small>' + HS.esc(HS.t(total < 0 ? 'door.owes' : 'door.credit')) + '</small></span>' : '') + '</div>' +
      '<div class="tabs" role="tablist">' + tabs().map(function (t) { return '<button role="tab" data-tab="' + t + '" aria-selected="' + (t === tab) + '">' + HS.esc(HS.t('stu.tab.' + t)) + '</button>'; }).join('') + '</div>' +
      '<div class="stack" data-tabbody>' + tabBody(tab, f) + '</div>';
  }
  function footer(s) {
    return (HS.can('students.manage') ? '<button class="btn" data-edit>' + HS.icon('settings', 'sm') + HS.esc(HS.t('stu.edit')) + '</button>' : '') +
      '<button class="btn" data-card>' + HS.icon('printer', 'sm') + HS.esc(HS.t('stu.card')) + '</button>' +
      (HS.can('messages.send') && HS.can('contacts.view') && s.parentMobile ? '<button class="btn" data-wa>' + HS.icon('chat', 'sm') + HS.esc(HS.t('door.message')) + '</button>' : '');
  }
  function openStudent(id, tab) {
    HS.get('/api/c/student?id=' + encodeURIComponent(id)).then(function (f) {
      tab = tab || 'profile';
      HS.panel.open({ title: f.student.name, body: '<div class="stack" data-file>' + fileHTML(f, tab) + '</div>', footer: footer(f.student),
        mount: function (p) {
          function reload(t) { return HS.get('/api/c/student?id=' + encodeURIComponent(id)).then(function (nf) { f = nf; tab = t || tab; p.querySelector('[data-file]').innerHTML = fileHTML(f, tab); }); }
          p.addEventListener('click', function (e) {
            var t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; p.querySelector('[data-file]').innerHTML = fileHTML(f, tab); return; }
            var o = e.target.closest('[data-open]'); if (o) { openStudent(o.dataset.open); return; }
            if (e.target.closest('[data-edit]')) { editStudent(id); return; }
            if (e.target.closest('[data-card]')) { HS.printCards([f.student]); return; }
            if (e.target.closest('[data-wa]')) { HS.get('/api/c/wa?studentId=' + encodeURIComponent(id) + '&kind=monthly&lang=' + HS.lang).then(function (r) { if (r.to) window.open('https://wa.me/' + r.to + '?text=' + encodeURIComponent(r.text), '_blank', 'noopener'); }, function (er) { HS.toast(U.errorText(er), 'bad'); }); return; }
            if (e.target.closest('[data-enrol]')) { pickGroup(f.student, null, function (gid) { return HS.post('/api/c/enroll', { studentId: id, groupId: gid }); }, function () { reload('groups'); }); return; }
            var tr = e.target.closest('[data-transfer]');
            if (tr) { pickGroup(f.student, tr.dataset.transfer, function (gid) { return HS.post('/api/c/transfer', { enrollmentId: tr.dataset.transfer, groupId: gid }); }, function () { reload('groups'); }); return; }
            var lv = e.target.closest('[data-leave]');
            if (lv) U.confirm({ title: HS.t('stu.leave'), body: HS.t('stu.leave.b'), reason: HS.t('stu.reason'), danger: true, ok: HS.t('stu.leave') }).then(function (reason) {
              if (reason) U.run(HS.post('/api/c/leave', { enrollmentId: lv.dataset.leave, reason: reason }), 'common.saved').then(function () { D.load(); reload('groups'); });
            });
            var ft = e.target.closest('[data-t]'); if (ft) { ft.parentNode.querySelectorAll('[data-t]').forEach(function (b) { b.setAttribute('aria-pressed', b === ft); }); }
          });
          p.addEventListener('submit', function (e) {
            var form = e.target.closest('[data-fu]'); if (!form) return; e.preventDefault();
            var type = (form.querySelector('[data-t][aria-pressed="true"]') || {}).dataset.t || 'call';
            // the server keeps "reason" as a short code (40 chars) and "outcome" as the free text (400 chars)
            U.run(HS.post('/api/c/followup', { studentId: id, type: type, reason: form.outcome.value, outcome: form.reason.value }), 'fu.saved', form.querySelector('[type=submit]')).then(function () { reload('follow'); });
          });
        } });
    }, function (e) { HS.toast(U.errorText(e), 'bad', 5000); });
  }
  HS.openStudent = openStudent;

  /* ---------- choose a group (enrol / transfer): same grade first, seats left, timetable ---------- */
  function slotsText(g) {
    return (g.slots || []).map(function (s) { return HS.t('day.' + s.day) + ' ' + s.start; }).join(' · ');
  }
  function pickGroup(student, fromEnrolment, call, done) {
    var counts = {};
    D.list('enrollments').forEach(function (e) { if ((e.status || 'active') === 'active') counts[e.groupId] = (counts[e.groupId] || 0) + 1; });
    var mine = {}; enrolmentsOf(student.id).forEach(function (e) { mine[e.groupId] = 1; });
    var from = fromEnrolment ? D.get('enrollments', fromEnrolment) : null, fromG = from ? D.get('groups', from.groupId) : null;
    var list = D.list('groups').filter(function (g) { return g.active !== false && !mine[g.id] && (!fromG || g.subjectId === fromG.subjectId); })
      .sort(function (a, b) { return (a.gradeCode !== student.gradeCode) - (b.gradeCode !== student.gradeCode) || String(a.name).localeCompare(String(b.name), HS.lang); });
    var el = HS.dialog({ title: HS.t(from ? 'stu.transfer' : 'stu.enrol') + ' · ' + student.name, wide: true, body:
      '<input class="input" data-gq placeholder="' + HS.esc(HS.t('grp.search')) + '">' +
      '<ul class="pick-list" data-gl>' + list.map(function (g) {
        var n = counts[g.id] || 0, cap = Number(g.capacity) || 0, full = cap && n >= cap;
        return '<li><button class="pick' + (g.gradeCode === student.gradeCode ? ' match' : '') + '" data-g="' + HS.esc(g.id) + '"' + (full ? ' disabled' : '') + ' data-k="' + HS.esc(U.key(g.name + ' ' + D.teacherName(g.teacherId))) + '">' +
          '<span class="now-bar" style="--c:' + U.groupTone(g) + '"></span><div class="grow"><b>' + HS.esc(g.name) + '</b><span class="muted">' + HS.esc([D.teacherName(g.teacherId), D.subjectName(g.subjectId), HS.t('grade.' + g.gradeCode)].filter(Boolean).join(' · ')) + '</span>' +
          '<span class="faint">' + HS.esc(slotsText(g)) + '</span></div><span class="seat' + (full ? ' bad' : cap && n / cap > .85 ? ' warn' : '') + '"><b class="num">' + HS.fmt.num(n) + '</b><span class="num">/' + HS.fmt.num(cap || 0) + '</span><small>' + HS.esc(HS.t(full ? 'grp.full' : 'grp.seats')) + '</small></span></button></li>';
      }).join('') + '</ul>' + (list.length ? '' : U.empty('layers', HS.t('grp.none'), '')) });
    el.querySelector('[data-gq]').addEventListener('input', function (e) { var n = U.key(e.target.value); el.querySelectorAll('[data-k]').forEach(function (b) { b.parentNode.hidden = n && b.dataset.k.indexOf(n) < 0; }); });
    el.querySelector('[data-gl]').addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return;
      U.run(call(b.dataset.g), 'common.saved', b).then(function () { HS.overlay.close(); return D.load(); }).then(done, function () {});
    });
  }

  /* ---------- the page ---------- */
  function refresh() { HS.rerender(); }
  HS.views.students = HS.withData({
    render: function (ctx) {
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.missing === 'parent') F.only = 'parent';
      var groups = D.list('groups').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
      var scoped = HS.me && HS.me.scopes && HS.me.scopes.length;
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.students')) + '</h1><p>' + HS.esc(HS.t('page.students.d')) + '</p></div>' +
          (HS.can('students.manage') ? '<a class="btn" href="#/students/import">' + HS.icon('upload', 'sm') + HS.esc(HS.t('ov.act.import')) + '</a><button class="btn primary" data-new>' + HS.icon('plus', 'sm') + HS.esc(HS.t('stu.new')) + ' <i class="kbd">N</i></button>' : '') + '</div>' +
        '<div class="toolbar"><input class="input" type="search" data-f="q" value="' + HS.esc(F.q) + '" placeholder="' + HS.esc(HS.t('stu.search')) + '" style="max-width:22rem">' +
          '<select class="input" data-f="grade" style="width:auto">' + opts(GRADES, 'grade.', F.grade, HS.t('f.gradeCode') + ': ' + HS.t('common.all')) + '</select>' +
          '<select class="input" data-f="group" style="width:auto;max-width:16rem"><option value="">' + HS.esc(HS.t('f.group') + ': ' + HS.t('common.all')) + '</option>' + groups.map(function (g) { return '<option value="' + HS.esc(g.id) + '"' + (F.group === g.id ? ' selected' : '') + '>' + HS.esc(g.name) + '</option>'; }).join('') + '</select>' +
          (scoped ? '' : '<select class="input" data-f="teacher" style="width:auto"><option value="">' + HS.esc(HS.t('f.teacherId') + ': ' + HS.t('common.all')) + '</option>' + D.list('teachers').map(function (t) { return '<option value="' + HS.esc(t.id) + '"' + (F.teacher === t.id ? ' selected' : '') + '>' + HS.esc(t.name) + '</option>'; }).join('') + '</select>') +
          '<select class="input" data-f="only" style="width:auto">' + ['', 'debt', 'risk', 'parent', 'inactive', 'all'].map(function (k) { return '<option value="' + k + '"' + (F.only === k ? ' selected' : '') + '>' + HS.esc(HS.t('stu.only.' + (k || 'active'))) + '</option>'; }).join('') + '</select>' +
          '<span class="grow"></span><button class="btn" data-cards title="' + HS.esc(HS.t('stu.cards.b')) + '">' + HS.icon('printer', 'sm') + HS.esc(HS.t('stu.cards')) + '</button></div>' +
        '<div data-sum></div><div data-rows></div>';
    },
    mount: function (root, ctx) {
      function paint() { var rows = filtered(); root.querySelector('[data-sum]').innerHTML = summary(rows); root.querySelector('[data-rows]').innerHTML = table(rows); }
      paint();
      if (HS.can(['money.view', 'money.collect', 'followup.view']) && !money) HS.get('/api/c/balances').then(function (r) { money = r; if (root.isConnected !== false) paint(); }, function () {});
      if (HS.can('followup.view') && !risky) HS.get('/api/c/risk').then(function (r) { risky = {}; r.forEach(function (x) { if (!risky[x.studentId] || x.level === 'high') risky[x.studentId] = x.level; }); if (root.isConnected !== false) paint(); }, function () {});
      root.addEventListener('input', HS.debounce(function (e) { if (e.target.dataset.f === 'q') { F.q = e.target.value; F.limit = PAGE; paint(); } }, 120));
      root.addEventListener('change', function (e) { var k = e.target.dataset.f; if (k && k !== 'q') { F[k] = e.target.value; F.limit = PAGE; paint(); } });
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-new]')) { editStudent(null); return; }
        if (e.target.closest('[data-more]')) { F.limit += PAGE * 2; paint(); return; }
        var only = e.target.closest('[data-only]'); if (only) { F.only = F.only === only.dataset.only ? '' : only.dataset.only; root.querySelector('[data-f="only"]').value = F.only; paint(); return; }
        if (e.target.closest('[data-cards]')) { HS.printCards(filtered().slice(0, 200)); return; }
        var tr = e.target.closest('tr[data-id]'); if (tr) openStudent(tr.dataset.id);
      });
      root.addEventListener('keydown', function (e) { var tr = e.key === 'Enter' && e.target.closest('tr[data-id]'); if (tr) openStudent(tr.dataset.id); });
      if (ctx.route.q.id) openStudent(ctx.route.q.id);
      if (ctx.route.q.new && HS.can('students.manage')) editStudent(null);
    }
  });
  HS.on('data', function () { money = null; risky = null; });   // fresh balances after any change
})();
