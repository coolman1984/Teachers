/* Hessa - followup: placeholder until its scheduled implementation task. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  HS.views.followup = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.followup')) + '</h1><p>' +
        HS.esc(HS.t('page.followup.d')) + '</p></div></div>' +
        '<section class="card">' + U.empty('bell', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
