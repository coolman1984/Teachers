/* Hessa - start-up: decides between the sign-in screen and the application. */
(function () {
  'use strict';
  var HS = window.HS;
  var keepAlive = null;

  function start() {
    HS.get('/api/auth/status').then(function (s) {
      HS.status = s;
      if (s.me) {
        HS.me = s.me;
        if (s.me.must_change) { HS.views.auth.mustChange(); return; }
        HS.data.load().then(function () { HS.shell.start(); HS.data.startPolling(); }, function () { HS.shell.start(); });
        clearInterval(keepAlive);
        keepAlive = setInterval(function () { HS.get('/api/version').catch(function () { /* a 401 signs out through HS.api */ }); }, 45000);
      } else {
        HS.me = null; clearInterval(keepAlive);
        HS.views.auth.show(s);
      }
    }, function () {
      HS.$('#root').innerHTML = '<div class="auth"><div class="panel"><div class="empty"><div class="art">' + HS.icon('alert', 'lg') + '</div><h3>' + HS.esc(HS.t('common.error')) + '</h3>' +
        '<button class="btn primary" onclick="location.reload()">' + HS.esc(HS.t('common.retry')) + '</button></div></div></div>';
    });
  }
  HS.on('logged-in', start);
  HS.on('logged-out', function () {
    if (HS.track) HS.track.clear();          // nobody to send them for any more
    HS.shell.stop(); HS.data.stopPolling(); HS.data.state = null; start();
  });
  HS.on('auth-rerender', function () { if (HS.status) HS.views.auth.show(HS.status); });

  document.addEventListener('DOMContentLoaded', function () {
    HS.prefs.apply();
    document.title = HS.t('app.name');
    start();
  });
})();
