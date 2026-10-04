/* Hessa - money: placeholder until its scheduled implementation task. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  HS.views.money = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.money')) + '</h1><p>' +
        HS.esc(HS.t('page.money.d')) + '</p></div></div>' +
        '<section class="card">' + U.empty('sheet', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
