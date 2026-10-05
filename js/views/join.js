/* Hessa - first start of a PC: create the centre (first PC) or JOIN the centre PC that already exists, so a door laptop
   keeps its own full copy and keeps working when the owner's PC is off. Also the "is this the same computer?" decision
   and the waiting screen while the first copy arrives. auth.js asks HS.joinFlow.intercept(status) before it draws
   its own setup/login screens; every screen here is only reachable on the PC itself (the server checks that too). */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var F = HS.joinFlow = { mode: 'choose', notice: '' };
  var poll = null;

  function hero() {
    return '<div class="hero"><div class="row"><div class="brand" style="padding:0;min-height:0"><div class="mark">' + HS.icon('cap', 'lg') + '</div><div class="name">' + HS.esc(HS.t('app.name')) + '</div></div>' +
      '<span class="grow"></span><button class="btn ghost sm" data-lang style="color:var(--side-ink)">' + HS.icon('globe', 'sm') + (HS.lang === 'ar' ? 'English' : 'العربية') + '</button></div>' +
      '<div><h1>' + HS.esc(HS.t('auth.hero.title')) + '</h1><p>' + HS.esc(HS.t('auth.hero.sub')) + '</p></div><div class="road" aria-hidden="true"></div></div>';
  }
  function screen(html) {
    var root = HS.$('#root');
    root.innerHTML = '<div class="auth">' + hero() + '<div class="panel"><div class="auth-box">' + html + '</div></div></div><div id="overlay"></div><div id="toasts"></div>';
    var b = root.querySelector('[data-lang]');
    if (b) b.addEventListener('click', function () { HS.prefs.toggleLang(); HS.emit('auth-rerender'); });
    return root;
  }
  function choice(act, icon, title, text, primary) {
    return '<button type="button" class="choice-btn' + (primary ? ' primary' : '') + '" data-c="' + act + '">' + HS.icon(icon) + '<b>' + HS.esc(title) + '</b><small>' + HS.esc(text) + '</small></button>';
  }
  function again() { clearInterval(poll); HS.emit('auth-rerender'); }

  /* ---------- 1. a brand-new PC: first PC or join ---------- */
  function chooseScreen() {
    var root = screen('<div><h2>' + HS.esc(HS.t('join.title')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('join.sub')) + '</p></div>' +
      '<div class="choice-list">' + choice('create', 'user', HS.t('join.create'), HS.t('join.create.b'), true) + choice('join', 'plug', HS.t('join.join'), HS.t('join.join.b')) + '</div>');
    root.querySelector('.choice-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      F.mode = b.dataset.c; again();
    });
  }

  /* ---------- 2. join: find the centre PC, check the address while typing, join ---------- */
  function joinScreen(name) {
    var root = screen('<div><h2>' + HS.esc(HS.t('join.join')) + '</h2><p class="muted" id="j-find" style="margin-top:.4rem">' + HS.esc(HS.t('join.looking')) + '</p></div><div id="j-found" class="choice-list"></div>' +
      '<form id="j-form" autocomplete="off" class="stack">' +
        '<div class="field"><label for="j-name">' + HS.esc(HS.t('join.pcname')) + '</label><input class="input" id="j-name" name="name" required value="' + HS.esc(name || '') + '" placeholder="' + HS.esc(HS.t('join.pcname.ph')) + '"></div>' +
        '<div class="field"><label for="j-addr">' + HS.esc(HS.t('join.addr')) + '</label><input class="input" id="j-addr" name="address" required dir="ltr" autocapitalize="off" spellcheck="false" placeholder="192.168.1.10"></div>' +
        '<p class="chk" id="j-check" role="status" aria-live="polite"></p>' +
        '<details class="faint"><summary>' + HS.esc(HS.t('join.where')) + '</summary><p>' + HS.esc(HS.t('join.where.b')) + '</p></details>' +
        '<div class="tip bad" id="j-err" hidden role="alert"></div>' +
        '<button class="btn primary" type="submit">' + HS.icon('plug', 'sm') + HS.esc(HS.t('join.go')) + '</button>' +
        '<button class="btn ghost" type="button" data-back>' + HS.icon('left', 'sm mirror') + HS.esc(HS.t('common.back')) + '</button></form>');
    var addr = root.querySelector('#j-addr'), check = root.querySelector('#j-check'), err = root.querySelector('#j-err'), timer;
    function probe() {
      var v = addr.value.trim();
      if (!v) { check.textContent = ''; check.className = 'chk'; return; }
      check.className = 'chk'; check.textContent = HS.t('join.checking');
      HS.post('/api/join/probe', { address: v }).then(function (r) {
        if (addr.value.trim() !== v) return;      // the person kept typing: only the last answer counts
        check.className = 'chk ok'; check.textContent = HS.t('join.found', { name: r.name });
      }, function (e) { if (addr.value.trim() === v) { check.className = 'chk bad'; check.textContent = e.message; } });
    }
    addr.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(probe, 700); });
    root.querySelector('[data-back]').addEventListener('click', function () { F.mode = 'choose'; again(); });
    root.querySelector('#j-found').addEventListener('click', function (e) {
      var b = e.target.closest('[data-address]'); if (!b) return;
      addr.value = b.dataset.address; probe();
    });
    root.querySelector('#j-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('[type=submit]'); btn.disabled = true; err.hidden = true;
      HS.post('/api/join', { address: addr.value.trim(), code: '', name: root.querySelector('#j-name').value.trim() }).then(function () { receivingScreen(); },
        function (er) { btn.disabled = false; err.hidden = false; err.textContent = er.message; });
    });
    // the network scan takes a few seconds; the typed address always wins over what it finds
    HS.post('/api/join/discover', {}).then(function (r) {
      var f = r.found || [], find = root.querySelector('#j-find'), box = root.querySelector('#j-found');
      if (!find || !box) return;
      if (!f.length) { find.textContent = HS.t('join.none'); return; }
      find.textContent = HS.t(f.length === 1 ? 'join.one' : 'join.many');
      box.innerHTML = f.map(function (x) { return '<button type="button" class="choice-btn" data-address="' + HS.esc(x.address) + '">' + HS.icon('check') + '<b>' + HS.esc(x.name) + '</b><small dir="ltr">' + HS.esc(x.address) + '</small></button>'; }).join('');
      if (!addr.value.trim()) { addr.value = f[0].address; probe(); }
    }, function () { var find = root.querySelector('#j-find'); if (find) find.textContent = HS.t('join.none'); });
  }

  /* ---------- 3. joined: the first copy of everything arrives ---------- */
  function receivingScreen() {
    var root = screen('<div><h2>' + HS.esc(HS.t('join.copying')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('join.copying.b')) + '</p></div>' +
      '<div class="skeleton" style="height:.6rem;border-radius:999px"></div><p class="muted" id="j-msg" role="status" aria-live="polite">' + HS.esc(HS.t('join.wait')) + '</p>' +
      '<button class="btn ghost" type="button" data-cancel>' + HS.esc(HS.t('join.cancel')) + '</button>');
    var t0 = Date.now();
    root.querySelector('[data-cancel]').addEventListener('click', function () {
      clearInterval(poll);
      HS.post('/api/join/cancel', {}).then(function () { F.mode = 'choose'; location.reload(); }, function () { location.reload(); });
    });
    clearInterval(poll);
    poll = setInterval(function () {
      HS.get('/api/join/status').then(function (st) {
        var box = HS.$('#j-msg');
        if (!box) { clearInterval(poll); return; }
        if (st.hasUsers) { clearInterval(poll); F.notice = HS.t('join.ready'); HS.emit('logged-in'); return; }
        if (st.status === 'none') { clearInterval(poll); F.mode = 'choose'; again(); return; }
        box.textContent = st.error ? HS.t('join.waitadmin') : Date.now() - t0 > 45000 ? HS.t('join.long') : HS.t('join.wait');
      }, function () { /* the page itself keeps trying */ });
    }, 2000);
  }

  /* ---------- 4. the data folder came from another computer: nothing is shared until a person decides ---------- */
  function movedScreen() {
    var root = screen('<div><h2>' + HS.esc(HS.t('moved.title')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('moved.sub')) + '</p></div>' +
      '<div class="choice-list">' + choice('same', 'check', HS.t('moved.same'), HS.t('moved.same.b'), true) + choice('new', 'plug', HS.t('moved.new'), HS.t('moved.new.b')) + '</div>');
    root.querySelector('.choice-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      if (b.dataset.c === 'same') { HS.post('/api/node/moved', { choice: 'same' }).then(function () { location.reload(); }, function (er) { HS.toast(er.message, 'bad'); }); return; }
      U.confirm({ title: HS.t('moved.new'), body: HS.t('moved.confirm'), ok: HS.t('moved.new') }).then(function (ok) {
        if (ok) HS.post('/api/node/moved', { choice: 'new' }).then(function () {
          screen('<div><h2>' + HS.esc(HS.t('moved.restart')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('moved.restart.b')) + '</p></div>');
        }, function (er) { HS.toast(er.message, 'bad'); });
      });
    });
  }
  function remoteScreen() {
    screen('<div class="empty"><div class="art">' + HS.icon('lock', 'lg') + '</div><h3>' + HS.esc(HS.t('auth.setup.title')) + '</h3><p>' + HS.esc(HS.t('auth.remote')) + '</p></div>');
  }

  /* auth.js calls this first. true = a screen of this file was drawn, false = auth.js draws its own create / login screen */
  F.intercept = function (status) {
    var node = status.node || {};
    if (node.moved) { if (status.local) movedScreen(); else remoteScreen(); return true; }
    if (status.hasUsers) return false;
    if (!status.local) { remoteScreen(); return true; }
    if (node.role === 'member' || node.join) { receivingScreen(); return true; }
    if (F.mode === 'join') { joinScreen(node.name || ''); return true; }
    if (F.mode === 'choose') { chooseScreen(); return true; }
    return false;                                    // 'create': the administrator form of auth.js
  };
  F.takeNotice = function () { var n = F.notice; F.notice = ''; return n; };
})();
