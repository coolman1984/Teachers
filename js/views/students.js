/* Hessa - students: placeholder until its scheduled implementation task. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  HS.views.students = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.students')) + '</h1><p>' +
        HS.esc(HS.t('page.students.d')) + '</p></div></div>' +
        '<section class="card">' + U.empty('users', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
