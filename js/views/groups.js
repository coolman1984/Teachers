/* Hessa - groups: placeholder until its scheduled implementation task. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  HS.views.groups = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.groups')) + '</h1><p>' +
        HS.esc(HS.t('page.groups.d')) + '</p></div></div>' +
        '<section class="card">' + U.empty('layers', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
