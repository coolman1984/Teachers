/* Hessa - the owner's Watch (server/watch.py): what in the signed records looks like a mistake or a trick, ranked by how
   much it matters, each with why it matters and the right way to do it. Administrators of the whole centre only (the server
   checks). A reviewed alert stays in the list (greyed, with who reviewed it and what they found) - the review is itself a
   logged change, so nobody can quietly make an alert about himself go away. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var LEVELS = ['critical', 'high', 'warn', 'info'];
  var LV_ICON = { critical: 'alert', high: 'eye', warn: 'info', info: 'doc' };
  var RULE_ICON = { void: 'refresh', skim: 'alert', short: 'sheet', over: 'sheet', repeatShort: 'alert', openShift: 'lock', freeRide: 'users',
    discount: 'star', fee: 'chart', deleted: 'x', pastAtt: 'clock', afterHours: 'moon', denied: 'shield', bigExpense: 'doc', trials: 'spark', admin: 'settings' };
  var MONEY = { amount: 1, amount2: 1, diff: 1, total: 1, owed: 1, expected: 1, counted: 1, unit: 1 };
  var F = { period: '30', from: '', to: '', level: '', rule: '', user: '', reviewed: false };
  var data = null, loading = false, failed = null;

  function iso(d) { return d.getFullYear() + '-' + HS.fmt.pad(d.getMonth() + 1) + '-' + HS.fmt.pad(d.getDate()); }
  function range() {
    var t = new Date(), from = new Date(t);
    if (F.period === 'custom') return [F.from, F.to];
    if (F.period === 'today') return [iso(t), iso(t)];
    if (F.period === '7') from.setDate(t.getDate() - 6);
    else if (F.period === 'month') from = new Date(t.getFullYear(), t.getMonth(), 1);
    else if (F.period === 'last') { from = new Date(t.getFullYear(), t.getMonth() - 1, 1); t = new Date(t.getFullYear(), t.getMonth(), 0); }
    else from.setDate(t.getDate() - 29);
    return [iso(from), iso(t)];
  }
  function load() {
    var r = range();
    loading = true; failed = null;
    return HS.get('/api/watch?from=' + encodeURIComponent(r[0] || '') + '&to=' + encodeURIComponent(r[1] || '')).then(function (d) { data = d; loading = false; },
      function (e) { failed = e; loading = false; });
  }
  HS.watch = { load: function (from, to) { return HS.get('/api/watch?from=' + from + '&to=' + to); } };

  // the alert's sentence: money as money, everything else escaped by HS.t
  function sentence(a) {
    var v = {}, key = 'wa.r.' + a.rule;
    Object.keys(a.vars || {}).forEach(function (k) { v[k] = MONEY[k] ? { html: U.money(a.vars[k]) } : a.vars[k]; });
    if (a.rule === 'discount' && a.vars.exempt) key = 'wa.r.discount.exempt';
    if (a.rule === 'fee' && a.vars.special) key = 'wa.r.fee.special';
    if (a.rule === 'denied') key = 'wa.r.denied.' + (a.vars.kind || 'denied');
    if (a.rule === 'bigExpense' && a.vars.reversed) key = 'wa.r.bigExpense.rev';
    if (a.rule === 'deleted') v.what = (a.vars.entities || []).map(function (x) { return HS.audit ? HS.audit.entity(x) : x; }).join(HS.lang === 'ar' ? '، ' : ', ');
    if (a.rule === 'admin') { v.what = a.vars.what === 'setting' ? HS.t('wa.admin.setting') : (HS.has('sec.' + a.vars.what) ? HS.t('sec.' + a.vars.what) : a.vars.what);
      v.target = HS.has('set.' + a.vars.target) ? HS.t('set.' + a.vars.target) : a.vars.target; }
    if (a.rule === 'bigExpense') v.category = HS.has('exp.cat.' + a.vars.category) ? HS.t('exp.cat.' + a.vars.category) : a.vars.category;
    var extra = [];
    if (a.rule === 'void') {
      if (a.vars.same) extra.push(HS.t('wa.void.same'));
      if (a.vars.days > 0) extra.push(HS.t('wa.void.days', { n: a.vars.days }));
      if (a.vars.closed) extra.push(HS.t('wa.void.closed'));
    }
    return HS.t(key, v) + (extra.length ? ' <b>' + extra.join(' ') + '</b>' : '');
  }
  function rich(t) { return HS.guides ? HS.guides.rich(t) : HS.esc(t); }

  function alertHTML(a, i) {
    var rev = a.review;
    return '<article class="wa-item lv-' + a.level + (rev ? ' reviewed' : '') + '" data-key="' + HS.esc(a.key) + '" style="--i:' + Math.min(i, 12) + '">' +
      '<span class="wa-ic">' + HS.icon(RULE_ICON[a.rule] || 'alert') + '</span>' +
      '<div class="wa-main"><div class="row wrap wa-head"><span class="badge lv ' + a.level + '">' + HS.icon(LV_ICON[a.level], 'sm') + HS.esc(HS.t('wa.lv.' + a.level)) + '</span>' +
        '<b>' + HS.esc(HS.t('wa.rn.' + a.rule)) + '</b><span class="grow"></span><span class="faint num">' + U.dt(a.ts) + '</span></div>' +
        '<p class="wa-text">' + sentence(a) + '</p>' +
        (a.user ? '<p class="faint wa-who">' + HS.icon('user', 'sm') + HS.esc(HS.t('wa.by', { user: a.user })) + '</p>' : '') +
        (rev ? '<div class="tip ok">' + HS.icon('check') + '<span>' + HS.t('wa.reviewedBy', { by: rev.by, at: U.dt(rev.at), note: rev.note || '–' }) + '</span></div>' : '') +
        '<details class="wa-more"><summary>' + HS.esc(HS.t('wa.why')) + ' · ' + HS.esc(HS.t('wa.do')) + '</summary>' +
          '<p><b>' + HS.esc(HS.t('wa.why')) + ':</b> ' + rich(HS.t('wa.r.' + a.rule + '.why')) + '</p>' +
          '<p><b>' + HS.esc(HS.t('wa.do')) + ':</b> ' + rich(HS.t('wa.r.' + a.rule + '.do', { u: data.rules.owedUnits })) + '</p></details>' +
        '<div class="row wrap wa-acts"><a class="btn sm" href="#/' + HS.esc(a.page) + '">' + HS.esc(HS.t('wa.open')) + HS.icon('right', 'sm mirror') + '</a>' +
          (rev ? '' : '<button class="btn sm" data-review>' + HS.icon('check', 'sm') + HS.esc(HS.t('wa.review')) + '</button>') + '</div></div></article>';
  }
  function shown() {
    return data.alerts.filter(function (a) {
      return (F.reviewed || !a.review) && (!F.level || a.level === F.level) && (!F.rule || a.rule === F.rule) && (!F.user || a.user === F.user);
    });
  }
  function body() {
    if (failed) return U.empty('alert', U.errorText(failed), '', '<button class="btn" data-retry>' + HS.esc(HS.t('common.retry')) + '</button>');
    if (!data) return '<div class="skeleton" style="height:7rem"></div><div class="skeleton" style="height:18rem;margin-top:1rem"></div>';
    var list = shown(), s = data.summary, rules = {}, users = {};
    data.alerts.forEach(function (a) { rules[a.rule] = 1; if (a.user) users[a.user] = 1; });
    var tiles = '<div class="grid kpis wa-kpis">' + LEVELS.map(function (lv, i) {
      return '<button type="button" class="card kpi wa-kpi lv-' + lv + (F.level === lv ? ' on' : '') + '" data-level="' + lv + '" style="--i:' + i + '">' +
        '<div class="label">' + HS.esc(HS.t('wa.lv.' + lv)) + '<span class="tile-ic">' + HS.icon(LV_ICON[lv]) + '</span></div><div class="value num">' + HS.fmt.num(s[lv] || 0) + '</div>' +
        '<div class="hint">' + HS.esc(HS.t('wa.lv.' + lv + '.b')) + '</div></button>'; }).join('') + '</div>';
    var people = '<section class="card"><header><span class="tile-ic">' + HS.icon('users') + '</span><div><h3>' + HS.esc(HS.t('wa.people')) + '</h3><small class="muted">' + HS.esc(HS.t('wa.people.b')) + '</small></div></header>' +
      (data.people.length ? '<ul class="wa-people">' + data.people.map(function (p) {
        return '<li><button type="button" data-person="' + HS.esc(p.user) + '" class="' + (F.user === p.user ? 'on' : '') + '"><b>' + HS.esc(p.user) + '</b><span class="grow"></span>' +
          LEVELS.filter(function (lv) { return p[lv]; }).map(function (lv) { return '<span class="badge lv ' + lv + '" title="' + HS.esc(HS.t('wa.lv.' + lv)) + '">' + HS.fmt.num(p[lv]) + '</span>'; }).join('') + '</button></li>'; }).join('') + '</ul>'
        : '<p class="muted">' + HS.esc(HS.t('wa.people.none')) + '</p>') + '</section>';
    var bar = '<div class="toolbar wa-filters"><select class="input" data-f="rule" aria-label="' + HS.esc(HS.t('wa.all.rules')) + '"><option value="">' + HS.esc(HS.t('wa.all.rules')) + '</option>' +
        Object.keys(rules).map(function (r) { return '<option value="' + r + '"' + (F.rule === r ? ' selected' : '') + '>' + HS.esc(HS.t('wa.rn.' + r)) + '</option>'; }).join('') + '</select>' +
      '<select class="input" data-f="user" aria-label="' + HS.esc(HS.t('wa.all.people')) + '"><option value="">' + HS.esc(HS.t('wa.all.people')) + '</option>' +
        Object.keys(users).sort().map(function (u) { return '<option' + (F.user === u ? ' selected' : '') + '>' + HS.esc(u) + '</option>'; }).join('') + '</select>' +
      '<label class="row" style="gap:.4rem"><span class="switch"><input type="checkbox" data-f="reviewed"' + (F.reviewed ? ' checked' : '') + '><span></span></span>' + HS.esc(HS.t('wa.showReviewed')) +
        (data.reviewed ? ' <span class="badge">' + HS.esc(HS.t('wa.reviewedN', { n: data.reviewed })) + '</span>' : '') + '</label>' +
      '<span class="grow"></span>' +
      (list.some(function (a) { return !a.review; }) ? '<button class="btn sm" data-review-all>' + HS.icon('check', 'sm') + HS.esc(HS.t('wa.reviewShown', { n: list.filter(function (a) { return !a.review; }).length })) + '</button>' : '') +
      '<button class="btn sm" data-export>' + HS.icon('download', 'sm') + HS.esc(HS.t('wa.export')) + '</button></div>';
    var items = !data.alerts.length ? U.empty('shield', HS.t('wa.none'), HS.t('wa.none.b'))
      : list.length ? '<div class="wa-list">' + list.map(alertHTML).join('') + '</div>' : U.empty('search', HS.t('wa.noMatch'), '');
    return tiles + '<div class="grid two-col wa-grid"><div class="stack">' + bar + items + '</div><aside class="stack">' + people +
      '<div class="tip">' + HS.icon('shield') + '<span>' + HS.esc(HS.t('wa.sealed')) + ' <a href="#/settings?tab=data">' + HS.esc(HS.t('wa.check')) + '</a></span></div>' +
      '<p class="faint">' + HS.esc(HS.t('wa.rules', { a: data.rules.hours[0] + ':00', b: data.rules.hours[1] + ':00', big: data.rules.big, u: data.rules.owedUnits })) + '</p></aside></div>';
  }
  function periodBar() {
    var r = range();
    return '<div class="toolbar wa-period"><div class="seg" role="group" aria-label="' + HS.esc(HS.t('wa.period')) + '">' + ['today', '7', '30', 'month', 'last'].map(function (p) {
        return '<button type="button" data-period="' + p + '" aria-pressed="' + (F.period === p) + '">' + HS.esc(HS.t('wa.p.' + p)) + '</button>'; }).join('') + '</div>' +
      '<input class="input" type="date" data-from value="' + HS.esc(r[0]) + '" aria-label="' + HS.esc(HS.t('grp.temp.from')) + '"><input class="input" type="date" data-to value="' + HS.esc(r[1]) + '" aria-label="' + HS.esc(HS.t('grp.temp.to')) + '"></div>';
  }

  function review(keys, btn) {
    U.confirm({ title: HS.t('wa.review.t'), body: HS.t('wa.review.b'), reason: HS.t('f.notes'), ok: HS.t('wa.review') }).then(function (note) {
      if (!note) return;
      U.run(HS.post('/api/watch/review', { keys: keys, note: note }), 'wa.review.done', btn).then(function () { return load(); }).then(paint, function () {});
    });
  }
  var host = null;
  function paint() { if (host && host.isConnected !== false) { var b = host.querySelector('[data-wbody]'); if (b) b.innerHTML = body(); } }

  HS.views.watch = {
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.icon('shield') + ' ' + HS.esc(HS.t('nav.watch')) + '</h1><p>' + HS.esc(HS.t('page.watch.d')) + '</p></div></div>' +
        periodBar() + '<div data-wbody>' + body() + '</div>';
    },
    mount: function (root) {
      host = root;
      if (!data && !loading) load().then(paint);
      root.addEventListener('click', function (e) {
        var b;
        if ((b = e.target.closest('[data-period]'))) { F.period = b.dataset.period; data = null; HS.rerender(); load().then(paint); return; }
        if ((b = e.target.closest('[data-level]'))) { F.level = F.level === b.dataset.level ? '' : b.dataset.level; paint(); return; }
        if ((b = e.target.closest('[data-person]'))) { F.user = F.user === b.dataset.person ? '' : b.dataset.person; paint(); return; }
        if (e.target.closest('[data-retry]')) { load().then(paint); paint(); return; }
        if ((b = e.target.closest('[data-review]'))) { review([b.closest('[data-key]').dataset.key], b); return; }
        if ((b = e.target.closest('[data-review-all]'))) { review(shown().filter(function (a) { return !a.review; }).map(function (a) { return a.key; }), b); return; }
        if (e.target.closest('[data-export]')) {
          var tmp = document.createElement('div');
          U.download('hessa-watch-' + range().join('_') + '.csv', U.csv([[HS.t('f.time'), HS.t('wa.period'), HS.t('f.user'), HS.t('f.what'), HS.t('act.detail'), HS.t('wa.review')]].concat(shown().map(function (a) {
            tmp.innerHTML = sentence(a);
            return [a.ts, HS.t('wa.lv.' + a.level), a.user, HS.t('wa.rn.' + a.rule), tmp.textContent, a.review ? (a.review.by + ': ' + (a.review.note || '')) : ''];
          }))), 'text/csv');
        }
      });
      root.addEventListener('change', function (e) {
        var f = e.target.dataset && e.target.dataset.f;
        if (f === 'rule' || f === 'user') { F[f] = e.target.value; paint(); }
        else if (f === 'reviewed') { F.reviewed = e.target.checked; paint(); }
        else if (e.target.hasAttribute('data-from') || e.target.hasAttribute('data-to')) {
          F.period = 'custom'; F.from = root.querySelector('[data-from]').value; F.to = root.querySelector('[data-to]').value;
          HS.$$('[data-period]', root).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          data = null; paint(); load().then(paint);
        }
      });
    }
  };
})();
