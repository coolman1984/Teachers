/* Hessa - door: placeholder until its scheduled implementation task. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  HS.views.door = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.door')) + '</h1><p>' +
        HS.esc(HS.t('page.door.d')) + '</p></div></div>' +
        '<section class="card">' + U.empty('board', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
