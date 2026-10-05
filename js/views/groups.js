/* Hessa - groups and the timetable: the groups list, a week timetable (clashes outlined), today's sessions with roll call,
   teachers / rooms / subjects lists, the group form with its weekly times (checked for room and teacher clashes on the
   server before saving) and the group panel with its students, money and bulk enrolment by pasted codes. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'M3', 'S1', 'S2', 'S3'];
  var SYSTEMS = { P: ['general', 'azhar', 'language'], M: ['general', 'azhar', 'language'], S: ['thanaweya', 'bac', 'azhar'] };
  var TRACKS = { bac: ['med', 'eng', 'biz', 'arts'], thanaweya: ['science', 'math', 'literary'], azhar: ['scientific', 'literary'] };
  var TABS = ['list', 'timetable', 'today', 'teachers', 'rooms', 'subjects'];
  var DAY0 = 8 * 60, DAY1 = 23 * 60;   // the timetable shows 08:00 - 23:00

  function hm(s) { var p = String(s || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
  function opt(v, label, cur) { return '<option value="' + HS.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + HS.esc(label) + '</option>'; }
  function counts() {
    var c = {};
    D.list('enrollments').forEach(function (e) { if ((e.status || 'active') === 'active' && (!e.to || e.to >= U.today())) c[e.groupId] = (c[e.groupId] || 0) + 1; });
    return c;
  }
  function slotsText(g) {
    return (g.slots || []).map(function (s) { return HS.t('day.' + s.day) + ' ' + s.start + '–' + s.end; }).join(' · ');
  }
  function fill(n, cap) {
    var p = cap ? Math.min(100, Math.round(n * 100 / cap)) : 0, tone = !cap ? '' : n >= cap ? 'bad' : p >= 85 ? 'warn' : p < 40 ? 'info' : 'ok';
    return '<div class="fill ' + tone + '"><div class="meter"><i style="width:' + p + '%"></i></div><span class="num">' + HS.fmt.num(n) + (cap ? '/' + HS.fmt.num(cap) : '') + '</span></div>';
  }
  // earlier prices are kept by the server so a price rise never changes what students owed before it
  function priceHistory(g) {
    var h = (g.feeHistory || []).filter(function (x) { return (x.type || 'session') === (g.feeType || 'session'); });
    return h.length ? '<small class="faint" style="display:block">' + h.map(function (x) { return HS.esc(HS.t('grp.priceUntil', { a: HS.fmt.num(x.fee), d: U.day(x.to).replace(/<[^>]+>/g, '') })); }).join(' · ') + '</small>' : '';
  }
  function feeText(g) {
    return g.fee ? U.money(g.fee) + ' <span class="faint">' + HS.esc(HS.t('fee.' + (g.feeType || 'session'))) + (g.feeType === 'package' && g.packageSessions ? ' · ' + HS.esc(HS.t('grp.perPkg', { n: g.packageSessions })) : '') + '</span>' : '<span class="faint">–</span>';
  }

  /* ---------- the list ---------- */
  var F = { q: '', teacher: '', grade: '', kind: '', tab: 'list', room: '', day: null };
  function filtered() {
    var n = U.key(F.q);
    return D.list('groups').filter(function (g) {
      if (F.teacher && g.teacherId !== F.teacher) return false;
      if (F.grade && g.gradeCode !== F.grade) return false;
      if (F.kind && (g.kind || 'center') !== F.kind) return false;
      return !n || U.key([g.name, D.teacherName(g.teacherId), D.subjectName(g.subjectId)].join(' ')).indexOf(n) >= 0;
    }).sort(function (a, b) { return (a.active === false) - (b.active === false) || String(a.name).localeCompare(String(b.name), HS.lang); });
  }
  function listHTML() {
    var rows = filtered(), c = counts();
    if (!rows.length) return U.empty('layers', HS.t(D.list('groups').length ? 'stu.none.filter' : 'grp.empty'), HS.t(D.list('groups').length ? 'stu.none.filter.b' : 'grp.empty.b'),
      !D.list('groups').length && HS.can('groups.manage') ? '<button class="btn primary" data-new>' + HS.icon('plus', 'sm') + HS.esc(HS.t('grp.new')) + '</button>' : '');
    return U.table([
      { h: 'f.name', cell: function (g) { return '<span class="row" style="gap:.6rem"><span class="now-bar" style="--c:' + U.groupTone(g) + ';height:2rem"></span><span><b>' + HS.esc(g.name) + '</b>' + (g.active === false ? ' <span class="badge">' + HS.esc(HS.t('f.inactive')) + '</span>' : '') + '<br><span class="faint">' + HS.esc(D.subjectName(g.subjectId)) + '</span></span></span>'; } },
      { h: 'f.teacherId', cell: function (g) { return HS.esc(D.teacherName(g.teacherId)); } },
      { h: 'f.gradeCode', cell: function (g) { return '<span class="muted">' + U.grade(g.gradeCode, g.system, g.track) + '</span>'; } },
      { h: 'grp.times', cell: function (g) { return '<span class="muted">' + HS.esc(slotsText(g)) + '</span>'; } },
      { h: 'grp.room', cell: function (g) { return HS.esc(D.name('rooms', g.roomId)); } },
      { h: 'grp.fill', cell: function (g) { return fill(c[g.id] || 0, Number(g.capacity) || 0); } },
      { h: 'grp.fee', cell: feeText },
      { h: 'grp.kind', cell: function (g) { var k = g.kind || 'center'; return '<span class="badge' + (k === 'school' ? ' info' : '') + '">' + HS.esc(HS.t('kind.' + k)) + '</span>'; } }
    ], rows, { click: true, rowAttr: function (g) { return 'data-id="' + HS.esc(g.id) + '"'; } });
  }

  /* ---------- the week timetable ---------- */
  var clashes = null;
  function timetableHTML() {
    var groups = D.list('groups').filter(function (g) { return g.active !== false && (!F.teacher || g.teacherId === F.teacher) && (!F.grade || g.gradeCode === F.grade); });
    var blocks = [[], [], [], [], [], [], []], bad = {};
    (clashes || []).forEach(function (c) { if (c.kind !== 'capacity') { bad[c.a + c.day + c.start] = c.kind; bad[c.b + c.day] = c.kind; } });
    groups.forEach(function (g) {
      (g.slots || []).forEach(function (s) {
        var room = s.roomId || g.roomId;
        if (F.room && room !== F.room) return;
        blocks[s.day].push({ g: g, s: s, room: room, clash: bad[g.id + s.day + s.start] || bad[g.id + s.day] });
      });
    });
    var lo = DAY1, hi = DAY0;
    blocks.forEach(function (list) { list.forEach(function (b) { lo = Math.min(lo, hm(b.s.start)); hi = Math.max(hi, hm(b.s.end)); }); });
    if (lo > hi) { lo = 14 * 60; hi = 22 * 60; }
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    var span = hi - lo, today = (new Date().getDay() + 1) % 7, phoneDay = F.day === null ? today : F.day;
    var hours = []; for (var h = lo; h <= hi; h += 60) hours.push(h);
    var col = function (d) {
      // overlapping blocks of the same day sit side by side
      var list = blocks[d].sort(function (a, b) { return hm(a.s.start) - hm(b.s.start); }), lanes = [];
      list.forEach(function (b) { var i = 0; while (lanes[i] !== undefined && lanes[i] > hm(b.s.start)) i++; lanes[i] = hm(b.s.end); b.lane = i; });
      var n = Math.max(1, lanes.length);
      return '<div class="tt-col' + (d === today ? ' today' : '') + (d === phoneDay ? ' phone-on' : '') + '" data-day="' + d + '"><div class="tt-head">' + HS.esc(HS.t('day.' + d)) + '</div><div class="tt-body" style="--rows:' + (span / 60) + '">' +
        hours.map(function (x) { return '<i class="tt-line" style="top:' + ((x - lo) * 100 / span) + '%"></i>'; }).join('') +
        list.map(function (b) {
          var top = (hm(b.s.start) - lo) * 100 / span, ht = (hm(b.s.end) - hm(b.s.start)) * 100 / span;
          return '<button class="tt-block' + (b.clash ? ' clash' : '') + '" data-id="' + HS.esc(b.g.id) + '" style="top:' + top + '%;height:' + ht + '%;--c:' + U.groupTone(b.g) + ';inset-inline-start:calc(' + (b.lane * 100 / n) + '% + 2px);width:calc(' + (100 / n) + '% - 4px)" title="' + HS.esc(b.g.name + ' · ' + b.s.start + '–' + b.s.end + (b.clash ? ' · ' + HS.t('grp.clash.' + b.clash) : '')) + '">' +
            '<b>' + HS.esc(b.g.name) + '</b><span>' + U.bdi(b.s.start + '–' + b.s.end) + '</span><span>' + HS.esc(D.name('rooms', b.room)) + '</span></button>';
        }).join('') + '</div></div>';
    };
    return '<div class="tt-days phone-only">' + [0, 1, 2, 3, 4, 5, 6].map(function (d) { return '<button data-pday="' + d + '" aria-pressed="' + (d === phoneDay) + '">' + HS.esc(HS.t('day.' + d)) + '</button>'; }).join('') + '</div>' +
      ((clashes || []).filter(function (c) { return c.kind !== 'capacity'; }).length ? '<div class="tip bad">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('grp.clashes', { n: clashes.filter(function (c) { return c.kind !== 'capacity'; }).length })) + '</span></div>' : '') +
      '<div class="tt"><div class="tt-hours"><div class="tt-head"></div><div class="tt-body">' + hours.map(function (x) { return '<span style="top:' + ((x - lo) * 100 / span) + '%">' + HS.fmt.pad(x / 60) + ':00</span>'; }).join('') + '</div></div>' +
      [0, 1, 2, 3, 4, 5, 6].map(col).join('') + '</div>';
  }

  /* ---------- today ---------- */
  function todayHTML(list) {
    if (!list.length) return U.empty('clock', HS.t('ov.now.none'), HS.t('ov.now.none.b'));
    var t = new Date(), m = t.getHours() * 60 + t.getMinutes();
    return '<ul class="now-list">' + list.map(function (s) {
      var g = D.get('groups', s.groupId) || {}, live = hm(s.start) <= m && m <= hm(s.end), off = s.status === 'cancelled';
      return '<li style="cursor:default"><span class="now-time">' + U.bdi(s.start) + '<small>' + U.bdi(s.end) + '</small></span><span class="now-bar" style="--c:' + U.groupTone(g) + '"></span>' +
        '<div class="grow"><b' + (off ? ' style="text-decoration:line-through"' : '') + '>' + HS.esc(g.name || s.groupId) + '</b> ' + (off ? '<span class="badge bad">' + HS.esc(HS.t('grp.cancelled')) + '</span>' : live ? '<span class="badge signal"><span class="pulse-dot"></span> ' + HS.esc(HS.t('grp.live')) + '</span>' : '') +
          '<span class="muted" style="display:block">' + HS.esc([D.teacherName(s.teacherId), D.name('rooms', s.roomId)].filter(Boolean).join(' · ')) + '</span>' + fill(s.present, s.enrolled) + '</div>' +
        '<span class="row" style="gap:.3rem">' + (HS.can(['attendance.mark', 'door.use']) && !off ? '<button class="btn sm primary" data-roster="' + HS.esc(s.id) + '">' + HS.icon('check', 'sm') + HS.esc(HS.t('roll.title')) + '</button>' : '') +
          (HS.can('groups.manage') && !off && !s.present ? '<button class="btn sm ghost" data-cancel="' + HS.esc(s.id) + '">' + HS.esc(HS.t('grp.cancel')) + '</button>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- the group form ---------- */
  function slotRow(s) {
    s = s || { day: 0, start: '16:00', end: '17:30', roomId: '' };
    return '<div class="slot-row"><select class="input" data-s="day">' + [0, 1, 2, 3, 4, 5, 6].map(function (d) { return opt(d, HS.t('day.' + d), s.day); }).join('') + '</select>' +
      '<input class="input" type="time" data-s="start" value="' + HS.esc(s.start) + '"><input class="input" type="time" data-s="end" value="' + HS.esc(s.end) + '">' +
      '<select class="input" data-s="roomId">' + opt('', HS.t('grp.sameRoom'), s.roomId) + D.list('rooms').map(function (r) { return opt(r.id, r.name, s.roomId); }).join('') + '</select>' +
      '<button type="button" class="icon-btn" data-rmslot aria-label="' + HS.esc(HS.t('common.delete')) + '">' + HS.icon('x') + '</button></div>';
  }
  function formHTML(g) {
    var stage = String(g.gradeCode || 'S1').charAt(0);
    var sel = function (name, list, cur, blank) { return '<select class="input" name="' + name + '" id="gf-' + name + '">' + (blank ? opt('', '–', '') : '') + list.map(function (x) { return opt(x[0], x[1], cur); }).join('') + '</select>'; };
    var f = function (key, label, html, wide) { return '<div class="field' + (wide ? ' wide' : '') + '"><label for="gf-' + key + '">' + HS.esc(HS.t(label)) + '</label>' + html + '</div>'; };
    var inp = function (name, type, extra) { return '<input class="input" id="gf-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + HS.esc(g[name] === undefined || g[name] === null ? '' : g[name]) + '"' + (extra || '') + '>'; };
    return '<form class="grid cols-2 form-grid" data-gform autocomplete="off">' +
      f('name', 'f.name', '<div class="row">' + inp('name', 'text', ' required') + '<button type="button" class="btn sm" data-suggest title="' + HS.esc(HS.t('grp.suggest.b')) + '">' + HS.icon('spark', 'sm') + HS.esc(HS.t('grp.suggest')) + '</button></div>', true) +
      f('teacherId', 'f.teacherId', sel('teacherId', D.list('teachers').filter(function (t) { return t.active !== false || t.id === g.teacherId; }).map(function (t) { return [t.id, t.name]; }), g.teacherId, true)) +
      f('subjectId', 'grp.subject', sel('subjectId', D.list('subjects').map(function (s) { return [s.id, D.subjectName(s.id)]; }), g.subjectId, true)) +
      f('gradeCode', 'f.gradeCode', sel('gradeCode', GRADES.map(function (x) { return [x, HS.t('grade.' + x)]; }), g.gradeCode)) +
      f('system', 'f.system', sel('system', (SYSTEMS[stage] || []).map(function (x) { return [x, HS.t('system.' + x)]; }), g.system, true)) +
      f('track', 'f.track', sel('track', (TRACKS[g.system] || []).map(function (x) { return [x, HS.t('track.' + x)]; }), g.track, true)) +
      f('kind', 'grp.kind', sel('kind', ['center', 'school', 'online', 'home'].map(function (x) { return [x, HS.t('kind.' + x)]; }), g.kind || 'center')) +
      '<div class="tip wide" data-school' + ((g.kind || 'center') === 'school' ? '' : ' hidden') + '>' + HS.icon('info') + '<span>' + HS.esc(HS.t('grp.school.b')) + '</span></div>' +
      f('roomId', 'grp.room', sel('roomId', D.list('rooms').map(function (r) { return [r.id, r.name + (r.capacity ? ' (' + r.capacity + ')' : '')]; }), g.roomId, true)) +
      f('capacity', 'f.capacity', inp('capacity', 'number', ' min="1" dir="ltr"')) +
      f('feeType', 'grp.feeType', sel('feeType', ['session', 'month', 'package'].map(function (x) { return [x, HS.t('fee.' + x)]; }), g.feeType || 'session')) +
      f('fee', 'grp.fee', inp('fee', 'number', ' min="0" step="any" dir="ltr"')) +
      (g.id ? '<div class="field" data-feefrom hidden><label for="gf-feeFrom">' + HS.esc(HS.t('grp.feeFrom')) + '</label><input class="input" id="gf-feeFrom" type="date">' +
        '<small class="faint">' + HS.esc(HS.t('grp.feeFrom.b')) + '</small></div>' : '') +
      '<div class="field" data-pkg' + (g.feeType === 'package' ? '' : ' hidden') + '><label for="gf-packageSessions">' + HS.esc(HS.t('grp.pkgSessions')) + '</label>' + inp('packageSessions', 'number', ' min="1" dir="ltr"') + '</div>' +
      f('startDate', 'grp.start', inp('startDate', 'date')) + f('endDate', 'grp.end', inp('endDate', 'date')) +
      '<div class="field wide"><span class="lbl">' + HS.esc(HS.t('grp.times')) + '</span><div class="slots" data-slots>' + ((g.slots || []).length ? g.slots.map(slotRow).join('') : slotRow()) + '</div>' +
        '<button type="button" class="btn sm" data-addslot>' + HS.icon('plus', 'sm') + HS.esc(HS.t('grp.addSlot')) + '</button></div>' +
      '<div class="field"><div class="row"><span class="switch"><input type="checkbox" id="gf-active" name="active"' + (g.active !== false ? ' checked' : '') + '><span></span></span><label for="gf-active">' + HS.esc(HS.t('f.active')) + '</label></div></div>' +
      '<div class="tip bad wide" data-err hidden role="alert"></div></form>';
  }
  function readForm(p, cur) {
    var form = p.querySelector('[data-gform]'), row = Object.assign({}, cur || {});
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      row[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    });
    row.slots = Array.prototype.map.call(form.querySelectorAll('.slot-row'), function (r) {
      return { day: Number(r.querySelector('[data-s=day]').value), start: r.querySelector('[data-s=start]').value, end: r.querySelector('[data-s=end]').value, roomId: r.querySelector('[data-s=roomId]').value };
    }).filter(function (s) { return s.start && s.end; });
    delete row.id; delete row.ver;
    return row;
  }
  function nextMonth(day) { var d = new Date(day.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-01'; }
  function editGroup(id) {
    if (!HS.can('groups.manage')) return;
    var cur = id ? D.get('groups', id) : null;
    if (!D.list('teachers').length) {
      HS.dialog({ title: HS.t('grp.new'), body: U.empty('users', HS.t('grp.needTeachers'), HS.t('grp.needTeachers.b'), '<button class="btn primary" data-close data-go="teachers">' + HS.esc(HS.t('adv.setupTeachers.go')) + '</button>') });
      var b = HS.$('#overlay [data-go]'); if (b) b.addEventListener('click', function () { F.tab = 'teachers'; HS.go('groups?tab=teachers'); });
      return;
    }
    HS.panel.open({ title: HS.t(cur ? 'grp.edit' : 'grp.new'), body: formHTML(cur ? Object.assign({ id: id }, cur) : { gradeCode: 'S1', feeType: 'session', kind: 'center', capacity: 30, active: true, startDate: U.today() }),
      footer: '<span class="grow faint">' + HS.esc(HS.t('grp.check.b')) + '</span><button class="btn primary" data-save>' + HS.icon('check', 'sm') + HS.esc(HS.t('common.save')) + '</button>',
      mount: function (p) {
        var form = p.querySelector('[data-gform]'), err = p.querySelector('[data-err]');
        function sync(e) {
          var g = form.gradeCode, sy = form.system, tr = form.track;
          if (e && (e.target === g || e.target === sy)) {
            var list = SYSTEMS[g.value.charAt(0)] || [], c = sy.value;
            sy.innerHTML = opt('', '–', '') + list.map(function (x) { return opt(x, HS.t('system.' + x), c); }).join('');
            var tl = TRACKS[sy.value] || [], t = tr.value;
            tr.innerHTML = opt('', '–', '') + tl.map(function (x) { return opt(x, HS.t('track.' + x), t); }).join('');
          }
          tr.disabled = !(TRACKS[sy.value] || []).length || (sy.value === 'bac' && g.value === 'S1');
          if (tr.disabled) tr.value = '';
          p.querySelector('[data-pkg]').hidden = form.feeType.value !== 'package';
          // a new price for a group that already has students starts on a day; what they owed before stays at the old price
          var ff = p.querySelector('[data-feefrom]');
          if (ff) {
            var changed = form.fee.value !== '' && Number(form.fee.value) !== Number(cur.fee || 0) && form.feeType.value === (cur.feeType || 'session');
            if (changed && ff.hidden) { var t = U.today(); p.querySelector('#gf-feeFrom').value = form.feeType.value === 'month' && t.slice(8) !== '01' ? nextMonth(t) : t; }
            ff.hidden = !changed;
          }
          p.querySelector('[data-school]').hidden = form.kind.value !== 'school';
          if (e && e.target === form.roomId && form.roomId.value && !cur) { var r = D.get('rooms', form.roomId.value); if (r && r.capacity) form.capacity.value = r.capacity; }
        }
        form.addEventListener('change', sync); form.fee.addEventListener('input', sync); sync();
        p.addEventListener('click', function (e) {
          if (e.target.closest('[data-addslot]')) { var last = form.querySelectorAll('.slot-row'), prev = last.length ? readForm(p).slots.pop() : null;
            p.querySelector('[data-slots]').insertAdjacentHTML('beforeend', slotRow(prev ? { day: (prev.day + 2) % 7, start: prev.start, end: prev.end, roomId: prev.roomId } : null)); return; }
          var rm = e.target.closest('[data-rmslot]'); if (rm) { rm.closest('.slot-row').remove(); return; }
          if (e.target.closest('[data-suggest]')) {
            var v = readForm(p), s1 = v.slots[0];
            form.name.value = [D.subjectName(v.subjectId), HS.t('grade.' + v.gradeCode), (D.teacherName(v.teacherId) || '').split(' ').slice(0, 2).join(' '), s1 ? HS.t('day.' + s1.day) + ' ' + s1.start : ''].filter(Boolean).join(' · ');
          }
        });
        function save() {
          var row = readForm(p, cur), btn = p.querySelector('[data-save]');
          err.hidden = true;
          var missing = [['name', 'f.name'], ['teacherId', 'f.teacherId']].filter(function (k) { return !row[k[0]]; }).map(function (k) { return HS.t(k[1]); });
          if (!row.slots.length) missing.push(HS.t('grp.times'));
          if (missing.length) { err.hidden = false; err.textContent = HS.t('form.missing', { f: missing.join(', ') }); return; }
          var gid = id || D.newId('gr'), op = { e: 'groups', id: gid, op: 'put', ver: cur ? cur.ver : null, row: row };
          var ffv = p.querySelector('[data-feefrom]:not([hidden]) input');
          if (ffv && ffv.value) op.feeFrom = ffv.value;
          btn.disabled = true;
          // the server says which clashes this save would create: room and teacher block, a small room only warns
          HS.post('/api/c/timetable/check', { ops: [op] }).then(function (list) {
            var hard = list.filter(function (c) { return c.kind !== 'capacity'; }), soft = list.filter(function (c) { return c.kind === 'capacity'; });
            if (hard.length) {
              btn.disabled = false; err.hidden = false;
              err.innerHTML = '<b>' + HS.esc(HS.t('grp.clashBlock')) + '</b><ul class="notes">' + hard.map(function (c) {
                var other = D.get('groups', c.a === gid ? c.b : c.a) || {};
                return '<li>' + HS.esc(HS.t('grp.clash.' + c.kind)) + ': ' + HS.esc(HS.t('day.' + c.day)) + ' ' + U.bdi(c.start + '–' + c.end) + ' · ' + HS.esc(other.name || '') + '</li>'; }).join('') + '</ul>';
              return null;
            }
            var go = soft.length ? U.confirm({ title: HS.t('grp.smallRoom'), body: HS.t('grp.smallRoom.b') }) : Promise.resolve(true);
            return go.then(function (ok) {
              if (!ok) { btn.disabled = false; return null; }
              return U.run(D.commit((cur ? 'Edit group ' : 'New group ') + row.name, [op]), 'common.saved', btn).then(function () { HS.panel.close(); clashes = null; HS.rerender(); });
            });
          }).catch(function (e) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(e); });
        }
        p.querySelector('[data-save]').addEventListener('click', save);
        form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
      } });
  }
  HS.editGroup = editGroup;

  /* ---------- the group panel ---------- */
  function openGroup(id) {
    var g = D.get('groups', id); if (!g) return;
    var bal = null;
    function body() {
      var ens = D.list('enrollments').filter(function (e) { return e.groupId === id && (e.status || 'active') === 'active'; });
      var st = ens.map(function (e) { return { e: e, s: D.get('students', e.studentId) }; }).filter(function (x) { return x.s; })
        .sort(function (a, b) { return String(a.s.name).localeCompare(String(b.s.name), HS.lang); });
      var owe = bal ? ens.reduce(function (a, e) { var b = (bal.enrollments[e.id] || {}).balance || 0; return a + (b < 0 ? -b : 0); }, 0) : null;
      return '<div class="mini-kpis"><div><small>' + HS.esc(HS.t('grp.fill')) + '</small>' + fill(st.length, Number(g.capacity) || 0) + '</div><div><small>' + HS.esc(HS.t('grp.fee')) + '</small><b>' + feeText(g) + '</b>' + priceHistory(g) + '</div>' +
          (owe !== null ? '<div><small>' + HS.esc(HS.t('grp.owed')) + '</small><b>' + U.money(owe) + '</b></div>' : '') + '</div>' +
        '<dl class="kv">' + '<dt>' + HS.esc(HS.t('f.teacherId')) + '</dt><dd>' + HS.esc(D.teacherName(g.teacherId)) + '</dd><dt>' + HS.esc(HS.t('grp.subject')) + '</dt><dd>' + HS.esc(D.subjectName(g.subjectId)) + '</dd>' +
          '<dt>' + HS.esc(HS.t('f.gradeCode')) + '</dt><dd>' + U.grade(g.gradeCode, g.system, g.track) + '</dd><dt>' + HS.esc(HS.t('grp.times')) + '</dt><dd>' + HS.esc(slotsText(g)) + '</dd>' +
          '<dt>' + HS.esc(HS.t('grp.room')) + '</dt><dd>' + HS.esc(D.name('rooms', g.roomId) || '–') + '</dd></dl>' +
        '<section><div class="row"><h3 class="sec grow">' + HS.esc(HS.t('grp.students', { n: st.length })) + '</h3>' + (HS.can('students.manage') ? '<button class="btn sm" data-bulk>' + HS.icon('plus', 'sm') + HS.esc(HS.t('grp.bulk')) + '</button>' : '') + '</div>' +
          (st.length ? '<ul class="roll">' + st.map(function (x) {
            var b = bal && bal.enrollments[x.e.id];
            return '<li><button class="btn ghost sm grow" style="justify-content:flex-start" data-stu="' + HS.esc(x.s.id) + '"><b>' + HS.esc(x.s.name) + '</b> <span class="faint num">' + U.bdi(x.s.code || '') + '</span></button>' +
              (b ? '<span class="bal ' + (b.balance < 0 ? 'bad' : '') + '">' + U.money(Math.abs(b.balance)) + '</span>' : '') + '</li>'; }).join('') + '</ul>'
            : U.empty('users', HS.t('roll.empty'), HS.t('grp.bulk.b'))) + '</section>';
    }
    HS.panel.open({ title: g.name, body: '<div class="stack" data-gbody>' + body() + '</div>',
      footer: (HS.can('groups.manage') ? '<button class="btn" data-edit>' + HS.icon('settings', 'sm') + HS.esc(HS.t('grp.edit')) + '</button>' : '') +
        '<button class="btn" data-print>' + HS.icon('printer', 'sm') + HS.esc(HS.t('grp.printList')) + '</button>',
      mount: function (p) {
        if (HS.can(['money.view', 'money.collect'])) HS.get('/api/c/balances').then(function (r) { bal = r; p.querySelector('[data-gbody]').innerHTML = body(); }, function () {});
        p.addEventListener('click', function (e) {
          var s = e.target.closest('[data-stu]'); if (s && HS.openStudent) { HS.openStudent(s.dataset.stu); return; }
          if (e.target.closest('[data-edit]')) { editGroup(id); return; }
          if (e.target.closest('[data-print]')) { HS.printGroupList(g); return; }
          if (e.target.closest('[data-bulk]')) bulkEnrol(g, function () { p.querySelector('[data-gbody]').innerHTML = body(); });
        });
      } });
  }
  HS.openGroup = openGroup;

  /* paste a column of student codes (from Excel or a scanner) -> each one is enrolled; the result is listed */
  function bulkEnrol(g, done) {
    var el = HS.dialog({ title: HS.t('grp.bulk') + ' · ' + g.name, body: '<p class="muted">' + HS.esc(HS.t('grp.bulk.b')) + '</p><textarea class="input" rows="8" dir="ltr" data-codes placeholder="10001&#10;10002"></textarea><div data-res></div>',
      footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.close')) + '</button><button class="btn primary" data-go>' + HS.esc(HS.t('stu.enrol')) + '</button>' });
    el.querySelector('[data-go]').addEventListener('click', function (ev) {
      var btn = ev.currentTarget, byCode = {};
      D.list('students').forEach(function (s) { byCode[s.code] = s; });
      var codes = el.querySelector('[data-codes]').value.replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).split(/[^0-9]+/).filter(Boolean);
      var res = [], i = 0; btn.disabled = true;
      (function next() {
        if (i >= codes.length) {
          btn.disabled = false;
          el.querySelector('[data-res]').innerHTML = '<ul class="notes">' + res.map(function (r) { return '<li class="' + (r.ok ? '' : 'neg') + '">' + U.bdi(r.code) + ' · ' + HS.esc(r.text) + '</li>'; }).join('') + '</ul>';
          D.load().then(done); return;
        }
        var code = codes[i++], s = byCode[code];
        if (!s) { res.push({ code: code, ok: false, text: HS.t('door.none') }); next(); return; }
        HS.post('/api/c/enroll', { studentId: s.id, groupId: g.id }).then(function () { res.push({ code: code, ok: true, text: s.name }); }, function (e) { res.push({ code: code, ok: false, text: s.name + ' – ' + U.errorText(e) }); }).then(next);
      })();
    });
  }

  /* ---------- the page ---------- */
  HS.views.groups = HS.withData({
    render: function (ctx) {
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.tab && TABS.indexOf(q.tab) >= 0) F.tab = q.tab;
      var tabs = TABS.filter(function (t) { return t !== 'teachers' && t !== 'rooms' && t !== 'subjects' || HS.can(t === 'teachers' ? 'teachers.manage' : 'rooms.manage') || D.list(t).length; });
      var tl = D.list('teachers').slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
      var filters = F.tab === 'list' || F.tab === 'timetable';
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.groups')) + '</h1><p>' + HS.esc(HS.t('page.groups.d')) + '</p></div>' +
          (HS.can('groups.manage') ? '<button class="btn primary" data-new>' + HS.icon('plus', 'sm') + HS.esc(HS.t('grp.new')) + '</button>' : '') + '</div>' +
        '<div class="tabs" role="tablist" style="margin-bottom:1rem">' + tabs.map(function (t) { return '<button role="tab" data-gtab="' + t + '" aria-selected="' + (t === F.tab) + '">' + HS.esc(HS.t('grp.tab.' + t)) + '</button>'; }).join('') + '</div>' +
        (filters ? '<div class="toolbar">' + (F.tab === 'list' ? '<input class="input" type="search" data-f="q" value="' + HS.esc(F.q) + '" placeholder="' + HS.esc(HS.t('grp.search')) + '" style="max-width:20rem">' : '') +
          '<select class="input" data-f="teacher" style="width:auto">' + opt('', HS.t('f.teacherId') + ': ' + HS.t('common.all'), F.teacher) + tl.map(function (t) { return opt(t.id, t.name, F.teacher); }).join('') + '</select>' +
          '<select class="input" data-f="grade" style="width:auto">' + opt('', HS.t('f.gradeCode') + ': ' + HS.t('common.all'), F.grade) + GRADES.map(function (x) { return opt(x, HS.t('grade.' + x), F.grade); }).join('') + '</select>' +
          (F.tab === 'list' ? '<select class="input" data-f="kind" style="width:auto">' + opt('', HS.t('grp.kind') + ': ' + HS.t('common.all'), F.kind) + ['center', 'school', 'online', 'home'].map(function (x) { return opt(x, HS.t('kind.' + x), F.kind); }).join('') + '</select>'
            : '<select class="input" data-f="room" style="width:auto">' + opt('', HS.t('grp.room') + ': ' + HS.t('common.all'), F.room) + D.list('rooms').map(function (r) { return opt(r.id, r.name, F.room); }).join('') + '</select>') + '</div>' : '') +
        '<div data-gpane></div>';
    },
    mount: function (root, ctx) {
      var pane = root.querySelector('[data-gpane]');
      function paint() {
        if (F.tab === 'list') pane.innerHTML = listHTML();
        else if (F.tab === 'timetable') {
          pane.innerHTML = timetableHTML();
          if (!clashes && HS.can('groups.view')) HS.get('/api/c/clashes').then(function (c) { clashes = c; if (F.tab === 'timetable' && root.isConnected !== false) pane.innerHTML = timetableHTML(); }, function () { clashes = []; });
        } else if (F.tab === 'today') {
          pane.innerHTML = '<div class="skeleton" style="height:10rem"></div>';
          HS.get('/api/c/today').then(function (r) { if (F.tab === 'today') pane.innerHTML = (HS.can('attendance.mark') && HS.dayOff ? '<div class="row" style="justify-content:flex-end;margin-bottom:.6rem"><button class="btn sm ghost" data-dayoff>' + HS.icon('x', 'sm') + HS.esc(HS.t('off.btn')) + '</button></div>' : '') + '<section class="card">' + todayHTML(r.sessions) + '</section>'; }, function (e) { pane.innerHTML = U.empty('alert', U.errorText(e)); });
        } else { pane.innerHTML = '<section class="card">' + HS.lists.render(F.tab) + '</section>'; }
      }
      paint();
      if (F.tab !== 'list' && F.tab !== 'timetable' && F.tab !== 'today') HS.lists.mount(pane);
      root.addEventListener('input', HS.debounce(function (e) { if (e.target.dataset.f === 'q') { F.q = e.target.value; paint(); } }, 120));
      root.addEventListener('change', function (e) { var k = e.target.dataset.f; if (k && k !== 'q') { F[k] = e.target.value; paint(); } });
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-gtab]'); if (t) { F.tab = t.dataset.gtab; HS.go('groups?tab=' + F.tab); return; }
        if (e.target.closest('[data-new]')) { editGroup(null); return; }
        var pd = e.target.closest('[data-pday]'); if (pd) { F.day = Number(pd.dataset.pday); paint(); return; }
        var r = e.target.closest('[data-roster]'); if (r) { HS.openRoster(r.dataset.roster); return; }
        if (e.target.closest('[data-dayoff]')) { HS.dayOff(function () { if (F.tab === 'today') paint(); }); return; }
        var c = e.target.closest('[data-cancel]');
        if (c) { U.confirm({ title: HS.t('grp.cancel'), body: HS.t('grp.cancel.b'), danger: true, ok: HS.t('grp.cancel') }).then(function (ok) {
          if (ok) U.run(HS.post('/api/c/session', { sessionId: c.dataset.cancel, status: 'cancelled' }), 'common.saved', c).then(paint); }); return; }
        var row = e.target.closest('[data-id]'); if (row && pane.contains(row)) openGroup(row.dataset.id);
      });
      root.addEventListener('keydown', function (e) { var tr = e.key === 'Enter' && e.target.closest('tr[data-id]'); if (tr) openGroup(tr.dataset.id); });
      repaintToday = function () { if (F.tab === 'today' && root.isConnected !== false) paint(); };
      var q = (ctx && ctx.route && ctx.route.q) || {};
      if (q.id) openGroup(q.id);
      if (q.new && HS.can('groups.manage')) editGroup(null);
    }
  });
  var repaintToday = null;
  HS.on('roll-saved', function () { if (repaintToday && HS.route().path === 'groups') repaintToday(); });
  HS.on('data', function () { clashes = null; });
})();
