/* Hessa - overview scaffold; live centre figures follow in P5.7. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  HS.views.overview = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.overview')) + '</h1><p>' +
        HS.esc(HS.t('page.overview.d')) + '</p></div></div>' +
        '<section class="card" data-tour="kpis">' + U.empty('cap', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
