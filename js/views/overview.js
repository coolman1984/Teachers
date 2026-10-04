/* Hessa - Overview: greeting, live tiles, getting-started list, trust colours, tips, system status. */
(function () {
  'use strict';
  var HS = window.HS;
  var STEPS = [
    { k: 1, icon: 'settings', page: 'settings', ready: true }, { k: 2, icon: 'layers', page: 'settings' }, { k: 3, icon: 'car', page: 'vehicles' },
    { k: 4, icon: 'users', page: 'people' }, { k: 5, icon: 'sheet', page: 'excel' }, { k: 6, icon: 'cloud', page: 'settings' }
  ];
  function greet() {
    var h = new Date().getHours();
    var k = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    var name = (HS.me.full_name || HS.me.username || '').split(' ')[0];
    return HS.t('ov.greet.' + k, { name: name });
  }
  function kpi(i, icon, key, live) {
    return '<div class="card kpi' + (live ? ' live' : '') + '" style="--i:' + i + '"><div class="label">' + HS.esc(HS.t('ov.kpi.' + key)) +
      '<span class="tile-ic">' + HS.icon(icon) + '</span></div><div class="value" data-count="' + key + '"><span class="skeleton" style="display:inline-block;width:3rem;height:2rem"></span></div>' +
      '<div class="hint">' + (live ? '<span class="pulse-dot"></span> ' : '') + HS.esc(HS.t('ov.kpi.hint.' + key)) + '</div></div>';
  }
  function trustRow(c) {
    return '<div class="row" style="align-items:flex-start;gap:.9rem"><span class="trust ' + c + '" style="margin-top:.4rem"></span><div><b>' + HS.esc(HS.t('ov.trust.' + ({ green: 'green', yellow: 'yellow', red: 'red' })[c])) + '</b><div class="muted">' + HS.esc(HS.t('ov.trust.' + c + '.d')) + '</div></div></div>';
  }
  function kbd(k) { return '<i class="kbd">' + k + '</i>'; }

  HS.views.overview = {
    render: function () {
      var steps = STEPS.map(function (s) {
        var ready = s.ready;
        return '<li><div class="grow"><a href="#/' + s.page + '" style="color:inherit;text-decoration:none;font-weight:600">' + HS.esc(HS.t('ov.start.' + s.k)) + '</a></div>' +
          '<span class="badge ' + (ready ? 'ok' : '') + '">' + HS.esc(HS.t(ready ? 'ov.now.tag' : 'ov.soon.tag')) + '</span></li>';
      }).join('');
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(greet()) + '</h1><p>' + HS.esc(HS.t('ov.sub')) + ' <span class="faint">' + HS.esc(HS.fmt.longDate()) + '</span></p></div>' +
        '<button class="btn" data-a="tour">' + HS.icon('play', 'sm') + HS.esc(HS.t('ov.tour.btn')) + '</button>' +
        '<button class="btn" data-a="slides">' + HS.icon('present', 'sm') + HS.esc(HS.t('ov.slides.btn')) + '</button></div>' +
        '<div class="grid cols-4" data-tour="kpis">' + kpi(0, 'route', 'today') + kpi(1, 'gauge', 'road', true) + kpi(2, 'shield', 'review') + kpi(3, 'car', 'fleet') + '</div>' +
        '<div class="grid split" style="margin-top:var(--gap)"><div class="stack">' +
          '<section class="card lift"><header><h3>' + HS.esc(HS.t('ov.start.title')) + '</h3></header><p class="muted" style="margin:-.4rem 0 1rem">' + HS.esc(HS.t('ov.start.sub')) + '</p><ol class="steps">' + steps + '</ol></section>' +
          '<section class="card"><header><h3>' + HS.esc(HS.t('ov.trust.title')) + '</h3></header><p class="muted" style="margin:-.4rem 0 1rem">' + HS.esc(HS.t('ov.trust.sub')) + '</p><div class="stack" style="gap:.9rem">' + trustRow('green') + trustRow('yellow') + trustRow('red') + '</div></section>' +
        '</div><div class="stack">' +
          '<section class="card lift" style="border-color:var(--signal-line)"><header><span class="tile-ic" style="width:2.4rem;height:2.4rem;border-radius:.7rem;display:grid;place-items:center;background:var(--signal-soft);color:var(--ink)">' + HS.icon('sheet') + '</span><h3>' + HS.esc(HS.t('ov.demo.title')) + '</h3></header><p class="muted">' + HS.esc(HS.t('ov.demo.body')) + '</p>' +
            '<div style="margin-top:1rem"><a class="btn primary" href="#/excel">' + HS.icon('upload', 'sm') + HS.esc(HS.t('ov.demo.btn')) + '</a></div></section>' +
          '<section class="card"><header><h3>' + HS.esc(HS.t('ov.tips.title')) + '</h3></header><div class="stack" style="gap:.8rem">' +
            '<div class="row" style="align-items:flex-start">' + HS.icon('search') + '<span>' + HS.t('ov.tip.search', { k: '\u0000' }).replace('\u0000', kbd('Ctrl K')) + '</span></div>' +
            '<div class="row" style="align-items:flex-start">' + HS.icon('route') + '<span>' + HS.t('ov.tip.go', { k: '\u0000' }).replace('\u0000', kbd('G')) + '</span></div>' +
            '<div class="row" style="align-items:flex-start">' + HS.icon('keyboard') + '<span>' + HS.t('ov.tip.help', { k: '\u0000' }).replace('\u0000', kbd('?')) + '</span></div>' +
            '<a class="btn sm" href="#/help" style="justify-self:start">' + HS.icon('book', 'sm') + HS.esc(HS.t('ov.guide.btn')) + '</a></div></section>' +
          '<section class="card"><header><h3>' + HS.esc(HS.t('ov.status.title')) + '</h3></header><dl class="kv" id="status-kv">' +
            '<dt>' + HS.icon('cloud', 'sm') + ' ' + HS.esc(HS.t('ov.status.mailbox')) + '</dt><dd><span class="badge warn">' + HS.esc(HS.t('ov.status.mailbox.v')) + '</span></dd>' +
            '<dt>' + HS.icon('lock', 'sm') + ' ' + HS.esc(HS.t('ov.status.backup')) + '</dt><dd><span class="badge ok">' + HS.esc(HS.t('ov.status.backup.v')) + '</span></dd>' +
            '<dt>' + HS.icon('layers', 'sm') + ' ' + HS.esc(HS.t('ov.status.sync')) + '</dt><dd><span class="badge">' + HS.esc(HS.t('ov.status.sync.v')) + '</span></dd>' +
            '<dt>' + HS.icon('doc', 'sm') + ' ' + HS.esc(HS.t('ov.status.data')) + '</dt><dd><span class="num" id="rec-count">…</span></dd></dl></section>' +
        '</div></div>';
    },
    mount: function (root) {
      root.querySelector('[data-a="tour"]').addEventListener('click', function () { HS.tour.start(); });
      root.querySelector('[data-a="slides"]').addEventListener('click', function () { HS.slides.open(); });
      HS.data.load().then(function (D) {
        var today = HS.ui.today(), trips = D.list('trips');
        var v = {
          today: trips.filter(function (t) { return t.date === today && t.status !== 'cancelled'; }).length,
          road: trips.filter(function (t) { return t.status === 'started'; }).length,
          review: trips.filter(function (t) { var c = D.trust(t.id).trust; return t.status !== 'cancelled' && (c === 'red' || c === 'yellow'); }).length,
          fleet: D.list('vehicles').filter(function (x) { return x.active !== false; }).length
        };
        HS.$$('[data-count]', root).forEach(function (el) { HS.countUp(el, v[el.dataset.count]); });
        var rc = HS.$('#rec-count', root);
        if (rc) rc.textContent = HS.fmt.num(trips.length + D.list('vehicles').length + D.list('drivers').length + D.list('people').length);
      }, function () {
        HS.$$('[data-count]', root).forEach(function (el) { el.textContent = '–'; });
      });
    }
  };
})();
