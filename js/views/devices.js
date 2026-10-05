/* Hessa - Devices & Sync (administrators): which PCs share the centre's data, whether they agree, what needs a decision, and the
   safeguards of the permanent history (record check, administrator key, backup administrator PC). Also the small light in the
   top bar that every user sees (administrators the full text, everybody else only when there is a problem).
   Every action is checked again by the server; the page only decides what to show. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var DEFAULT_SYNC_PORT = 8463;
  var dev = null, conflicts = [], tab = 'pcs', log = null, loading = false;

  /* ---------- small helpers ---------- */
  function hm(ts) { var d = new Date(ts); return isNaN(d) ? '' : HS.fmt.pad(d.getHours()) + ':' + HS.fmt.pad(d.getMinutes()); }
  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function bdi(s) { return '<bdi dir="ltr">' + HS.esc(s) + '</bdi>'; }
  function isCentre() { return dev && dev.me.role === 'authority' && !dev.me.backup; }
  function canAdmin() { return dev && dev.me.role === 'authority'; }
  function addresses() {
    var port = dev.me.port, list = dev.me.addresses || [];
    return list.map(function (ip) { return port && port !== DEFAULT_SYNC_PORT ? ip + ':' + port : ip; });
  }
  function copy(text, btn) {
    var done = function () { HS.toast(HS.t('dev.copied')); if (btn) btn.focus(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { HS.toast(text); });
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { HS.toast(text); } t.remove(); }
  }

  /* ---------- the light in the top bar ---------- */
  var STATE_ICON = { ok: 'check', pending: 'sync', offline: 'monitor', problem: 'alert' };
  function paintLight() {
    var el = HS.$('#sync-pill'), s = HS.sync;
    if (!el) return;
    if (!s || s.state === 'single' || !HS.me) { el.hidden = true; return; }
    var admin = HS.can('users.manage');
    if (!admin && s.state !== 'problem') { el.hidden = true; return; }      // ordinary users are not bothered with sharing
    var key = admin ? s.state : 'tell';
    el.hidden = false;
    el.className = 'sync-pill s-' + (admin ? s.state : 'problem');
    el.innerHTML = '<i class="dot"></i><span class="desk-only">' + HS.esc(HS.t('dev.light.' + key)) + '</span>';
    el.title = HS.t('dev.light.' + key + '.tip') + (admin && s.files_missing ? ' ' + HS.t('dev.light.files', { n: HS.fmt.num(s.files_missing) }) : '');
    el.setAttribute('aria-label', el.title);
    if (admin) el.setAttribute('href', '#/devices'); else el.removeAttribute('href');
  }
  HS.on('sync', paintLight);
  HS.on('route', paintLight);

  /* ---------- loading ---------- */
  function load() {
    loading = true;
    return Promise.all([HS.get('/api/devices'), HS.get('/api/conflicts')]).then(function (r) {
      dev = r[0]; conflicts = r[1] || []; HS.sync = dev.summary; paintLight(); loading = false;
    }, function (e) { loading = false; throw e; });
  }

  /* ---------- the status card ---------- */
  function statusCard() {
    var s = dev.summary, others = dev.nodes.filter(function (n) { return !n.self && n.status === 'active'; });
    var agree = others.filter(function (n) { return (n.status_now || {}).agree === true; }).length;
    var tone = { ok: 'ok', pending: 'info', offline: '', problem: 'bad', single: '' }[s.state] || '';
    var icon = s.state === 'problem' ? 'alert' : s.state === 'ok' ? 'check' : s.state === 'single' ? 'monitor' : 'sync';
    return '<section class="card dev-hero' + (tone ? ' ' + tone : '') + '"><span class="tile-ic">' + HS.icon(icon, 'lg') + '</span><div class="grow">' +
      '<h2>' + HS.esc(HS.t('dev.state.' + s.state)) + '</h2><p class="muted">' + HS.esc(HS.t('dev.state.' + s.state + '.b')) + '</p>' +
      (others.length ? '<p>' + HS.t('dev.counts', { a: HS.fmt.num(s.online || 0), b: HS.fmt.num(others.length), c: HS.fmt.num(agree) }) +
        (s.files_missing ? ' · ' + HS.esc(HS.t('dev.light.files', { n: HS.fmt.num(s.files_missing) })) : '') + '</p>' : '') + '</div>' +
      (isCentre() ? '<button class="btn primary" data-add>' + HS.icon('plus', 'sm') + HS.esc(HS.t('dev.add')) + '</button>' : '') + '</section>';
  }

  /* the centre PC's address, as the other PCs must type it */
  function addressCard() {
    if (!canAdmin()) return '';
    var list = addresses();
    return '<section class="card"><header><span class="tile-ic">' + HS.icon('link') + '</span><h3>' + HS.esc(HS.t('dev.addr.title')) + '</h3></header>' +
      '<p class="muted">' + HS.esc(HS.t('dev.addr.b')) + '</p>' +
      (list.length ? '<div class="chip-row">' + list.map(function (a) { return '<button type="button" class="btn" data-copy="' + HS.esc(a) + '" title="' + HS.esc(HS.t('dev.copy')) + '"><span class="num" dir="ltr">' + HS.esc(a) + '</span>' + HS.icon('copy', 'sm') + '</button>'; }).join('') + '</div>'
        : '<p class="faint">' + HS.esc(HS.t('dev.addr.none')) + '</p>') + '</section>';
  }

  /* the administrator key: without a saved copy a lost centre PC means nobody can manage people any more */
  function keyCard() {
    if (!isCentre()) return '';
    if (dev.key_saved) return '<p class="faint dev-key">' + HS.icon('shield', 'sm') + ' ' + HS.esc(HS.t('dev.key.saved', { d: U.day(dev.key_saved.slice(0, 10)).replace(/<[^>]+>/g, '') })) +
      ' <button type="button" class="btn sm ghost" data-key>' + HS.esc(HS.t('dev.key.again')) + '</button></p>';
    return '<section class="card dev-attention"><header><span class="tile-ic">' + HS.icon('shield') + '</span><h3>' + HS.esc(HS.t('dev.key.title')) + '</h3></header><p>' + HS.esc(HS.t('dev.key.b')) +
      '</p><button class="btn primary" data-key>' + HS.icon('download', 'sm') + HS.esc(HS.t('dev.key.save')) + '</button></section>';
  }

  /* ---------- the PCs ---------- */
  function peerCell(n) {
    var st = n.status_now || {};
    if (n.self) return '<span class="badge info">' + HS.esc(HS.t('dev.thispc')) + '</span>';
    if (n.status === 'revoked') return '<span class="badge">' + HS.esc(HS.t('dev.removed')) + '</span>';
    var cls = { online: 'ok', syncing: 'info', offline: '', error: 'bad', unknown: '' }[st.state || 'unknown'] || '', extra = '';
    if (st.state === 'online') {
      var out = st.pending_out || 0, inn = st.pending_in || 0;
      extra = out || inn ? HS.t('dev.pending', { a: HS.fmt.num(out), b: HS.fmt.num(inn) }) : st.agree === true ? '<span class="ok-txt">' + HS.esc(HS.t('dev.same')) + '</span>' : st.agree === false ? '<span class="bad-txt">' + HS.esc(HS.t('dev.differs')) + '</span>' : '';
    } else if (st.state === 'offline') extra = HS.t('dev.lastseen', { t: U.ago(st.last_seen) });
    else if (st.state === 'error') extra = '<span class="bad-txt" title="' + HS.esc(st.last_error || '') + '">' + HS.esc(short(st.last_error, 70)) + '</span>';
    return '<span class="badge ' + cls + '">' + HS.esc(HS.t('dev.st.' + (st.state || 'unknown'))) + '</span>' + (extra ? '<small class="faint" style="display:block">' + extra + '</small>' : '');
  }
  // one card per PC (a table is too wide for a phone and for long Arabic button labels)
  function pcCard(n, admin) {
    var role = n.authority ? ' <span class="badge signal" title="' + HS.esc(HS.t('dev.role.centre.tip')) + '">' + HS.esc(HS.t('dev.role.centre')) + '</span>'
      : n.backup ? ' <span class="badge info" title="' + HS.esc(HS.t('dev.role.backup.tip')) + '">' + HS.esc(HS.t('dev.role.backup')) + '</span>' : '';
    var b = '';
    if (admin && n.status === 'active') {
      b = '<button class="btn sm" data-edit="' + HS.esc(n.id) + '">' + HS.icon('settings', 'sm') + HS.esc(HS.t('dev.edit')) + '</button>';
      if (!n.self && !n.authority) b += '<button class="btn sm" data-backup="' + HS.esc(n.id) + '" data-on="' + (n.backup ? 0 : 1) + '">' + HS.icon('shield', 'sm') + HS.esc(HS.t(n.backup ? 'dev.backup.end' : 'dev.backup.make')) + '</button>';
      if (!n.self && !(dev.me.backup && n.authority)) b += '<button class="btn sm danger" data-revoke="' + HS.esc(n.id) + '">' + HS.esc(HS.t('dev.remove')) + '</button>';
    }
    return '<li class="pc-card' + (n.status === 'revoked' ? ' gone' : '') + '"><div class="pc-name"><b>' + HS.esc(n.name) + '</b>' + role + '</div>' +
      '<div class="pc-status">' + peerCell(n) + '</div>' +
      '<dl class="pc-meta"><div><dt>' + HS.esc(HS.t('dev.col.last')) + '</dt><dd>' + (n.self ? '–' : U.ago((n.status_now || {}).last_ok)) + '</dd></div>' +
        '<div><dt>' + HS.esc(HS.t('dev.col.added')) + '</dt><dd>' + (n.enrolled_at ? U.day(n.enrolled_at.slice(0, 10)) : '–') + '</dd></div></dl>' +
      (b ? '<div class="pc-actions">' + b + '</div>' : '') + '</li>';
  }
  function pcsTable() {
    var admin = canAdmin();
    return '<section class="card"><header><span class="tile-ic">' + HS.icon('monitor') + '</span><h3>' + HS.esc(HS.t('dev.pcs')) + '</h3></header>' +
      '<ul class="pc-list">' + dev.nodes.map(function (n) { return pcCard(n, admin); }).join('') + '</ul>' +
      '<p class="faint" style="margin-top:.8rem">' + HS.esc(HS.t(admin ? 'dev.pcs.admin' : 'dev.pcs.noadmin')) + '</p></section>';
  }
  function protectCards() {
    var v = dev.last_verify;
    return '<div class="grid cols-2"><section class="card"><header><span class="tile-ic">' + HS.icon('shield') + '</span><h3>' + HS.esc(HS.t('dev.protect')) + '</h3></header>' +
      '<p class="muted">' + HS.esc(HS.t('dev.protect.b')) + '</p><p>' + (v ? HS.t('dev.protect.last', { d: U.day(v.ts.slice(0, 10)).replace(/<[^>]+>/g, '') }) + ' ' +
        (v.ok ? '<b class="ok-txt">' + HS.esc(HS.t('dev.protect.ok')) + '</b>' : '<b class="bad-txt">' + HS.esc(HS.t('dev.protect.bad')) + '</b>') : HS.esc(HS.t('dev.protect.never'))) + '</p></section>' +
      '<section class="card"><header><span class="tile-ic">' + HS.icon('doc') + '</span><h3>' + HS.esc(HS.t('dev.files')) + '</h3></header>' +
      (dev.missing_files.length ? '<p>' + HS.esc(HS.t('dev.files.wait', { n: HS.fmt.num(dev.missing_files.length) })) + '</p>' : '<p class="ok-txt">' + HS.icon('check', 'sm') + ' ' + HS.esc(HS.t('dev.files.ok')) + '</p>') + '</section></div>';
  }

  /* ---------- to decide: what two PCs did at the same time ---------- */
  function valText(entity, field, v) { return HS.audit.text(entity, field, v, true) || HS.t('dev.empty'); }
  function fieldLabel(f) { return HS.audit.field(f); }
  function entityLabel(c) { var k = 'ent.' + c.entity; return HS.has(k) ? HS.t(k) : c.title; }
  function by(b) { return b ? HS.t('dev.by', { who: b.actor || '?', pc: b.node_name || '?', t: (b.ts || '').replace('T', ' ').slice(0, 16) }) : HS.t('dev.unknown'); }   // HTML: values are escaped by HS.t
  function conflictsHTML() {
    if (!conflicts.length) return U.empty('check', HS.t('dev.conf.none'), HS.t('dev.conf.none.b'));
    return conflicts.map(function (c, i) {
      var head = '<header><span class="tile-ic">' + HS.icon('merge') + '</span><h3>' + HS.esc(entityLabel(c)) + ' · ' + HS.esc(short(c.name, 50)) + '</h3></header>';
      if (c.kind === 'conflict') return '<section class="card conflict">' + head + Object.keys(c.detail).map(function (f) {
        return '<p><b>' + HS.esc(fieldLabel(f)) + '</b> ' + HS.esc(HS.t('dev.conf.two')) + '</p>' + U.table([
          { h: 'dev.conf.value', cell: function (e) { return '<b>' + HS.esc(valText(c.entity, f, e.value)) + '</b>'; } },
          { h: 'dev.conf.who', cell: function (e) { return by(e.by); } },
          { h: 'f.status', cell: function (e) { return e.win ? '<span class="badge ok">' + HS.esc(HS.t('dev.conf.shown')) + '</span>' : ''; } },
          { h: 'f.action', cell: function (e) { return '<button class="btn sm" data-keep="' + i + '" data-f="' + HS.esc(f) + '" data-v="' + HS.esc(JSON.stringify(e.value)) + '">' + HS.icon('check', 'sm') + HS.esc(HS.t('dev.conf.use')) + '</button>'; } }
        ], c.detail[f]); }).join('') + '</section>';
      if (c.kind === 'deleted-edit') return '<section class="card conflict">' + head + '<p>' + HS.t('dev.conf.delEdit', { del: { html: by(c.delete_by) }, edits: { html: (c.edits_by || []).map(by).join('; ') } }) + '</p>' +
        '<div class="row wrap"><button class="btn sm" data-keepdel="' + i + '">' + HS.esc(HS.t('dev.conf.keepdel')) + '</button><button class="btn sm primary" data-restore="' + i + '">' + HS.icon('refresh', 'sm') + HS.esc(HS.t('dev.conf.restore')) + '</button></div></section>';
      if (c.kind === 'negative') return '<section class="card conflict">' + head + '<p>' + HS.t('dev.conf.neg', { n: HS.fmt.num(Object.keys(c.detail).map(function (k) { return c.detail[k]; })[0]) }) + '</p></section>';
      return '';
    }).join('');
  }
  function resolve(body, okKey) {
    return U.run(HS.post('/api/conflicts/resolve', body), okKey).then(function () { return D.load(); }).then(function () { return load(); }).then(paint, function () { /* the toast says why */ });
  }

  /* ---------- warnings and details ---------- */
  function alertsHTML() {
    var al = dev.alerts || [];
    if (!al.length) return U.empty('check', HS.t('dev.warn.none'), HS.t('dev.warn.none.b'));
    return '<section class="card">' + U.table([
      { h: 'f.time', cell: function (a) { return '<span class="num">' + HS.esc(a.last_ts.replace('T', ' ').slice(0, 16)) + '</span>'; } },
      { h: 'f.what', cell: function (a) { var k = 'dev.alert.' + a.kind; return '<span class="badge ' + (a.severity === 'error' ? 'bad' : 'warn') + '">' + HS.esc(HS.has(k) ? HS.t(k) : a.kind) + '</span>'; } },
      { h: 'dev.col.detail', cell: function (a) { return HS.esc(a.detail); } },
      { h: 'dev.col.times', cls: 'end', cell: function (a) { return '<span class="num">' + HS.fmt.num(a.count) + '</span>'; } },
      { h: 'f.action', cell: function (a) { return '<button class="btn sm" data-ack="' + HS.esc(a.key) + '" title="' + HS.esc(HS.t('dev.warn.seen.tip')) + '">' + HS.icon('check', 'sm') + HS.esc(HS.t('dev.warn.seen')) + '</button>'; } }
    ], al) + '</section>';
  }
  function detailsHTML() {
    if (!log) return '<div class="skeleton" style="height:8rem"></div>';
    var name = function (id) { var n = dev.nodes.filter(function (x) { return x.id === id; })[0]; return n ? n.name : id; };
    if (!log.length) return U.empty('sync', HS.t('dev.log.none'), HS.t('dev.log.none.b'));
    return '<section class="card">' + U.table([
      { h: 'f.time', cell: function (r) { return '<span class="num">' + HS.esc(String(r.ts).replace('T', ' ').slice(0, 19)) + '</span>'; } },
      { h: 'dev.col.pc', cell: function (r) { return HS.esc(name(r.peer)); } },
      { h: 'dev.col.result', cell: function (r) { return '<span class="badge ' + (r.event === 'ok' ? 'ok' : r.event === 'offline' ? '' : 'bad') + '">' + HS.esc(r.event) + '</span>'; } },
      { h: 'dev.col.received', cls: 'end', cell: function (r) { return '<span class="num">' + HS.fmt.num(JSON.parse(r.detail || '{}').pulled || 0) + '</span>'; } },
      { h: 'dev.col.sent', cls: 'end', cell: function (r) { return '<span class="num">' + HS.fmt.num(JSON.parse(r.detail || '{}').pushed || 0) + '</span>'; } },
      { h: 'dev.col.detail', cell: function (r) { var d = JSON.parse(r.detail || '{}'); return '<span class="faint" title="' + HS.esc(d.error || '') + '">' + HS.esc(short(d.error || '', 80)) + '</span>'; } }
    ], log) + '<p class="faint" style="margin-top:.8rem">' + HS.esc(HS.t('dev.log.b')) + '</p></section>';
  }

  /* ---------- the page ---------- */
  function tabs() {
    var list = [['pcs', HS.t('dev.tab.pcs')], ['conflicts', HS.t('dev.tab.conf') + (conflicts.length ? ' (' + HS.fmt.num(conflicts.length) + ')' : '')],
      ['warnings', HS.t('dev.tab.warn') + ((dev.alerts || []).length ? ' (' + HS.fmt.num(dev.alerts.length) + ')' : '')], ['details', HS.t('dev.tab.log')]];
    return '<div class="seg" role="tablist" style="max-width:100%;overflow:auto">' + list.map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + HS.esc(t[1]) + '</button>'; }).join('') + '</div>';
  }
  function body() {
    if (tab === 'conflicts') return conflictsHTML();
    if (tab === 'warnings') return alertsHTML();
    if (tab === 'details') return detailsHTML();
    return '<div class="stack">' + statusCard() + keyCard() + addressCard() + pcsTable() + protectCards() + '</div>';
  }
  var host = null;
  function paint() {
    if (!host || !host.isConnected || !dev) return;
    host.querySelector('[data-sub]').innerHTML = HS.t('dev.me', { name: dev.me.name, role: dev.me.role === 'authority' ? (dev.me.backup ? HS.t('dev.role.backup') : HS.t('dev.role.centre')) : HS.t('dev.role.member') });
    host.querySelector('[data-tabs]').innerHTML = tabs();
    host.querySelector('[data-body]').innerHTML = body();
  }
  function reload(quiet) {
    return load().then(function () { if (tab === 'details') return HS.get('/api/devices/log?limit=300').then(function (r) { log = r; }); }).then(paint,
      function (e) { if (!quiet && host && host.isConnected) host.querySelector('[data-body]').innerHTML = U.empty('lock', HS.t('common.error'), U.errorText(e)); });
  }

  /* ---------- actions ---------- */
  function addDialog() {
    U.run(HS.post('/api/devices/adding-open', {})).then(function () { return reload(true); }).then(function () {
      var el = HS.dialog({ title: HS.t('dev.add'), wide: true, body: '<div data-add-body></div>',
        footer: '<button class="btn ghost" data-close-adding>' + HS.esc(HS.t('dev.add.close')) + '</button><button class="btn primary" data-close>' + HS.esc(HS.t('common.done')) + '</button>' });
      var before = dev.nodes.filter(function (n) { return n.status === 'active'; }).length, timer, joined = '', webUrls = [];
      HS.get('/api/info').then(function (r) { webUrls = r.urls || []; paintAdd(); }, function () { /* the explanation still works without the addresses */ });
      function paintAdd() {
        var open = dev.adding_until, list = addresses();
        el.querySelector('[data-add-body]').innerHTML = joined ? '<div class="tip ok" role="status">' + HS.icon('check') + '<span><b>' + HS.t('dev.add.joined', { name: joined }) + '</b> ' + HS.esc(HS.t('dev.add.joined.b')) + '</span></div>'
          : '<p>' + HS.esc(HS.t('dev.add.b')) + '</p><ol class="steps"><li>' + HS.esc(HS.t('dev.add.s1')) + '</li><li>' + HS.esc(HS.t('dev.add.s2')) + '</li><li>' + HS.esc(HS.t('dev.add.s3')) + '</li></ol>' +
            '<div class="chip-row">' + list.map(function (a) { return '<button type="button" class="btn" data-copy="' + HS.esc(a) + '"><b class="num big-num" dir="ltr">' + HS.esc(a) + '</b>' + HS.icon('copy', 'sm') + '</button>'; }).join('') + '</div>' +
            '<details class="faint" style="margin-top:.6rem"><summary>' + HS.esc(HS.t('dev.way.title')) + '</summary><p>' + HS.esc(HS.t('dev.way.b')) + '</p>' +
              '<div class="chip-row" dir="ltr">' + webUrls.map(function (u) { return '<button type="button" class="btn sm" data-copy="' + HS.esc(u) + '"><span class="num" dir="ltr">' + HS.esc(u) + '</span>' + HS.icon('copy', 'sm') + '</button>'; }).join('') + '</div></details>' +
            (open ? '<p class="faint">' + HS.icon('clock', 'sm') + ' ' + HS.esc(HS.t('dev.add.until', { t: hm(open) })) + '</p>' : '<div class="tip warn">' + HS.icon('info') + '<span>' + HS.esc(HS.t('dev.add.closed')) + '</span></div>');
        var cb = el.querySelector('[data-close-adding]'); if (cb) cb.hidden = !open || !!joined;
      }
      el.addEventListener('click', function (e) {
        var c = e.target.closest('[data-copy]'); if (c) { copy(c.dataset.copy, c); return; }
        if (e.target.closest('[data-close-adding]')) U.run(HS.post('/api/devices/adding-close', {}), 'dev.add.closed.done').then(function () { return reload(true); }).then(function () { HS.overlay.close(); });
      });
      paintAdd();
      // the new PC is told "joined" the moment it appears in the list - no refresh needed
      timer = setInterval(function () {
        load().then(function () {
          var active = dev.nodes.filter(function (n) { return n.status === 'active'; });
          if (active.length > before && !joined) { joined = (active.filter(function (n) { return !n.self; }).sort(function (a, b) { return String(b.enrolled_at).localeCompare(String(a.enrolled_at)); })[0] || {}).name || ''; }
          paintAdd();
        }, function () { /* try again */ });
      }, 2000);
      var off = function () { HS.off('overlay-closed', off); clearInterval(timer); reload(true); };
      HS.on('overlay-closed', off);
    }, function () { /* the toast says why */ });
  }
  function editDialog(id) {
    var n = dev.nodes.filter(function (x) { return x.id === id; })[0]; if (!n) return;
    var el = HS.dialog({ title: HS.t('dev.edit') + ' · ' + n.name, body: '<div class="field"><label for="pc-n">' + HS.esc(HS.t('dev.pcname')) + '</label><input class="input" id="pc-n" value="' + HS.esc(n.name) + '"></div>' +
        (n.self ? '' : '<div class="field"><label for="pc-a">' + HS.esc(HS.t('dev.pcaddr')) + '</label><input class="input" id="pc-a" dir="ltr" value="' + HS.esc(n.address || '') + '" placeholder="192.168.1.20"><small class="faint">' + HS.esc(HS.t('dev.pcaddr.b')) + '</small></div>'),
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.esc(HS.t('common.save')) + '</button>' });
    el.querySelector('[data-ok]').addEventListener('click', function () {
      var body = { id: n.id, name: el.querySelector('#pc-n').value.trim() };
      if (!n.self) body.address = el.querySelector('#pc-a').value.trim();
      U.run(HS.post('/api/devices/update', body), 'common.saved', this).then(function () { HS.overlay.close(); return reload(true); }, function () { /* the toast says why */ });
    });
  }
  function keyDialog() {
    var el = HS.dialog({ title: HS.t('dev.key.title'), body: '<p>' + HS.esc(HS.t('dev.key.dialog')) + '</p>' +
        '<div class="field"><label for="k1">' + HS.esc(HS.t('dev.key.p1')) + '</label><input class="input" id="k1" type="password" autocomplete="new-password" dir="ltr"></div>' +
        '<div class="field"><label for="k2">' + HS.esc(HS.t('dev.key.p2')) + '</label><input class="input" id="k2" type="password" autocomplete="new-password" dir="ltr"></div>' +
        '<p class="faint">' + HS.esc(HS.t('dev.key.file')) + '</p><div class="tip bad" data-err hidden role="alert"></div>',
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.icon('download', 'sm') + HS.esc(HS.t('dev.key.save')) + '</button>' });
    var err = el.querySelector('[data-err]');
    el.querySelector('[data-ok]').addEventListener('click', function () {
      var p1 = el.querySelector('#k1').value, p2 = el.querySelector('#k2').value, btn = this;
      if (p1.length < 12) { err.hidden = false; err.textContent = HS.t('dev.key.short'); return; }
      if (p1 !== p2) { err.hidden = false; err.textContent = HS.t('dev.key.diff'); return; }
      btn.disabled = true;
      HS.post('/api/devices/export-key', { passphrase: p1 }).then(function (box) {
        U.download('Hessa-administrator-key.json', JSON.stringify(box, null, 2), 'application/json');
        HS.overlay.close(); HS.toast(HS.t('dev.key.done'), '', 7000); reload(true);
      }, function (e) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(e); });
    });
  }
  function act(path, body, okKey) { return U.run(HS.post(path, body), okKey).then(function (r) { return reload(true).then(function () { return r; }); }, function () { /* the toast says why */ }); }

  HS.views.devices = {
    selfRefresh: true,
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.devices')) + '</h1><p data-sub>' + HS.esc(HS.t('page.devices.d')) + '</p></div>' +
        '<div class="row wrap"><button class="btn" data-share>' + HS.icon('sync', 'sm') + HS.esc(HS.t('dev.share')) + '</button>' +
        '<button class="btn" data-verify>' + HS.icon('shield', 'sm') + HS.esc(HS.t('dev.verify')) + '</button></div></div>' +
        '<div class="toolbar" data-tabs></div><div data-body><div class="skeleton" style="height:12rem"></div></div>';
    },
    mount: function (root, ctx) {
      host = root;
      var q = ctx && ctx.route && ctx.route.q || {};
      if (['pcs', 'conflicts', 'warnings', 'details'].indexOf(q.tab) >= 0) tab = q.tab;
      reload(false);
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-tab]');
        if (t) { tab = t.dataset.tab; log = null; reload(false); return; }
        if (e.target.closest('[data-add]')) { addDialog(); return; }
        var c = e.target.closest('[data-copy]'); if (c) { copy(c.dataset.copy, c); return; }
        if (e.target.closest('[data-key]')) { keyDialog(); return; }
        var ed = e.target.closest('[data-edit]'); if (ed) { editDialog(ed.dataset.edit); return; }
        var ack = e.target.closest('[data-ack]'); if (ack) { act('/api/devices/ack', { key: ack.dataset.ack }); return; }
        if (e.target.closest('[data-share]')) { U.run(HS.post('/api/devices/sync-now', {}), 'dev.share.done').then(function () { setTimeout(function () { reload(true); }, 2500); }, function () {}); return; }
        if (e.target.closest('[data-verify]')) {
          HS.toast(HS.t('dev.verify.run'), '', 15000);
          HS.post('/api/devices/verify', { all: true }).then(function (r) {
            HS.toast(r.ok ? HS.t('dev.verify.ok', { n: HS.fmt.num(r.checked) }) : HS.t('dev.verify.bad', { n: HS.fmt.num(r.problemCount) }), r.ok ? 'ok' : 'bad', 8000);
            if (!r.ok) tab = 'warnings';
            return reload(true);
          }, function (er) { HS.toast(U.errorText(er), 'bad', 6000); });
          return;
        }
        var bk = e.target.closest('[data-backup]');
        if (bk) {
          var n = dev.nodes.filter(function (x) { return x.id === bk.dataset.backup; })[0], on = bk.dataset.on === '1';
          U.confirm({ title: HS.t(on ? 'dev.backup.make' : 'dev.backup.end') + ' · ' + n.name, body: HS.t(on ? 'dev.backup.make.b' : 'dev.backup.end.b'), ok: HS.t(on ? 'dev.backup.make' : 'dev.backup.end') }).then(function (ok) {
            if (ok) act('/api/devices/backup', { id: n.id, on: on }, on ? 'dev.backup.made' : 'dev.backup.ended');
          });
          return;
        }
        var rv = e.target.closest('[data-revoke]');
        if (rv) {
          var m = dev.nodes.filter(function (x) { return x.id === rv.dataset.revoke; })[0];
          U.confirm({ title: HS.t('dev.remove') + ' · ' + m.name, body: HS.t('dev.remove.b'), danger: true, ok: HS.t('dev.remove') }).then(function (ok) {
            if (ok) act('/api/devices/revoke', { id: m.id }, 'dev.removed.done');
          });
          return;
        }
        var kp = e.target.closest('[data-keep]');
        if (kp) { var c1 = conflicts[+kp.dataset.keep]; resolve({ entity: c1.entity, id: c1.id, action: 'value', field: kp.dataset.f, value: JSON.parse(kp.dataset.v) }, 'dev.conf.done'); return; }
        var kd = e.target.closest('[data-keepdel]'); if (kd) { var c2 = conflicts[+kd.dataset.keepdel]; resolve({ entity: c2.entity, id: c2.id, action: 'keep-deleted' }, 'dev.conf.done'); return; }
        var rs = e.target.closest('[data-restore]'); if (rs) { var c3 = conflicts[+rs.dataset.restore]; resolve({ entity: c3.entity, id: c3.id, action: 'restore' }, 'dev.conf.done'); }
      });
      // keep the page current while it is open (not while a window is open over it)
      var timer = setInterval(function () {
        if (!root.isConnected) { clearInterval(timer); return; }
        if (document.hidden || HS.overlay.isOpen || loading || (tab !== 'pcs' && tab !== 'warnings')) return;
        reload(true);
      }, 5000);
      if (timer && timer.unref) timer.unref();   // lets the node tests exit; harmless in a browser
    }
  };
})();
