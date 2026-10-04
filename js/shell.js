/* Hessa - the application shell: side menu, top bar, router, side panels, command palette, keyboard shortcuts,
   guided tour and welcome slides. Pages plug in through HS.views[id] = { render(ctx) -> html, mount(root, ctx) }. */
(function () {
  'use strict';
  var HS = window.HS;

  /* ---------- page registry (order = menu order) ---------- */
  // perm: permission (or list) that shows the page; key: the letter after "G" that jumps there; phase: when it is built
  var PAGES = [
    { id: 'overview', icon: 'home', group: 'ops', perm: 'overview.view', key: 'o', phase: 1 },
    { id: 'trips', icon: 'route', group: 'ops', perm: 'trips.view', key: 't', phase: 2 },
    { id: 'board', icon: 'board', group: 'ops', perm: 'board.view', key: 'b', phase: 2 },
    { id: 'review', icon: 'shield', group: 'ops', perm: 'review.view', key: 'r', phase: 2 },
    { id: 'vehicles', icon: 'car', group: 'fleet', perm: 'fleet.view', key: 'v', phase: 2 },
    { id: 'drivers', icon: 'wheel', group: 'fleet', perm: 'fleet.view', key: 'd', phase: 2 },
    { id: 'people', icon: 'users', group: 'fleet', perm: 'people.view', key: 'p', phase: 2 },
    { id: 'places', icon: 'pin', group: 'fleet', perm: 'people.view', key: 'l', phase: 2 },
    { id: 'reports', icon: 'chart', group: 'insight', perm: 'reports.view', key: 'e', phase: 1 },
    { id: 'excel', icon: 'sheet', group: 'insight', perm: ['excel.import', 'excel.export'], key: 'x', phase: 1 },
    { id: 'activity', icon: 'activity', group: 'control', perm: 'logs.view', key: 'a', phase: 2 },
    { id: 'settings', icon: 'settings', group: 'control', perm: null, key: 's', phase: 1 },
    { id: 'help', icon: 'help', group: 'control', perm: null, key: 'h', phase: 1 }
  ];
  var GROUPS = ['ops', 'fleet', 'insight', 'control'];
  HS.pages = PAGES;

  HS.can = function (perm) {
    var me = HS.me;
    if (!perm) return true;
    if (!me) return false;
    var list = Array.isArray(perm) ? perm : [perm];
    return list.some(function (p) { return (me.perms || []).indexOf(p) >= 0; });
  };
  function visiblePages() { return PAGES.filter(function (p) { return HS.can(p.perm); }); }

  /* ---------- router ---------- */
  HS.route = function () {
    var h = location.hash.replace(/^#\/?/, '');
    var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var q = {};
    if (qi >= 0) h.slice(qi + 1).split('&').forEach(function (kv) { if (kv) { var a = kv.split('='); q[decodeURIComponent(a[0])] = decodeURIComponent(a[1] || ''); } });
    var parts = path.split('/').filter(Boolean);
    return { path: parts[0] || 'overview', parts: parts, q: q };
  };
  HS.go = function (path) { location.hash = '#/' + path.replace(/^#?\/?/, ''); };

  /* ---------- shell ---------- */
  var shellReady = false;
  function shellHTML() {
    var me = HS.me;
    var groups = GROUPS.map(function (g) {
      var items = visiblePages().filter(function (p) { return p.group === g; });
      if (!items.length) return '';
      return '<div class="nav-group"><span>' + HS.esc(HS.t('nav.g.' + g)) + '</span>' + items.map(function (p) {
        return '<a href="#/' + p.id + '" data-page="' + p.id + '" class="' + (p.phase > 1 ? 'soon' : '') + '" title="' + HS.esc(HS.t('nav.' + p.id)) + '">' +
          HS.icon(p.icon) + '<span>' + HS.esc(HS.t('nav.' + p.id)) + '</span><i class="kbd kbd-hint">' + p.key.toUpperCase() + '</i></a>';
      }).join('') + '</div>';
    }).join('');
    var initials = (me.full_name || me.username || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
    return '<div class="app" id="app-shell" data-collapsed="' + (HS.prefs.data.collapsed ? 1 : 0) + '">' +
      '<aside class="sidebar" id="sidebar" aria-label="' + HS.esc(HS.t('top.menu')) + '">' +
        '<div class="brand"><div class="mark">' + HS.icon('route', 'lg') + '</div><div class="name">' + HS.esc(HS.t('app.name')) + '<small>' + HS.esc(HS.t('app.tagline')) + '</small></div></div>' +
        '<nav class="nav" data-tour="nav">' + groups + '</nav>' +
        '<div class="side-foot"><button class="icon-btn" data-act="account" aria-label="' + HS.esc(HS.t('top.account')) + '" style="background:var(--side-active);color:var(--side-ink);font-weight:700;border-radius:50%">' + HS.esc(initials) + '</button>' +
          '<div class="who"><b>' + HS.esc(me.full_name || me.username) + '</b><small>' + HS.esc(me.role || '') + '</small></div>' +
          '<button class="icon-btn mirror-ic" data-act="collapse" aria-label="' + HS.esc(HS.t('top.collapse')) + '" title="' + HS.esc(HS.t('top.collapse')) + ' ([)">' + HS.icon('collapse') + '</button></div>' +
      '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<button class="icon-btn menu-btn" data-act="menu" aria-label="' + HS.esc(HS.t('top.menu')) + '">' + HS.icon('menu') + '</button>' +
          '<div class="crumbs" id="crumbs"></div>' +
          '<span class="grow"></span>' +
          '<button class="search-trigger" data-act="palette" data-tour="search">' + HS.icon('search', 'sm') + '<span>' + HS.esc(HS.t('top.search')) + '</span><i class="kbd">Ctrl K</i></button>' +
          '<span class="grow" style="flex:0 0 0"></span>' +
          '<span data-tour="tools" class="row" style="gap:.2rem">' +
          '<button class="icon-btn" data-act="lang" aria-label="' + HS.esc(HS.t('top.lang')) + '" title="' + HS.esc(HS.t('top.lang')) + ' (L)">' + HS.icon('globe') + '</button>' +
          '<button class="icon-btn" data-act="theme" id="theme-btn" aria-label="' + HS.esc(HS.t('top.theme')) + '" title="' + HS.esc(HS.t('top.theme')) + ' (T)"></button>' +
          '<button class="icon-btn" data-act="keys" aria-label="' + HS.esc(HS.t('top.shortcuts')) + '" title="' + HS.esc(HS.t('top.shortcuts')) + ' (?)">' + HS.icon('keyboard') + '</button>' +
          '</span>' +
        '</header>' +
        '<main class="content" id="view" tabindex="-1"></main>' +
      '</div>' +
      '<div id="panels" aria-live="polite"></div>' +
      '</div>';
  }

  HS.shell = {
    start: function () {
      var root = HS.$('#root');
      root.innerHTML = shellHTML() + '<div id="overlay"></div><div id="toasts" aria-live="polite"></div><div id="tour"></div><div id="slides"></div>';
      shellReady = true;
      refreshThemeButton();
      window.addEventListener('hashchange', renderRoute);
      renderRoute();
      if (!HS.prefs.data.welcomed) setTimeout(function () { HS.slides.open(true); }, 500);
    },
    stop: function () { shellReady = false; }
  };

  function refreshThemeButton() {
    var b = HS.$('#theme-btn');
    if (b) b.innerHTML = HS.icon(HS.prefs.isDark() ? 'sun' : 'moon');
  }

  function renderRoute() {
    if (!shellReady) return;
    var r = HS.route();
    var page = PAGES.filter(function (p) { return p.id === r.path; })[0];
    if (!page || !HS.can(page.perm)) { HS.go('overview'); return; }
    HS.$$('#sidebar a[data-page]').forEach(function (a) { if (a.dataset.page === page.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    HS.$('#crumbs').innerHTML = '<span class="mut">' + HS.esc(HS.t('app.name')) + '</span><span class="mut faint">/</span><b>' + HS.esc(HS.t('nav.' + page.id)) + '</b>';
    document.title = HS.t('nav.' + page.id) + ' · ' + HS.t('app.name');
    var view = HS.views[page.id] || HS.views.soon;
    var old = HS.$('#view'), host = old.cloneNode(false);   // a fresh element: no listeners of the previous page stay behind, and the page-in animation replays
    old.replaceWith(host);
    var ctx = { page: page, route: r, me: HS.me };
    host.innerHTML = view.render(ctx);
    if (view.mount) view.mount(host, ctx);
    window.scrollTo(0, 0);
    HS.emit('route', r);
  }
  HS.rerender = function () { renderRoute(); };

  /* ---------- rebuild everything when language or theme changes ---------- */
  HS.on('lang-changed', function () { if (shellReady) { rebuildShell(); } });
  HS.on('prefs-applied', function () { if (shellReady) refreshThemeButton(); });
  function rebuildShell() {
    var collapsed = HS.prefs.data.collapsed;
    var root = HS.$('#root');
    var panelsOpen = panelStack.slice();
    root.innerHTML = shellHTML() + '<div id="overlay"></div><div id="toasts" aria-live="polite"></div><div id="tour"></div><div id="slides"></div>';
    HS.$('#app-shell').dataset.collapsed = collapsed ? 1 : 0;
    refreshThemeButton();
    panelStack = [];
    renderRoute();
    panelsOpen.forEach(function (p) { HS.panel.open(p.opts, true); });
  }

  /* ---------- side panels (stackable, Esc closes the top one) ---------- */
  var panelStack = [];
  HS.panel = {
    open: function (opts, instant) {
      var host = HS.$('#panels');
      if (!host) return;
      if (!panelStack.length) {
        var sc = document.createElement('div');
        sc.className = 'drawer-scrim';
        sc.addEventListener('click', function () { HS.panel.close(); });
        host.appendChild(sc);
        requestAnimationFrame(function () { sc.classList.add('on'); });
      }
      panelStack.forEach(function (p) { p.el.classList.add('behind'); });
      var el = document.createElement('aside');
      el.className = 'drawer';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', opts.title);
      el.innerHTML = '<header><h2>' + (opts.ltr ? '<bdi dir="ltr">' + HS.esc(opts.title) + '</bdi>' : HS.esc(opts.title)) + '</h2><button class="icon-btn" data-pclose aria-label="' + HS.esc(HS.t('common.close')) + '">' + HS.icon('x') + '</button></header>' +
        '<div class="body">' + opts.body + '</div>' + (opts.footer ? '<footer>' + opts.footer + '</footer>' : '');
      host.appendChild(el);
      el.querySelector('[data-pclose]').addEventListener('click', function () { HS.panel.close(); });
      panelStack.push({ el: el, opts: opts });
      if (instant) el.classList.add('on'); else requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('on'); }); });
      if (opts.mount) opts.mount(el);
      host.style.pointerEvents = 'auto';
      return el;
    },
    close: function () {
      var top = panelStack.pop();
      if (!top) return false;
      var host = HS.$('#panels');
      top.el.classList.remove('on');
      setTimeout(function () { top.el.remove(); }, 260);
      if (panelStack.length) panelStack[panelStack.length - 1].el.classList.remove('behind');
      else {
        var sc = host.querySelector('.drawer-scrim');
        if (sc) { sc.classList.remove('on'); setTimeout(function () { sc.remove(); }, 260); }
        host.style.pointerEvents = 'none';
      }
      return true;
    },
    count: function () { return panelStack.length; }
  };

  /* ---------- command palette ---------- */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  }
  function paletteItems() {
    var items = visiblePages().map(function (p) {
      return { icon: p.icon, label: HS.t('nav.' + p.id), group: HS.t('pal.g.pages'), hint: 'G ' + p.key.toUpperCase(), run: function () { HS.go(p.id); } };
    });
    items.push(
      { icon: 'plus', label: HS.t('act.newtrip'), group: HS.t('pal.g.actions'), hint: 'N', run: function () { HS.newTrip(); } },
      { icon: 'moon', label: HS.t('act.theme.toggle'), group: HS.t('pal.g.appearance'), hint: 'T', run: function () { HS.prefs.toggleTheme(); } },
      { icon: 'globe', label: HS.t('act.lang.toggle'), group: HS.t('pal.g.appearance'), hint: 'L', run: function () { HS.prefs.toggleLang(); } },
      { icon: 'collapse', label: HS.t('act.collapse'), group: HS.t('pal.g.appearance'), hint: '[', run: function () { toggleCollapse(); } },
      { icon: 'keyboard', label: HS.t('act.shortcuts'), group: HS.t('pal.g.actions'), hint: '?', run: function () { showKeys(); } },
      { icon: 'play', label: HS.t('act.tour'), group: HS.t('pal.g.actions'), hint: '', run: function () { HS.tour.start(); } },
      { icon: 'present', label: HS.t('act.slides'), group: HS.t('pal.g.actions'), hint: '', run: function () { HS.slides.open(); } },
      { icon: 'info', label: HS.t('act.about'), group: HS.t('pal.g.actions'), hint: '', run: function () { openAbout(); } },
      { icon: 'logout', label: HS.t('act.logout'), group: HS.t('pal.g.actions'), hint: '', run: function () { logout(); } }
    );
    return items;
  }
  function openPalette() {
    var all = paletteItems(), sel = 0, list = all;
    var o = HS.overlay.open('<div class="dialog palette" role="dialog" aria-modal="true" aria-label="' + HS.esc(HS.t('top.search')) + '">' +
      '<input id="pal-q" type="text" autocomplete="off" spellcheck="false" placeholder="' + HS.esc(HS.t('pal.placeholder')) + '" aria-label="' + HS.esc(HS.t('top.search')) + '">' +
      '<ul id="pal-list" role="listbox"></ul>' +
      '<div class="foot"><span><i class="kbd">↑</i> <i class="kbd">↓</i> ' + HS.esc(HS.t('pal.move')) + '</span><span><i class="kbd">↵</i> ' + HS.esc(HS.t('pal.open')) + '</span><span><i class="kbd">Esc</i> ' + HS.esc(HS.t('pal.close')) + '</span></div></div>', { center: false });
    var q = HS.$('#pal-q', o), ul = HS.$('#pal-list', o);
    function paint() {
      if (!list.length) { ul.innerHTML = '<li class="faint" style="cursor:default">' + HS.esc(HS.t('pal.none')) + '</li>'; return; }
      ul.innerHTML = list.map(function (it, i) {
        return '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '">' + HS.icon(it.icon) + '<span>' + HS.esc(it.label) + '</span>' +
          '<span class="grp">' + (it.hint ? '<i class="kbd">' + HS.esc(it.hint) + '</i> ' : '') + HS.esc(it.group) + '</span></li>';
      }).join('');
      var cur = ul.querySelector('[aria-selected="true"]');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    }
    function run(i) { var it = list[i]; if (!it) return; HS.overlay.close(); setTimeout(it.run, 30); }
    q.addEventListener('input', function () {
      var n = norm(q.value);
      list = all.filter(function (it) { return !n || norm(it.label).indexOf(n) >= 0 || norm(it.group).indexOf(n) >= 0; });
      if (n.length >= 2 && HS.data && HS.data.state && HS.paletteRecords) list = list.concat(HS.paletteRecords(q.value).slice(0, 8));
      sel = 0; paint();
    });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
    });
    ul.addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (li) run(Number(li.dataset.i)); });
    paint();
  }
  HS.palette = { open: openPalette };

  /* ---------- keyboard shortcuts sheet ---------- */
  function showKeys() {
    var rows = [
      ['Ctrl K', 'keys.search'], ['?', 'keys.help'], ['G + O T B R V D P L E X A S H', 'keys.go'], ['T', 'keys.theme'], ['L', 'keys.lang'],
      ['[', 'keys.collapse'], ['Esc', 'keys.close'], ['N', 'keys.new'], ['[ ]', 'keys.day']
    ];
    rows[8][0] = '← →';
    HS.dialog({ title: HS.t('keys.title'), wide: true,
      body: '<div class="keys">' + rows.map(function (r) { return '<div><span>' + HS.esc(HS.t(r[1])) + '</span><span>' + r[0].split(' ').map(function (k) { return k === '+' ? '+' : '<i class="kbd">' + HS.esc(k) + '</i>'; }).join(' ') + '</span></div>'; }).join('') + '</div>' +
        '<p class="faint">' + HS.esc(HS.t('keys.note')) + '</p>' });
  }
  HS.showKeys = showKeys;

  function openAbout() {
    HS.get('/api/auth/status').then(function (s) {
      var a = s.about || {};
      HS.panel.open({ title: HS.t('panel.about'), body:
        '<div class="card"><div class="row"><div class="brand" style="padding:0;min-height:0"><div class="mark" style="background:var(--signal)">' + HS.icon('route', 'lg') + '</div></div><div><h3>' + HS.esc(HS.t('app.name')) + '</h3><span class="muted">' + HS.esc(HS.t('common.version')) + ' <span class="num">' + HS.esc(a.version || '') + '</span></span></div></div>' +
        '<p style="margin-top:.9rem">' + HS.esc(HS.t('panel.about.body')) + '</p></div>' +
        '<div class="tip">' + HS.icon('info') + '<span>' + HS.esc(HS.t('panel.sheet')) + '</span></div>' +
        '<dl class="kv"><dt>©</dt><dd>' + HS.esc((a.copyright || '').replace('©', '').trim()) + '</dd></dl>' });
    });
  }

  function openAccount() {
    var me = HS.me;
    HS.panel.open({ title: HS.t('panel.account'), body:
      '<div class="card"><h3>' + HS.esc(me.full_name || me.username) + '</h3><span class="muted">@' + HS.esc(me.username) + '</span>' +
      '<dl class="kv" style="margin-top:1rem"><dt>' + HS.esc(HS.t('panel.account.role')) + '</dt><dd>' + HS.esc(me.role || '') + '</dd>' +
      '<dt>' + HS.esc(HS.t('panel.account.node')) + '</dt><dd>' + HS.esc(me.node ? me.node.name : '') + '</dd>' +
      '<dt>' + HS.esc(HS.t('panel.account.perms')) + '</dt><dd><span class="num">' + (me.perms || []).length + '</span></dd></dl></div>',
      footer: '<button class="btn" data-logout>' + HS.icon('logout', 'sm') + HS.esc(HS.t('auth.logout')) + '</button>',
      mount: function (el) { el.querySelector('[data-logout]').addEventListener('click', logout); } });
  }

  function logout() {
    HS.post('/api/auth/logout').then(function () { HS.emit('logged-out'); }, function () { HS.emit('logged-out'); });
  }
  function toggleCollapse() {
    var v = !HS.prefs.data.collapsed;
    HS.prefs.data.collapsed = v; HS.prefs.save();
    var app = HS.$('#app-shell'); if (app) app.dataset.collapsed = v ? 1 : 0;
  }

  /* ---------- clicks and keys ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !shellReady) return;
    var a = b.dataset.act;
    if (a === 'palette') openPalette();
    else if (a === 'theme') HS.prefs.toggleTheme();
    else if (a === 'lang') HS.prefs.toggleLang();
    else if (a === 'keys') showKeys();
    else if (a === 'collapse') toggleCollapse();
    else if (a === 'account') openAccount();
    else if (a === 'menu') { var app = HS.$('#app-shell'); app.dataset.menu = app.dataset.menu === '1' ? 0 : 1; }
  });
  document.addEventListener('click', function (e) {   // on a phone the menu closes after choosing a page
    if (e.target.closest('#sidebar a[data-page]')) { var app = HS.$('#app-shell'); if (app) app.dataset.menu = 0; }
    else if (e.target.id === 'app-shell' || (e.target.closest && e.target.closest('.app[data-menu="1"]') && !e.target.closest('#sidebar') && !e.target.closest('[data-act="menu"]'))) {
      var ap = HS.$('#app-shell'); if (ap && ap.dataset.menu === '1' && e.target.closest('.main') === null) ap.dataset.menu = 0;
    }
  });

  var goPending = 0;
  document.addEventListener('keydown', function (e) {
    if (!shellReady) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); if (HS.overlay.isOpen) HS.overlay.close(); else openPalette(); return; }
    if (e.key === 'Escape') {
      if (HS.overlay.isOpen) { HS.overlay.close(); return; }
      if (HS.tour.active) { HS.tour.stop(); return; }
      if (HS.slides.active) { HS.slides.close(); return; }
      if (HS.panel.count()) { HS.panel.close(); return; }
      var app = HS.$('#app-shell'); if (app && app.dataset.menu === '1') app.dataset.menu = 0;
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || HS.overlay.isOpen) return;
    if (HS.slides.active) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === ' ') HS.slides.key(e); return; }
    var code = e.code || '';
    if (goPending && Date.now() - goPending < 1300) {
      goPending = 0;
      var letter = code.replace('Key', '').toLowerCase();
      var page = visiblePages().filter(function (p) { return p.key === letter; })[0];
      if (page) { e.preventDefault(); HS.go(page.id); }
      return;
    }
    if (e.key === '?' || (e.shiftKey && code === 'Slash')) { e.preventDefault(); showKeys(); }
    else if (code === 'KeyG') { goPending = Date.now(); }
    else if (code === 'KeyT') { HS.prefs.toggleTheme(); }
    else if (code === 'KeyL') { HS.prefs.toggleLang(); }
    else if (code === 'KeyN') { if (HS.can('trips.create')) { e.preventDefault(); HS.newTrip(); } }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && HS.boardShift) { var rtl = document.documentElement.dir === 'rtl'; if (HS.boardShift((e.key === 'ArrowRight') === rtl ? -1 : 1)) e.preventDefault(); }
    else if (e.key === '[') { toggleCollapse(); }
    else if (e.key === '/') { e.preventDefault(); openPalette(); }
  });

  /* ---------- guided tour (spotlight) ---------- */
  var TOUR = [
    { sel: '[data-tour="nav"]', k: 1 }, { sel: '[data-tour="search"]', k: 2 }, { sel: '[data-tour="tools"]', k: 3 },
    { sel: '[data-tour="kpis"]', k: 4, page: 'overview' }, { sel: '[data-act="account"]', k: 5 }
  ];
  HS.tour = {
    active: false,
    start: function () {
      var steps = TOUR.filter(function (s) { return HS.$(s.sel); });
      if (!steps.length) return;
      var i = 0, host = HS.$('#tour');
      HS.tour.active = true;
      host.style.pointerEvents = 'auto';
      function show() {
        var s = steps[i], el = HS.$(s.sel);
        el.scrollIntoView({ block: 'center' });
        var r = el.getBoundingClientRect(), pad = 6;
        var pw = Math.min(352, window.innerWidth - 32), ph = 210, gap = 16, vw = window.innerWidth, vh = window.innerHeight;
        var top, left, tall = r.height > vh * 0.5;
        var clampX = function (x) { return Math.min(Math.max(12, x), vw - pw - 12); };
        var clampY = function (y) { return Math.min(Math.max(12, y), vh - ph - 12); };
        if (!tall && r.bottom + gap + ph <= vh) { top = r.bottom + gap; left = clampX(r.left + r.width / 2 - pw / 2); }
        else if (!tall && r.top - gap - ph >= 0) { top = r.top - gap - ph; left = clampX(r.left + r.width / 2 - pw / 2); }
        else if (r.left - gap - pw >= 12) { left = r.left - gap - pw; top = clampY(r.top + 24); }
        else if (r.right + gap + pw <= vw - 12) { left = r.right + gap; top = clampY(r.top + 24); }
        else { left = clampX(12); top = clampY(vh - ph - 12); }
        host.innerHTML = '<div class="hole" style="top:' + (r.top - pad) + 'px;left:' + (r.left - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px"></div>' +
          '<div class="pop" role="dialog" style="top:' + top + 'px;left:' + left + 'px"><h3>' + HS.esc(HS.t('tour.' + s.k + '.t')) + '</h3><p class="muted">' + HS.esc(HS.t('tour.' + s.k + '.b')) + '</p>' +
          '<div class="row"><span class="dots">' + steps.map(function (_, n) { return '<i class="' + (n === i ? 'on' : '') + '"></i>'; }).join('') + '</span><span class="faint num">' + HS.t('tour.of', { n: i + 1, m: steps.length }) + '</span>' +
          '<span class="grow"></span><button class="btn ghost sm" data-tskip>' + HS.esc(HS.t('common.skip')) + '</button><button class="btn primary sm" data-tnext>' + HS.esc(i === steps.length - 1 ? HS.t('common.done') : HS.t('common.next')) + '</button></div></div>';
        host.querySelector('[data-tskip]').onclick = HS.tour.stop;
        host.querySelector('[data-tnext]').onclick = function () { if (i === steps.length - 1) HS.tour.stop(); else { i++; show(); } };
      }
      show();
    },
    stop: function () {
      var host = HS.$('#tour');
      HS.tour.active = false;
      if (host) { host.innerHTML = ''; host.style.pointerEvents = 'none'; }
    }
  };

  /* ---------- welcome slides ---------- */
  var SLIDE_ICONS = ['route', 'chat', 'camera', 'shield', 'sheet', 'lock'];
  HS.slides = {
    active: false, i: 0,
    open: function (first) {
      var host = HS.$('#slides'), n = SLIDE_ICONS.length;
      HS.slides.active = true; HS.slides.i = 0;
      host.className = 'on';
      host.innerHTML = '<button class="btn x" data-sclose aria-label="' + HS.esc(HS.t('common.close')) + '">' + HS.icon('x', 'sm') + '</button><div class="track">' +
        SLIDE_ICONS.map(function (ic, k) { return '<section><div class="big">' + HS.icon(ic) + '</div><h2>' + HS.esc(HS.t('slide.' + (k + 1) + '.t')) + '</h2><p>' + HS.esc(HS.t('slide.' + (k + 1) + '.b')) + '</p></section>'; }).join('') +
        '</div><div class="nav-s"><button class="btn" data-sprev aria-label="' + HS.esc(HS.t('common.back')) + '">' + HS.icon('left', 'sm mirror') + '</button><span class="dots">' + SLIDE_ICONS.map(function () { return '<i></i>'; }).join('') + '</span>' +
        '<button class="btn primary" data-snext>' + HS.esc(HS.t('common.next')) + '</button></div>';
      var track = host.querySelector('.track'), dots = host.querySelectorAll('.dots i'), next = host.querySelector('[data-snext]');
      function go(k) {
        HS.slides.i = Math.max(0, Math.min(n - 1, k));
        track.style.transform = 'translateX(' + (-HS.slides.i * 100) + '%)';   // the track is always laid out left to right
        dots.forEach(function (d, j) { d.className = j === HS.slides.i ? 'on' : ''; });
        next.textContent = HS.slides.i === n - 1 ? HS.t('slide.start') : HS.t('common.next');
      }
      HS.slides._go = go;
      host.querySelector('[data-sprev]').onclick = function () { go(HS.slides.i - 1); };
      next.onclick = function () { if (HS.slides.i === n - 1) HS.slides.close(); else go(HS.slides.i + 1); };
      host.querySelector('[data-sclose]').onclick = HS.slides.close;
      go(0);
      if (first) { HS.prefs.data.welcomed = true; HS.prefs.save(); }
    },
    key: function (e) {
      var rtl = document.documentElement.dir === 'rtl';
      if (e.key === ' ' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); if (HS.slides.i === SLIDE_ICONS.length - 1) HS.slides.close(); else HS.slides._go(HS.slides.i + 1); }
      else { e.preventDefault(); HS.slides._go(HS.slides.i - 1); }
    },
    close: function () {
      var host = HS.$('#slides');
      HS.slides.active = false;
      if (host) { host.className = ''; host.innerHTML = ''; }
    }
  };
})();
