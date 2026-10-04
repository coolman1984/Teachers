/* Hessa - Settings -> Data & backups: Recycle Bin (restore deleted records), backups (make, list, restore), complete export. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var state = null;

  function load() {
    var jobs = [HS.can('trash.restore') ? HS.get('/api/trash') : Promise.resolve([]), HS.can(['backups.manage', 'backups.restore']) ? HS.get('/api/backups') : Promise.resolve([])];
    return Promise.all(jobs).then(function (r) { state = { trash: r[0], backups: r[1] }; });
  }
  function trashCard() {
    if (!HS.can('trash.restore')) return '';
    var rows = state.trash;
    return '<section class="card"><header><h3>' + HS.icon('refresh') + ' ' + HS.esc(HS.t('bin.title')) + '</h3></header><p class="muted" style="margin:-.4rem 0 1rem">' + HS.esc(HS.t('bin.sub')) + '</p>' +
      (rows.length ? U.table([
        { h: 'f.time', cell: function (r) { return '<span class="num">' + U.dt(r.ts) + '</span>'; } },
        { h: 'f.user', cell: function (r) { return HS.esc(r.user || ''); } },
        { h: 'f.what', cell: function (r) { return HS.esc((r.names || []).join('، ') || r.label || ''); } },
        { h: 'f.action', cell: function (r) { return '<button class="btn sm" data-restore="' + HS.esc(r.txn) + '">' + HS.esc(HS.t('bin.restore')) + '</button>'; } }
      ], rows.slice(0, 100)) : U.empty('check', HS.t('bin.empty.t'), HS.t('bin.empty.b'))) + '</section>';
  }
  function backupCard() {
    if (!HS.can(['backups.manage', 'backups.restore'])) return '';
    var rows = state.backups.slice(0, 30);
    return '<section class="card"><header><h3>' + HS.icon('lock') + ' ' + HS.esc(HS.t('bk.title')) + '</h3>' +
      (HS.can('backups.manage') ? '<button class="btn primary sm" data-backup>' + HS.icon('plus', 'sm') + HS.esc(HS.t('bk.make')) + '</button>' : '') + '</header><p class="muted" style="margin:-.4rem 0 1rem">' + HS.esc(HS.t('bk.sub')) + '</p>' +
      (rows.length ? U.table([
        { h: 'f.time', cell: function (b) { return '<span class="num">' + U.dt(b.time) + '</span>'; } },
        { h: 'f.type', cell: function (b) { return '<span class="badge">' + HS.esc(b.kind || '') + '</span>'; } },
        { h: 'bk.size', cell: function (b) { return b.size ? '<span class="num">' + HS.fmt.num(Math.round(b.size / 1024)) + '</span> KB' : '–'; } },
        { h: 'f.action', cell: function (b) { return HS.can('backups.restore') ? '<button class="btn sm danger" data-brestore="' + HS.esc(b.name) + '">' + HS.esc(HS.t('bk.restore')) + '</button>' : ''; } }
      ], rows) : U.empty('lock', HS.t('bk.empty'))) + '</section>';
  }
  HS.dataTab = {
    render: function () {
      if (!state) return '<div class="skeleton" style="height:12rem"></div>';
      return '<div class="stack">' + HS.sampleControls() + trashCard() + backupCard() +
        (HS.can('report.full') ? '<section class="card"><header><h3>' + HS.icon('download') + ' ' + HS.esc(HS.t('exp.title')) + '</h3></header><p class="muted">' + HS.esc(HS.t('exp.sub')) + '</p><div style="margin-top:1rem"><a class="btn" href="/api/export.xlsx">' + HS.icon('download', 'sm') + HS.esc(HS.t('exp.btn')) + '</a></div></section>' : '') + '</div>';
    },
    mount: function (root) {
      if (!state) { load().then(function () { HS.rerender(); }, function () { root.innerHTML = U.empty('alert', HS.t('common.error')); }); return; }
      HS.mountSampleControls(root);
      root.addEventListener('click', function (e) {
        var r = e.target.closest('[data-restore]');
        if (r) { U.run(HS.post('/api/trash/restore', { txn: r.dataset.restore }), 'bin.restored', r).then(function () { state = null; return HS.data.load(); }).then(function () { HS.rerender(); }); return; }
        if (e.target.closest('[data-backup]')) { U.run(HS.post('/api/backups'), 'bk.made').then(function () { state = null; HS.rerender(); }); return; }
        var b = e.target.closest('[data-brestore]');
        if (b) U.confirm({ title: HS.t('bk.restore'), body: HS.t('bk.restore.body'), danger: true, ok: HS.t('bk.restore') }).then(function (ok) {
          if (ok) U.run(HS.post('/api/backups/restore', { name: b.dataset.brestore }), 'bk.restored').then(function () { state = null; return HS.data.load(); }).then(function () { HS.rerender(); });
        });
      });
    },
    reset: function () { state = null; }
  };
})();
