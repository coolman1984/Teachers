/* Hessa - sign in, first-start administrator setup, forced password change. */
(function () {
  'use strict';
  var HS = window.HS;

  function hero() {
    return '<div class="hero"><div class="row"><div class="brand" style="padding:0;min-height:0"><div class="mark">' + HS.icon('route', 'lg') + '</div><div class="name">' + HS.esc(HS.t('app.name')) + '</div></div>' +
      '<span class="grow"></span><button class="btn ghost sm" data-lang style="color:var(--side-ink)">' + HS.icon('globe', 'sm') + (HS.lang === 'ar' ? 'English' : 'العربية') + '</button></div>' +
      '<div><h1>' + HS.esc(HS.t('auth.hero.title')) + '</h1><p>' + HS.esc(HS.t('auth.hero.sub')) + '</p></div><div class="road" aria-hidden="true"></div></div>';
  }
  function field(id, label, type, extra) {
    return '<div class="field"><label for="' + id + '">' + HS.esc(label) + '</label><input class="input" id="' + id + '" name="' + id + '" type="' + type + '" ' + (extra || '') + '></div>';
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
      var setup = !status.hasUsers;
      var body;
      if (setup && !status.local) {
        body = '<div class="empty"><div class="art">' + HS.icon('lock', 'lg') + '</div><h3>' + HS.esc(HS.t('auth.setup.title')) + '</h3><p>' + HS.esc(HS.t('auth.remote')) + '</p></div>';
      } else if (setup) {
        body = '<form id="auth-form" autocomplete="off"><div><h2>' + HS.esc(HS.t('auth.setup.title')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('auth.setup.sub')) + '</p></div>' +
          field('full_name', HS.t('auth.fullname'), 'text', 'autofocus required') + field('username', HS.t('auth.username'), 'text', 'required autocapitalize="off" spellcheck="false" dir="ltr"') +
          field('password', HS.t('auth.password'), 'password', 'required dir="ltr"') + '<p class="faint" style="font-size:.85rem">' + HS.esc(HS.t('auth.pw.hint')) + '</p>' +
          '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div>' +
          '<button class="btn primary" type="submit">' + HS.esc(HS.t('auth.setup.btn')) + '</button></form>';
      } else {
        body = '<form id="auth-form"><div><h2>' + HS.esc(HS.t('auth.login.title')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('auth.login.sub')) + '</p></div>' +
          field('username', HS.t('auth.username'), 'text', 'autofocus required autocapitalize="off" spellcheck="false" dir="ltr" autocomplete="username"') +
          field('password', HS.t('auth.password'), 'password', 'required dir="ltr" autocomplete="current-password"') +
          '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div>' +
          '<button class="btn primary" type="submit">' + HS.esc(HS.t('auth.login.btn')) + '</button></form>';
      }
      root.innerHTML = '<div class="auth">' + hero() + '<div class="panel">' + body + '</div></div><div id="overlay"></div><div id="toasts"></div>';
      bindLang(root);
      var form = HS.$('#auth-form', root);
      if (!form) return;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = {}; new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        HS.post(setup ? '/api/auth/setup' : '/api/auth/login', d).then(function () { HS.emit('logged-in'); }, function (err) {
          btn.disabled = false;
          fail(form, err.code === 401 || err.code === 400 ? (err.message || HS.t('auth.failed')) : HS.t('common.error'));
        });
      });
    },
    mustChange: function () {
      var root = HS.$('#root');
      root.innerHTML = '<div class="auth">' + hero() + '<div class="panel"><form id="auth-form"><div><h2>' + HS.esc(HS.t('auth.password')) + '</h2><p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('auth.pw.hint')) + '</p></div>' +
        field('old', HS.t('auth.password') + ' (1)', 'password', 'autofocus required dir="ltr"') + field('new', HS.t('auth.password') + ' (2)', 'password', 'required dir="ltr"') +
        '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div><button class="btn primary" type="submit">' + HS.esc(HS.t('common.save')) + '</button></form></div></div><div id="overlay"></div><div id="toasts"></div>';
      bindLang(root);
      var form = HS.$('#auth-form', root);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        HS.post('/api/auth/password', { old: form.old.value, new: form.new.value }).then(function () { HS.emit('logged-in'); }, function (err) { fail(form, err.message); });
      });
    }
  };
})();
