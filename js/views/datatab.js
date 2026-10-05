/* Hessa - Settings -> Data & backups: Recycle Bin (restore deleted records), backups (make, list, restore), complete export. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var state = null;

  function soft(promise) { return promise.then(function (r) { return r; }, function () { return null; }); }   // an extra card failing must not hide the others
  function load() {
    var jobs = [HS.can('trash.restore') ? HS.get('/api/trash') : Promise.resolve([]), HS.can(['backups.manage', 'backups.restore']) ? HS.get('/api/backups') : Promise.resolve([]),
      HS.can('backups.manage') ? soft(HS.get('/api/backups/folder')) : Promise.resolve(null), HS.can(['backups.manage', 'backups.restore']) ? soft(HS.get('/api/data-safety')) : Promise.resolve(null)];
    return Promise.all(jobs).then(function (r) { state = { trash: r[0], backups: r[1], folder: r[2], safety: r[3], check: state && state.check || null }; });
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
  function lastBackup() {
    var last = state.backups[0];
    if (!last) return '<p class="tip warn">' + HS.icon('alert', 'sm') + ' ' + HS.esc(HS.t('bk.last.none')) + '</p>';
    var old = Date.now() - new Date(last.time).getTime() > 36 * 3600 * 1000;
    return '<p class="' + (old ? 'tip warn' : 'muted') + '">' + (old ? HS.icon('alert', 'sm') + ' ' : '') + HS.esc(HS.t('bk.last', { when: U.ago(last.time) })) + (old ? ' ' + HS.esc(HS.t('bk.old')) : '') + '</p>';
  }
  function folderBlock() {
    var f = state.folder;
    if (!f) return '';
    var dirs = f.dirs || [], can = f.admin && f.local;
    return '<div class="stack" style="margin-block:1.2rem" data-folder><h4>' + HS.icon('shield', 'sm') + ' ' + HS.esc(HS.t('bk2.title')) + '</h4>' +
      (dirs.length ? '<p class="tip ok">' + HS.icon('check', 'sm') + ' ' + HS.t('bk2.on', { dir: { html: '<bdi dir="ltr">' + HS.esc(dirs.join(', ')) + '</bdi>' } }) + '</p>'
        : '<p class="tip warn">' + HS.icon('alert', 'sm') + ' ' + HS.esc(HS.t('bk2.none')) + '</p>') +
      (f.error ? '<p class="tip bad" role="alert">' + HS.esc(HS.t('bk2.failed', { e: f.error })) + '</p>' : '') +
      (can ? '<form class="row wrap" data-folder-form autocomplete="off"><div class="field grow" style="min-width:14rem"><label for="bk2-path">' + HS.esc(HS.t('bk2.label')) + '</label>' +
          '<input class="input" id="bk2-path" name="path" dir="ltr" autocapitalize="off" spellcheck="false" placeholder="E:\\Hessa-Backups" value="' + HS.esc(dirs[0] || '') + '" required></div>' +
          '<button class="btn primary" type="submit">' + HS.esc(HS.t(dirs.length ? 'bk2.change' : 'bk2.save')) + '</button>' +
          (dirs.length ? '<button class="btn ghost" type="button" data-folder-off>' + HS.esc(HS.t('bk2.remove')) + '</button>' : '') + '</form>'
        : '<p class="faint">' + HS.esc(HS.t(f.admin ? 'bk2.local' : 'bk2.admin')) + '</p>') + '</div>';
  }
  function backupCard() {
    if (!HS.can(['backups.manage', 'backups.restore'])) return '';
    var rows = state.backups.slice(0, 30);
    return '<section class="card"><header><h3>' + HS.icon('lock') + ' ' + HS.esc(HS.t('bk.title')) + '</h3>' +
      (HS.can('backups.manage') ? '<button class="btn primary sm" data-backup>' + HS.icon('plus', 'sm') + HS.esc(HS.t('bk.make')) + '</button>' : '') + '</header><p class="muted" style="margin:-.4rem 0 .6rem">' + HS.esc(HS.t('bk.sub')) + '</p>' +
      lastBackup() + folderBlock() +
      (rows.length ? U.table([
        { h: 'f.time', cell: function (b) { return '<span class="num">' + U.dt(b.time) + '</span>'; } },
        { h: 'f.type', cell: function (b) { return '<span class="badge">' + HS.esc(b.kind || '') + '</span>'; } },
        { h: 'bk.size', cell: function (b) { return b.size ? '<span class="num">' + HS.fmt.num(Math.round(b.size / 1024)) + '</span> KB' : '–'; } },
        { h: 'f.action', cell: function (b) { return HS.can('backups.restore') ? '<button class="btn sm danger" data-brestore="' + HS.esc(b.name) + '">' + HS.esc(HS.t('bk.restore')) + '</button>' : ''; } }
      ], rows) : U.empty('lock', HS.t('bk.empty'))) + '</section>';
  }
  function checkResult() {
    var c = state.check;
    if (!c) return '';
    if (c.running) return '<p class="muted" role="status">' + HS.esc(HS.t('ds.checking')) + '</p>';
    return c.ok ? '<p class="tip ok" role="status">' + HS.icon('check', 'sm') + ' ' + HS.esc(HS.t('ds.ok', { n: HS.fmt.num(c.checked_changes || 0) })) + '</p>'
      : '<div class="tip bad" role="alert"><b>' + HS.esc(HS.t('ds.bad')) + '</b><ul>' + (c.problems || []).map(function (x) { return '<li dir="auto">' + HS.esc(x) + '</li>'; }).join('') + '</ul></div>';
  }
  function safetyCard() {
    var d = state.safety;
    if (!d) return '';
    var ups = (d.history || []).filter(function (h) { return h.snapshot; }), mb = (d.snapshots || []).reduce(function (a, x) { return a + x.size; }, 0) / 1048576;
    return '<section class="card" data-safety><header><h3>' + HS.icon('shield') + ' ' + HS.esc(HS.t('ds.title')) + '</h3>' +
      (HS.can('backups.manage') ? '<button class="btn sm" data-check>' + HS.icon('check', 'sm') + HS.esc(HS.t('ds.check')) + '</button>' : '') + '</header>' +
      '<p class="muted" style="margin:-.4rem 0 .8rem">' + HS.esc(HS.t('ds.sub')) + '</p><div data-check-result>' + checkResult() + '</div>' +
      '<ul class="steps">' + [1, 2, 3, 4, 5].map(function (i) { return '<li>' + HS.esc(HS.t('ds.p.' + i)) + '</li>'; }).join('') + '</ul>' +
      '<h4>' + HS.esc(HS.t('ds.updates')) + ' <span class="faint">· ' + HS.esc(HS.t('ds.version', { v: d.program })) + '</span></h4>' +
      (ups.length ? '<ul class="steps">' + ups.map(function (h) {
        return '<li>' + HS.esc(HS.t('ds.upd.row', { from: h.from || HS.t('ds.upd.earlier'), to: h.to })) + ' · <span class="num">' + HS.esc(String(h.at || '').replace('T', ' ').slice(0, 16)) + '</span> — ' + HS.esc(HS.t('ds.upd.copy')) + '</li>'; }).join('') + '</ul>'
        : '<p class="faint">' + HS.esc(HS.t('ds.upd.none')) + '</p>') +
      ((d.snapshots || []).length ? '<p class="faint">' + HS.esc(HS.t('ds.snaps', { n: HS.fmt.num(d.snapshots.length), mb: HS.fmt.num(Math.max(1, Math.round(mb))) })) + '</p>' : '') + '</section>';
  }
  HS.dataTab = {
    render: function () {
      if (!state) return '<div class="skeleton" style="height:12rem"></div>';
      return '<div class="stack">' + HS.sampleControls() + trashCard() + backupCard() + safetyCard() +
        (HS.can('report.full') ? '<section class="card"><header><h3>' + HS.icon('download') + ' ' + HS.esc(HS.t('exp.title')) + '</h3></header><p class="muted">' + HS.esc(HS.t('exp.sub')) + '</p><div style="margin-top:1rem"><a class="btn" href="/api/export.xlsx">' + HS.icon('download', 'sm') + HS.esc(HS.t('exp.btn')) + '</a></div></section>' : '') + '</div>';
    },
    mount: function (root) {
      if (!state) { load().then(function () { HS.rerender(); }, function () { root.innerHTML = U.empty('alert', HS.t('common.error')); }); return; }
      HS.mountSampleControls(root);
      root.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-folder-form]'); if (!form) return;
        e.preventDefault();
        var btn = form.querySelector('[type=submit]');
        U.run(HS.post('/api/backups/folder', { path: form.querySelector('[name=path]').value.trim() }), null, btn).then(function (r) {
          if (r && r.error) HS.toast(HS.t('bk2.failed', { e: r.error }), 'bad', 6000); else HS.toast(HS.t('bk2.saved'));
          state = null; HS.rerender();
        }, function () {});
      });
      root.addEventListener('click', function (e) {
        var r = e.target.closest('[data-restore]');
        if (r) { U.run(HS.post('/api/trash/restore', { txn: r.dataset.restore }), 'bin.restored', r).then(function () { state = null; return HS.data.load(); }).then(function () { HS.rerender(); }); return; }
        if (e.target.closest('[data-check]')) {
          state.check = { running: true }; root.querySelector('[data-check-result]').innerHTML = checkResult();
          HS.post('/api/data-safety/check', {}).then(function (r) { state.check = r; }, function (er) { state.check = { ok: false, problems: [U.errorText(er)] }; }).then(function () {
            var box = root.querySelector('[data-check-result]'); if (box) box.innerHTML = checkResult(); });
          return;
        }
        if (e.target.closest('[data-folder-off]')) { U.run(HS.post('/api/backups/folder', { path: '' }), 'bk2.removed').then(function () { state = null; HS.rerender(); }, function () {}); return; }
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
