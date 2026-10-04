/* Hessa - pages that are designed but built in a later phase: they show what will be there, in the final look. */
(function () {
  'use strict';
  var HS = window.HS;
  HS.views.soon = {
    render: function (ctx) {
      var p = ctx.page, id = p.id;
      var bullets = [1, 2, 3].filter(function (n) { return HS.has('page.' + id + '.' + n); }).map(function (n) {
        return '<li>' + HS.esc(HS.t('page.' + id + '.' + n)) + '</li>';
      }).join('');
      var skeleton = '<div class="table-wrap" aria-hidden="true"><table class="tbl"><thead><tr><th></th><th></th><th></th><th></th></tr></thead><tbody>' +
        [0, 1, 2, 3].map(function (i) { return '<tr style="--i:' + i + '"><td><span class="skeleton" style="display:block;width:70%"></span></td><td><span class="skeleton" style="display:block;width:50%"></span></td><td><span class="skeleton" style="display:block;width:60%"></span></td><td><span class="skeleton" style="display:block;width:40%"></span></td></tr>'; }).join('') +
        '</tbody></table></div>';
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.' + id)) + '</h1><p>' + HS.esc(HS.t('page.' + id + '.d')) + '</p></div>' +
        '<span class="badge signal">' + HS.icon('clock', 'sm') + HS.esc(HS.t('soon.phase', { n: p.phase })) + '</span></div>' +
        '<div class="grid split"><section class="card"><header><h3>' + HS.esc(HS.t('soon.will')) + '</h3></header><ul class="steps" style="counter-reset:none">' +
        bullets.replace(/<li>/g, '<li>') + '</ul><div class="tip" style="margin-top:1.2rem">' + HS.icon('info') + '<span>' + HS.esc(HS.t('soon.design')) + '</span></div></section>' +
        '<section class="card"><div class="empty"><div class="art">' + HS.icon(p.icon, 'lg') + '</div><h3>' + HS.esc(HS.t('soon.title')) + '</h3><p>' + HS.esc(HS.t('page.' + id + '.d')) + '</p></div></section></div>' +
        '<div style="margin-top:var(--gap)">' + skeleton + '</div>';
    }
  };
})();
