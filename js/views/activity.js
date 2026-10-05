/* Hessa - Activity log: two permanent, read-only lists kept in the signed history of every PC.
   "Changes": every change to the centre's data - who, when, from which PC, and exactly what it was before and after.
   "Logins & security": sign-ins, refused attempts, account and PC changes (administrators only).
   Nothing here can be edited or deleted. What a person may see is decided by the server (teachers' scopes, phone numbers). */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, A = HS.audit;
  var PAGE = 100;
  var TONE = { 'remote-refused': 'bad', 'login-failed': 'bad', 'login-blocked': 'bad', 'account-locked': 'bad', 'password-change-failed': 'bad', 'login-link-failed': 'bad', 'access-denied': 'bad',
    'user-unlocked': 'warn', 'forced-logout': 'warn', 'password-reset': 'warn', 'admin-reset': 'warn', 'user-disabled': 'warn', 'user-deleted': 'warn',
    'profile-deleted': 'warn', 'link-created': 'warn', 'node-enrolled': 'warn', 'node-revoked': 'warn', 'pairing-code': 'warn', 'pairing-request': 'warn',
    'pairing-rejected': 'warn', 'pc-adding-open': 'warn', 'authority-exported': 'warn', 'authority-imported': 'warn', 'backup-set': 'warn', 'backup-removed': 'warn',
    'backup-started': 'warn', 'backup-ended': 'warn', 'backup-key-sent': 'warn', 'backup-restored': 'warn' };
  var EVENTS = ['login', 'logout', 'login-failed', 'login-blocked', 'account-locked', 'user-unlocked', 'session-expired', 'forced-logout', 'password-changed',
    'password-change-failed', 'password-reset', 'admin-reset', 'user-created', 'user-changed', 'user-disabled', 'user-deleted', 'profile-saved', 'profile-deleted',
    'link-created', 'link-removed', 'login-link', 'login-link-failed', 'access-denied', 'setup', 'node-enrolled', 'node-confirmed', 'node-revoked', 'pairing-code',
    'pairing-request', 'pairing-rejected', 'pc-adding-open', 'pc-adding-closed', 'authority-exported', 'authority-imported', 'backup-set', 'backup-removed',
    'backup-started', 'backup-ended', 'backup-key-sent', 'backup-restored', 'backup-folder', 'conflict-resolved', 'integrity-check', 'gateway-secret', 'remote-login', 'remote-refused', 'remote-switch'];
  var QUIET = { login: 1, logout: 1, 'session-expired': 1, 'login-link': 1 };     // their detail is only the browser's name
  var tab = 'changes';
  var filters = { changes: blank(), security: blank() };
  function blank() { return { q: '', user: '', typ: '', node: '', from: '', to: '' }; }
  function tabs() {
    var list = [];
    if (HS.can('logs.view')) list.push('changes');
    if (HS.can('logs.security') && HS.me && HS.me.admin) list.push('security');
    return list;
  }
  function url(kind, f, limit, offset) {
    var p = ['limit=' + limit, 'offset=' + offset];
    [['q', f.q], ['user', f.user], ['type', f.typ], ['node', f.node], ['from', f.from], ['to', f.to]].forEach(function (x) { if (x[1]) p.push(x[0] + '=' + encodeURIComponent(x[1])); });
    return (kind === 'security' ? '/api/security?' : '/api/audit?') + p.join('&');
  }
  function isoToday() { var d = new Date(); return d.getFullYear() + '-' + HS.fmt.pad(d.getMonth() + 1) + '-' + HS.fmt.pad(d.getDate()); }
  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function opt(v, label, cur) { return '<option value="' + HS.esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + HS.esc(label) + '</option>'; }

  /* ---------- the detail sentence in the reader's language ----------
     The server writes each security detail as one fixed English sentence (the log is evidence: it is never rewritten). Here every
     known sentence becomes a dictionary text with its numbers and names, so old entries read in Arabic too; an unknown one is shown as
     written. A list of changes ("User name: a -> b; Role: …") is translated part by part. */
  var DETAIL = [
    [/^First administrator account created on this PC \(it is now the administrator PC\)$/, 'setup'],
    [/^Unknown user name$/, 'unknownUser'],
    [/^Account is locked until (.+)$/, 'lockedUntil'],
    [/^Wrong password \(attempt (\d+) of (\d+)\)$/, 'wrongPassword'],
    [/^Locked for (\d+) minutes after (\d+) wrong passwords$/, 'lockedFor'],
    [/^Account is disabled$/, 'disabled'],
    [/^Unknown or switched-off personal link$/, 'linkUnknown'],
    [/^Personal link used, but the account is disabled$/, 'linkDisabled'],
    [/^Personal link refused: administrator accounts must use their password$/, 'linkAdmin'],
    [/^Logged in with the personal link(?: - (.+))?$/, 'linkLogin'],
    [/^A new personal link was made \(an older one stops working on every PC\)$/, 'linkReplaced'],
    [/^Personal link created(?: \(logs in without a password\))?$/, 'linkCreated'],
    [/^Personal link switched off on every PC$/, 'linkOff'],
    [/^Current password was wrong$/, 'currentWrong'],
    [/^Changed own password; (\d+) other session\(s\) logged out$/, 'ownPassword'],
    [/^(\d+) permission\(s\); updated for (\d+) person\(s\)$/, 'profileSaved'],
    [/^People who had it keep their permissions$/, 'profileDeleted'],
    [/^Role: (.*); active: (True|False); teachers: (.+); permissions: (.*)$/, 'userCreated'],
    [/^All open sessions on every PC are ended$/, 'sessionsEnded'],
    [/^Temporary password set by the administrator; must be changed at next login; logged out on every PC$/, 'tempPassword'],
    [/^Unlocked on (.+)$/, 'unlocked'],
    [/^Sessions ended by the administrator on (.+) \((\d+) here\)$/, 'forcedLogout'],
    [/^Account deleted on every PC \(kept in the logs; the user name stays reserved\)$/, 'userDeleted'],
    [/^Logged out automatically after (\d+) minutes without activity$/, 'idle'],
    [/^Logged out automatically after the maximum session time \((\d+) hours\)$/, 'maxAge'],
    [/^Session ended - the account is disabled or deleted$/, 'sessionDisabled'],
    [/^Session ended - the personal link was switched off or the account became an administrator$/, 'sessionLink'],
    [/^Confirmed on this PC: same computer as before \(name or network card changed\)$/, 'nodeConfirmed'],
    [/^Second backup folder set$/, 'folderSet'],
    [/^Second backup folder removed$/, 'folderRemoved'],
    [/^(\d+) records changed back; safety backup: (.+)$/, 'restored'],
    [/^Administrator key saved as a file \(passphrase protected\)$/, 'keySaved'],
    [/^Administrator key exported \(passphrase protected\)$/, 'keySaved'],
    [/^OK$/, 'checkOk'],
    [/^(\d+) problem\(s\)$/, 'checkProblems'],
    [/^Emergency password reset on the administrator PC \(maintenance tool\)$/, 'emergencyReset'],
    [/^This PC is now the administrator PC \(key imported\)\. Remove the old administrator PC in Devices & Sync\.$/, 'keyImported'],
    [/^This PC was removed: the administrator key was deleted here$/, 'pcRemoved'],
    [/^No longer a backup administrator PC: the administrator key was deleted here$/, 'backupEnded'],
    [/^This PC is now a backup administrator PC$/, 'backupStarted'],
    [/^The administrator key was handed to the backup administrator PC$/, 'keySent'],
    [/^PC (.+) \((.+)\) asks to join; confirmation number (\d+)$/, 'pairing'],
    [/^Office secret shown$/, 'secretShown'],
    [/^Setup code shown$/, 'codeShown'],
    [/^Signed in from outside the centre$/, 'remoteLogin'],
    [/^Sign-in from outside the centre refused: no permission$/, 'remoteRefused'],
    [/^Work from outside the centre switched on$/, 'remoteOn'],
    [/^Work from outside the centre switched off$/, 'remoteOff']
  ];
  var PART = [
    [/^(User name|Name|Job title|Role|Active|Must change password|Notes): (.*) -> (.*)$/, 'field'],
    [/^Permissions (added|removed): (.+)$/, 'perms'],
    [/^Teachers: (.+) -> (.+)$/, 'teachers']
  ];
  var FIELD = { 'User name': 'sec.f.username', Name: 'sec.f.name', 'Job title': 'sec.f.title', Role: 'sec.f.role', Active: 'sec.f.active', 'Must change password': 'sec.f.mustChange', Notes: 'sec.f.notes' };
  function word(v) { return v === 'True' ? HS.t('common.yes') : v === 'False' ? HS.t('common.no') : v === 'all' ? HS.t('common.all') : v; }
  function perms(list) { return String(list || '').split(', ').filter(Boolean).map(function (p) { return HS.has('perm.' + p) ? HS.t('perm.' + p) : p; }).join('، '); }
  function teachers(v) { return v === 'all' ? HS.t('common.all') : String(v).split(', ').map(function (id) { return (HS.data && HS.data.teacherName && HS.data.teacherName(id)) || id; }).join('، '); }
  function part(text) {
    for (var i = 0; i < PART.length; i++) {
      var m = PART[i][0].exec(text); if (!m) continue;
      if (PART[i][1] === 'field') return HS.t('sec.p.field', { f: HS.has(FIELD[m[1]]) ? HS.t(FIELD[m[1]]) : m[1], a: word(m[2]), b: word(m[3]) });
      if (PART[i][1] === 'perms') return HS.t('sec.p.' + m[1], { list: perms(m[2]) });
      return HS.t('sec.p.teachers', { a: teachers(m[1]), b: teachers(m[2]) });
    }
    return text;
  }
  A.securityDetail = function (detail) {
    var text = String(detail || '');
    for (var i = 0; i < DETAIL.length; i++) {
      var m = DETAIL[i][0].exec(text);
      if (!m) continue;
      var k = 'sec.d.' + DETAIL[i][1];
      if (DETAIL[i][1] === 'userCreated') return HS.t(k, { a: m[1], b: word(m[2]), c: m[3] === 'all' ? HS.t('common.all') : m[3], d: perms(m[4]) || HS.t('sec.p.none') });
      if (DETAIL[i][1] === 'linkLogin') return HS.t(k) + (m[1] ? ' - ' + m[1] : '');
      return HS.t(k, { a: m[1] || '', b: m[2] || '', c: m[3] || '' });
    }
    return text.indexOf('; ') > 0 && PART.some(function (p) { return p[0].test(text.split('; ')[0]); }) ? text.split('; ').map(part).join(' · ') : text;
  };

  /* ---------- one entry ---------- */
  function changeRow(r) { return A.entryHTML(r, { hist: true }); }
  function securityRow(r) {
    var k = 'sec.' + r.event, tone = TONE[r.event] || '';
    return '<li class="log-row' + (tone === 'bad' ? ' is-bad' : '') + '"><div class="log-head"><span class="badge ' + tone + '">' + HS.esc(HS.has(k) ? HS.t(k) : r.event) + '</span>' +
      (r.target ? '<b class="log-name">' + HS.esc(short(r.target, 60)) + '</b>' : '') + '<span class="grow"></span><time class="faint num">' + HS.esc(A.when(r.ts)) + '</time></div>' +
      '<div class="log-sub faint">' + HS.esc(r.user || '') + (r.ip ? ' · <bdi dir="ltr">' + HS.esc(r.ip) + '</bdi>' : '') + ' · ' + HS.esc(r.node_name || '') + '</div>' +
      (r.detail ? '<div class="log-sum' + (QUIET[r.event] ? ' faint' : '') + '" dir="auto">' + HS.esc(short(A.securityDetail(r.detail), 300)) + '</div>' : '') + '</li>';
  }

  /* ---------- the page ---------- */
  var host = null, state = null;      // state: the rows loaded for the tab on screen
  function filtered(f) { return !!(f.q || f.user || f.typ || f.node || f.from || f.to); }
  function toolbar() {
    var f = filters[tab];
    return '<div class="toolbar" data-filters>' +
      '<input class="input" data-f="q" type="search" value="' + HS.esc(f.q) + '" placeholder="' + HS.esc(HS.t('list.search')) + '" aria-label="' + HS.esc(HS.t('list.search')) + '" style="max-width:20rem">' +
      '<select class="input" data-f="user" aria-label="' + HS.esc(HS.t('f.user')) + '" style="width:auto">' + opt('', HS.t('act.user'), f.user) + '</select>' +
      (tab === 'changes' ? '<select class="input" data-f="typ" aria-label="' + HS.esc(HS.t('act.op')) + '" style="width:auto">' + opt('', HS.t('act.op'), f.typ) +
        ['insert', 'update', 'delete'].map(function (o) { return opt(o, A.opLabel(o), f.typ); }).join('') + '</select>'
        : '<select class="input" data-f="typ" aria-label="' + HS.esc(HS.t('act.ev')) + '" style="width:auto">' + opt('', HS.t('act.ev'), f.typ) +
        EVENTS.map(function (e) { return opt(e, HS.t('sec.' + e), f.typ); }).join('') + '</select>') +
      '<select class="input" data-f="node" aria-label="' + HS.esc(HS.t('f.pc')) + '" style="width:auto" hidden>' + opt('', HS.t('act.pc'), f.node) + '</select>' +
      '<input class="input" data-f="from" type="date" value="' + HS.esc(f.from) + '" aria-label="' + HS.esc(HS.t('act.from')) + '" style="width:auto">' +
      '<input class="input" data-f="to" type="date" value="' + HS.esc(f.to) + '" aria-label="' + HS.esc(HS.t('act.to')) + '" style="width:auto">' +
      '<button type="button" class="btn ghost sm" data-reset hidden>' + HS.icon('x', 'sm') + HS.esc(HS.t('act.reset')) + '</button>' +
      '<span class="grow"></span><button type="button" class="btn sm" data-export>' + HS.icon('download', 'sm') + HS.esc(HS.t('act.export')) + '</button></div>';
  }
  function fillLists() {
    if (!state) return;
    var f = filters[tab], u = host.querySelector('[data-f=user]'), n = host.querySelector('[data-f=node]');
    u.innerHTML = opt('', HS.t('act.user'), f.user) + (state.users || []).filter(Boolean).map(function (x) { return opt(x, x, f.user); }).join('');
    n.innerHTML = opt('', HS.t('act.pc'), f.node) + (state.nodes || []).map(function (x) { return opt(x.id, x.name, f.node); }).join('');
    n.hidden = (state.nodes || []).length < 2;                       // one PC: nothing to choose
    host.querySelector('[data-reset]').hidden = !filtered(f);
  }
  function paintList() {
    var body = host.querySelector('[data-body]'), rows = state.rows, f = filters[tab];
    var fails = tab === 'security' ? rows.filter(function (r) { return TONE[r.event] === 'bad'; }).length : 0;
    if (!rows.length) {
      body.innerHTML = filtered(f) ? U.empty('activity', HS.t('act.none.f'), HS.t('act.none.f.b')) :
        tab === 'security' ? U.empty('lock', HS.t('act.sec.none'), HS.t('act.sec.none.b')) : U.empty('activity', HS.t('act.none.t'), HS.t('act.none.b'));
      return;
    }
    body.innerHTML = '<div class="row wrap" style="margin-bottom:.8rem"><span class="badge">' + HS.esc(HS.t('act.count', { shown: HS.fmt.num(rows.length), total: HS.fmt.num(state.total) })) + '</span>' +
      (fails ? '<span class="badge bad">' + HS.esc(HS.t('act.fail.n', { n: HS.fmt.num(fails) })) + '</span>' : '') + '</div>' +
      '<ol class="log-list">' + rows.map(tab === 'security' ? securityRow : changeRow).join('') + '</ol>' +
      (rows.length < state.total ? '<div style="margin-top:1rem;text-align:center"><button type="button" class="btn" data-more>' + HS.esc(HS.t('act.more')) + '</button></div>' : '') +
      '<p class="faint" style="margin-top:1.2rem">' + HS.icon('lock', 'sm') + ' ' + HS.esc(HS.t('act.kept')) + '</p>';
  }
  function load(more) {
    var kind = tab, f = filters[tab], body = host.querySelector('[data-body]');
    if (!more) body.innerHTML = '<div class="skeleton" style="height:12rem"></div>';
    return HS.get(url(kind, f, PAGE, more && state ? state.rows.length : 0)).then(function (r) {
      if (!host || !host.isConnected || kind !== tab) return;
      if (more && state) { state.rows = state.rows.concat(r.rows || []); state.total = r.total; }
      else state = { rows: r.rows || [], total: r.total || 0, users: r.users, nodes: r.nodes };
      fillLists(); paintList();
    }, function (e) { if (host && host.isConnected) body.innerHTML = U.empty('lock', HS.t('common.error'), U.errorText(e)); });
  }
  function exportCsv() {
    var kind = tab, f = filters[tab];
    return U.run(HS.get(url(kind, f, 1000, 0))).then(function (r) {
      var rows = r.rows || [], lines;
      if (kind === 'security') {
        lines = [[HS.t('f.time'), HS.t('f.user'), HS.t('act.event'), HS.t('act.target'), HS.t('act.ip'), HS.t('f.pc'), HS.t('act.detail')]].concat(rows.map(function (x) {
          return [x.ts, x.user, HS.has('sec.' + x.event) ? HS.t('sec.' + x.event) : x.event, x.target, x.ip, x.node_name, A.securityDetail(x.detail)];
        }));
      } else {
        lines = [[HS.t('f.time'), HS.t('f.user'), HS.t('f.pc'), HS.t('f.action'), HS.t('act.op'), HS.t('f.what'), HS.t('act.target'), HS.t('act.detail')]].concat(rows.map(function (x) {
          return [x.ts, x.user, x.node_name, x.label, A.opLabel(x.op), A.entity(x.entity), A.name(x), A.lines(x).join(' | ')];
        }));
      }
      U.download('hessa-' + (kind === 'security' ? 'security' : 'changes') + '-' + isoToday() + '.csv', U.csv(lines), 'text/csv;charset=utf-8');
      HS.toast(HS.t('act.exported', { n: HS.fmt.num(rows.length) }));
    }, function () { /* the toast says why */ });
  }
  function paint() {
    host.querySelector('[data-tabs]').innerHTML = tabs().length > 1 ? '<div class="seg" role="tablist">' + tabs().map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t + '" aria-pressed="' + (tab === t) + '">' + HS.esc(HS.t('act.tab.' + t)) + '</button>'; }).join('') + '</div>' : '';
    host.querySelector('[data-bar]').innerHTML = toolbar();
    state = null;
    return load(false);
  }

  HS.views.activity = {
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.activity')) + '</h1><p>' + HS.esc(HS.t('page.activity.d')) + '</p></div></div><div class="toolbar" data-tabs></div><div data-bar></div><div data-body><div class="skeleton" style="height:12rem"></div></div>';
    },
    mount: function (root) {
      host = root;
      if (tabs().indexOf(tab) < 0) tab = tabs()[0] || 'changes';
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-tab]');
        if (t) { tab = t.dataset.tab; paint(); return; }
        var h = e.target.closest('[data-hist]'); if (h) { var p = h.dataset.hist.split('|'); A.historyDialog(p[0], p.slice(1).join('|')); return; }
        if (e.target.closest('[data-more]')) { load(true); return; }
        if (e.target.closest('[data-export]')) { exportCsv(); return; }
        if (e.target.closest('[data-reset]')) { filters[tab] = blank(); paint(); }
      });
      var reload = HS.debounce(function () { load(false); }, 250);
      root.addEventListener('input', function (e) {
        var el = e.target.closest('[data-f]'); if (!el) return;
        filters[tab][el.dataset.f] = el.value.trim();
        if (el.dataset.f === 'q') reload(); else load(false);
        var r = root.querySelector('[data-reset]'); if (r) r.hidden = !filtered(filters[tab]);
      });
      paint();
    }
  };
})();
