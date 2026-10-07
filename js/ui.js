/* Hessa - shared interface pieces: money, grades, attendance badges, confirm dialog, forms, tables, name matching. */
(function () {
  'use strict';
  var HS = window.HS;
  var U = HS.ui = {};

  /* Shared here because centre views load before the list editor. */
  HS.withData = function (view) {
    var failed = false;
    return {
      selfRefresh: !!view.selfRefresh,   // the page updates its own parts on 'data-changed' instead of being redrawn
      render: function (ctx) {
        if (HS.data.state) return view.render(ctx);
        if (failed) return U.empty('alert', HS.t('common.error'), '',
          '<button class="btn primary" data-load-retry>' + HS.esc(HS.t('common.retry')) + '</button>');
        return '<div class="stack" role="status" aria-label="' + HS.esc(HS.t('common.loading')) + '">' +
          [1, 2, 3, 4].map(function () { return '<div class="skeleton" aria-hidden="true" style="height:3rem"></div>'; }).join('') + '</div>';
      },
      mount: function (root, ctx) {
        if (HS.data.state) { failed = false; if (view.mount) view.mount(root, ctx); return; }
        function load() {
          failed = false;
          HS.data.load().then(function () { HS.rerender(); }, function () { failed = true; HS.rerender(); });
        }
        if (failed) {
          root.querySelector('[data-load-retry]').addEventListener('click', function () { failed = false; HS.rerender(); });
        } else load();
      }
    };
  };

  /* ---------- name matching (mirrors server/domain.py key_text) ---------- */
  U.key = function (s) {
    return String(s || '').normalize('NFKC').replace(/ـ/g, '').replace(/[ً-ٰٟ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/[ىی]/g, 'ي').replace(/ک/g, 'ك').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).toLowerCase().replace(/[^\w؀-ۿ\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  /* ---------- small pieces ---------- */
  U.bdi = function (text) { return '<bdi dir="ltr">' + HS.esc(text) + '</bdi>'; };
  U.money = function (n) {
    var amount = Number(n) || 0, settings = HS.data.state && HS.data.state.settings || {}, currency = settings.currency || 'EGP';
    var label = currency === 'EGP' ? HS.t('currency.EGP') : currency;
    var value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
    return '<span class="num' + (amount < 0 ? ' bad' : '') + '">' +
      (HS.lang === 'ar' ? U.bdi(value) + ' ' + HS.esc(label) : HS.esc(label) + ' ' + U.bdi(value)) + '</span>';
  };
  U.pct = function (x) { return U.bdi(HS.fmt.num(Math.round((Number(x) || 0) * 100) / 100) + '%'); };
  U.grade = function (code, system, track) {
    return [code ? HS.t('grade.' + code) : '', system ? HS.t('system.' + system) : '',
      track ? HS.t('track.' + track) : ''].filter(Boolean).map(HS.esc).join(' · ');
  };
  var ATT_TONE = { present: 'ok', late: 'warn', absent: 'bad', excused: 'info' };
  U.att = function (status) {
    return '<span class="badge ' + (ATT_TONE[status] || '') + '">' + HS.esc(HS.t('att.' + status)) + '</span>';
  };
  U.empty = function (icon, title, text, action) {
    return '<div class="empty"><div class="art">' + HS.icon(icon, 'lg') + '</div><h3>' + HS.esc(title) + '</h3>' + (text ? '<p>' + HS.esc(text) + '</p>' : '') + (action || '') + '</div>';
  };
  U.ago = function (ts) {
    if (!ts) return HS.t('dev.never');
    var min = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    if (min < 1) return HS.t('dev.ago.now');
    if (min < 60) return HS.t('dev.ago.min', { n: HS.fmt.num(min) });
    if (min < 1440) return HS.t('dev.ago.hour', { n: HS.fmt.num(Math.round(min / 60)) });
    return HS.t('dev.ago.day', { n: HS.fmt.num(Math.round(min / 1440)) });
  };
  U.dt = function (s) { if (!s) return '–'; var d = new Date(s); return isNaN(d) ? HS.esc(s) : HS.fmt.date(d) + ' ' + HS.fmt.time(d); };
  U.day = function (s) { if (!s) return '–'; var d = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s); return isNaN(d) ? HS.esc(s) : HS.fmt.date(d); };
  U.today = function () { var d = new Date(); return d.getFullYear() + '-' + HS.fmt.pad(d.getMonth() + 1) + '-' + HS.fmt.pad(d.getDate()); };
  /* record colours are theme token names (signal, ok, info, warn), so they follow light and dark themes */
  var TONES = { signal: 1, ok: 1, info: 1, warn: 1, bad: 1, brand: 1 };
  U.tone = function (name) { return 'var(--' + (TONES[name] ? name : 'brand') + ')'; };
  // a group is drawn in its teacher's colour (one teacher = one colour across the timetable), else its own
  U.groupTone = function (g) { var t = g && HS.data.get('teachers', g.teacherId); return U.tone((t && t.color) || (g && g.color)); };

  /* daily values for the last `days` days ending on `end` (ISO date); missing days count as 0 */
  U.series = function (rows, field, end, days) {
    var map = {}, out = [], last = new Date(end + 'T00:00:00');
    (rows || []).forEach(function (r) { map[r.date] = Number(r[field]) || 0; });
    for (var i = days - 1; i >= 0; i--) {
      var x = new Date(last); x.setDate(last.getDate() - i);
      var iso = x.getFullYear() + '-' + HS.fmt.pad(x.getMonth() + 1) + '-' + HS.fmt.pad(x.getDate());
      out.push({ date: iso, v: map[iso] || 0 });
    }
    return out;
  };
  /* an area or bar chart in inline SVG (no library, prints and works offline); caption = [left text, right text] */
  U.chart = function (points, kind, label, caption) {
    var w = 560, h = 140, pad = 6, max = Math.max.apply(null, points.map(function (p) { return p.v; }).concat([1]));
    var step = (w - pad * 2) / Math.max(1, points.length - 1), y = function (v) { return h - pad - (v / max) * (h - pad * 2 - 14); };
    var tip = function (p) { return '<title>' + HS.esc(U.day(p.date).replace(/<[^>]+>/g, '') + ' · ' + HS.fmt.num(Math.round(p.v * 100) / 100)) + '</title>'; };
    var body;
    if (kind === 'bars') {
      var bw = Math.max(4, step * 0.62);
      body = points.map(function (p, i) { return '<rect x="' + (pad + i * step - bw / 2).toFixed(1) + '" y="' + y(p.v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (h - pad - y(p.v)).toFixed(1) + '" rx="2">' + tip(p) + '</rect>'; }).join('');
    } else {
      var line = points.map(function (p, i) { return (i ? 'L' : 'M') + (pad + i * step).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
      body = '<path class="area" d="' + line + ' L' + (w - pad) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z"/><path class="line" d="' + line + '"/>' +
        points.map(function (p, i) { return '<circle cx="' + (pad + i * step).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="3">' + tip(p) + '</circle>'; }).join('');
    }
    var total = points.reduce(function (s, p) { return s + p.v; }, 0);
    return '<figure class="chart ' + kind + '"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="' + HS.esc(label) + '">' + body + '</svg>' +
      '<figcaption class="row between"><span class="faint">' + HS.esc((caption || [])[0] || '') + '</span><span class="muted">' + HS.esc(HS.t('ov.chart.total')) + ' <b class="num">' + HS.fmt.num(Math.round(total)) + '</b></span><span class="faint">' + HS.esc((caption || [])[1] || '') + '</span></figcaption></figure>';
  };
  /* horizontal bars for a {label: value} breakdown, largest first */
  U.bars = function (pairs, money) {
    var list = pairs.filter(function (p) { return p[1]; }).sort(function (a, b) { return b[1] - a[1]; }), max = Math.max.apply(null, list.map(function (p) { return Math.abs(p[1]); }).concat([1]));
    if (!list.length) return '<p class="faint">' + HS.esc(HS.t('money.none')) + '</p>';
    return '<div class="bars">' + list.map(function (p) {
      return '<div class="bar-row"><span class="bar-l" title="' + HS.esc(p[0]) + '">' + HS.esc(p[0]) + '</span><span class="bar-t"><i style="width:' + Math.round(Math.abs(p[1]) * 100 / max) + '%"></i></span>' + (money ? U.money(p[1]) : U.num(p[1])) + '</div>';
    }).join('') + '</div>';
  };

  /* a tiny line of values (0-100) for marks and trends; no library */
  U.spark = function (values, w, h) {
    w = w || 160; h = h || 36;
    if (!values || values.length < 2) return '';
    var max = Math.max.apply(null, values.concat([100])), step = (w - 4) / (values.length - 1);
    var pts = values.map(function (v, i) { return (2 + i * step).toFixed(1) + ',' + (h - 2 - (v / max) * (h - 4)).toFixed(1); });
    var last = pts[pts.length - 1].split(',');
    return '<svg class="sparkline" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + pts.join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3"/></svg>';
  };
  U.num = function (n) { return n === null || n === undefined || n === '' ? '<span class="faint">–</span>' : '<span class="num">' + HS.fmt.num(n) + '</span>'; };

  U.confirm = function (o) {
    return new Promise(function (resolve) {
      var el = HS.dialog({ title: o.title, body: (o.bodyHtml ? o.bodyHtml : '<p>' + HS.esc(o.body || '') + '</p>') + (o.reason ? '<div class="field"><label for="cf-reason">' + HS.esc(o.reason) + '</label><input class="input" id="cf-reason" autocomplete="off"></div>' : ''),
        footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-ok>' + HS.esc(o.ok || HS.t('common.done')) + '</button>' });
      var done = false;
      el.querySelector('[data-ok]').addEventListener('click', function () {
        var r = el.querySelector('#cf-reason');
        if (r && r.value.trim().length < 3) { r.focus(); r.style.borderColor = 'var(--bad)'; return; }
        done = true; var val = r ? r.value.trim() : true; HS.overlay.close(); resolve(val);
      });
      var off = function () { HS.off('overlay-closed', off); if (!done) resolve(false); };
      HS.on('overlay-closed', off);
    });
  };

  // the server's fixed English sentences (auth.py, app.py) in the reader's language; a sentence not listed is shown as written.
  // {p} is a permission label, shown by its own dictionary name. tests/test_center_review.ServerWordsTest keeps this complete.
  var SERVER = [
    [/^The system is still starting\. Try again in a moment\.$/, 'starting'],
    [/^This change could not be saved: (.+)$/, 'notSaved'],
    [/^The password must have at least (\d+) characters\.$/, 'pwShort'],
    [/^The password is too long \(maximum 128 characters\)\.$/, 'pwLong'],
    [/^This password is too easy to guess\. Choose another one\.$/, 'pwEasy'],
    [/^The password must not contain the user name or the person's name\.$/, 'pwName'],
    [/^The password must contain letters and at least one number or symbol\.$/, 'pwMix'],
    [/^User name: 3-32 letters, numbers, dot, dash or underscore \(no spaces\)\.$/, 'userName'],
    [/^Enter the full name\.$/, 'fullName'],
    [/^The administrator account already exists\. Please log in\.$/, 'adminExists'],
    [/^This PC belongs to another administrator PC\. Wait until its user accounts have arrived\.$/, 'otherAdmin'],
    [/^Wrong user name or password\.$/, 'wrong'],
    [/^This account is locked for (\d+) more minute\(s\) after too many wrong passwords\. Wait, or ask the administrator to unlock it\.$/, 'lockedFor'],
    [/^Too many wrong passwords\. The account is locked for (\d+) minutes\.$/, 'lockedNow'],
    [/^This account is disabled\. Ask the administrator\.$/, 'disabledAsk'],
    [/^This link does not work any more\.$/, 'linkDead'],
    [/^This account is disabled\.$/, 'disabled'],
    [/^Administrator accounts must log in with their password\.$/, 'adminPw'],
    [/^This user no longer exists\.$/, 'noUser'],
    [/^People with administrator rights cannot get a personal link - they always log in with their password\.$/, 'adminNoLink'],
    [/^The current password is wrong\.$/, 'curWrong'],
    [/^The new password must be different from the current one\.$/, 'pwSame'],
    [/^For security, please change your password once on the administrator PC .*$/, 'pwOld'],
    [/^Give the profile a name, e\.g\. \"Visitor\"\.$/, 'profName'],
    [/^\"Custom\" is used for people with their own set of permissions\. Choose another name\.$/, 'profCustom'],
    [/^\"(.+)\" was the old name of the profile \"(.+)\"\. Choose another name\.$/, 'profOld'],
    [/^This profile no longer exists\.$/, 'profGone'],
    [/^The Administrator profile always has every right\. It cannot be changed\.$/, 'profAdmin'],
    [/^There is already a profile called \"(.+)\"\.$/, 'profDup'],
    [/^At least one active person must keep the right to manage people and permissions\.$/, 'keepManager'],
    [/^You have this profile yourself\. You cannot remove your own right to manage people and permissions\.$/, 'profSelf'],
    [/^(.+) has this profile and has a personal link\. People with a link cannot have administrator rights .*$/, 'profLink'],
    [/^The Administrator profile cannot be deleted\.$/, 'profAdminDel'],
    [/^People who log in with a personal link cannot have administrator rights .*$/, 'linkAdmin'],
    [/^The user name \"(.+)\" is already used by a deleted user\.$/, 'userDupDeleted'],
    [/^The user name \"(.+)\" is already used\.$/, 'userDup'],
    [/^(.+) was changed by (.+) at (.+)\. Close and open it again\.$/, 'changedBy'],
    [/^(.+) also has a personal link\. People with a link cannot have administrator rights\. .*$/, 'userLink'],
    [/^You cannot disable yourself or remove your own right to manage users\.$/, 'selfDisable'],
    [/^At least one active user must keep the right to manage users\.$/, 'keepUserManager'],
    [/^There is no account with this user name\.$/, 'noAccount'],
    [/^You cannot delete your own account\.$/, 'selfDelete'],
    [/^Choose a USB drive or another disk of this PC, not a network folder \(the backups contain the passwords\)\.$/, 'bkNetwork'],
    [/^Type the full folder, for example E:\\Hessa-Backups\.$/, 'bkFull'],
    [/^Choose a folder on another disk or a USB drive, not inside the program data\.$/, 'bkInside'],
    [/^This folder cannot be used \(not found or no permission to write\)\. Check the drive and try again\.$/, 'bkBad'],
    [/^The setting could not be saved \(config\.json is damaged or cannot be written\)\.$/, 'cfgBad'],
    [/^Only a user with the permission \"(.+)\" for all teachers can replace all data\.$/, 'replaceAll'],
    [/^You are limited to certain teachers and cannot add new ones\.$/, 'scopeAdd'],
    [/^Contact details require the permission to view contacts\.$/, 'contacts'],
    [/^You are not allowed to (add|change|delete) (.+)\. Ask the administrator for the permission \"(.+)\"\.$/, 'notAllowed'],
    [/^You may work only inside the centre\. .*$/, 'insideOnly'],
    [/^You do not have permission for this\. Ask the administrator for: \"(.+)\"\.$/, 'needPerm'],
    [/^Request too large \((\d+) MB\)$/, 'tooLarge'],
    [/^This shows the whole centre\. It is only for users who work with all teachers\.$/, 'wholeCentre'],
    [/^Only an administrator can open this\.$/, 'adminOnly'],
    [/^Only on this PC itself\.$/, 'thisPc'],
    [/^The complete export contains all teachers; you only have access to some of them\.$/, 'exportAll'],
    [/^Request from another web site was blocked\.$/, 'csrf'],
    [/^Too many attempts\. Wait a minute and try again\.$/, 'tooMany'],
    [/^Too many wrong attempts from this computer\. Wait a minute and try again\.$/, 'tooManyPc'],
    [/^Joining is only possible on a new, not yet set up PC, on the PC itself\.$/, 'joinNew'],
    [/^Only on a new, not yet set up PC, on the PC itself\.$/, 'newPc'],
    [/^Not possible\.$/, 'notPossible'],
    [/^Recover a password on the centre PC itself\.$/, 'recoverHere'],
    [/^Recover a password on the centre PC \(the administrator PC\)\.$/, 'recoverAdmin'],
    [/^The first administrator account can only be created on the PC with the program itself\.$/, 'firstAdmin'],
    [/^Please change your temporary password first\.$/, 'tempPw'],
    [/^This PC needs a decision first: .*$/, 'moved'],
    [/^Conflicts are decided only in Devices & Sync by an administrator\.$/, 'conflicts'],
    [/^Alerts are reviewed on the Watch page by an administrator\.$/, 'alerts'],
    [/^Only an administrator changes what the Watch looks for\.$/, 'watchRules'],
    [/^Use the dedicated centre operation for attendance and money records\.$/, 'useOp'],
    [/^Choose how the program opens on this PC itself\.$/, 'windowHere'],
    [/^Remote work is switched on at the centre itself, not from outside\.$/, 'remoteHere'],
    [/^Only an administrator can choose the backup folder\.$/, 'bkAdmin'],
    [/^For safety, choose the backup folder on this PC itself\.$/, 'bkHere'],
    [/^For safety, save the administrator key on the administrator PC itself\.$/, 'keyHere'],
    [/^Only the administrator PC can save the administrator key\.$/, 'keyAdmin'],
    [/^The passphrase must have at least 12 characters\.$/, 'passphrase'],
    [/^Record not found$/, 'notFound'],
    [/^File type (.+) is not allowed$/, 'fileType'],
    [/^Empty file$/, 'emptyFile'],
    [/^Please log in\.$/, 'login'],
    [/^This is changed only on its own page, by an administrator\.$/, 'ownPage'],
    [/^The trial password works only on the centre PC itself\. Change it there first\.$/, 'trialRemote'],
  ];
  var PERM_AT = { replaceAll: 1, notAllowed: 3, needPerm: 1 };     // which captured value is a permission label
  function permName(label) {
    var groups = (HS.me && HS.me.permissions) || [];
    for (var i = 0; i < groups.length; i++) {
      var list = groups[i][1] || [];
      for (var j = 0; j < list.length; j++) if (list[j][1] === label) return HS.t('perm.' + list[j][0]);
    }
    return label;
  }
  U.serverText = function (msg) {
    msg = String(msg || '');
    for (var i = 0; i < SERVER.length; i++) {
      var m = SERVER[i][0].exec(msg);
      if (!m) continue;
      var key = SERVER[i][1], vars = { a: m[1], b: m[2], c: m[3] };
      if (PERM_AT[key]) vars.p = permName(m[PERM_AT[key]]);
      return HS.t('srv.' + key, vars);
    }
    return msg;
  };
  U.errorText = function (e) {
    return e && e.data && e.data.key ? HS.t(e.data.key, e.data.vars) : (e && e.message ? U.serverText(e.message) : HS.t('common.error'));
  };

  /* ---------- forms ---------- */
  // field: { key, label, type: text|number|tel|date|datetime|select|bool|textarea|ref, entity, options, required, help, ltr, placeholder, allowNew }
  function refOptions(f) {
    var rows = HS.data.list(f.entity).filter(function (r) { return r.active !== false; });
    return rows.map(function (r) { return { v: r.id, l: f.entity === 'subjects' ? HS.data.subjectName(r.id) : r.name }; })
      .sort(function (a, b) { return String(a.l).localeCompare(String(b.l), HS.lang); });
  }
  U.field = function (f, value) {
    var id = 'f-' + f.key, lab = HS.t(f.label), val = value === undefined || value === null ? '' : value;
    var help = f.help ? '<span class="help" id="' + id + '-h">' + HS.esc(HS.t(f.help)) + '</span>' : '';
    var attrs = (f.required ? ' required' : '') + (f.ltr ? ' dir="ltr"' : '') + (f.placeholder ? ' placeholder="' + HS.esc(HS.t(f.placeholder)) + '"' : '') +
      (f.help ? ' aria-describedby="' + id + '-h"' : '');
    var cls = 'field' + (f.wide ? ' wide' : '');
    var input;
    if (f.type === 'multi') {
      input = '<select class="input" multiple id="' + id + '" name="' + f.key + '"' + attrs + '>' + f.options.map(function (o) {
        return '<option value="' + HS.esc(o.v) + '"' + (Array.isArray(val) && val.indexOf(o.v) >= 0 ? ' selected' : '') + '>' + HS.esc(o.l) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'select') {
      input = '<select class="input" id="' + id + '" name="' + f.key + '">' + (f.blank !== false ? '<option value="">–</option>' : '') + f.options.map(function (o) {
        return '<option value="' + HS.esc(o.v) + '"' + (String(val) === String(o.v) ? ' selected' : '') + '>' + HS.esc(o.l) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'ref') {
      var opts = refOptions(f), cur = opts.filter(function (o) { return o.v === val; })[0];
      input = '<input class="input" id="' + id + '" name="' + f.key + '" list="dl-' + id + '" autocomplete="off" value="' + HS.esc(cur ? cur.l : '') + '"' + attrs + ' data-ref="' + f.entity + '">' +
        '<datalist id="dl-' + id + '">' + opts.map(function (o) { return '<option value="' + HS.esc(o.l) + '"></option>'; }).join('') + '</datalist>';
    } else if (f.type === 'bool') {
      // an on/off setting is one row you can click anywhere on: the words (and their explanation) first, the switch at the end
      return '<div class="' + cls + ' toggle"><label class="toggle-row" for="' + id + '"><span class="toggle-text"><span class="lbl">' + HS.esc(lab) + '</span>' + help + '</span>' +
        '<span class="switch"><input type="checkbox" id="' + id + '" name="' + f.key + '"' + (val ? ' checked' : '') + (f.help ? ' aria-describedby="' + id + '-h"' : '') + '><span></span></span></label></div>';
    } else if (f.type === 'textarea') {
      input = '<textarea class="input" id="' + id + '" name="' + f.key + '" rows="3"' + attrs + '>' + HS.esc(val) + '</textarea>';
    } else {
      var type = f.type === 'datetime' ? 'datetime-local' : (f.type || 'text');
      input = '<input class="input" id="' + id + '" name="' + f.key + '" type="' + type + '"' + (type === 'number' ? ' inputmode="numeric" step="any"' : '') + ' value="' + HS.esc(type === 'datetime-local' ? String(val).slice(0, 16) : val) + '"' + attrs + (f.suggest ? ' list="dl-' + id + '" autocomplete="off"' : '') + '>' +
        (f.suggest ? '<datalist id="dl-' + id + '">' + f.suggest().map(function (x) { return '<option value="' + HS.esc(x) + '"></option>'; }).join('') + '</datalist>' : '');
    }
    return '<div class="' + cls + '"><label for="' + id + '">' + HS.esc(lab) + (f.required ? ' <span class="faint">*</span>' : '') + '</label>' + input + help + '</div>';
  };
  U.fields = function (fields, values) { return fields.map(function (f) { return U.field(f, (values || {})[f.key]); }).join(''); };

  // returns { values, missing: [labels], newRefs: [{field, entity, text}] }
  U.read = function (root, fields) {
    var values = {}, missing = [], newRefs = [];
    fields.forEach(function (f) {
      var el = root.querySelector('[name="' + f.key + '"]');
      if (!el) return;
      var v;
      if (f.type === 'multi') v = Array.prototype.filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
      else if (f.type === 'bool') v = el.checked;
      else if (f.type === 'number') v = el.value === '' ? null : Number(el.value);
      else if (f.type === 'datetime') v = el.value ? el.value + ':00' : '';
      else if (f.type === 'ref') {
        var text = el.value.trim(), hit = refOptions(f).filter(function (o) { return U.key(o.l) === U.key(text); })[0];
        if (hit) v = hit.v; else if (text && f.allowNew) { v = ''; newRefs.push({ field: f.key, entity: f.entity, text: text }); } else { v = ''; if (text) missing.push(HS.t(f.label)); }
      } else v = el.value.trim();
      if (f.required && (v === '' || v === null || Array.isArray(v) && !v.length)) missing.push(HS.t(f.label));
      values[f.key] = v;
    });
    return { values: values, missing: missing, newRefs: newRefs };
  };

  /* ---------- table ---------- */
  // cols: [{ h: headerKey, cell: function(row) -> html, cls }]
  U.table = function (cols, rows, opts) {
    opts = opts || {};
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + HS.esc(HS.t(c.h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr style="--i:' + Math.min(i, 14) + '"' + (opts.rowAttr ? ' ' + opts.rowAttr(r) : '') + (opts.click ? ' tabindex="0" role="button" style="cursor:pointer;--i:' + Math.min(i, 14) + '"' : '') + '>' +
          cols.map(function (c) { return '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.cell(r) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  };

  /* ---------- a file for the person to keep: a spreadsheet (CSV, opens in Excel with Arabic intact) ---------- */
  U.download = function (name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  U.csv = function (lines) {
    return '\ufeff' + lines.map(function (l) {
      return l.map(function (v) {
        v = v === undefined || v === null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(v) && !/^[-+]?\d+(\.\d+)?$/.test(v) && !/^\+\d[\d ]+$/.test(v)) v = "'" + v;      // a name that starts with = must never run as a spreadsheet formula
        return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  };

  /* ---------- run a save with the standard feedback ---------- */
  U.run = function (promise, okKey, btn) {
    if (btn) btn.disabled = true;
    return promise.then(function (r) { if (okKey) HS.toast(HS.t(okKey)); return r; }, function (e) {
      if (btn) btn.disabled = false;
      HS.toast(U.errorText(e), 'bad', 5000);
      throw e;
    });
  };
})();
