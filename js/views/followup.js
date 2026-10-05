/* Hessa - follow-up: the early-warning "call today" list, debts with polite reminders, and the WhatsApp sender that opens
   one chat at a time from the centre's own number (no bulk sending, so the number is never banned). Every call or
   message is logged as a follow-up, which lowers the student's risk score for two weeks. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var TABS = ['calls', 'debts', 'messages'];

  function opt(v, l, cur) { return '<option value="' + HS.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + HS.esc(l) + '</option>'; }
  function canMessage() { return HS.can('messages.send') && HS.can('contacts.view'); }
  function dots(last) { return '<span class="att-dots" title="' + HS.esc(HS.t('fu.last6')) + '">' + (last || []).map(function (s) { return '<i class="' + s + '"></i>'; }).join('') + '</span>'; }

  /* ---------- log a call result ---------- */
  function callDialog(st, done) {
    var el = HS.dialog({ title: HS.t('fu.callResult', { name: st.name }), body:
      (st.parentMobile && HS.can('contacts.view') ? '<a class="btn primary xl" href="tel:' + HS.esc(st.parentMobile) + '">' + HS.icon('chat') + HS.esc(HS.t('fu.callNow')) + ' ' + U.bdi(st.parentMobile) + '</a>' : '') +
      '<div class="field"><span class="lbl">' + HS.esc(HS.t('fu.outcome')) + '</span><div class="seg wrap" role="group" data-out>' + ['reached', 'noAnswer', 'promised', 'leaving', 'other'].map(function (o, i) {
        return '<button type="button" data-v="' + o + '" aria-pressed="' + (i === 0) + '">' + HS.esc(HS.t('fu.out.' + o)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="fu-n">' + HS.esc(HS.t('fu.reason')) + '</label><textarea class="input" id="fu-n" rows="3"></textarea></div>',
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.icon('check', 'sm') + HS.esc(HS.t('fu.save')) + '</button>' });
    el.querySelector('[data-out]').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) b.parentNode.querySelectorAll('[data-v]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); });
    el.querySelector('[data-ok]').addEventListener('click', function (ev) {
      var out = el.querySelector('[data-out] [aria-pressed="true"]').dataset.v;
      U.run(HS.post('/api/c/followup', { studentId: st.id, type: 'call', reason: out, outcome: el.querySelector('#fu-n').value }), 'fu.saved', ev.currentTarget).then(function () { HS.overlay.close(); done(); }, function () {});
    });
  }

  /* ---------- the WhatsApp sender: one chat at a time, the person presses Send in WhatsApp ---------- */
  HS.waQueue = function (items, kind, done) {
    if (!items.length) { HS.toast(HS.t('wa.nobody'), 'bad'); return; }
    var i = 0, sent = 0, cur = null;
    var el = HS.dialog({ title: HS.t('wa.title', { kind: HS.t('wa.kind.' + kind) }), wide: true, body: '<div data-q></div>',
      footer: '<span class="grow faint" data-progress></span><button class="btn ghost" data-skip>' + HS.esc(HS.t('common.skip')) + '</button>' +
        '<button class="btn" data-copy>' + HS.icon('copy', 'sm') + HS.esc(HS.t('common.copy')) + '</button><button class="btn" data-sms>' + HS.esc(HS.t('wa.sms')) + '</button>' +
        '<button class="btn primary" data-open>' + HS.icon('chat', 'sm') + HS.esc(HS.t('wa.open')) + '</button>' });
    var box = el.querySelector('[data-q]');
    function show() {
      if (i >= items.length) {
        box.innerHTML = U.empty('check', HS.t('wa.done', { n: sent, m: items.length }), HS.t('wa.done.b'));
        el.querySelectorAll('[data-skip],[data-copy],[data-sms],[data-open]').forEach(function (b) { b.hidden = true; });
        el.querySelector('[data-progress]').textContent = ''; if (done) done(); return;
      }
      var it = items[i];
      el.querySelector('[data-progress]').textContent = HS.t('wa.progress', { n: i + 1, m: items.length });
      box.innerHTML = '<div class="meter big"><i style="width:' + Math.round(i * 100 / items.length) + '%"></i></div><div class="skeleton" style="height:6rem"></div>';
      HS.get('/api/c/wa?studentId=' + encodeURIComponent(it.id) + '&kind=' + kind + '&lang=' + HS.lang + (it.amount ? '&amount=' + it.amount : '')).then(function (r) {
        cur = r;
        box.innerHTML = '<div class="meter big"><i style="width:' + Math.round(i * 100 / items.length) + '%"></i></div>' +
          '<div class="stu-head"><span class="avatar sm">' + HS.esc(String(it.name || '?').charAt(0)) + '</span><div class="grow"><b>' + HS.esc(it.name) + '</b><span class="muted" style="display:block">' + (r.to ? U.bdi('+' + r.to) : HS.esc(HS.t('stu.noMobile'))) + '</span></div></div>' +
          '<textarea class="input wa-text" rows="5" data-text>' + HS.esc(r.text) + '</textarea>' +
          '<p class="faint">' + HS.esc(HS.t('wa.hint')) + '</p>';
        el.querySelector('[data-open]').disabled = el.querySelector('[data-sms]').disabled = !r.to;
      }, function (e) { cur = null; box.innerHTML = U.empty('alert', U.errorText(e)); });
    }
    function next() { i++; show(); }
    function log(type) { HS.post('/api/c/followup', { studentId: items[i].id, type: type, reason: kind }).catch(function () {}); sent++; }
    el.addEventListener('click', function (e) {
      var text = el.querySelector('[data-text]'), msg = text ? text.value : '';
      if (e.target.closest('[data-skip]')) { next(); return; }
      if (e.target.closest('[data-copy]') && text) { text.select(); try { navigator.clipboard ? navigator.clipboard.writeText(msg) : document.execCommand('copy'); } catch (er) { /* the text stays selected */ } HS.toast(HS.t('link.copied')); return; }
      if (e.target.closest('[data-open]') && cur && cur.to) { window.open('https://wa.me/' + cur.to + '?text=' + encodeURIComponent(msg), '_blank', 'noopener'); log('whatsapp'); next(); return; }
      if (e.target.closest('[data-sms]') && cur && cur.to) { location.href = 'sms:+' + cur.to + '?body=' + encodeURIComponent(msg); log('sms'); next(); }
    });
    show();
  };

  /* ---------- the tabs ---------- */
  var F = { teacher: '', level: '', tab: 'calls' };
  function callsHTML(list) {
    var rows = list.filter(function (r) { return (!F.teacher || r.teacherId === F.teacher) && (!F.level || r.level === F.level); });
    var seen = {}; rows = rows.filter(function (r) { if (seen[r.studentId]) return false; seen[r.studentId] = 1; return true; });   // one card per student (his worst group)
    if (!rows.length) return U.empty('check', HS.t('fu.allClear'), HS.t('fu.allClear.b'));
    var money = HS.can(['money.view', 'money.collect']);
    return '<div class="risk-grid">' + rows.map(function (r, i) {
      var s = r.student || {}, g = D.get('groups', r.groupId) || {};
      return '<article class="risk-card ' + r.level + (r.followed ? ' followed' : '') + '" style="--i:' + Math.min(i, 20) + '">' +
        '<div class="row"><span class="score"><b class="num">' + r.score + '</b><small>/100</small></span><div class="grow"><b class="ellipsis" style="display:block">' + HS.esc(s.name || '') + '</b>' +
          '<span class="muted ellipsis" style="display:block">' + HS.esc([g.name, D.teacherName(r.teacherId)].filter(Boolean).join(' · ')) + '</span></div>' + (r.followed ? '<span class="badge ok">' + HS.icon('check', 'sm') + HS.esc(HS.t('fu.followed')) + '</span>' : '') + '</div>' +
        '<div class="meter"><i style="width:' + r.score + '%"></i></div>' +
        '<div class="chip-row">' + (r.why || []).map(function (w) { return '<span class="badge ' + (r.level === 'high' ? 'bad' : 'warn') + '">' + HS.esc(HS.t(w)) + '</span>'; }).join('') + '</div>' +
        '<div class="row between">' + dots(r.last) + (money && r.balance < 0 ? '<span class="bal bad">' + U.money(-r.balance) + '<small>' + HS.esc(HS.t('door.owes')) + '</small></span>' : '') + '</div>' +
        '<div class="row wrap" style="gap:.4rem">' + (HS.can('followup.log') ? '<button class="btn sm primary" data-call="' + HS.esc(r.studentId) + '">' + HS.icon('chat', 'sm') + HS.esc(HS.t('fu.type.call')) + '</button>' : '') +
          (canMessage() ? '<button class="btn sm" data-wa1="' + HS.esc(r.studentId) + '">' + HS.esc(HS.t('fu.type.whatsapp')) + '</button>' : '') +
          '<button class="btn sm ghost" data-stu="' + HS.esc(r.studentId) + '">' + HS.esc(HS.t('door.file')) + '</button></div></article>';
    }).join('') + '</div>';
  }
  function debtsHTML(bal) {
    var rows = Object.keys(bal.students).filter(function (id) { return bal.students[id] < 0 && D.get('students', id); }).map(function (id) {
      return { s: D.get('students', id), owed: -bal.students[id], last: bal.lastPaid[id] };
    }).sort(function (a, b) { return b.owed - a.owed; });
    if (!rows.length) return U.empty('check', HS.t('fu.noDebts'), HS.t('fu.noDebts.b'));
    var total = rows.reduce(function (a, r) { return a + r.owed; }, 0);
    return '<div class="row wrap" style="margin-bottom:.8rem"><span class="badge bad">' + HS.esc(HS.t('stu.owing', { n: rows.length })) + ' ' + U.money(Math.round(total * 100) / 100) + '</span><span class="grow"></span>' +
        (canMessage() ? '<button class="btn primary" data-remind-all>' + HS.icon('chat', 'sm') + HS.esc(HS.t('fu.remindAll', { n: rows.length })) + '</button>' : '') + '</div>' +
      U.table([
        { h: 'f.code', cell: function (r) { return '<b class="num">' + U.bdi(r.s.code || '') + '</b>'; } },
        { h: 'f.name', cell: function (r) { return '<b>' + HS.esc(r.s.name) + '</b>'; } },
        { h: 'f.group', cell: function (r) { return '<span class="chip-row">' + D.list('enrollments').filter(function (e) { return e.studentId === r.s.id && (bal.enrollments[e.id] || {}).balance < 0; }).map(function (e) {
          return '<span class="chip">' + HS.esc(D.groupName(e.groupId)) + (bal.enrollments[e.id].left ? ' <small class="badge warn">' + HS.esc(HS.t('fu.leftGroup')) + '</small>' : '') + '</span>'; }).join('') + '</span>'; } },
        { h: 'fu.lastPaid', cell: function (r) { return r.last ? U.day(r.last) : '<span class="badge warn">' + HS.esc(HS.t('fu.never')) + '</span>'; } },
        { h: 'grp.owed', cls: 'end', cell: function (r) { return '<b class="neg">' + U.money(r.owed) + '</b>'; } },
        { h: 'f.action', cell: function (r) { return '<span class="row" style="gap:.3rem;justify-content:flex-end">' + (canMessage() ? '<button class="btn sm" data-remind="' + HS.esc(r.s.id) + '" data-amount="' + r.owed + '">' + HS.esc(HS.t('fu.remind')) + '</button>' : '') + '<button class="btn sm ghost" data-stu="' + HS.esc(r.s.id) + '">' + HS.esc(HS.t('door.file')) + '</button></span>'; } }
      ], rows);
  }
  function messagesHTML() {
    if (!canMessage()) return U.empty('lock', HS.t('fu.noMsgPerm'), HS.t('fu.noMsgPerm.b'));
    var groups = D.list('groups').filter(function (g) { return g.active !== false; });
    return '<section class="card stack"><p class="muted">' + HS.esc(HS.t('wa.intro')) + '</p>' +
      '<div class="grid cols-2"><div class="field"><label for="m-k">' + HS.esc(HS.t('wa.kindLabel')) + '</label><select class="input" id="m-k">' + ['absence', 'payment', 'report', 'exam', 'welcome'].map(function (k) { return opt(k, HS.t('wa.kind.' + k), 'absence'); }).join('') + '</select></div>' +
      '<div class="field"><label for="m-a">' + HS.esc(HS.t('wa.audience')) + '</label><select class="input" id="m-a">' + opt('absent', HS.t('wa.aud.absent'), '') + opt('risk', HS.t('wa.aud.risk'), '') +
        groups.map(function (g) { return opt('g:' + g.id, HS.t('wa.aud.group', { name: g.name }), ''); }).join('') + '</select></div></div>' +
      '<div class="tip">' + HS.icon('shield') + '<span>' + HS.esc(HS.t('wa.safe')) + '</span></div>' +
      '<div class="row"><span class="grow faint" data-count></span><button class="btn primary" data-start>' + HS.icon('chat', 'sm') + HS.esc(HS.t('wa.start')) + '</button></div>' +
      (HS.can('settings.edit') ? '<a href="#/settings?tab=messages" class="faint">' + HS.esc(HS.t('wa.templates')) + '</a>' : '') + '</section>';
  }
  // absence is computed by the server (it is never stored), so the absentee list comes from /api/c/absent
  function audience(key, risk, absent) {
    var ids = {};
    if (key === 'absent') return (absent || []).filter(function (a) { return !a.told; }).map(function (a) { return { id: a.studentId, name: a.name }; });
    if (key === 'risk') (risk || []).forEach(function (r) { if (!r.followed) ids[r.studentId] = 1; });
    else if (key.indexOf('g:') === 0) D.list('enrollments').forEach(function (e) { if (e.groupId === key.slice(2) && (e.status || 'active') === 'active') ids[e.studentId] = 1; });
    return Object.keys(ids).map(function (id) { return D.get('students', id); }).filter(Boolean).map(function (s) { return { id: s.id, name: s.name }; });
  }

  /* ---------- the page ---------- */
  var risk = null, bal = null, absent = null;
  HS.views.followup = HS.withData({
    render: function (ctx) {
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.tab && TABS.indexOf(q.tab) >= 0) F.tab = q.tab;
      var tabs = TABS.filter(function (t) { return t !== 'debts' || HS.can(['money.view', 'money.collect']); });
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.followup')) + '</h1><p>' + HS.esc(HS.t('page.followup.d')) + '</p></div></div>' +
        '<div class="tabs" role="tablist" style="margin-bottom:1rem">' + tabs.map(function (t) { return '<button role="tab" data-ftab="' + t + '" aria-selected="' + (t === F.tab) + '">' + HS.esc(HS.t('fu.tab.' + t)) + '</button>'; }).join('') + '</div>' +
        (F.tab === 'calls' ? '<div class="toolbar"><select class="input" data-f="teacher" style="width:auto">' + opt('', HS.t('f.teacherId') + ': ' + HS.t('common.all'), F.teacher) + D.list('teachers').map(function (t) { return opt(t.id, t.name, F.teacher); }).join('') + '</select>' +
          '<div class="seg" role="group">' + ['', 'high', 'medium'].map(function (l) { return '<button type="button" data-level="' + l + '" aria-pressed="' + (F.level === l) + '">' + HS.esc(HS.t('fu.level.' + (l || 'all'))) + '</button>'; }).join('') + '</div>' +
          '<span class="grow"></span><span class="faint">' + HS.esc(HS.t('fu.how')) + '</span></div>' : '') +
        '<div data-fpane><div class="skeleton" style="height:12rem"></div></div>';
    },
    mount: function (root) {
      var pane = root.querySelector('[data-fpane]');
      function paint() {
        if (F.tab === 'calls') {
          if (risk) pane.innerHTML = callsHTML(risk);
          HS.get('/api/c/risk').then(function (r) { risk = r; if (F.tab === 'calls' && root.isConnected !== false) pane.innerHTML = callsHTML(r); }, function (e) { pane.innerHTML = U.empty('alert', U.errorText(e)); });
        } else if (F.tab === 'debts') {
          HS.get('/api/c/balances').then(function (b) { bal = b; if (F.tab === 'debts') pane.innerHTML = debtsHTML(b); }, function (e) { pane.innerHTML = U.empty('alert', U.errorText(e)); });
        } else {
          pane.innerHTML = messagesHTML();
          var k = pane.querySelector('#m-a');
          if (k) { var count = function () { pane.querySelector('[data-count]').textContent = HS.t('wa.count', { n: audience(k.value, risk, absent).length }); }; k.addEventListener('change', count); count();
            if (!risk && HS.can('followup.view')) HS.get('/api/c/risk').then(function (r) { risk = r; count(); }, function () {});
            HS.get('/api/c/absent').then(function (r) { absent = r.rows; count(); }, function () { absent = []; }); }
        }
      }
      paint();
      root.addEventListener('change', function (e) { var k = e.target.dataset.f; if (k) { F[k] = e.target.value; if (risk) pane.innerHTML = callsHTML(risk); } });
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-ftab]'); if (t) { F.tab = t.dataset.ftab; HS.go('followup?tab=' + F.tab); return; }
        var lv = e.target.closest('[data-level]'); if (lv) { F.level = lv.dataset.level; root.querySelectorAll('[data-level]').forEach(function (b) { b.setAttribute('aria-pressed', b === lv); }); pane.innerHTML = callsHTML(risk || []); return; }
        var s = e.target.closest('[data-stu]'); if (s) { HS.openStudent(s.dataset.stu, 'follow'); return; }
        var c = e.target.closest('[data-call]'); if (c) { var st = D.get('students', c.dataset.call) || (risk.filter(function (r) { return r.studentId === c.dataset.call; })[0] || {}).student; if (st) callDialog(st, paint); return; }
        var w = e.target.closest('[data-wa1]'); if (w) { var x = D.get('students', w.dataset.wa1); if (x) HS.waQueue([{ id: x.id, name: x.name }], 'absence', paint); return; }
        var r = e.target.closest('[data-remind]'); if (r) { var y = D.get('students', r.dataset.remind); HS.waQueue([{ id: y.id, name: y.name, amount: r.dataset.amount }], 'payment', paint); return; }
        if (e.target.closest('[data-remind-all]') && bal) {
          HS.waQueue(Object.keys(bal.students).filter(function (id) { return bal.students[id] < 0 && D.get('students', id); }).map(function (id) { return { id: id, name: D.get('students', id).name, amount: -bal.students[id] }; }), 'payment', paint); return;
        }
        if (e.target.closest('[data-start]')) HS.waQueue(audience(pane.querySelector('#m-a').value, risk, absent), pane.querySelector('#m-k').value, null);
      });
    }
  });
  HS.on('data', function () { risk = null; bal = null; });
})();
