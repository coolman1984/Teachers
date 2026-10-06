/* Hessa - money: my cash shift (live summary, receipts with reversal, closing with a banknote counter and a printed
   report), other income (handouts, money in advance, other), expenses, all receipts by date with totals and CSV export,
   every shift, and handout stock. Receipts and expenses are never edited or deleted: a reversing record is added. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var TABS = ['shift', 'receipts', 'expenses', 'shifts', 'handouts'];
  var CATS = ['rent', 'salary', 'utilities', 'printing', 'supplies', 'marketing', 'maintenance', 'teacher_payout', 'handover', 'other'];
  var METHODS = ['cash', 'vodafone', 'instapay', 'fawry', 'card', 'bank'];
  var NOTES = [200, 100, 50, 20, 10, 5, 1, 0.5];

  function opt(v, l, cur) { return '<option value="' + HS.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + HS.esc(l) + '</option>'; }
  function seg(name, list, cur, prefix) {
    return '<div class="seg wrap" role="group" data-seg="' + name + '">' + list.map(function (x) { return '<button type="button" data-v="' + x + '" aria-pressed="' + (x === cur) + '">' + HS.esc(HS.t(prefix + x)) + '</button>'; }).join('') + '</div>';
  }
  function segValue(root, name) { var b = root.querySelector('[data-seg="' + name + '"] [aria-pressed="true"]'); return b ? b.dataset.v : ''; }
  function wireSegs(root) {
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-seg] [data-v]'); if (!b) return; b.parentNode.querySelectorAll('[data-v]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); root.dispatchEvent(new Event('change')); });
  }
  function stName(id) { var s = D.get('students', id); return s ? s.name : ''; }
  function kpi(label, value, tone) { return '<div class="' + (tone || '') + '"><small>' + HS.esc(HS.t(label)) + '</small><b>' + value + '</b></div>'; }

  /* ---------- receipts table (shift and receipts tabs) ---------- */
  function receiptsTable(rows, withVoid) {
    var voided = {}; rows.forEach(function (p) { if (p.voidOf) voided[p.voidOf] = 1; });
    return U.table([
      { h: 'f.no', cell: function (p) { return '<b class="num">' + U.bdi(p.no || '') + '</b>' + (p.voidOf ? ' <span class="badge bad">' + HS.esc(HS.t('money.reversal')) + '</span>' : voided[p.id] ? ' <span class="badge">' + HS.esc(HS.t('money.reversed')) + '</span>' : ''); } },
      { h: 'f.time', cell: function (p) { return U.day(p.date) + ' <span class="faint num">' + U.bdi(p.at || '') + '</span>'; } },
      { h: 'f.name', cell: function (p) { return HS.esc(stName(p.studentId) || '–'); } },
      { h: 'f.what', cell: function (p) { return HS.esc(HS.t('pay.kind.' + p.kind)) + (p.groupId ? ' · <span class="muted">' + HS.esc(D.groupName(p.groupId)) + '</span>' : p.materialId ? ' · <span class="muted">' + HS.esc(D.name('materials', p.materialId)) + ' ×' + (p.qty || 1) + '</span>' : ''); } },
      { h: 'pay.method', cell: function (p) { return HS.esc(HS.t('pay.method.' + p.method)) + (p.ref ? ' <span class="faint">' + U.bdi(p.ref) + '</span>' : ''); } },
      { h: 'pay.amount', cls: 'end', cell: function (p) { return U.money(p.amount); } },
      { h: 'f.user', cell: function (p) { return '<span class="muted">' + HS.esc(p.by || '') + '</span>'; } },
      { h: 'f.action', cell: function (p) {
        return '<span class="row" style="gap:.3rem;justify-content:flex-end"><button class="icon-btn" data-printr="' + HS.esc(p.id) + '" title="' + HS.esc(HS.t('receipt.print')) + '">' + HS.icon('printer', 'sm') + '</button>' +
          (withVoid && HS.can('money.void') && !p.voidOf && !voided[p.id] ? '<button class="btn sm ghost" data-void="' + HS.esc(p.id) + '">' + HS.esc(HS.t('money.void')) + '</button>' : '') + '</span>'; } }
    ], rows);
  }
  function byMethod(rows) {
    var m = {}; rows.forEach(function (p) { var k = p.method || 'cash'; m[k] = (m[k] || 0) + (Number(p.amount) || 0); });
    return '<div class="chip-row">' + Object.keys(m).map(function (k) { return '<span class="badge">' + HS.esc(HS.t('pay.method.' + k)) + ' ' + U.money(Math.round(m[k] * 100) / 100) + '</span>'; }).join('') + '</div>';
  }
  function voidReceipt(id, done, again) {
    U.confirm({ title: HS.t('money.void'), bodyHtml: (again ? '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('void.vague')) + '</span></div>' : '') +
      '<p>' + HS.esc(HS.t('money.void.b')) + '</p><p class="faint">' + HS.icon('shield', 'sm') + ' ' + HS.esc(HS.t('void.watched')) + '</p>', reason: HS.t('void.reason'), danger: true, ok: HS.t('money.void') }).then(function (reason) {
      if (!reason) return;
      // "خطأ" or "غلط" tells the owner nothing: ask for what was wrong before the receipt leaves the books
      if (String(reason).replace(/\s+/g, ' ').trim().length < 8) { voidReceipt(id, done, true); return; }
      U.run(HS.post('/api/c/void', { id: id, reason: reason }), 'money.voided').then(done, function () {});
    });
  }

  /* ---------- other income: handout, money in advance, other ---------- */
  function studentPicker(holder, onPick) {
    holder.innerHTML = '<input class="input" data-sq placeholder="' + HS.esc(HS.t('door.search')) + '" autocomplete="off"><ul class="door-results" data-sr></ul><input type="hidden" data-sid>';
    var q = holder.querySelector('[data-sq]'), ul = holder.querySelector('[data-sr]'), list = [];
    q.addEventListener('input', HS.debounce(function () {
      if (q.value.trim().length < 2) { ul.innerHTML = ''; return; }
      HS.get('/api/c/find?q=' + encodeURIComponent(q.value.trim())).then(function (r) {
        list = r; ul.innerHTML = r.slice(0, 6).map(function (s, i) { return '<li data-i="' + i + '"><b>' + HS.esc(s.name) + '</b> <span class="badge num">' + U.bdi(s.code || '') + '</span></li>'; }).join('');
      });
    }, 160));
    ul.addEventListener('click', function (e) { var li = e.target.closest('[data-i]'); if (!li) return; var s = list[Number(li.dataset.i)]; holder.querySelector('[data-sid]').value = s.id; q.value = s.name + ' · ' + s.code; ul.innerHTML = ''; if (onPick) onPick(s); });
  }
  // opts.student {id, name, code}: opened from the door card, the student is fixed and his teachers' handouts come first
  function incomeDialog(done, kind, opts) {
    opts = opts || {};
    HS.ensureShift().then(function () {
      var mats = D.list('materials').filter(function (m) { return m.active !== false; }), who = opts.student;
      if (who && opts.teacherIds) {
        var mine = function (m) { return !m.teacherId || opts.teacherIds.indexOf(m.teacherId) >= 0 ? 0 : 1; };
        mats = mats.filter(function (m) { return HS.can('materials.manage') || !mine(m); }).sort(function (a, b) { return mine(a) - mine(b) || (a.gradeCode === who.gradeCode ? -1 : b.gradeCode === who.gradeCode ? 1 : 0); });
      }
      var kinds = who ? ['material', 'wallet_topup'] : ['material', 'wallet_topup', 'other'];
      var payKey = D.newId('');   // one key per dialog: Save pressed again after a lost answer returns the same receipt
      var el = HS.dialog({ title: HS.t(who ? (kind === 'wallet_topup' ? 'door.topup' : 'door.sell') : 'money.income'), body:
        '<div class="field"><span class="lbl">' + HS.esc(HS.t('money.kind')) + '</span>' + seg('kind', kinds, kind || (mats.length ? 'material' : 'other'), 'pay.kind.') + '</div>' +
        (who ? '' : '<div class="tip">' + HS.icon('info') + '<span>' + HS.t('money.feesAtDoor', { link: { html: '<a href="#/door" data-close>' + HS.esc(HS.t('nav.door')) + '</a>' } }) + '</span></div>') +
        (who ? '<div class="stu-head"><span class="avatar sm">' + HS.esc(String(who.name || '?').charAt(0)) + '</span><div class="grow"><b>' + HS.esc(who.name) + '</b> <span class="badge num">' + U.bdi(who.code || '') + '</span></div></div><div hidden data-picker></div>'
          : '<div class="field"><span class="lbl">' + HS.esc(HS.t('f.name')) + ' <span class="faint" data-optional>(' + HS.esc(HS.t('money.optional')) + ')</span></span><div data-picker></div></div>') +
        '<div class="grid cols-2" data-mat>' + (mats.length ? '<div class="field"><label for="in-m">' + HS.esc(HS.t('money.handout')) + '</label><select class="input" id="in-m">' + mats.map(function (m) { return opt(m.id, m.name + ' (' + (m.stock || 0) + ')', ''); }).join('') + '</select><span class="help" data-stock></span></div>'
          : '<p class="muted" style="grid-column:1/-1">' + HS.esc(HS.t('door.noHandouts')) + '</p><select hidden id="in-m"></select>') +
          '<div class="field"><label for="in-q">' + HS.esc(HS.t('money.qty')) + '</label><input class="input" id="in-q" type="number" min="1" value="1" dir="ltr"></div></div>' +
        '<div class="field"><label for="in-a">' + HS.esc(HS.t('pay.amount')) + '</label><input class="input big-num" id="in-a" type="number" min="0" step="any" dir="ltr"></div>' +
        '<div class="field"><span class="lbl">' + HS.esc(HS.t('pay.method')) + '</span>' + seg('method', METHODS.slice(0, 4), 'cash', 'pay.method.') + '</div>' +
        '<div class="field"><label for="in-n">' + HS.esc(HS.t('f.notes')) + '</label><input class="input" id="in-n"></div><div class="tip bad" data-err hidden></div>',
        footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.icon('check', 'sm') + HS.esc(HS.t('pay.save')) + '</button>' });
      studentPicker(el.querySelector('[data-picker]'));
      if (who) el.querySelector('[data-sid]').value = who.id;
      wireSegs(el);
      function sync() {
        var k = segValue(el, 'kind'), m = D.get('materials', el.querySelector('#in-m').value), opt = el.querySelector('[data-optional]'), stock = el.querySelector('[data-stock]');
        el.querySelector('[data-mat]').hidden = k !== 'material';
        if (opt) opt.hidden = k === 'wallet_topup';
        if (stock) { var left = m ? Number(m.stock) || 0 : 0; stock.textContent = m ? HS.t('door.stockLeft', { n: left }) : ''; stock.className = 'help' + (m && left < (Number(el.querySelector('#in-q').value) || 1) ? ' neg' : ''); }
        if (k === 'material' && m) el.querySelector('#in-a').value = (Number(m.price) || 0) * (Number(el.querySelector('#in-q').value) || 1);
      }
      el.addEventListener('change', sync); el.querySelector('#in-q').addEventListener('input', sync); sync();
      el.querySelector('[data-close][href]') && el.querySelector('[data-close][href]').addEventListener('click', HS.overlay.close);
      el.querySelector('[data-ok]').addEventListener('click', function (ev) {
        var k = segValue(el, 'kind'), err = el.querySelector('[data-err]');
        var body = { kind: k, studentId: el.querySelector('[data-sid]').value || '', amount: el.querySelector('#in-a').value, method: segValue(el, 'method'), note: el.querySelector('#in-n').value, key: payKey };
        if (k === 'material') { body.materialId = el.querySelector('#in-m').value; body.qty = el.querySelector('#in-q').value; }
        var btn = ev.currentTarget; btn.disabled = true;
        HS.post('/api/c/pay', body).then(function (r) { HS.overlay.close(); HS.toast(HS.t('pay.done', { no: r.no })); if (who && HS.printReceipt && HS.prefs.data.autoReceipt === 'on') HS.printReceipt(r); done(r); },
          function (e) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(e); });
      });
    }, function () {});
  }
  HS.incomeDialog = incomeDialog;

  /* ---------- expenses ---------- */
  // preset: {category, teacherId, amount, note} - a teacher payout or a cash handover opens already filled in
  function expenseDialog(done, preset) {
    preset = preset || {};
    var cats = CATS.filter(function (c) { return c !== 'teacher_payout' || HS.can('settlements.manage'); }), cat0 = preset.category || 'other';
    var el = HS.dialog({ title: HS.t('money.expense'), body:
      '<div class="field"><label for="ex-c">' + HS.esc(HS.t('money.category')) + '</label><select class="input" id="ex-c">' + cats.map(function (c) { return opt(c, HS.t('exp.cat.' + c), cat0); }).join('') + '</select></div>' +
      '<div class="field" data-teacher' + (cat0 === 'teacher_payout' ? '' : ' hidden') + '><label for="ex-t">' + HS.esc(HS.t('f.teacherId')) + '</label><select class="input" id="ex-t">' + opt('', '–', '') + D.list('teachers').map(function (t) { return opt(t.id, t.name, preset.teacherId); }).join('') + '</select></div>' +
      '<div class="field"><label for="ex-a">' + HS.esc(HS.t('pay.amount')) + '</label><input class="input big-num" id="ex-a" type="number" min="0" step="any" dir="ltr" value="' + HS.esc(preset.amount || '') + '"></div>' +
      '<div class="field"><span class="lbl">' + HS.esc(HS.t('pay.method')) + '</span>' + seg('method', ['cash', 'vodafone', 'instapay', 'bank'], 'cash', 'pay.method.') + '</div>' +
      '<div class="field"><label for="ex-n">' + HS.esc(HS.t('f.notes')) + '</label><input class="input" id="ex-n" value="' + HS.esc(preset.note || '') + '"></div>' +
      '<div class="tip">' + HS.icon('lock') + '<span>' + HS.esc(HS.t('money.expense.b')) + '</span></div><div class="tip bad" data-err hidden></div>',
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.icon('check', 'sm') + HS.esc(HS.t('common.save')) + '</button>' });
    wireSegs(el);
    var cat = el.querySelector('#ex-c');
    cat.addEventListener('change', function () { el.querySelector('[data-teacher]').hidden = cat.value !== 'teacher_payout'; });
    el.querySelector('[data-ok]').addEventListener('click', function (ev) {
      var btn = ev.currentTarget, err = el.querySelector('[data-err]'), method = segValue(el, 'method');
      var go = method === 'cash' ? HS.ensureShift() : Promise.resolve();
      btn.disabled = true;
      go.then(function () {
        return HS.post('/api/c/expense', { category: cat.value, amount: el.querySelector('#ex-a').value, method: method, teacherId: el.querySelector('#ex-t').value, note: el.querySelector('#ex-n').value });
      }).then(function (r) { if (HS.overlay.isOpen) HS.overlay.close(); HS.toast(HS.t('money.expense.done', { no: r.no })); done(r); },
        function (e) { btn.disabled = false; if (e && e.message !== 'cancelled') { err.hidden = false; err.textContent = U.errorText(e); } });
    });
  }
  HS.expenseDialog = expenseDialog;

  /* ---------- closing the drawer: count the banknotes ---------- */
  function closeDialog(summary, done) {
    var expected = Number(summary.expected) || 0;
    var el = HS.dialog({ title: HS.t('shift.close'), wide: true, body:
      '<p class="muted">' + HS.esc(HS.t('shift.close.b')) + '</p>' +
      '<div class="notes-grid">' + NOTES.map(function (n) { return '<label class="note-cell"><span class="num">' + HS.fmt.num(n) + '</span><input class="input" type="number" min="0" inputmode="numeric" dir="ltr" data-note="' + n + '" placeholder="0"><small class="num" data-sub="' + n + '">0</small></label>'; }).join('') + '</div>' +
      '<div class="mini-kpis">' + kpi('shift.expected', U.money(expected)) + '<div><small>' + HS.esc(HS.t('shift.counted')) + '</small><b data-counted>' + U.money(0) + '</b></div><div data-diffbox><small>' + HS.esc(HS.t('shift.diff')) + '</small><b data-diff>' + U.money(-expected) + '</b></div></div>' +
      '<div class="field" data-reason><label for="cl-r">' + HS.esc(HS.t('shift.reason')) + '</label><input class="input" id="cl-r" placeholder="' + HS.esc(HS.t('shift.reason.p')) + '"></div><div class="tip bad" data-err hidden></div>',
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.icon('lock', 'sm') + HS.esc(HS.t('shift.close')) + '</button>' });
    var total = 0;
    function sum() {
      total = 0;
      el.querySelectorAll('[data-note]').forEach(function (i) { var n = Number(i.dataset.note), c = Math.max(0, Number(i.value) || 0); total += n * c; el.querySelector('[data-sub="' + i.dataset.note + '"]').textContent = HS.fmt.num(n * c); });
      total = Math.round(total * 100) / 100;
      var diff = Math.round((total - expected) * 100) / 100;
      el.querySelector('[data-counted]').innerHTML = U.money(total);
      el.querySelector('[data-diff]').innerHTML = U.money(diff);
      el.querySelector('[data-diffbox]').className = diff === 0 ? 'ok' : 'bad';
      el.querySelector('[data-reason]').hidden = diff === 0;
    }
    el.addEventListener('input', sum); sum();
    el.querySelector('[data-note]').focus();
    el.querySelector('[data-ok]').addEventListener('click', function (ev) {
      var btn = ev.currentTarget, err = el.querySelector('[data-err]');
      btn.disabled = true;
      HS.post('/api/c/shift/close', { shiftId: summary.shift.id, counted: total, reason: el.querySelector('#cl-r').value }).then(function (r) {
        HS.overlay.close(); HS.toast(HS.t('shift.closed'));
        if (HS.printShift) HS.printShift(summary, r);
        done(r);
      }, function (e) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(e); el.querySelector('#cl-r').focus(); });
    });
  }

  /* ---------- tabs ---------- */
  function shiftTab(pane) {
    pane.innerHTML = '<div class="skeleton" style="height:12rem"></div>';
    HS.get('/api/c/shift').then(function (s) {
      if (!s.shift || s.shift.status !== 'open') {
        pane.innerHTML = '<section class="card">' + U.empty('lock', HS.t('shift.none'), HS.t('shift.none.b'),
          HS.can(['money.collect', 'expenses.add']) ? '<button class="btn primary" data-openshift>' + HS.icon('lock', 'sm') + HS.esc(HS.t('shift.open')) + '</button>' : '') + '</section>';
        return;
      }
      var pays = s.payments.slice().reverse();
      pane.innerHTML = '<section class="card shift-card"><header><span class="tile-ic">' + HS.icon('lock') + '</span><h3>' + HS.esc(HS.t('shift.mine', { no: s.shift.no })) + '</h3>' +
          '<span class="faint">' + HS.esc(HS.t('shift.since', { t: U.dt(s.shift.openedAt).replace(/<[^>]+>/g, '') })) + '</span></header>' +
          '<div class="mini-kpis">' + kpi('shift.opening', U.money(s.shift.openingCash)) + kpi('shift.cashIn', U.money(s.cashIn), 'ok') + kpi('shift.cashOut', U.money(s.cashOut)) +
            kpi('shift.expected', '<span class="big">' + U.money(s.expected) + '</span>', 'signal') + kpi('shift.receipts', HS.fmt.num(s.receipts) + (s.voids ? ' <span class="faint">(' + HS.esc(HS.t('shift.voids', { n: s.voids })) + ')</span>' : '')) + '</div>' +
          byMethod(s.payments) +
          '<div class="row wrap" style="margin-top:.4rem">' + (HS.can('money.collect') ? '<a class="btn primary" href="#/door">' + HS.icon('board', 'sm') + HS.esc(HS.t('money.fees')) + '</a><button class="btn" data-income>' + HS.icon('plus', 'sm') + HS.esc(HS.t('money.income')) + '</button>' : '') +
            (HS.can('expenses.add') ? '<button class="btn" data-expense>' + HS.icon('doc', 'sm') + HS.esc(HS.t('money.expense')) + '</button><button class="btn" data-handover>' + HS.icon('upload', 'sm') + HS.esc(HS.t('money.handover')) + '</button>' : '') +
            '<span class="grow"></span>' + (HS.can(['shifts.close', 'shifts.manage']) ? '<button class="btn danger" data-close-shift>' + HS.icon('lock', 'sm') + HS.esc(HS.t('shift.close')) + '</button>' : '') + '</div></section>' +
        '<section class="card" style="margin-top:var(--gap)"><header><h3>' + HS.esc(HS.t('shift.list')) + '</h3></header>' + (pays.length ? receiptsTable(pays, true) : U.empty('sheet', HS.t('shift.noReceipts'), '')) + '</section>' +
        (s.expenseRows.length ? '<section class="card" style="margin-top:var(--gap)"><header><h3>' + HS.esc(HS.t('money.tab.expenses')) + '</h3></header>' + expensesTable(s.expenseRows) + '</section>' : '');
      pane._summary = s;
    }, function (e) { pane.innerHTML = U.empty('alert', U.errorText(e)); });
  }
  function expensesTable(rows) {
    var voided = {}; rows.forEach(function (x) { if (x.voidOf) voided[x.voidOf] = 1; });
    return U.table([
      { h: 'f.no', cell: function (x) { return '<b class="num">' + U.bdi(x.no || '') + '</b>' + (x.voidOf ? ' <span class="badge bad">' + HS.esc(HS.t('money.reversal')) + '</span>' : voided[x.id] ? ' <span class="badge">' + HS.esc(HS.t('money.reversed')) + '</span>' : ''); } },
      { h: 'f.date', cell: function (x) { return U.day(x.date); } },
      { h: 'money.category', cell: function (x) { return HS.esc(HS.t('exp.cat.' + x.category)) + (x.teacherId ? ' · <span class="muted">' + HS.esc(D.teacherName(x.teacherId)) + '</span>' : ''); } },
      { h: 'f.notes', cell: function (x) { return '<span class="muted">' + HS.esc(x.note || '') + '</span>'; } },
      { h: 'pay.method', cell: function (x) { return HS.esc(HS.t('pay.method.' + x.method)); } },
      { h: 'pay.amount', cls: 'end', cell: function (x) { return U.money(x.amount); } },
      { h: 'f.action', cell: function (x) { return HS.can('money.void') && !x.voidOf && !voided[x.id] ? '<button class="btn sm ghost" data-evoid="' + HS.esc(x.id) + '">' + HS.esc(HS.t('money.void')) + '</button>' : ''; } }
    ], rows);
  }
  var R = { from: null, to: null, method: '', q: '' };
  function rangeOf(k) {
    var n = new Date(), iso = function (d) { return d.getFullYear() + '-' + HS.fmt.pad(d.getMonth() + 1) + '-' + HS.fmt.pad(d.getDate()); };
    if (k === 'today') return [iso(n), iso(n)];
    if (k === 'week') { var s = new Date(n); s.setDate(n.getDate() - ((n.getDay() + 1) % 7)); return [iso(s), iso(n)]; }
    if (k === 'month') return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)];
    return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))];
  }
  function ledgerTab(pane, which) {
    if (!R.from) { var r0 = rangeOf('today'); R.from = r0[0]; R.to = r0[1]; }
    pane.innerHTML = '<div class="toolbar"><div class="seg" role="group">' + ['today', 'week', 'month', 'last'].map(function (k) { return '<button type="button" data-range="' + k + '">' + HS.esc(HS.t('money.range.' + k)) + '</button>'; }).join('') + '</div>' +
      '<input class="input" type="date" data-r="from" value="' + R.from + '" style="width:auto"><input class="input" type="date" data-r="to" value="' + R.to + '" style="width:auto">' +
      (which === 'receipts' ? '<select class="input" data-r="method" style="width:auto">' + opt('', HS.t('pay.method') + ': ' + HS.t('common.all'), R.method) + METHODS.concat(['wallet']).map(function (m) { return opt(m, HS.t('pay.method.' + m), R.method); }).join('') + '</select>' : '') +
      '<span class="grow"></span>' + (which === 'expenses' && HS.can('expenses.add') ? '<button class="btn primary" data-expense>' + HS.icon('plus', 'sm') + HS.esc(HS.t('money.expense')) + '</button>' : '') +
      '<button class="btn" data-csv>' + HS.icon('download', 'sm') + HS.esc(HS.t('money.csv')) + '</button></div><div data-led><div class="skeleton" style="height:10rem"></div></div>';
    HS.get('/api/c/money?from=' + R.from + '&to=' + R.to).then(function (m) {
      var rows = (which === 'receipts' ? m.payments : m.expenses).filter(function (p) { return !R.method || p.method === R.method; })
        .sort(function (a, b) { return String(b.date + (b.at || '')).localeCompare(String(a.date + (a.at || ''))); });
      pane._rows = rows;
      var total = rows.reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
      pane.querySelector('[data-led]').innerHTML = '<div class="row wrap" style="margin-bottom:.8rem"><span class="badge">' + HS.esc(HS.t(which === 'receipts' ? 'shift.receipts' : 'money.tab.expenses')) + ' <b class="num">' + rows.length + '</b></span><span class="badge signal">' + HS.esc(HS.t('ov.chart.total')) + ' ' + U.money(Math.round(total * 100) / 100) + '</span>' + (which === 'receipts' ? byMethod(rows) : '') + '</div>' +
        (rows.length ? (which === 'receipts' ? receiptsTable(rows, true) : expensesTable(rows)) : U.empty(which === 'receipts' ? 'sheet' : 'doc', HS.t('money.none'), HS.t('money.none.b')));
    }, function (e) { pane.querySelector('[data-led]').innerHTML = U.empty('alert', U.errorText(e)); });
  }
  function csv(rows, which) {
    var head = which === 'receipts' ? ['no', 'date', 'at', 'student', 'kind', 'group', 'method', 'ref', 'amount', 'by'] : ['no', 'date', 'category', 'teacher', 'method', 'amount', 'note', 'by'];
    var lines = [head.map(function (h) { return HS.t('csv.' + h); })].concat(rows.map(function (p) {
      return which === 'receipts' ? [p.no, p.date, p.at, stName(p.studentId), HS.t('pay.kind.' + p.kind), D.groupName(p.groupId), HS.t('pay.method.' + p.method), p.ref, p.amount, p.by]
        : [p.no, p.date, HS.t('exp.cat.' + p.category), D.teacherName(p.teacherId), HS.t('pay.method.' + p.method), p.amount, p.note, p.by];
    }));
    U.download('hessa-' + which + '-' + R.from + '_' + R.to + '.csv', U.csv(lines), 'text/csv;charset=utf-8');
  }
  function shiftsTab(pane) {
    pane.innerHTML = '<div class="skeleton" style="height:10rem"></div>';
    HS.get('/api/c/shifts').then(function (rows) {
      pane.innerHTML = rows.length ? U.table([
        { h: 'f.no', cell: function (s) { return '<b class="num">' + U.bdi(s.no || '') + '</b>'; } },
        { h: 'f.user', cell: function (s) { return HS.esc(s.user || ''); } },
        { h: 'shift.openedAt', cell: function (s) { return U.dt(s.openedAt); } },
        { h: 'shift.closedAt', cell: function (s) { return s.status === 'open' ? '<span class="badge signal"><span class="pulse-dot"></span> ' + HS.esc(HS.t('shift.isOpen')) + '</span>' : U.dt(s.closedAt); } },
        { h: 'shift.expected', cls: 'end', cell: function (s) { return s.status === 'open' ? '–' : U.money(s.expectedCash); } },
        { h: 'shift.counted', cls: 'end', cell: function (s) { return s.status === 'open' ? '–' : U.money(s.countedCash); } },
        { h: 'shift.diff', cell: function (s) { return s.status === 'open' ? '' : !s.diff ? '<span class="badge ok">' + HS.icon('check', 'sm') + '</span>' : '<span class="badge bad">' + U.money(s.diff) + '</span> <span class="muted">' + HS.esc(s.diffReason || '') + '</span>'; } },
        { h: 'f.action', cell: function (s) { return s.status === 'open' && HS.can('shifts.manage') ? '<button class="btn sm" data-close-other="' + HS.esc(s.id) + '">' + HS.esc(HS.t('shift.close')) + '</button>' : ''; } }
      ], rows) : U.empty('lock', HS.t('shift.noneAll'), '');
    }, function (e) { pane.innerHTML = U.empty('alert', U.errorText(e)); });
  }
  function handoutsTab(pane) {
    var rows = D.list('materials').slice().sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); });
    pane.innerHTML = '<div class="toolbar"><span class="grow"></span>' + (HS.can('money.collect') ? '<button class="btn primary" data-income="material">' + HS.icon('sheet', 'sm') + HS.esc(HS.t('money.sell')) + '</button>' : '') +
      (HS.can('materials.manage') ? '<button class="btn" data-mat-new>' + HS.icon('plus', 'sm') + HS.esc(HS.t('money.newHandout')) + '</button>' : '') + '</div>' +
      (rows.length ? U.table([
        { h: 'f.name', cell: function (m) { return '<b>' + HS.esc(m.name) + '</b>' + (m.active === false ? ' <span class="badge">' + HS.esc(HS.t('f.inactive')) + '</span>' : ''); } },
        { h: 'f.teacherId', cell: function (m) { return HS.esc(D.teacherName(m.teacherId)); } },
        { h: 'f.gradeCode', cell: function (m) { return m.gradeCode ? HS.esc(HS.t('grade.' + m.gradeCode)) : ''; } },
        { h: 'f.price', cls: 'end', cell: function (m) { return U.money(m.price); } },
        { h: 'f.stock', cls: 'end', cell: function (m) { var n = Number(m.stock) || 0; return '<span class="badge ' + (n <= 0 ? 'bad' : n <= 5 ? 'warn' : 'ok') + ' num">' + HS.fmt.num(n) + '</span>'; } },
        { h: 'f.action', cell: function (m) { return HS.can('materials.manage') ? '<button class="btn sm ghost" data-mat="' + HS.esc(m.id) + '">' + HS.esc(HS.t('common.edit')) + '</button>' : ''; } }
      ], rows) : U.empty('doc', HS.t('money.noHandouts'), HS.t('money.noHandouts.b')));
  }

  /* ---------- the page ---------- */
  var tab = 'shift';
  HS.views.money = HS.withData({
    render: function (ctx) {
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.tab && TABS.indexOf(q.tab) >= 0) tab = q.tab;
      // each tab follows the permission its server reads need: all receipts and expenses need money.view
      var need = { shift: ['money.collect', 'expenses.add', 'shifts.close', 'shifts.manage'], receipts: ['money.view'], expenses: ['money.view'],
        shifts: ['shifts.manage', 'money.view'], handouts: ['money.collect', 'materials.manage'] };
      var tabs = TABS.filter(function (t) { return HS.can(need[t]); });
      if (tabs.indexOf(tab) < 0) tab = tabs[0] || 'shift';
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.money')) + '</h1><p>' + HS.esc(HS.t('page.money.d')) + '</p></div></div>' +
        '<div class="tabs" role="tablist" style="margin-bottom:1rem">' + tabs.map(function (t) { return '<button role="tab" data-mtab="' + t + '" aria-selected="' + (t === tab) + '">' + HS.esc(HS.t('money.tab.' + t)) + '</button>'; }).join('') + '</div><div data-mpane></div>';
    },
    mount: function (root, ctx) {
      var pane = root.querySelector('[data-mpane]');
      function paint() {
        if (tab === 'shift') shiftTab(pane); else if (tab === 'receipts' || tab === 'expenses') ledgerTab(pane, tab);
        else if (tab === 'shifts') shiftsTab(pane); else handoutsTab(pane);
      }
      paint();
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-mtab]'); if (t) { tab = t.dataset.mtab; HS.go('money?tab=' + tab); return; }
        if (e.target.closest('[data-openshift]')) { HS.ensureShift().then(paint, function () {}); return; }
        var inc = e.target.closest('[data-income]'); if (inc) { incomeDialog(paint, inc.dataset.income || ''); return; }
        if (e.target.closest('[data-expense]')) { expenseDialog(paint); return; }
        if (e.target.closest('[data-handover]')) { expenseDialog(paint, { category: 'handover' }); return; }
        if (e.target.closest('[data-close-shift]') && pane._summary) { closeDialog(pane._summary, paint); return; }
        var co = e.target.closest('[data-close-other]'); if (co) { HS.get('/api/c/shift?id=' + encodeURIComponent(co.dataset.closeOther)).then(function (s) { closeDialog(s, paint); }); return; }
        var v = e.target.closest('[data-void]'); if (v) { voidReceipt(v.dataset.void, paint); return; }
        var ev = e.target.closest('[data-evoid]');
        if (ev) { U.confirm({ title: HS.t('money.void'), body: HS.t('money.void.b'), reason: HS.t('stu.reason'), danger: true, ok: HS.t('money.void') }).then(function (reason) {
          if (reason) U.run(HS.post('/api/c/expense/void', { id: ev.dataset.evoid, reason: reason }), 'money.voided').then(paint, function () {}); }); return; }
        var pr = e.target.closest('[data-printr]');
        if (pr) { var rows = (pane._summary && pane._summary.payments || []).concat(pane._rows || []), p = rows.filter(function (x) { return x.id === pr.dataset.printr; })[0]; if (p) HS.printReceipt(p); return; }
        var rg = e.target.closest('[data-range]'); if (rg) { var r = rangeOf(rg.dataset.range); R.from = r[0]; R.to = r[1]; paint(); return; }
        if (e.target.closest('[data-csv]') && pane._rows) { csv(pane._rows, tab); return; }
        if (e.target.closest('[data-mat-new]')) { HS.lists.edit('materials'); return; }
        var mt = e.target.closest('[data-mat]'); if (mt) { HS.lists.edit('materials', mt.dataset.mat); return; }
      });
      root.addEventListener('change', function (e) { var k = e.target.dataset.r; if (k) { R[k] = e.target.value; paint(); } });
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.pay && HS.can('money.collect')) incomeDialog(paint);
      if (q.expense && HS.can('expenses.add')) expenseDialog(paint);
    }
  });
})();
