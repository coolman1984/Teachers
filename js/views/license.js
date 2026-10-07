/* Hessa - the monthly subscription on screen (server/license.py):
   - Settings -> Subscription: this PC's request code (copy / send on WhatsApp), the activation code box, the history;
   - a bar at the bottom of every screen from 7 days before the end (trial, ending soon, ended, locked, clock moved back);
   - on the sign-in screen: the same notice, activation of a PC whose trial ended before anybody set it up, and
     "Forgot your password?" (staff: the administrator resets it; the administrator: a one-time code from the seller). */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var BAR_STATES = { trial: 'info', warn: 'warn', grace: 'bad', locked: 'bad', trialEnded: 'bad', clock: 'bad' };
  var last = null, hidden = false, timer = null;

  function dateText(iso) { return iso ? HS.fmt.date(new Date(iso + 'T12:00:00')) : '–'; }
  function stateText(st) {
    return HS.t('lic.s.' + st.state, { n: HS.fmt.num(Math.max(0, st.daysLeft || 0)), g: HS.fmt.num(st.graceLeft || 0), date: dateText(st.until), seen: st.clockSeen || '' });
  }
  function waLink(st, text) {
    return st.vendor ? 'https://wa.me/' + encodeURIComponent(st.vendor) + '?text=' + encodeURIComponent(text) : '';
  }
  function copy(text, btn) {
    var done = function () { HS.toast(HS.t('lic.copied'), 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* the code is on screen */ } t.remove(); }
    if (btn) btn.blur();
  }
  function codeBox(code) { return '<div class="lic-code" dir="ltr"><code data-req>' + HS.esc(code || '') + '</code></div>'; }

  /* ---------- the bar at the bottom ---------- */
  function paintBar(st) {
    last = st;
    var bar = document.getElementById('lic-bar'), tone = st && BAR_STATES[st.state];
    if (!tone || (hidden && (st.state === 'trial' || st.state === 'warn'))) { if (bar) bar.remove(); return; }
    // inside the page column (it never covers the menu or the account button); on the sign-in screen at the bottom of the window
    var home = document.querySelector('.main') || document.body;
    if (bar && bar.parentNode !== home) { bar.remove(); bar = null; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'lic-bar'; bar.setAttribute('role', tone === 'bad' ? 'alert' : 'status'); home.appendChild(bar); }
    var admin = HS.me && HS.me.admin;
    bar.className = 'lic-bar ' + tone;
    bar.innerHTML = HS.icon(tone === 'bad' ? 'alert' : 'clock') + '<span class="grow">' + HS.esc(stateText(st)) + (admin ? '' : ' ' + HS.esc(HS.t('lic.tellAdmin'))) + '</span>' +
      (admin ? '<a class="btn sm ' + (tone === 'bad' ? 'danger' : 'primary') + '" href="#/settings?tab=license">' + HS.icon('key', 'sm') + HS.esc(HS.t('lic.renew')) + '</a>' : '') +
      (tone !== 'bad' ? '<button class="icon-btn" data-lic-hide aria-label="' + HS.esc(HS.t('common.close')) + '">' + HS.icon('x', 'sm') + '</button>' : '');
    var x = bar.querySelector('[data-lic-hide]'); if (x) x.onclick = function () { hidden = true; bar.remove(); };
  }
  function refresh() { return HS.get('/api/license').then(function (st) { paintBar(st); HS.emit('license', st); return st; }, function () {}); }
  HS.license = {
    refresh: refresh,
    status: function () { return last; },
    start: function () { clearInterval(timer); refresh(); timer = setInterval(refresh, 15 * 60 * 1000); },
    stop: function () { clearInterval(timer); var b = document.getElementById('lic-bar'); if (b) b.remove(); last = null; }
  };
  if (HS.on) {
    HS.on('lang-changed', function () { if (last) paintBar(last); });
    HS.on('route', function () { if (last) paintBar(last); });     // the page column exists now: the bar moves into it
    HS.on('logged-out', function () { HS.license.stop(); });
  }

  /* ---------- Settings -> Subscription ---------- */
  function tabBody(st) {
    var tone = BAR_STATES[st.state] || 'ok';
    return '<div class="grid two-col lic-grid"><section class="card stack">' +
        '<header><span class="tile-ic">' + HS.icon('key') + '</span><h2>' + HS.esc(HS.t('lic.title')) + '</h2></header>' +
        '<div class="lic-state ' + tone + '"><b>' + HS.esc(HS.t('lic.state.' + st.state)) + '</b><span>' + HS.esc(stateText(st)) + '</span></div>' +
        '<dl class="kv"><dt>' + HS.esc(HS.t('lic.until')) + '</dt><dd class="num">' + HS.esc(dateText(st.until)) + '</dd>' +
          (st.daysLeft !== null && st.daysLeft !== undefined ? '<dt>' + HS.esc(HS.t('lic.left')) + '</dt><dd class="num">' + HS.fmt.num(Math.max(0, st.daysLeft)) + '</dd>' : '') + '</dl>' +
        (st.required ? '' : '<div class="tip">' + HS.icon('info') + '<span>' + HS.esc(HS.t('lic.notRequired')) + '</span></div>') +
        '<h3 class="sec">1. ' + HS.esc(HS.t('lic.step1')) + '</h3><p class="muted">' + HS.esc(HS.t('lic.step1.b')) + '</p>' + codeBox(st.request) +
        '<div class="row wrap"><button class="btn" data-copy-req>' + HS.icon('copy', 'sm') + HS.esc(HS.t('lic.copy')) + '</button>' +
          (st.vendor ? '<a class="btn" target="_blank" rel="noopener" href="' + HS.esc(waLink(st, HS.t('lic.waText', { code: st.request }))) + '">' + HS.icon('chat', 'sm') + HS.esc(HS.t('lic.wa')) + '</a>' : '') + '</div>' +
        '<h3 class="sec">2. ' + HS.esc(HS.t('lic.step2')) + '</h3><p class="muted">' + HS.esc(HS.t('lic.step2.b')) + '</p>' +
        '<form class="stack" data-lic-form autocomplete="off"><textarea class="input lic-input" name="code" rows="4" dir="ltr" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-…" aria-label="' + HS.esc(HS.t('lic.code')) + '"></textarea>' +
          '<div class="tip bad" data-lic-err hidden role="alert"></div>' +
          '<button class="btn primary" type="submit">' + HS.icon('check', 'sm') + HS.esc(HS.t('lic.activate')) + '</button></form></section>' +
      '<aside class="stack"><section class="card"><h3>' + HS.esc(HS.t('lic.how')) + '</h3><ul class="lic-points">' +
        ['a', 'b', 'c', 'd', 'e'].map(function (k) { return '<li>' + HS.icon('check', 'sm') + '<span>' + HS.esc(HS.t('lic.how.' + k)) + '</span></li>'; }).join('') + '</ul></section>' +
        ((st.history || []).length ? '<section class="card"><h3>' + HS.esc(HS.t('lic.history')) + '</h3><ol class="log-list">' + st.history.slice().reverse().map(function (h) {
          return '<li class="log-row"><div class="log-head"><span class="badge ok">' + HS.esc(HS.t('lic.untilShort', { date: dateText(h.until) })) + '</span><span class="grow"></span><time class="faint num">' + HS.esc(String(h.at || '').replace('T', ' ').slice(0, 16)) + '</time></div>' +
            '<div class="log-sub faint">' + HS.esc(h.by || '') + '</div></li>'; }).join('') + '</ol></section>' : '') + '</aside></div>';
  }
  function activate(form, onDone) {
    var err = form.querySelector('[data-lic-err]'), btn = form.querySelector('[type=submit]'), code = form.code.value.trim();
    err.hidden = true;
    if (!code) { err.hidden = false; err.textContent = HS.t('lic.empty'); return; }
    btn.disabled = true;
    HS.post('/api/license/activate', { code: code }).then(function (st) {
      btn.disabled = false; hidden = false; paintBar(st);
      HS.toast(HS.t('lic.done', { date: dateText(st.until) }), 'ok');
      if (onDone) onDone(st);
    }, function (e) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(e); });
  }
  HS.licenseTab = {
    render: function () {
      if (!(HS.me && HS.me.admin)) return U.empty('lock', HS.t('set.admin.only'), '');
      return '<div data-lic><div class="skeleton" style="height:16rem"></div></div>';
    },
    mount: function (root) {
      var box = root.querySelector('[data-lic]'); if (!box) return;
      function load() { HS.get('/api/license').then(function (st) { box.innerHTML = tabBody(st); paintBar(st); }, function (e) { box.innerHTML = U.empty('alert', U.errorText(e)); }); }
      load();
      box.addEventListener('click', function (e) { var b = e.target.closest('[data-copy-req]'); if (b) copy(box.querySelector('[data-req]').textContent, b); });
      box.addEventListener('submit', function (e) { e.preventDefault(); activate(e.target, function () { load(); }); });
    }
  };

  /* ---------- the sign-in screen ---------- */
  HS.license.authNotice = function (root, status) {
    var holder = root.querySelector('[data-lic-auth]'); if (!holder) return;
    HS.get('/api/license').then(function (st) {
      var tone = BAR_STATES[st.state];
      if (!tone || st.state === 'trial') return;
      var blocked = tone === 'bad' && st.state !== 'grace';
      holder.innerHTML = '<div class="tip ' + (tone === 'bad' ? 'bad' : 'warn') + '">' + HS.icon('alert') + '<span>' + HS.esc(stateText(st)) + (blocked ? ' ' + HS.esc(HS.t('lic.signInStill')) : '') + '</span></div>' +
        (blocked && status && !status.hasUsers && st.request ? '<div class="stack">' + codeBox(st.request) + '<form class="stack" data-lic-form autocomplete="off"><textarea class="input lic-input" name="code" rows="3" dir="ltr" aria-label="' + HS.esc(HS.t('lic.code')) + '"></textarea>' +
          '<div class="tip bad" data-lic-err hidden role="alert"></div><button class="btn" type="submit">' + HS.esc(HS.t('lic.activate')) + '</button></form></div>' : '');
      var f = holder.querySelector('[data-lic-form]');
      if (f) f.addEventListener('submit', function (e) { e.preventDefault(); activate(f, function () { holder.innerHTML = ''; }); });
    }, function () {});
  };

  /* "Forgot your password?" - staff ask the administrator; the administrator uses the seller's one-time code */
  HS.license.forgot = function () {
    var el = HS.dialog({ title: HS.t('fp.title'), wide: true, body:
      '<div class="stack"><div class="tip">' + HS.icon('user') + '<span>' + HS.esc(HS.t('fp.staff')) + '</span></div>' +
      '<h3 class="sec">' + HS.esc(HS.t('fp.admin')) + '</h3><p class="muted">' + HS.esc(HS.t('fp.admin.b')) + '</p>' +
      '<button class="btn" data-fp-req>' + HS.icon('key', 'sm') + HS.esc(HS.t('fp.request')) + '</button><div data-fp-box></div></div>' });
    el.querySelector('[data-fp-req]').addEventListener('click', function (e) {
      var btn = e.currentTarget; btn.disabled = true;
      HS.post('/api/auth/forgot/request', {}).then(function (r) {
        HS.get('/api/license').then(function (st) { return st; }, function () { return {}; }).then(function (st) {
          var box = el.querySelector('[data-fp-box]');
          box.innerHTML = '<p>' + HS.esc(HS.t('fp.send')) + '</p>' + codeBox(r.request) + '<div class="row wrap"><button type="button" class="btn sm" data-fp-copy>' + HS.icon('copy', 'sm') + HS.esc(HS.t('lic.copy')) + '</button>' +
            (st.vendor ? '<a class="btn sm" target="_blank" rel="noopener" href="' + HS.esc(waLink(st, HS.t('fp.waText', { code: r.request }))) + '">' + HS.icon('chat', 'sm') + HS.esc(HS.t('lic.wa')) + '</a>' : '') + '</div>' +
            '<form class="stack" data-fp-form autocomplete="off" style="margin-top:1rem">' +
              '<div class="field"><label for="fp-code">' + HS.esc(HS.t('fp.code')) + '</label><textarea class="input lic-input" id="fp-code" rows="3" dir="ltr" spellcheck="false"></textarea></div>' +
              '<div class="field"><label for="fp-user">' + HS.esc(HS.t('auth.username')) + '</label><input class="input" id="fp-user" dir="ltr" autocapitalize="off" spellcheck="false"></div>' +
              '<div class="field"><label for="fp-pw">' + HS.esc(HS.t('pw.new')) + '</label><input class="input" id="fp-pw" type="password" dir="ltr" autocomplete="new-password"></div>' +
              '<div class="field"><label for="fp-pw2">' + HS.esc(HS.t('pw.again')) + '</label><input class="input" id="fp-pw2" type="password" dir="ltr" autocomplete="new-password"></div>' +
              '<div class="tip bad" data-fp-err hidden role="alert"></div><button class="btn primary" type="submit">' + HS.esc(HS.t('fp.go')) + '</button></form>';
          box.querySelector('[data-fp-copy]').addEventListener('click', function (ev) { copy(r.request, ev.currentTarget); });
          box.querySelector('[data-fp-form]').addEventListener('submit', function (ev) {
            ev.preventDefault();
            var err = box.querySelector('[data-fp-err]'), pw = box.querySelector('#fp-pw').value;
            err.hidden = true;
            if (pw !== box.querySelector('#fp-pw2').value) { err.hidden = false; err.textContent = HS.t('pw.mismatch'); return; }
            HS.post('/api/auth/forgot/reset', { code: box.querySelector('#fp-code').value, username: box.querySelector('#fp-user').value.trim(), password: pw }).then(function () {
              HS.overlay.close(); HS.toast(HS.t('fp.done'), 'ok'); HS.emit('logged-in');
            }, function (er) { err.hidden = false; err.textContent = U.errorText(er); });
          });
        });
      }, function (er) { btn.disabled = false; HS.toast(U.errorText(er), 'bad'); });
    });
  };
})();
