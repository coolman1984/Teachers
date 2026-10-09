/* Hessa - Help & guide: one topic per daily job (the front desk, students, groups, money, marks, follow-up,
   settlements, reports, phones, safety), plain questions and answers in both languages, a search that understands
   Arabic spelling variants, a link from every topic to its page, and the tour and welcome slides. The "?" in the top
   bar opens the topic of the page you are on. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  // n = how many questions the topic has (keys hq.<id>.<k>.q / .a)
  var TOPICS = [
    { id: 'start', icon: 'flag', page: 'overview', n: 4 },
    { id: 'door', icon: 'board', page: 'door', perm: 'door.use', n: 10 },
    { id: 'students', icon: 'users', page: 'students', perm: 'students.view', n: 5 },
    { id: 'groups', icon: 'layers', page: 'groups', perm: 'groups.view', n: 8 },
    { id: 'money', icon: 'sheet', page: 'money', perm: ['money.view', 'money.collect'], n: 6 },
    { id: 'exams', icon: 'star', page: 'exams', perm: ['exams.view', 'marks.enter'], n: 6 },
    { id: 'followup', icon: 'bell', page: 'followup', perm: 'followup.view', n: 4 },
    { id: 'settlements', icon: 'chart', page: 'settlements', perm: 'settlements.view', n: 3 },
    { id: 'reports', icon: 'present', page: 'reports', perm: 'reports.view', n: 2 },
    { id: 'phone', icon: 'globe', page: 'overview', n: 3 },
    { id: 'devices', icon: 'sync', page: 'devices', perm: 'users.manage', n: 6 },
    { id: 'safety', icon: 'shield', page: 'settings', n: 6 },
    { id: 'parents', icon: 'link', page: 'settings?tab=gateway', n: 6 },
    { id: 'remote', icon: 'globe', page: 'settings?tab=remote', n: 4 },
    { id: 'printing', icon: 'printer', page: 'settings', n: 3 }
  ];
  HS.helpTopic = function (page) { return TOPICS.filter(function (t) { return t.id === page; })[0] ? page : 'start'; };

  /* ---------- talk to the seller (server/vendorlink.py): self-check, help request, support window ---------- */
  var LEVEL_ICON = { ok: 'check', warn: 'alert', bad: 'x' };
  function checkText(c) {
    var st = c.state ? '.' + c.state : '';
    return HS.has('sup.chk.' + c.id + st) ? HS.t('sup.chk.' + c.id + st, c.vars) : HS.t('sup.chk.' + c.id, c.vars);
  }
  function supportHTML(r) {
    var checks = '<section class="card stack" data-sup="checks"><header><span class="tile-ic">' + HS.icon('shield') + '</span><h2>' + HS.esc(HS.t('sup.checks')) + '</h2></header>' +
      '<ul class="sup-checks">' + r.checks.map(function (c) {
        return '<li data-check="' + HS.esc(c.id) + '"><span class="badge ' + HS.esc(c.level) + '">' + HS.icon(LEVEL_ICON[c.level] || 'help', 'sm') + HS.esc(HS.t('sup.level.' + c.level)) + '</span> ' + HS.esc(checkText(c)) + '</li>'; }).join('') + '</ul></section>';
    if (!r.configured) {
      return checks + '<section class="card stack"><div class="tip">' + HS.icon('link') + '<span>' + HS.esc(HS.t(r.admin ? 'sup.off.admin' : 'sup.off')) + '</span></div></section>' + (r.admin ? linkHTML(r) : '');
    }
    var ask = '<section class="card stack"><header><span class="tile-ic">' + HS.icon('life') + '</span><h2>' + HS.esc(HS.t('sup.ask')) + '</h2></header>' +
      '<p class="faint">' + HS.esc(HS.t('sup.ask.b')) + '</p>' +
      '<form class="stack" data-supform autocomplete="off"><label class="field"><span>' + HS.esc(HS.t('sup.subject')) + '</span><input class="input" name="subject" maxlength="150" required></label>' +
      '<label class="field"><span>' + HS.esc(HS.t('sup.message')) + '</span><textarea class="input" name="message" rows="4" maxlength="3500" required></textarea></label>' +
      '<label class="row"><input type="checkbox" name="attach" checked> <span>' + HS.esc(HS.t('sup.attach')) + '</span></label>' +
      '<details><summary>' + HS.esc(HS.t('sup.preview')) + '</summary><pre class="sup-preview" dir="ltr">' + HS.esc(JSON.stringify(r.preview, null, 2)) + '</pre></details>' +
      '<div><button class="btn primary" data-supsend>' + HS.icon('chat', 'sm') + HS.esc(HS.t('sup.send')) + '</button></div></form></section>' +
      '<section class="card stack"><header><span class="tile-ic">' + HS.icon('bell') + '</span><h2>' + HS.esc(HS.t('sup.mine')) + '</h2></header><div data-suptickets><p class="faint">' + HS.esc(HS.t('common.loading')) + '</p></div></section>';
    return checks + ask + (r.admin ? windowHTML(r.link || {}) + linkHTML(r) : '');
  }
  function windowHTML(link) {
    var w = link.window;
    var head = '<section class="card stack" data-sup="window"><header><span class="tile-ic">' + HS.icon('lock') + '</span><h2>' + HS.esc(HS.t('sup.window')) + '</h2></header>';
    if (w && w.open) {
      return head + '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('sup.window.on', { until: HS.fmt.time(w.until + 'Z'), by: w.by })) + '</span></div>' +
        '<p>' + HS.esc(HS.t('sup.window.code')) + ' <bdi dir="ltr" class="sup-code">' + HS.esc(w.code) + '</bdi></p>' +
        '<p class="faint">' + HS.esc((w.scopes || []).map(function (x) { return HS.t('sup.scope.' + x); }).join('، ')) + '</p>' +
        '<div><button class="btn danger" data-supend>' + HS.icon('x', 'sm') + HS.esc(HS.t('sup.window.end')) + '</button></div></section>';
    }
    return head + '<p class="faint">' + HS.esc(HS.t('sup.window.b')) + '</p><form class="stack" data-supwin>' +
      '<div class="row wrap">' + ['view_diagnostics', 'screen_session', 'repair'].map(function (x) {
        return '<label class="row"><input type="checkbox" name="scope" value="' + x + '"' + (x === 'view_diagnostics' ? ' checked' : '') + '> <span>' + HS.esc(HS.t('sup.scope.' + x)) + '</span></label>'; }).join('') + '</div>' +
      '<label class="field"><span>' + HS.esc(HS.t('sup.minutes')) + '</span><select class="input" name="minutes">' + [30, 60, 120].map(function (m) {
        return '<option value="' + m + '">' + HS.esc(HS.t('sup.minutes.n', { n: m })) + '</option>'; }).join('') + '</select></label>' +
      '<div><button class="btn primary" data-supopen>' + HS.icon('check', 'sm') + HS.esc(HS.t('sup.window.open')) + '</button></div></form></section>';
  }
  function linkHTML(r) {
    var l = r.link || {};
    return '<section class="card stack" data-sup="link"><header><span class="tile-ic">' + HS.icon('settings') + '</span><h2>' + HS.esc(HS.t('sup.link')) + '</h2></header>' +
      '<div class="row wrap"><span class="badge ' + (l.configured ? 'ok' : '') + '">' + HS.esc(HS.t(l.configured ? 'sup.link.on' : 'sup.link.off')) + '</span>' +
      (l.configured ? '<bdi dir="ltr" class="faint">' + HS.esc(l.host) + ' · ins_…' + HS.esc(l.ends) + '</bdi>' : '') + '</div>' +
      (l.lastError ? '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(HS.t(l.lastError)) + '</span></div>' : '') +
      (r.here ? '<form class="stack" data-suplink autocomplete="off"><input class="input" name="url" dir="ltr" placeholder="https://" aria-label="' + HS.esc(HS.t('sup.link.url')) + '">' +
        '<input class="input" name="token" type="password" dir="ltr" spellcheck="false" autocomplete="off" placeholder="ins_…" aria-label="' + HS.esc(HS.t('sup.link.token')) + '">' +
        '<div class="row wrap"><button class="btn primary" data-suplinksave>' + HS.icon('check', 'sm') + HS.esc(HS.t('common.save')) + '</button>' +
        (l.configured ? '<button type="button" class="btn" data-supcheck>' + HS.icon('sync', 'sm') + HS.esc(HS.t('sup.link.test')) + '</button><button type="button" class="btn danger" data-supclear>' + HS.icon('x', 'sm') + HS.esc(HS.t('sup.link.clear')) + '</button>' : '') +
        '</div></form>' : '<p class="faint">' + HS.esc(HS.t('sup.link.here')) + '</p>') +
      '<div class="tip">' + HS.icon('shield') + '<span>' + HS.esc(HS.t('sup.privacy')) + '</span></div></section>';
  }
  function ticketsHTML(list) {
    if (!list.length) return '<p class="faint">' + HS.esc(HS.t('sup.mine.none')) + '</p>';
    return '<ul class="sup-tickets">' + list.map(function (t) {
      return '<li><strong>' + HS.esc(t.subject) + '</strong> <span class="badge ' + (t.status === 'resolved' ? 'ok' : 'info') + '">' + HS.esc(HS.t('sup.status.' + t.status)) + '</span>' +
        (t.vendor_reply ? '<p>' + HS.esc(HS.t('sup.reply')) + ' ' + HS.esc(t.vendor_reply) + '</p>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function mountSupport(root) {
    var box = root.querySelector('[data-support]'); if (!box) return;
    function load() {
      HS.get('/api/support').then(function (r) {
        box.innerHTML = supportHTML(r);
        var tl = box.querySelector('[data-suptickets]');
        if (tl) HS.get('/api/support/tickets').then(function (x) { tl.innerHTML = ticketsHTML(x.tickets || []); }, function (e) { tl.innerHTML = '<p class="faint">' + HS.esc(U.errorText(e)) + '</p>'; });
      }, function (e) { box.innerHTML = U.empty('alert', U.errorText(e)); });
    }
    load();
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (f.matches('[data-supform]')) {
        U.run(HS.post('/api/support/ticket', { subject: f.subject.value, message: f.message.value, attach: f.attach.checked }), 'sup.sent', f.querySelector('[data-supsend]')).then(load, function () {});
      } else if (f.matches('[data-supwin]')) {
        var scopes = HS.$$('input[name=scope]:checked', f).map(function (x) { return x.value; });
        U.run(HS.post('/api/support/window', { minutes: +f.minutes.value, scopes: scopes }), 'sup.window.opened', f.querySelector('[data-supopen]')).then(load, function () {});
      } else if (f.matches('[data-suplink]')) {
        U.run(HS.post('/api/support/link', { url: f.url.value.trim(), token: f.token.value.trim() }), 'sup.link.saved', f.querySelector('[data-suplinksave]')).then(load, function () {});
      }
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-supend],[data-supclear],[data-supcheck]'); if (!b) return;
      if (b.hasAttribute('data-supend')) U.run(HS.post('/api/support/window/end'), 'sup.window.ended', b).then(load, function () {});
      if (b.hasAttribute('data-supclear')) U.run(HS.post('/api/support/link', { clear: true }), 'sup.link.cleared', b).then(load, function () {});
      if (b.hasAttribute('data-supcheck')) U.run(HS.post('/api/support/check'), 'sup.link.ok', b).then(load, function () {});
    });
  }

  function visible() { return TOPICS.filter(function (t) { return !t.perm || HS.can(t.perm); }); }
  function topicHTML(t, open) {
    var qa = [];
    for (var k = 1; k <= t.n; k++) qa.push('<details' + (open && k === 1 ? ' open' : '') + '><summary>' + HS.esc(HS.t('hq.' + t.id + '.' + k + '.q')) + '</summary><p>' + HS.esc(HS.t('hq.' + t.id + '.' + k + '.a')) + '</p></details>');
    return '<section class="help-topic" id="topic-' + t.id + '" data-topic="' + t.id + '"><header class="row"><span class="tile-ic">' + HS.icon(t.icon) + '</span><h2 class="grow">' + HS.esc(HS.t('hq.' + t.id)) + '</h2>' +
      '<a class="btn sm" href="#/' + t.page + '">' + HS.esc(HS.t('help.open')) + HS.icon('right', 'sm mirror') + '</a></header><div class="faq">' + qa.join('') + '</div></section>';
  }

  HS.views.help = {
    render: function (ctx) {
      var list = visible(), q = (ctx && ctx.route && ctx.route.q) || {};
      // three ways in: step-by-step guides (default), situations from real centres, questions and answers
      var view = q.view || (q.topic || q.q ? 'faq' : 'guides');
      var seg = '<div class="seg help-views" role="tablist">' + ['guides', 'situations', 'faq', 'support'].map(function (v) {
        return '<button type="button" role="tab" data-hview="' + v + '" aria-pressed="' + (v === view) + '">' + HS.icon(v === 'guides' ? 'compass' : v === 'situations' ? 'life' : v === 'support' ? 'chat' : 'help', 'sm') + HS.esc(HS.t('help.view.' + v)) + '</button>'; }).join('') + '</div>';
      var head = '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('help.title')) + '</h1><p>' + HS.esc(HS.t('help.sub')) + '</p></div>' +
          '<button class="btn" data-a="tour">' + HS.icon('play', 'sm') + HS.esc(HS.t('help.tour.start')) + '</button>' +
          '<button class="btn" data-a="slides">' + HS.icon('present', 'sm') + HS.esc(HS.t('help.slides.start')) + '</button></div>' + seg;
      if (view === 'guides' && HS.guides) return head + '<div class="stack">' + HS.guides.html(q.for || '') + '</div>';
      if (view === 'situations' && HS.guides) return head + '<div class="stack">' + HS.guides.situationsHTML() + '</div>';
      if (view === 'support') return head + '<div class="stack" data-support><p class="faint">' + HS.esc(HS.t('common.loading')) + '</p></div>';
      return head + '<div class="help-search">' + HS.icon('search', 'lg') + '<input class="input" id="help-q" type="search" placeholder="' + HS.esc(HS.t('help.search')) + '" aria-label="' + HS.esc(HS.t('help.search')) + '" value="' + HS.esc(q.q || '') + '"></div>' +
        '<nav class="help-cards" aria-label="' + HS.esc(HS.t('help.topics')) + '">' + list.map(function (t) {
          return '<a href="#/help?topic=' + t.id + '" data-jump="' + t.id + '" class="help-card' + (q.topic === t.id ? ' on' : '') + '">' + HS.icon(t.icon) + '<span>' + HS.esc(HS.t('hq.' + t.id)) + '</span></a>'; }).join('') + '</nav>' +
        '<div class="stack" id="help-topics">' + list.map(function (t) { return topicHTML(t, q.topic === t.id); }).join('') + '</div>' +
        '<div class="empty" id="faq-none" hidden><div class="art">' + HS.icon('search', 'lg') + '</div><h3>' + HS.esc(HS.t('help.none')) + '</h3><p>' + HS.esc(HS.t('help.none.b')) + '</p></div>';
    },
    mount: function (root, ctx) {
      root.addEventListener('click', function (e) {
        var v = e.target.closest('[data-hview]'); if (v) HS.go('help?view=' + v.dataset.hview);
      });
      mountSupport(root);
      var gid = ctx && ctx.route && ctx.route.q.guide, g = gid && root.querySelector('#guide-' + gid);
      if (g) { g.open = true; setTimeout(function () { if (g.scrollIntoView) g.scrollIntoView({ block: 'start' }); }, 50); }
      if (!root.querySelector('#help-q')) { HS.$$('[data-a="tour"]', root).forEach(function (b) { b.addEventListener('click', function () { HS.go('overview'); setTimeout(HS.tour.start, 350); }); });
        HS.$$('[data-a="slides"]', root).forEach(function (b) { b.addEventListener('click', function () { HS.slides.open(); }); }); return; }
      root.querySelector('[data-a="tour"]').addEventListener('click', function () { HS.go('overview'); setTimeout(HS.tour.start, 350); });
      root.querySelector('[data-a="slides"]').addEventListener('click', function () { HS.slides.open(); });
      var q = root.querySelector('#help-q');
      function filter() {
        var n = U.key(q.value), shown = 0;   // U.key: أ/ا, ة/ه, ى/ي and Arabic digits match their plain forms
        HS.$$('.help-topic', root).forEach(function (sec) {
          var any = 0;
          HS.$$('details', sec).forEach(function (d) { var hit = !n || U.key(d.textContent).indexOf(n) >= 0; d.hidden = !hit; if (hit) { any++; if (n) d.open = true; } });
          sec.hidden = !any; shown += any;
        });
        root.querySelector('#faq-none').hidden = shown > 0;
      }
      q.addEventListener('input', HS.debounce(filter, 100));
      root.addEventListener('click', function (e) {
        var j = e.target.closest('[data-jump]'); if (!j) return;
        e.preventDefault();
        q.value = ''; filter();
        var sec = root.querySelector('#topic-' + j.dataset.jump);
        if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); var d = sec.querySelector('details'); if (d) d.open = true; }
        HS.$$('.help-card', root).forEach(function (c) { c.classList.toggle('on', c === j); });
      });
      var t = ctx && ctx.route && ctx.route.q.topic;
      if (q.value) filter();
      if (t) setTimeout(function () { var sec = root.querySelector('#topic-' + t); if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'start' }); }, 50);
    }
  };
})();
