/* Hessa - sign in, first-start administrator setup, forced password change. */
(function () {
  'use strict';
  var HS = window.HS;

  function hero() {
    return '<div class="hero"><div class="row"><div class="brand" style="padding:0;min-height:0"><div class="mark">' + HS.icon('cap', 'lg') + '</div><div class="name">' + HS.esc(HS.t('app.name')) + '</div></div>' +
      '<span class="grow"></span><button class="btn ghost sm" data-lang style="color:var(--side-ink)">' + HS.icon('globe', 'sm') + (HS.lang === 'ar' ? 'English' : 'العربية') + '</button></div>' +
      '<div><h1>' + HS.esc(HS.t('auth.hero.title')) + '</h1><p>' + HS.esc(HS.t('auth.hero.sub')) + '</p></div><div class="road" aria-hidden="true"></div></div>';
  }
  function field(id, label, type, extra) {
    if (type === 'password') {   // an eye to see what was typed, and a warning when Caps Lock is on
      return '<div class="field"><label for="' + id + '">' + HS.esc(label) + '</label><div class="pw-box"><input class="input" id="' + id + '" name="' + id + '" type="password" ' + (extra || '') + '>' +
        '<button type="button" class="icon-btn" data-eye aria-label="' + HS.esc(HS.t('auth.show')) + '" title="' + HS.esc(HS.t('auth.show')) + '">' + HS.icon('eye', 'sm') + '</button></div>' +
        '<small class="caps" hidden role="status">' + HS.icon('alert', 'sm') + HS.esc(HS.t('auth.caps')) + '</small></div>';
    }
    return '<div class="field"><label for="' + id + '">' + HS.esc(label) + '</label><input class="input" id="' + id + '" name="' + id + '" type="' + type + '" ' + (extra || '') + '></div>';
  }
  function remembered() { try { return localStorage.getItem('hs.lastUser') || ''; } catch (e) { return ''; } }
  function remember(name) { try { if (name) localStorage.setItem('hs.lastUser', name); } catch (e) { /* private window */ } }
  function wirePasswords(root) {
    HS.$$('[data-eye]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); inp.focus();
      });
    });
    HS.$$('.pw-box input', root).forEach(function (inp) {
      function caps(e) { var c = inp.closest('.field').querySelector('.caps'); if (c && e.getModifierState) c.hidden = !e.getModifierState('CapsLock'); }
      inp.addEventListener('keyup', caps); inp.addEventListener('keydown', caps);
    });
  }
  function bindLang(root) {
    var b = root.querySelector('[data-lang]');
    if (b) b.addEventListener('click', function () { HS.prefs.toggleLang(); HS.emit('auth-rerender'); });
  }
  function fail(form, msg) {
    var e = form.querySelector('.err');
    e.hidden = false; e.textContent = msg;
  }

  HS.views.auth = {
    show: function (status) {
      var root = HS.$('#root');
      // trial sign-in (admin / 123): chosen on the first-start screen, or offered on the sign-in form of this PC
      var trial = status.trial, trialForm = !status.hasUsers && trial && HS.joinFlow && HS.joinFlow.mode === 'trial';
      var setup = !status.hasUsers && !trialForm;
      var body;
      // a new PC chooses between "first PC" and "join the centre PC"; a moved data folder asks first (js/views/join.js)
      if (HS.joinFlow && HS.joinFlow.intercept(status)) return;
      if (setup && !status.local) {
        body = '<div class="empty"><div class="art">' + HS.icon('lock', 'lg') + '</div><h3>' + HS.esc(HS.t('auth.setup.title')) + '</h3><p>' + HS.esc(HS.t('auth.remote')) + '</p></div>';
      } else if (setup) {
        body = '<form id="auth-form" autocomplete="off"><div><h2>' + HS.esc(HS.t('auth.setup.title')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('auth.setup.sub')) + '</p></div>' +
          field('full_name', HS.t('auth.fullname'), 'text', 'autofocus required') + field('username', HS.t('auth.username'), 'text', 'required autocapitalize="off" spellcheck="false" dir="ltr"') +
          field('password', HS.t('auth.password'), 'password', 'required dir="ltr"') + '<p class="faint" style="font-size:.85rem">' + HS.esc(HS.t('auth.pw.hint')) + '</p>' +
          '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div>' +
          '<button class="btn primary" type="submit">' + HS.esc(HS.t('auth.setup.btn')) + '</button>' +
          (HS.joinFlow ? '<button class="btn ghost" type="button" data-back>' + HS.icon('left', 'sm mirror') + HS.esc(HS.t('common.back')) + '</button>' : '') + '</form>';
      } else {
        var notice = HS.joinFlow ? HS.joinFlow.takeNotice() : '';
        body = '<form id="auth-form"><div><h2>' + HS.esc(HS.t('auth.login.title')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('auth.login.sub')) + '</p></div>' +
          (notice ? '<div class="tip ok" role="status">' + HS.icon('check') + '<span>' + HS.esc(notice) + '</span></div>' : '') +
          (trial ? '<div class="tip trial" role="note">' + HS.icon('key') + '<span class="grow">' + HS.esc(HS.t('trial.hint', trial)) + '</span>' +
            '<button class="btn sm" type="button" data-fill>' + HS.esc(HS.t('trial.fill')) + '</button></div>' : '') +
          field('username', HS.t('auth.username'), 'text', (remembered() ? '' : 'autofocus ') + 'required autocapitalize="off" spellcheck="false" dir="ltr" autocomplete="username" value="' + HS.esc(remembered()) + '"') +
          field('password', HS.t('auth.password'), 'password', (remembered() ? 'autofocus ' : '') + 'required dir="ltr" autocomplete="current-password"') +
          '<p class="faint" style="font-size:.85rem;margin:0">' + HS.icon('shield', 'sm') + ' ' + HS.esc(HS.t('auth.watched')) + '</p>' +
          '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div>' +
          '<button class="btn primary" type="submit">' + HS.esc(HS.t('auth.login.btn')) + '</button>' +
          (trialForm ? '' : '<button class="btn ghost sm" type="button" data-forgot>' + HS.icon('key', 'sm') + HS.esc(HS.t('fp.link')) + '</button>') +
          (trialForm ? '<button class="btn ghost" type="button" data-back>' + HS.icon('left', 'sm mirror') + HS.esc(HS.t('common.back')) + '</button>' : '') + '</form>';
      }
      root.innerHTML = '<div class="auth">' + hero() + '<div class="panel"><div class="auth-box-lic" data-lic-auth></div>' + body + '</div></div><div id="overlay"></div><div id="toasts"></div>';
      bindLang(root);
      wirePasswords(root);
      if (HS.license) HS.license.authNotice(root, status);
      var fg = root.querySelector('[data-forgot]'); if (fg && HS.license) fg.addEventListener('click', HS.license.forgot);
      var form = HS.$('#auth-form', root);
      if (!form) return;
      var back = form.querySelector('[data-back]');
      if (back) back.addEventListener('click', function () { HS.joinFlow.mode = 'choose'; HS.emit('auth-rerender'); });
      var fill = form.querySelector('[data-fill]');
      function fillTrial() { form.username.value = trial.username; form.password.value = trial.password; }
      if (fill) fill.addEventListener('click', function () { fillTrial(); form.querySelector('button[type=submit]').focus(); });
      if (trialForm) fillTrial();
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = {}; new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        HS.post(setup ? '/api/auth/setup' : '/api/auth/login', d).then(function (me) {
          remember(d.username); HS.welcome = me && me.welcome;
          HS.emit('logged-in');
        }, function (err) {
          btn.disabled = false;
          fail(form, err.code === 401 || err.code === 400 ? (err.message || HS.t('auth.failed')) : HS.t('common.error'));
        });
      });
    },
    mustChange: function () {
      var root = HS.$('#root');
      root.innerHTML = '<div class="auth">' + hero() + '<div class="panel"><form id="auth-form"><div><h2>' + HS.esc(HS.t('auth.password')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('auth.pw.hint')) + '</p></div>' +
        field('old', HS.t('pw.old'), 'password', 'autofocus required dir="ltr" autocomplete="current-password"') + field('new', HS.t('pw.new'), 'password', 'required dir="ltr" autocomplete="new-password"') +
        '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div><button class="btn primary" type="submit">' + HS.esc(HS.t('common.save')) + '</button></form></div></div><div id="overlay"></div><div id="toasts"></div>';
      bindLang(root);
      wirePasswords(root);
      var form = HS.$('#auth-form', root);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        HS.post('/api/auth/password', { old: form.old.value, new: form.new.value }).then(function () { HS.emit('logged-in'); }, function (err) { fail(form, err.message); });
      });
    }
  };
})();
