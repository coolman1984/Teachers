/* Hessa - teacher settlements: one card per teacher for the month - what was collected, the centre's share written
   out as the formula of the teacher's own terms (so nobody argues with a calculator), school groups, handouts,
   deductions, net, paid and remaining; approve (frozen record, warns when data changed later), pay out (an expense)
   and a printed statement for both signatures. A teacher account sees only its own card. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var ym = null;
  function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + HS.fmt.pad(d.getMonth() + 1); }
  function shift(m, k) { var y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)) - 1 + k; return (y + Math.floor(n / 12)) + '-' + HS.fmt.pad((n % 12 + 12) % 12 + 1); }
  function monthName(m) {
    try { return new Intl.DateTimeFormat(HS.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00:00')); } catch (e) { return m; }
  }
  HS.monthName = monthName;
  HS.monthPicker = function (cur) {
    return '<div class="month-pick"><button class="icon-btn" data-month="-1" aria-label="' + HS.esc(HS.t('rep.prev')) + '">' + HS.icon('left', 'mirror') + '</button>' +
      '<b>' + HS.esc(monthName(cur)) + '</b><button class="icon-btn" data-month="1" aria-label="' + HS.esc(HS.t('rep.next')) + '"' + (cur >= thisMonth() ? ' disabled' : '') + '>' + HS.icon('right', 'mirror') + '</button></div>';
  };
  HS.monthShift = shift; HS.thisMonth = thisMonth;

  /* the centre's share in words, from the teacher's own terms */
  function formula(s) {
    var t = s.terms || {}, parts = [];
    if (Number(t.rentMonth)) parts.push(HS.t('set.f.month', { a: HS.fmt.num(t.rentMonth) }));
    if (Number(t.rentSession)) parts.push(HS.t('set.f.session', { a: HS.fmt.num(t.rentSession), n: s.sessions }));
    if (Number(t.rentStudent)) parts.push(HS.t('set.f.student', { a: HS.fmt.num(t.rentStudent), n: s.visits }));
    if (Number(t.centerPct)) parts.push(HS.t('set.f.pct', { p: t.centerPct, a: HS.fmt.num(s.revenue - s.schoolRevenue) }));
    return parts.length ? parts.join(' + ') : HS.t('set.f.none');
  }
  function changed(s) {
    var v = s.saved;
    return v && (Math.abs((v.revenue || 0) - s.revenue) > 0.009 || Math.abs((v.centerShare || 0) - s.centerShare) > 0.009);
  }
  function card(s, i) {
    var v = s.saved, line = function (k, val, cls) { return '<div class="set-line ' + (cls || '') + '"><span>' + HS.esc(HS.t(k)) + '</span><b>' + val + '</b></div>'; };
    var pct = s.revenue ? Math.round(s.centerShare * 100 / s.revenue) : 0;
    return '<article class="card set-card" style="--i:' + i + '"><header><span class="avatar sm">' + HS.esc(String(s.teacher || '?').charAt(0)) + '</span><div class="grow"><h3>' + HS.esc(s.teacher) + '</h3>' +
        '<span class="faint">' + HS.esc(HS.t('set.meta', { n: s.sessions, v: s.visits })) + '</span></div>' +
        (v ? '<span class="badge ' + (changed(s) ? 'warn' : 'ok') + '">' + HS.icon(changed(s) ? 'alert' : 'check', 'sm') + HS.esc(HS.t(changed(s) ? 'set.changed' : 'set.approved')) + '</span>' : '<span class="badge">' + HS.esc(HS.t('set.draft')) + '</span>') + '</header>' +
      '<div class="split-bar" title="' + HS.esc(HS.t('set.split', { p: pct })) + '"><i style="width:' + pct + '%"></i></div>' +
      line('set.revenue', U.money(s.revenue)) +
      '<div class="set-line formula"><span>' + HS.esc(HS.t('set.centre')) + '<small>' + HS.esc(formula(s)) + '</small></span><b>− ' + U.money(s.centerShare) + '</b></div>' +
      (s.schoolRevenue ? line('set.school', U.money(s.schoolRevenue) + ' <span class="faint">→ ' + U.money((s.school || {}).teacher || 0) + '</span>') : '') +
      (s.materials ? line('set.materials', U.money(s.materials)) : '') +
      (s.deductions ? line('set.deductions', '− ' + U.money(s.deductions)) : '') +
      line('set.net', U.money(s.net), 'total') + line('set.paid', U.money(s.paid)) +
      line('set.remaining', U.money(s.remaining), s.remaining > 0 ? 'due' : 'ok') +
      (v ? '<p class="faint">' + HS.esc(HS.t('set.by', { by: v.by || '', at: U.dt(v.at).replace(/<[^>]+>/g, '') })) + '</p>' : '') +
      '<details><summary class="muted">' + HS.esc(HS.t('set.groups', { n: s.groups.length })) + '</summary><ul class="notes">' + s.groups.map(function (g) {
        return '<li>' + HS.esc(g.name) + ' · ' + U.money(g.revenue) + ' · ' + HS.esc(HS.t('set.meta', { n: g.sessions, v: g.visits })) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="row wrap" style="gap:.4rem">' + (HS.can('settlements.manage') ? '<button class="btn sm' + (v && !changed(s) ? '' : ' primary') + '" data-approve="' + HS.esc(s.teacherId) + '">' + HS.icon('check', 'sm') + HS.esc(HS.t(v ? 'set.reapprove' : 'set.approve')) + '</button>' +
          (s.remaining > 0 ? '<button class="btn sm" data-payout="' + HS.esc(s.teacherId) + '" data-amount="' + s.remaining + '">' + HS.icon('sheet', 'sm') + HS.esc(HS.t('set.payout')) + '</button>' : '') : '') +
        '<button class="btn sm ghost" data-print="' + HS.esc(s.teacherId) + '">' + HS.icon('printer', 'sm') + HS.esc(HS.t('set.print')) + '</button></div></article>';
  }
  function statement(s) {
    var row = function (k, v) { return '<tr><th>' + HS.esc(HS.t(k)) + '</th><td>' + v + '</td></tr>'; }, p = function (h) { return String(h).replace(/<[^>]+>/g, ''); };
    var sys = (D.state.settings || {}).systemName || HS.t('app.name');
    return '<div class="ps-head"><div><div class="ps-org">' + HS.esc(sys) + '</div><h1>' + HS.esc(HS.t('set.statement')) + '</h1><div>' + HS.esc(s.teacher + ' · ' + monthName(s.period)) + '</div></div></div>' +
      '<table class="ps-table">' + row('set.revenue', p(U.money(s.revenue))) + row('set.centre', p(U.money(s.centerShare)) + '<br><small>' + HS.esc(formula(s)) + '</small>') +
      (s.schoolRevenue ? row('set.school', p(U.money(s.schoolRevenue))) : '') + (s.deductions ? row('set.deductions', p(U.money(s.deductions))) : '') +
      row('set.net', '<b>' + p(U.money(s.net)) + '</b>') + row('set.paid', p(U.money(s.paid))) + row('set.remaining', '<b>' + p(U.money(s.remaining)) + '</b>') + '</table>' +
      '<table class="ps-list" style="margin-top:6mm"><thead><tr><th>' + HS.esc(HS.t('f.group')) + '</th><th>' + HS.esc(HS.t('set.revenue')) + '</th><th>' + HS.esc(HS.t('set.sessions')) + '</th><th>' + HS.esc(HS.t('set.visits')) + '</th></tr></thead><tbody>' +
      s.groups.map(function (g) { return '<tr><td>' + HS.esc(g.name) + '</td><td>' + p(U.money(g.revenue)) + '</td><td>' + g.sessions + '</td><td>' + g.visits + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="ps-legal" style="margin-top:14mm">' + HS.esc(HS.t('set.signatures')) + '</p>';
  }

  HS.views.settlements = HS.withData({
    render: function (ctx) {
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.ym && /^\d{4}-\d{2}$/.test(q.ym)) ym = q.ym;
      ym = ym || thisMonth();
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.settlements')) + '</h1><p>' + HS.esc(HS.t('page.settlements.d')) + '</p></div>' + HS.monthPicker(ym) + '</div>' +
        '<div data-sums></div><div class="set-grid" data-cards><div class="skeleton" style="height:18rem"></div><div class="skeleton" style="height:18rem"></div></div>';
    },
    mount: function (root) {
      var list = [];
      function load() {
        HS.get('/api/c/settlements?ym=' + ym).then(function (r) {
          list = r.filter(function (s) { return s.revenue || s.sessions || s.saved || s.paid; });
          var tot = { rev: 0, centre: 0, net: 0, rem: 0 }; list.forEach(function (s) { tot.rev += s.revenue; tot.centre += s.centerShare; tot.net += s.net; tot.rem += Math.max(0, s.remaining); });
          root.querySelector('[data-sums]').innerHTML = list.length ? '<div class="mini-kpis" style="margin-bottom:var(--gap)"><div><small>' + HS.esc(HS.t('set.revenue')) + '</small><b>' + U.money(tot.rev) + '</b></div>' +
            '<div class="signal"><small>' + HS.esc(HS.t('set.centre')) + '</small><b class="big">' + U.money(tot.centre) + '</b></div><div><small>' + HS.esc(HS.t('set.teachers')) + '</small><b>' + U.money(tot.net) + '</b></div>' +
            '<div class="' + (tot.rem > 0 ? 'bad' : 'ok') + '"><small>' + HS.esc(HS.t('set.remaining')) + '</small><b>' + U.money(tot.rem) + '</b></div></div>' : '';
          root.querySelector('[data-cards]').innerHTML = list.length ? list.map(card).join('') : U.empty('chart', HS.t('set.none'), HS.t('set.none.b'));
        }, function (e) { root.querySelector('[data-cards]').innerHTML = U.empty('alert', U.errorText(e)); });
      }
      load();
      root.addEventListener('click', function (e) {
        var m = e.target.closest('[data-month]'); if (m) { HS.go('settlements?ym=' + shift(ym, Number(m.dataset.month))); return; }
        var a = e.target.closest('[data-approve]');
        if (a) { U.run(HS.post('/api/c/settlement/approve', { teacherId: a.dataset.approve, ym: ym }), 'set.approvedToast', a).then(load, function () {}); return; }
        var po = e.target.closest('[data-payout]');
        if (po) {
          // the payout is an ordinary expense of the teacher_payout category, opened already filled in
          HS.expenseDialog(load, { category: 'teacher_payout', teacherId: po.dataset.payout, amount: po.dataset.amount, note: HS.t('set.payoutNote', { m: monthName(ym) }) });
          return;
        }
        var pr = e.target.closest('[data-print]');
        if (pr) { var s = list.filter(function (x) { return x.teacherId === pr.dataset.print; })[0]; if (s) HS.printHTML(statement(s)); }
      });
    }
  });
})();
