/* Hessa - Settings -> People & access: users, personal links, permission tick boxes, profiles.
   The administrator controls everything here; every right is also checked by the server on each request. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var cache = null;

  function slug(g) { return g.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').slice(0, 2).join('_'); }
  function permLabel(id, fallback) { return HS.has('perm.' + id) ? HS.t('perm.' + id) : fallback; }
  function groupLabel(g) { var k = 'permgroup.' + slug(g); return HS.has(k) ? HS.t(k) : g; }
  function load() {
    return Promise.all([HS.get('/api/users'), HS.get('/api/quick-links')]).then(function (r) { cache = { users: r[0], links: r[1] }; return cache; });
  }
  // ready-made profiles keep their English name in the data; the screen shows them in the reader's language unless renamed
  var BUILTIN = { 'full-access': 'Centre manager', administrator: 'Administrator', secretary: 'Front desk', teacher: 'Teacher', assistant: 'Assistant', accountant: 'Accountant', viewer: 'Viewer' };
  function roleLabel(name) {
    if (!name || name === 'Custom') return HS.t('acc.custom');
    // by the profile's stable id: a renamed ready-made profile frees its English name, and another profile given that name
    // must not borrow the translation of rights it does not have
    var p = cache && cache.users.profiles.filter(function (x) { return x.name === name; })[0];
    if (p) return BUILTIN[p.id] === name && HS.has('prof.' + p.id) ? HS.t('prof.' + p.id) : name;
    for (var id in BUILTIN) if (BUILTIN[id] === name && HS.has('prof.' + id)) return HS.t('prof.' + id);   // a deleted ready-made profile
    return name;
  }
  HS.roleLabel = roleLabel;
  function linkFor(uid) { return (cache.links.users || []).filter(function (l) { return l.id === uid; })[0] || {}; }
  function linkUrl(l) { return l.token ? location.origin + '/k/' + l.token : ''; }

  /* ---------- the list ---------- */
  function table() {
    var users = cache.users.users.filter(function (u) { return !u.deleted; });
    return U.table([
      { h: 'f.name', cell: function (u) { return '<b>' + HS.esc(u.full_name) + '</b><div class="muted" style="font-size:.85rem">@' + HS.esc(u.username) + (u.title ? ' · ' + HS.esc(u.title) : '') + '</div>'; } },
      { h: 'acc.profile', cell: function (u) { return '<span class="badge ' + (u.role === 'Administrator' ? 'signal' : '') + '">' + HS.esc(roleLabel(u.role)) + '</span>'; } },
      { h: 'acc.login', cell: function (u) { var l = linkFor(u.id); return l.login === 'link' ? '<span class="badge info">' + HS.icon('chat', 'sm') + HS.esc(HS.t('acc.login.link')) + '</span>' : '<span class="badge">' + HS.icon('lock', 'sm') + HS.esc(HS.t('acc.login.pw')) + '</span>'; } },
      { h: 'acc.teachers', cell: function (u) { return u.scopes ? '<span class="badge warn">' + HS.fmt.num(u.scopes.length) + ' ' + HS.esc(HS.t('acc.teachersOnly')) + '</span>' : '<span class="muted">' + HS.esc(HS.t('acc.allTeachers')) + '</span>'; } },
      { h: 'acc.last', cell: function (u) { return u.last_login ? '<span class="num">' + U.dt(u.last_login) + '</span>' : '<span class="faint">–</span>'; } },
      { h: 'f.active', cell: function (u) { return u.active ? '<span class="badge ok">' + HS.esc(HS.t('f.activeYes')) + '</span>' : '<span class="badge">' + HS.esc(HS.t('f.inactive')) + '</span>'; } }
    ], users, { click: true, rowAttr: function (u) { return 'data-uid="' + HS.esc(u.id) + '"'; } });
  }

  /* ---------- permission ticks ---------- */
  function ticks(perms, admin) {
    return cache.users.permissions.map(function (g) {
      var isAdmin = g[0].indexOf('Administrator') === 0;
      return '<fieldset class="perm-group' + (isAdmin ? ' admin' : '') + '"><legend>' + HS.esc(groupLabel(g[0])) + (isAdmin ? ' <span class="badge warn">' + HS.esc(HS.t('acc.adminGroup')) + '</span>' : '') + '</legend>' +
        '<div class="perm-grid">' + g[1].map(function (p) {
          return '<label class="perm"><input type="checkbox" data-perm="' + p[0] + '"' + (perms.indexOf(p[0]) >= 0 ? ' checked' : '') + '><span>' + HS.esc(permLabel(p[0], p[1])) + '</span></label>'; }).join('') + '</div></fieldset>';
    }).join('');
  }
  function checked(root) { return HS.$$('[data-perm]', root).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.perm; }); }

  /* ---------- user form ---------- */
  function openUser(u) {
    var isNew = !u, l = u ? linkFor(u.id) : {}, profiles = cache.users.profiles, teachers = HS.data.list('teachers');
    // a new person starts with the smallest ready-made profile (Viewer), and the list shows that same profile - it showed
    // "Centre manager" over the Viewer ticks, and saving kept the wrong name on the person
    var start = isNew ? (profiles.filter(function (p) { return p.id === 'viewer'; })[0] || { name: 'Custom', perms: [] }) : null;
    var perms = u ? u.perms : start.perms, role = u ? u.role : start.name;
    var mode = l.login === 'link' ? 'link' : 'password';
    var scoped = !!(u && u.scopes);
    HS.panel.open({ title: isNew ? HS.t('acc.add') : u.full_name,
      body: '<form id="u-form" autocomplete="off" class="stack">' +
        '<div class="field"><label>' + HS.esc(HS.t('f.name')) + ' <span class="faint">*</span></label><input class="input" name="full_name" value="' + HS.esc(u ? u.full_name : '') + '" required></div>' +
        '<div class="field"><label>' + HS.esc(HS.t('acc.loginHow')) + '</label><div class="seg" role="group"><button type="button" data-mode="password" aria-pressed="' + (mode === 'password') + '">' + HS.esc(HS.t('acc.login.pw')) + '</button><button type="button" data-mode="link" aria-pressed="' + (mode === 'link') + '">' + HS.esc(HS.t('acc.login.link')) + '</button></div><span class="help">' + HS.esc(HS.t('acc.loginHow.h')) + '</span></div>' +
        '<div data-pwbox class="stack"><div class="field"><label>' + HS.esc(HS.t('auth.username')) + '</label><input class="input" name="username" dir="ltr" value="' + HS.esc(u ? u.username : '') + '" autocapitalize="off" spellcheck="false"></div>' +
        (isNew ? '<div class="field"><label>' + HS.esc(HS.t('auth.password')) + '</label><input class="input" name="password" type="text" dir="ltr" autocomplete="off"><span class="help">' + HS.esc(HS.t('acc.pw.h')) + '</span></div>' : '') + '</div>' +
        '<div class="field"><label>' + HS.esc(HS.t('acc.title')) + '</label><input class="input" name="title" value="' + HS.esc(u ? u.title : '') + '"></div>' +
        '<div class="field"><label>' + HS.esc(HS.t('acc.profile')) + '</label><select class="input" name="role">' + profiles.map(function (p) { return '<option value="' + HS.esc(p.name) + '"' + (role === p.name ? ' selected' : '') + '>' + HS.esc(roleLabel(p.name)) + '</option>'; }).join('') + '<option value="Custom"' + (!role || role === 'Custom' ? ' selected' : '') + '>' + HS.esc(HS.t('acc.custom')) + '</option></select><span class="help">' + HS.esc(HS.t('acc.profile.h')) + '</span></div>' +
        '<div class="field"><label>' + HS.esc(HS.t('acc.teachers')) + '</label><div class="seg" role="group"><button type="button" data-scope="all" aria-pressed="' + (!scoped) + '">' + HS.esc(HS.t('acc.allTeachers')) + '</button><button type="button" data-scope="some" aria-pressed="' + scoped + '">' + HS.esc(HS.t('acc.teachersOnly')) + '</button></div>' +
          '<div data-teachers class="chip-row" style="margin-top:.4rem"' + (scoped ? '' : ' hidden') + '>' + teachers.map(function (c) { return '<label class="perm"><input type="checkbox" data-teacher="' + HS.esc(c.id) + '"' + (u && u.scopes && u.scopes.indexOf(c.id) >= 0 ? ' checked' : '') + '><span>' + HS.esc(HS.data.teacherName(c.id)) + '</span></label>'; }).join('') + '</div></div>' +
        '<div class="field"><div class="row"><span class="switch"><input type="checkbox" name="active"' + (!u || u.active ? ' checked' : '') + '><span></span></span><label style="font-weight:600">' + HS.esc(HS.t('f.active')) + '</label></div></div>' +
        (u && mode === 'link' ? linkBox(u, l) : '') +
        '<div class="field"><label>' + HS.esc(HS.t('acc.perms')) + '</label><div class="row wrap"><button type="button" class="btn sm" data-all>' + HS.esc(HS.t('acc.selectAll')) + '</button><button type="button" class="btn sm ghost" data-none>' + HS.esc(HS.t('acc.clearAll')) + '</button></div></div>' + ticks(perms) +
        '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div></form>',
      footer: (u ? '<div class="row wrap" style="margin-inline-end:auto"><button class="btn sm" data-reset>' + HS.esc(HS.t('acc.reset')) + '</button><button class="btn sm" data-logout>' + HS.esc(HS.t('acc.logout')) + '</button><button class="btn sm danger" data-del>' + HS.esc(HS.t('common.delete')) + '</button></div>' : '') +
        '<button class="btn ghost" data-cancel>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-save>' + HS.esc(HS.t('common.save')) + '</button>',
      mount: function (el) { mountUser(el, u, mode, profiles); } });
  }
  function linkBox(u, l) {
    return '<div class="card" style="background:var(--surface-2)"><b>' + HS.esc(HS.t('acc.link')) + '</b>' + (l.on && l.token ? '<div class="row" style="margin-top:.6rem"><input class="input" readonly dir="ltr" value="' + HS.esc(linkUrl(l)) + '" data-linkurl><button type="button" class="btn sm" data-copy>' + HS.esc(HS.t('common.copy')) + '</button></div>' +
      '<div class="row wrap" style="margin-top:.6rem"><button type="button" class="btn sm" data-newlink>' + HS.esc(HS.t('acc.link.new')) + '</button><button type="button" class="btn sm ghost" data-linkoff>' + HS.esc(HS.t('acc.link.off')) + '</button></div>' :
      '<p class="muted" style="margin-top:.4rem">' + HS.esc(HS.t('acc.link.none')) + '</p><button type="button" class="btn sm primary" data-newlink style="margin-top:.5rem">' + HS.esc(HS.t('acc.link.make')) + '</button>') + '</div>';
  }
  function mountUser(el, u, mode, profiles) {
    var form = el.querySelector('#u-form'), err = el.querySelector('.err');
    function showErr(m) { err.hidden = false; err.textContent = m; }
    function sync() { el.querySelector('[data-pwbox]').style.display = mode === 'password' ? '' : 'none'; HS.$$('[data-mode]', el).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === mode); }); }
    sync();
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) { mode = b.dataset.mode; sync(); }
      else if (b.dataset.scope) { HS.$$('[data-scope]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); el.querySelector('[data-teachers]').hidden = b.dataset.scope === 'all'; }
      else if (b.hasAttribute('data-all')) HS.$$('[data-perm]', el).forEach(function (c) { if (!c.closest('.admin')) c.checked = true; });
      else if (b.hasAttribute('data-none')) HS.$$('[data-perm]', el).forEach(function (c) { c.checked = false; });
      else if (b.hasAttribute('data-copy')) { var inp = el.querySelector('[data-linkurl]'); inp.select(); try { document.execCommand('copy'); HS.toast(HS.t('common.saved')); } catch (x) { /* the user can still copy by hand */ } }
      else if (b.hasAttribute('data-newlink')) U.run(HS.post('/api/quick-links/set', { id: u.id, on: true }), 'acc.link.done').then(function () { return load(); }).then(function () { HS.panel.close(); openUser(cache.users.users.filter(function (x) { return x.id === u.id; })[0]); });
      else if (b.hasAttribute('data-linkoff')) U.run(HS.post('/api/quick-links/set', { id: u.id, on: false }), 'acc.link.offdone').then(function () { return load(); }).then(function () { HS.panel.close(); openUser(cache.users.users.filter(function (x) { return x.id === u.id; })[0]); });
      else if (b.hasAttribute('data-cancel')) HS.panel.close();
      else if (b.hasAttribute('data-reset')) U.confirm({ title: HS.t('acc.reset'), body: HS.t('acc.reset.body'), reason: HS.t('auth.password'), ok: HS.t('common.save') }).then(function (pw) { if (pw) U.run(HS.post('/api/users/reset', { id: u.id, password: pw }), 'acc.reset.done'); });
      else if (b.hasAttribute('data-logout')) U.run(HS.post('/api/users/logout', { id: u.id }), 'acc.logout.done');
      else if (b.hasAttribute('data-del')) U.confirm({ title: HS.t('common.delete'), body: HS.t('acc.delete.body', { n: u.full_name }), danger: true, ok: HS.t('common.delete') }).then(function (ok) { if (ok) U.run(HS.post('/api/users/delete', { id: u.id }), 'list.deleted.toast').then(function () { HS.panel.close(); HS.rerender(); }); });
      else if (b.hasAttribute('data-save')) save();
    });
    el.querySelector('[name="role"]').addEventListener('change', function (e) {   // choosing a profile fills the ticks
      var p = profiles.filter(function (x) { return x.name === e.target.value; })[0];
      if (p) HS.$$('[data-perm]', el).forEach(function (c) { c.checked = p.perms.indexOf(c.dataset.perm) >= 0; });
    });
    el.addEventListener('change', function (e) { if (e.target.dataset && e.target.dataset.perm) el.querySelector('[name="role"]').value = 'Custom'; });
    function save() {
      var f = function (n) { return (form.querySelector('[name="' + n + '"]') || {}).value || ''; };
      var scopes = el.querySelector('[data-scope="some"]').getAttribute('aria-pressed') === 'true' ? HS.$$('[data-teacher]', el).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.teacher; }) : null;
      var body = { id: u ? u.id : undefined, full_name: f('full_name').trim(), username: mode === 'password' ? f('username').trim() : (u ? u.username : ''), title: f('title').trim(), role: f('role'), login: mode,
        perms: checked(el), scopes: scopes, active: form.querySelector('[name="active"]').checked, must_change: !u };
      if (!u && mode === 'password') body.password = f('password');
      if (!body.full_name) return showErr(HS.t('form.missing', { f: HS.t('f.name') }));
      U.run(HS.post('/api/users/save', body), 'common.saved', el.querySelector('[data-save]')).then(function (r) {
        return load().then(function () {
          HS.panel.close(); HS.rerender();
          if (r && r.token) HS.toast(HS.t('acc.link.done'));
        });
      }, function (e) { showErr(U.errorText(e)); });
    }
  }

  /* ---------- who can do what: every permission against every profile, printable (factory access standard) ---------- */
  function matrixHTML() {
    var list = cache.users.profiles;
    return '<div class="table-wrap"><table class="tbl matrix"><thead><tr><th>' + HS.esc(HS.t('acc.matrix.perm')) + '</th>' + list.map(function (p) { return '<th class="c">' + HS.esc(roleLabel(p.name)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      cache.users.permissions.map(function (g) {
        return '<tr class="group-row"><th colspan="' + (list.length + 1) + '">' + HS.esc(groupLabel(g[0])) + '</th></tr>' + g[1].map(function (x) {
          return '<tr><td>' + HS.esc(permLabel(x[0], x[1])) + '</td>' + list.map(function (p) { return '<td class="c">' + (p.perms.indexOf(x[0]) >= 0 ? '<b aria-label="' + HS.esc(HS.t('acc.matrix.yes')) + '">✓</b>' : '<span class="faint" aria-label="' + HS.esc(HS.t('acc.matrix.no')) + '">–</span>') + '</td>'; }).join('') + '</tr>';
        }).join('');
      }).join('') + '</tbody></table></div>';
  }
  // printed across, small and wrapping, so every profile column stays on the paper even with many custom profiles
  var MATRIX_PAGE = '@page { size: A4 landscape; margin: 8mm; } #print-sheet .tbl.matrix { width: 100%; table-layout: fixed; font-size: 7.5pt; } ' +
    '#print-sheet .tbl.matrix th, #print-sheet .tbl.matrix td { white-space: normal; overflow-wrap: anywhere; padding: 1.5pt 3pt; } ' +
    '#print-sheet .tbl.matrix th:first-child, #print-sheet .tbl.matrix td:first-child { width: 26%; } #print-sheet .table-wrap { overflow: visible; }';
  function openMatrix() {
    var el = HS.dialog({ title: HS.t('acc.matrix'), wide: true, body: '<p class="muted">' + HS.esc(HS.t('acc.matrix.h')) + '</p>' + matrixHTML(),
      footer: '<button class="btn" data-print>' + HS.icon('printer', 'sm') + HS.esc(HS.t('acc.matrix.print')) + '</button><button class="btn primary" data-close>' + HS.esc(HS.t('common.close')) + '</button>' });
    el.querySelector('[data-print]').addEventListener('click', function () { HS.printHTML('<h1>' + HS.esc(HS.t('acc.matrix')) + '</h1>' + matrixHTML(), MATRIX_PAGE); });
  }

  /* ---------- profiles ---------- */
  function openProfiles() {
    var list = cache.users.profiles;
    var el = HS.dialog({ title: HS.t('acc.profiles'), wide: true,
      body: '<p class="muted">' + HS.esc(HS.t('acc.profiles.h')) + '</p><div class="stack">' + list.map(function (p) {
        return '<div class="card row" style="justify-content:space-between"><div><b>' + HS.esc(roleLabel(p.name)) + '</b><div class="muted" style="font-size:.85rem">' + HS.fmt.num(p.perms.length) + ' ' + HS.esc(HS.t('acc.perms.count')) + '</div></div>' +
          (p.id === 'administrator' ? '<span class="badge signal">' + HS.icon('lock', 'sm') + HS.esc(HS.t('acc.locked')) + '</span>' : '<button class="btn sm" data-edit="' + HS.esc(p.id) + '">' + HS.esc(HS.t('common.open')) + '</button>') + '</div>'; }).join('') + '</div>',
      footer: '<button class="btn" data-matrix style="margin-inline-end:auto">' + HS.icon('sheet', 'sm') + HS.esc(HS.t('acc.matrix')) + '</button><button class="btn primary" data-newprofile>' + HS.icon('plus', 'sm') + HS.esc(HS.t('acc.profile.add')) + '</button>' });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-matrix]')) { HS.overlay.close(); openMatrix(); return; }
      if (e.target.closest('[data-newprofile]')) { HS.overlay.close(); editProfile(null); }
      var b = e.target.closest('[data-edit]'); if (b) { HS.overlay.close(); editProfile(list.filter(function (p) { return p.id === b.dataset.edit; })[0]); }
    });
  }
  function editProfile(p) {
    var el = HS.dialog({ title: p ? roleLabel(p.name) : HS.t('acc.profile.add'), wide: true,
      body: '<div class="field"><label>' + HS.esc(HS.t('f.name')) + '</label><input class="input" id="pf-name" value="' + HS.esc(p ? p.name : '') + '"></div><div class="field"><div class="row"><span class="switch"><input type="checkbox" id="pf-apply" checked><span></span></span><label for="pf-apply" style="font-weight:600">' + HS.esc(HS.t('acc.profile.apply')) + '</label></div></div>' + ticks(p ? p.perms : []) + '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div>',
      footer: (p ? '<button class="btn danger" data-del style="margin-inline-end:auto">' + HS.esc(HS.t('common.delete')) + '</button>' : '') + '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.esc(HS.t('common.save')) + '</button>' });
    el.querySelector('[data-ok]').addEventListener('click', function () {
      var err = el.querySelector('.err');
      U.run(HS.post('/api/profiles/save', { id: p ? p.id : undefined, name: el.querySelector('#pf-name').value.trim(), perms: checked(el), apply: el.querySelector('#pf-apply').checked }), 'common.saved').then(function () { return load(); }).then(function () { HS.overlay.close(); HS.rerender(); }, function (e) { err.hidden = false; err.textContent = U.errorText(e); });
    });
    var del = el.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () { U.run(HS.post('/api/profiles/delete', { id: p.id }), 'list.deleted.toast').then(function () { return load(); }).then(function () { HS.overlay.close(); HS.rerender(); }); });
  }

  /* ---------- the tab ---------- */
  HS.accessTab = {
    render: function () {
      if (!HS.can('users.manage')) return '<section class="card">' + U.empty('lock', HS.t('acc.noperm.t'), HS.t('acc.noperm.b')) + '</section>';
      if (!cache) return '<div class="skeleton" style="height:12rem"></div>';
      var auth = cache.users.authority;
      return (auth ? '' : '<div class="tip" style="margin-bottom:1rem;background:var(--warn-soft)">' + HS.icon('alert') + '<span>' + HS.esc(cache.users.authorityHint || HS.t('acc.notAuth')) + '</span></div>') +
        '<div class="toolbar"><h2 class="grow">' + HS.esc(HS.t('acc.title.users')) + '</h2><button class="btn" data-profiles>' + HS.icon('layers', 'sm') + HS.esc(HS.t('acc.profiles')) + '</button>' +
        (auth ? '<button class="btn primary" data-adduser>' + HS.icon('plus', 'sm') + HS.esc(HS.t('acc.add')) + '</button>' : '') + '</div>' + table();
    },
    mount: function (root) {
      if (!HS.can('users.manage')) return;
      if (!cache) { load().then(function () { HS.rerender(); }, function () { root.innerHTML = U.empty('alert', HS.t('common.error')); }); return; }
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-adduser]')) { openUser(null); return; }
        if (e.target.closest('[data-profiles]')) { openProfiles(); return; }
        var tr = e.target.closest('tr[data-uid]'); if (tr && cache.users.authority) openUser(cache.users.users.filter(function (u) { return u.id === tr.dataset.uid; })[0]);
      });
    },
    reset: function () { cache = null; }
  };
})();
