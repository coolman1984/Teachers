/* Hessa - reports: the month in numbers (income, expenses, payouts, net), attendance and money per day, breakdowns,
   new and lost enrolments, group profitability with one plain decision per group (open another / merge / watch /
   loses money), drawer differences and reversals; a full-screen presentation for the owner's meeting and print. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var ym = null, data = null;
  var SIGNAL_TONE = { full: 'info', merge: 'warn', watch: 'warn', loss: 'bad', ok: 'ok' };

  function daysIn(m) { var y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)); return new Date(y, n, 0).getDate(); }
  function lastDay(m) { var t = U.today(); return m === t.slice(0, 7) ? t : m + '-' + HS.fmt.pad(daysIn(m)); }
  function pct(x) { return x === null || x === undefined ? '–' : Math.round(x * 100) + '%'; }
  function kpi(label, value, tone, hint) { return '<div class="' + (tone || '') + '"><small>' + HS.esc(HS.t(label)) + '</small><b class="big">' + value + '</b>' + (hint ? '<small class="faint">' + hint + '</small>' : '') + '</div>'; }

  function profitTable(rows) {
    if (!rows.length) return U.empty('chart', HS.t('rep.noGroups'), '');
    return U.table([
      { h: 'f.group', cell: function (r) { return '<b>' + HS.esc(r.name) + '</b><br><span class="faint">' + HS.esc(D.teacherName(r.teacherId)) + '</span>'; } },
      { h: 'set.revenue', cls: 'end', cell: function (r) { return U.money(r.revenue); } },
      { h: 'set.centre', cls: 'end', cell: function (r) { return U.money(r.centerShare); } },
      { h: 'rep.roomCost', cls: 'end', cell: function (r) { return r.roomCost ? U.money(r.roomCost) : '<span class="faint">–</span>'; } },
      { h: 'rep.profit', cls: 'end', cell: function (r) { return '<b>' + U.money(r.centerProfit) + '</b>'; } },
      { h: 'grp.fill', cell: function (r) { return r.capacity ? '<span class="num">' + r.enrolled + '/' + r.capacity + '</span> <span class="faint">' + pct(r.utilisation) + '</span>' : U.num(r.enrolled); } },
      { h: 'rep.attRate', cell: function (r) { return pct(r.attendanceRate); } },
      { h: 'rep.signal', cell: function (r) { return '<span class="badge ' + SIGNAL_TONE[r.signal] + '">' + HS.esc(HS.t('signal.' + r.signal)) + '</span><br><small class="muted">' + HS.esc(HS.t('rep.do.' + r.signal)) + '</small>'; } }
    ], rows);
  }
  function body(r) {
    var payouts = r.payouts || 0, net = Math.round((r.income - r.expenseTotal - payouts) * 100) / 100;
    var teachers = Object.keys(r.byTeacher).map(function (k) { return [D.teacherName(k) || HS.t('rep.noTeacher'), r.byTeacher[k]]; });
    var methods = Object.keys(r.byMethod).map(function (k) { return [HS.t('pay.method.' + k), r.byMethod[k]]; });
    var exp = Object.keys(r.expenses).map(function (k) { return [HS.t('exp.cat.' + k), r.expenses[k]]; });
    var end = lastDay(ym), n = Number(end.slice(8, 10));
    var signals = {}; r.profitability.forEach(function (g) { signals[g.signal] = (signals[g.signal] || 0) + 1; });
    return '<div class="mini-kpis rep-kpis">' + kpi('rep.income', U.money(r.income), 'ok') + kpi('rep.expenses', U.money(r.expenseTotal)) + kpi('rep.payouts', U.money(payouts)) +
        kpi('rep.net', U.money(net), net < 0 ? 'bad' : 'signal', HS.esc(HS.t('rep.net.b'))) + kpi('rep.new', U.num(r.newEnrolments), '', HS.esc(HS.t('rep.left', { n: r.left }))) +
        kpi('rep.voids', U.num(r.voids.count), r.voids.count ? 'warn' : '', U.money(r.voids.amount)) + '</div>' +
      '<div class="grid cols-2" style="margin-top:var(--gap)"><section class="card"><header><h3>' + HS.esc(HS.t('rep.attDays')) + '</h3></header>' + U.chart(U.series(r.days, 'visits', end, n), 'area', HS.t('rep.attDays'), [HS.t('rep.dayFirst'), HS.t('rep.dayLast')]) + '</section>' +
        '<section class="card"><header><h3>' + HS.esc(HS.t('rep.moneyDays')) + '</h3></header>' + U.chart(U.series(r.moneyDays, 'amount', end, n), 'bars', HS.t('rep.moneyDays'), [HS.t('rep.dayFirst'), HS.t('rep.dayLast')]) + '</section></div>' +
      '<div class="grid cols-3" style="margin-top:var(--gap)"><section class="card"><header><h3>' + HS.esc(HS.t('rep.byTeacher')) + '</h3></header>' + U.bars(teachers, true) + '</section>' +
        '<section class="card"><header><h3>' + HS.esc(HS.t('rep.byMethod')) + '</h3></header>' + U.bars(methods, true) + '</section>' +
        '<section class="card"><header><h3>' + HS.esc(HS.t('rep.byExpense')) + '</h3></header>' + U.bars(exp, true) + '</section></div>' +
      '<section class="card" style="margin-top:var(--gap)"><header><span class="tile-ic">' + HS.icon('chart') + '</span><h3>' + HS.esc(HS.t('rep.profitability')) + '</h3>' +
        '<span class="chip-row">' + ['loss', 'merge', 'watch', 'full'].filter(function (k) { return signals[k]; }).map(function (k) { return '<span class="badge ' + SIGNAL_TONE[k] + '">' + HS.esc(HS.t('signal.' + k)) + ' ' + signals[k] + '</span>'; }).join('') + '</span></header>' +
        '<p class="muted" style="margin:-.4rem 0 .8rem">' + HS.esc(HS.t('rep.profit.b')) + '</p>' + profitTable(r.profitability) + '</section>' +
      (r.shiftDiffs.length ? '<section class="card" style="margin-top:var(--gap)"><header><h3>' + HS.esc(HS.t('rep.diffs')) + '</h3></header>' + U.table([
        { h: 'f.no', cell: function (s) { return U.bdi(s.no); } }, { h: 'f.user', cell: function (s) { return HS.esc(s.user_name || ''); } }, { h: 'shift.closedAt', cell: function (s) { return U.dt(s.closed_at); } },
        { h: 'shift.diff', cls: 'end', cell: function (s) { return U.money(s.diff); } }, { h: 'shift.reason', cell: function (s) { return '<span class="muted">' + HS.esc(s.diff_reason || '') + '</span>'; } }], r.shiftDiffs) + '</section>' : '');
  }

  /* ---------- presentation: the month in four slides for the owner's meeting ---------- */
  function present(r) {
    var net = Math.round((r.income - r.expenseTotal - (r.payouts || 0)) * 100) / 100, plain = function (h) { return String(h).replace(/<[^>]+>/g, ''); };
    var best = r.profitability.slice().sort(function (a, b) { return b.centerProfit - a.centerProfit; }).slice(0, 5);
    var act = r.profitability.filter(function (g) { return g.signal !== 'ok'; }).slice(0, 6);
    var big = function (k, v) { return '<div><span>' + HS.esc(HS.t(k)) + '</span><b class="num">' + HS.esc(v) + '</b></div>'; };
    var slides = [
      '<h2>' + HS.esc(HS.monthName(ym)) + '</h2><div class="big-row">' + big('rep.income', plain(U.money(r.income))) + big('rep.expenses', plain(U.money(r.expenseTotal + (r.payouts || 0)))) + big('rep.net', plain(U.money(net))) + '</div>',
      '<h2>' + HS.esc(HS.t('rep.slide.best')) + '</h2>' + U.bars(best.map(function (g) { return [g.name, g.centerProfit]; }), true),
      '<h2>' + HS.esc(HS.t('rep.slide.act')) + '</h2>' + (act.length ? '<ul class="slide-list">' + act.map(function (g) { return '<li><b>' + HS.esc(g.name) + '</b> — ' + HS.esc(HS.t('signal.' + g.signal)) + ': ' + HS.esc(HS.t('rep.do.' + g.signal)) + '</li>'; }).join('') + '</ul>' : '<p>' + HS.esc(HS.t('rep.slide.allOk')) + '</p>'),
      '<h2>' + HS.esc(HS.t('rep.slide.people')) + '</h2><div class="big-row">' + big('rep.new', String(r.newEnrolments)) + big('rep.leftShort', String(r.left)) + big('rep.visits', HS.fmt.num(r.days.reduce(function (a, d) { return a + d.visits; }, 0))) + '</div>'
    ];
    var i = 0, el = document.createElement('div');
    el.className = 'present'; el.setAttribute('role', 'dialog');
    function paint() { el.innerHTML = '<button class="btn px" data-x aria-label="' + HS.esc(HS.t('common.close')) + '">' + HS.icon('x') + '</button><div class="ps">' + slides[i] + '</div><span class="pn num">' + (i + 1) + ' / ' + slides.length + '</span>'; }
    function close() { document.removeEventListener('keydown', key, true); el.remove(); }
    function key(e) {
      var rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === ' ' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); if (i < slides.length - 1) { i++; paint(); } else close(); }
      else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) { e.preventDefault(); if (i) { i--; paint(); } }
    }
    el.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) close(); else if (i < slides.length - 1) { i++; paint(); } else close(); });
    document.addEventListener('keydown', key, true);
    paint(); document.body.appendChild(el);
  }

  /* ---------- the whole month as one spreadsheet: a sheet per section, the reader's language, the same (scoped) numbers ---------- */
  function sheets(r) {
    var t = HS.t, payouts = r.payouts || 0, net = Math.round((r.income - r.expenseTotal - payouts) * 100) / 100;
    var pair = function (obj, label) { return Object.keys(obj).map(function (k) { return [label(k), obj[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); };
    var pc = function (x) { return x === null || x === undefined ? '' : Math.round(x * 1000) / 10; };
    return [
      { name: t('rep.x.summary'), head: [t('rep.x.item'), t('rep.x.value')], rows: [
        [t('rep.x.month'), ym], [t('rep.income'), r.income], [t('rep.expenses'), r.expenseTotal], [t('rep.payouts'), payouts], [t('rep.net'), net],
        [t('rep.new'), r.newEnrolments], [t('rep.leftShort'), r.left], [t('rep.voids'), r.voids.count], [t('rep.x.voidAmount'), r.voids.amount],
        [t('rep.visits'), r.days.reduce(function (a, d) { return a + d.visits; }, 0)]] },
      { name: t('rep.byTeacher'), head: [t('f.teacherId'), t('rep.income')], rows: pair(r.byTeacher, function (k) { return D.teacherName(k) || t('rep.noTeacher'); }) },
      { name: t('rep.byMethod'), head: [t('pay.method'), t('rep.income')], rows: pair(r.byMethod, function (k) { return t('pay.method.' + k); }) },
      { name: t('rep.byExpense'), head: [t('rep.x.category'), t('rep.expenses')], rows: pair(r.expenses, function (k) { return t('exp.cat.' + k); }) },
      { name: t('rep.attDays'), head: [t('f.date'), t('rep.visits')], rows: r.days.map(function (d) { return [d.date, d.visits]; }) },
      { name: t('rep.moneyDays'), head: [t('f.date'), t('rep.income')], rows: r.moneyDays.map(function (d) { return [d.date, d.amount]; }) },
      { name: t('rep.profitability'), head: [t('f.group'), t('f.teacherId'), t('set.revenue'), t('set.centre'), t('rep.roomCost'), t('rep.profit'), t('rep.x.enrolled'), t('rep.x.capacity'), t('rep.x.fillPct'), t('rep.x.attPct'), t('rep.signal'), t('rep.x.todo')],
        rows: r.profitability.map(function (g) { return [g.name, D.teacherName(g.teacherId), g.revenue, g.centerShare, g.roomCost || 0, g.centerProfit, g.enrolled, g.capacity || '', pc(g.utilisation), pc(g.attendanceRate), t('signal.' + g.signal), t('rep.do.' + g.signal)]; }) },
      { name: t('rep.diffs'), head: [t('f.no'), t('f.user'), t('shift.closedAt'), t('shift.diff'), t('shift.reason')],
        rows: r.shiftDiffs.map(function (x) { return [x.no, x.user_name || '', String(x.closed_at || '').replace('T', ' ').slice(0, 16), x.diff, x.diff_reason || '']; }) }
    ];
  }
  function exportExcel(btn) {
    btn.disabled = true;
    HS.api('POST', '/api/xlsx', { filename: 'Hessa ' + ym, sheets: sheets(data) }, { blob: true }).then(function (blob) {
      U.download(HS.t('nav.reports') + ' ' + ym + '.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      HS.toast(HS.t('rep.x.done'));
    }, function (e) { HS.toast(U.errorText(e), 'bad', 5000); }).then(function () { btn.disabled = false; });
  }

  HS.views.reports = HS.withData({
    render: function (ctx) {
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.ym && /^\d{4}-\d{2}$/.test(q.ym)) ym = q.ym;
      ym = ym || HS.thisMonth();
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.reports')) + '</h1><p>' + HS.esc(HS.t('page.reports.d')) + '</p></div>' + HS.monthPicker(ym) +
          '<button class="btn" data-present>' + HS.icon('present', 'sm') + HS.esc(HS.t('rep.present')) + '</button><button class="btn" data-printrep>' + HS.icon('printer', 'sm') + HS.esc(HS.t('rep.print')) + '</button>' +
          (HS.can('excel.export') ? '<button class="btn" data-xlsx>' + HS.icon('download', 'sm') + HS.esc(HS.t('rep.x.btn')) + '</button>' : '') + '</div>' +
        '<div data-rep><div class="skeleton" style="height:8rem"></div><div class="skeleton" style="height:16rem;margin-top:1rem"></div></div>';
    },
    mount: function (root) {
      HS.get('/api/c/reports?ym=' + ym).then(function (r) { data = r; root.querySelector('[data-rep]').innerHTML = body(r); },
        function (e) { root.querySelector('[data-rep]').innerHTML = U.empty('alert', U.errorText(e)); });
      root.addEventListener('click', function (e) {
        var m = e.target.closest('[data-month]'); if (m) { HS.go('reports?ym=' + HS.monthShift(ym, Number(m.dataset.month))); return; }
        if (e.target.closest('[data-present]') && data) { present(data); return; }
        var x = e.target.closest('[data-xlsx]'); if (x && data) { exportExcel(x); return; }
        if (e.target.closest('[data-printrep]') && data) HS.printHTML('<div class="ps-head"><div><div class="ps-org">' + HS.esc((D.state.settings || {}).systemName || HS.t('app.name')) + '</div><h1>' + HS.esc(HS.t('nav.reports') + ' · ' + HS.monthName(ym)) + '</h1></div></div>' + body(data));
      });
    }
  });
})();
