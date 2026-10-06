/* Hessa - the command centre: greeting, live figures, the advisor (what needs a person today), quick actions,
   sessions now, 28-day trends, the getting-started guide, "open on your phone" and the sample-centre controls.
   Everything a user may not see is already removed by the server; the page only hides empty sections. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;

  /* ---------- sample centre (also used by Settings → Data) ---------- */
  HS.sampleControls = function () {
    var active = (HS.data.state || {}).settings && HS.data.state.settings['smp-centre'];
    return '<section class="card"><h2>' + HS.esc(HS.t('sample.title')) + '</h2><p>' + HS.esc(HS.t(active ? 'sample.active' : 'sample.help')) + '</p>' +
      (HS.can('data.import') && HS.can('users.manage') ? '<button class="btn ' + (active ? 'danger' : 'primary') + '" data-sample="' + (active ? 'delete' : 'load') + '">' +
        HS.esc(HS.t(active ? 'sample.delete' : 'sample.load')) + '</button>' : '') +
      (HS.can('students.manage') && HS.can('contacts.view') ? ' <a class="btn" href="#/students/import">' + HS.esc(HS.t('sample.importReal')) + '</a>' : '') + '</section>';
  };
  HS.mountSampleControls = function (root) {
    root.addEventListener('click', function (e) {
      var button = e.target.closest('[data-sample]'); if (!button) return;
      var removing = button.dataset.sample === 'delete';
      U.confirm({ title: HS.t(removing ? 'sample.delete' : 'sample.load'), body: HS.t(removing ? 'sample.deleteConfirm' : 'sample.loadConfirm'), danger: removing,
        ok: HS.t(removing ? 'sample.delete' : 'sample.load') })   // the button says what it does (it said "Done")
        .then(function (ok) { if (!ok) return;
          return U.run(HS.post('/api/c/sample' + (removing ? '/delete' : ''), {}), 'common.saved', button).then(function () {
            if (HS.dataTab) HS.dataTab.reset(); return HS.data.load();
          }).then(function () { HS.rerender(); });
        }).catch(function () {});
    });
  };

  /* ---------- pieces ---------- */
  function greet() {
    var h = new Date().getHours(), k = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    return HS.t('ov.greet.' + k, { name: (HS.me.full_name || HS.me.username || '').split(' ')[0] });   // already escaped by HS.t
  }
  function kpi(i, icon, key, opts) {
    opts = opts || {};
    return '<a class="card kpi lift' + (opts.live ? ' live' : '') + '" href="#/' + opts.page + '" style="--i:' + i + ';text-decoration:none;color:inherit">' +
      '<div class="label">' + HS.esc(HS.t('ov.' + key)) + '<span class="tile-ic">' + HS.icon(icon) + '</span></div>' +
      '<div class="value" data-k="' + key + '"><span class="skeleton" style="display:inline-block;width:3rem;height:2rem"></span></div>' +
      '<div class="hint">' + (opts.live ? '<span class="pulse-dot"></span> ' : '') + '<span data-h="' + key + '">' + HS.esc(HS.t('ov.hint.' + key)) + '</span></div></a>';
  }

  // the big buttons: every daily job one click from the first screen
  var ACTIONS = [
    { id: 'door', icon: 'board', perm: 'door.use', go: 'door', key: 'D' },
    { id: 'student', icon: 'users', perm: 'students.manage', go: 'students?new=1', key: 'N' },
    { id: 'pay', icon: 'sheet', perm: 'money.collect', go: 'money?pay=1' },
    { id: 'roll', icon: 'check', perm: 'attendance.mark', go: 'groups?tab=today' },
    { id: 'expense', icon: 'doc', perm: 'expenses.add', go: 'money?expense=1' },
    { id: 'calls', icon: 'bell', perm: 'followup.view', go: 'followup' },
    { id: 'marks', icon: 'star', perm: 'marks.enter', go: 'exams' },
    { id: 'import', icon: 'upload', perm: 'students.manage', go: 'students/import' }
  ];
  function actions() {
    var list = ACTIONS.filter(function (a) { return HS.can(a.perm); });
    if (!list.length) return '';
    return '<section class="card" data-tour="actions"><header><h3>' + HS.esc(HS.t('ov.actions')) + '</h3></header><div class="quick">' +
      list.map(function (a, i) {
        return '<a class="quick-btn" href="#/' + a.go + '" style="--i:' + i + '"><span class="q-ic">' + HS.icon(a.icon) + '</span><span>' + HS.esc(HS.t('ov.act.' + a.id)) + '</span>' +
          (a.key ? '<i class="kbd">' + a.key + '</i>' : '') + '</a>';
      }).join('') + '</div></section>';
  }

  /* ---------- the advisor ---------- */
  var LEVEL_ICON = { bad: 'alert', warn: 'alert', info: 'info', ok: 'check' };
  function advisorHTML(list) {
    if (!list.length) return '';
    return list.map(function (a, i) {
      var v = {};
      Object.keys(a.vars || {}).forEach(function (k) {
        // names are isolated so an Arabic group name keeps its order inside an English sentence (and the reverse)
        v[k] = k === 'amount' ? HS.fmt.num(a.vars[k]) : k === 'name' ? { html: '<bdi>' + HS.esc(a.vars[k]) + '</bdi>' } : a.vars[k];
      });
      return '<li class="adv ' + a.level + '" style="--i:' + i + '"><span class="adv-ic">' + HS.icon(a.icon || LEVEL_ICON[a.level]) + '</span>' +
        // HS.t escapes the values it fills in, so its result is already safe HTML (escaping again would show "&amp;")
        '<div class="grow"><b>' + HS.t('adv.' + a.id + '.t', v) + '</b><p class="muted">' + HS.t('adv.' + a.id + '.b', v) + '</p></div>' +
        '<a class="btn sm' + (a.level === 'bad' ? ' primary' : '') + '" href="#/' + HS.esc(a.page) + '">' + HS.esc(HS.t('adv.' + a.id + '.go')) + HS.icon('right', 'sm mirror') + '</a></li>';
    }).join('');
  }

  /* ---------- is everything safe? backups, sharing between PCs, the record check (only what this user may act on) ---------- */
  var SYNC_TONE = { ok: 'ok', pending: 'info', offline: 'warn', problem: 'bad' };
  function statusHTML(st) {
    var rows = [], day = 36 * 3600 * 1000;
    function row(icon, label, value, tone, page) { rows.push('<li><a class="st-row ' + tone + '" href="#/' + HS.esc(page) + '">' + HS.icon(icon, 'sm') + '<span class="grow">' + HS.esc(label) + '</span><span class="badge ' + tone + '">' + value + '</span></a></li>'); }
    if (st && st.backup) {
      var last = st.backup.last, old = last && Date.now() - new Date(last).getTime() > 2 * day;
      row('lock', HS.t('st.backup'), HS.esc(last ? U.ago(last) : HS.t('st.backup.none')), !last ? 'bad' : old ? 'warn' : 'ok', 'settings?tab=data');
      row('shield', HS.t('st.second'), HS.esc(HS.t(st.backup.folders ? 'st.second.on' : 'st.second.off')), st.backup.folders && !st.backup.error ? 'ok' : 'warn', 'settings?tab=data');
    }
    if (st && st.sync) {
      var sy = st.sync;
      row('sync', HS.t('st.sync'), HS.esc(sy.state === 'single' || !sy.multi && sy.state !== 'problem' ? HS.t('st.sync.single') : HS.t('dev.light.' + sy.state)), sy.state === 'single' || !sy.multi && sy.state !== 'problem' ? 'ok' : SYNC_TONE[sy.state] || '', 'devices');
      if (sy.conflicts) row('merge', HS.t('st.conf'), HS.fmt.num(sy.conflicts), 'warn', 'devices?tab=conflicts');
      row('check', HS.t('st.verify'), HS.esc(sy.verify_ok === false ? HS.t('st.verify.bad') : sy.verify_at ? HS.t('st.verify.ok', { when: U.ago(sy.verify_at) }) : HS.t('st.verify.none')),
        sy.verify_ok === false ? 'bad' : sy.verify_at ? 'ok' : '', 'settings?tab=data');
    }
    if (st && st.gateway) row('globe', HS.t('st.gateway'), HS.esc(HS.t(st.gateway.configured ? 'st.gateway.on' : 'st.gateway.off')), st.gateway.configured ? 'ok' : '', 'settings?tab=parents');
    if (!rows.length) return '';
    return '<section class="card"><header><span class="tile-ic">' + HS.icon('shield') + '</span><h3>' + HS.esc(HS.t('st.title')) + '</h3></header><p class="muted" style="margin:-.4rem 0 .6rem">' + HS.esc(HS.t('st.sub')) +
      '</p><ul class="st-list">' + rows.join('') + '</ul></section>';
  }

  /* ---------- sessions now and next ---------- */
  function hm(s) { var p = String(s || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
  function nowHTML(sessions) {
    var t = new Date(), m = t.getHours() * 60 + t.getMinutes();
    var live = sessions.filter(function (s) { return s.status !== 'cancelled' && hm(s.start) <= m && m <= hm(s.end); });
    var next = sessions.filter(function (s) { return s.status !== 'cancelled' && hm(s.start) > m; }).slice(0, Math.max(0, 6 - live.length));
    var rows = live.map(function (s) { return [s, true]; }).concat(next.map(function (s) { return [s, false]; }));
    if (!rows.length) return U.empty('clock', HS.t(sessions.length ? 'ov.now.done' : 'ov.now.none'), HS.t(sessions.length ? 'ov.now.done.b' : 'ov.now.none.b'));
    return '<ul class="now-list">' + rows.map(function (r, i) {
      var s = r[0], g = HS.data.get('groups', s.groupId) || {}, pct = s.enrolled ? Math.min(100, Math.round(s.present * 100 / s.enrolled)) : 0;
      return '<li style="--i:' + i + '" data-session="' + HS.esc(s.id) + '" tabindex="0" role="button"><span class="now-time">' + U.bdi(s.start) + '<small>' + U.bdi(s.end) + '</small></span>' +
        '<span class="now-bar" style="--c:' + U.groupTone(g) + '"></span>' +
        '<div class="grow"><b class="ellipsis" style="display:block">' + HS.esc(g.name || HS.data.groupName(s.groupId)) + '</b><span class="muted">' +
          HS.esc([HS.data.teacherName(s.teacherId), HS.data.name('rooms', s.roomId)].filter(Boolean).join(' · ')) + '</span>' +
          '<div class="meter" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div>' +
        '<span class="now-count">' + (r[1] ? '<span class="pulse-dot"></span> ' : '') + '<b class="num">' + HS.fmt.num(s.present) + '</b><span class="faint num"> / ' + HS.fmt.num(s.enrolled) + '</span></span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- 28-day charts: the shared inline-SVG chart in ui.js ---------- */
  function series(rows, field, d) { return U.series(rows, field, d, 28); }
  function chart(points, kind, label) { return U.chart(points, kind, label, [HS.t('ov.chart.from'), HS.t('ov.chart.today')]); }

  /* ---------- getting started (the guide for an empty centre) ---------- */
  var STEPS = [
    { id: 'centre', page: 'settings?tab=centre', perm: 'settings.edit', done: function (D) { var s = D.state.settings || {}; return !!(s.systemName || s['smp-centre']); } },
    { id: 'rooms', page: 'settings?tab=lists', perm: 'rooms.manage', done: function (D) { return D.list('rooms').length > 0; } },
    { id: 'teachers', page: 'settings?tab=lists', perm: 'teachers.manage', done: function (D) { return D.list('teachers').length > 0; } },
    { id: 'groups', page: 'groups', perm: 'groups.manage', done: function (D) { return D.list('groups').length > 0; } },
    { id: 'students', page: 'students/import', perm: 'students.manage', done: function (D) { return D.list('students').length > 0; } },
    { id: 'door', page: 'door', perm: 'door.use', done: function (D) { return D.list('attendance').length > 0; } },
    { id: 'phone', page: 'help', perm: null, done: function () { return !!HS.prefs.data.phoneSeen; } }
  ];
  function guideHTML() {
    var steps = STEPS.filter(function (s) { return HS.can(s.perm); });
    var done = steps.filter(function (s) { return s.done(HS.data); }).length;
    if (!steps.length || done === steps.length) return '';
    return '<section class="card lift guide" data-tour="guide"><header><span class="tile-ic">' + HS.icon('flag') + '</span><h3>' + HS.esc(HS.t('ov.guide.title')) + '</h3>' +
      '<span class="badge signal num">' + done + ' / ' + steps.length + '</span></header>' +
      '<div class="meter big" aria-hidden="true"><i style="width:' + Math.round(done * 100 / steps.length) + '%"></i></div>' +
      '<ol class="checklist">' + steps.map(function (s) {
        var ok = s.done(HS.data);
        return '<li class="' + (ok ? 'ok' : '') + '"><span class="tick">' + HS.icon(ok ? 'check' : 'dot', 'sm') + '</span><div class="grow"><a href="#/' + s.page + '"' + (s.id === 'phone' ? ' data-phone' : '') + '>' + HS.esc(HS.t('ov.step.' + s.id)) + '</a>' +
          '<small class="muted">' + HS.esc(HS.t('ov.step.' + s.id + '.b')) + '</small></div></li>';
      }).join('') + '</ol></section>';
  }

  /* ---------- open on a phone: the centre address as a QR ---------- */
  function qr(text) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; }
  }
  HS.phoneDialog = function () {
    HS.prefs.data.phoneSeen = true; HS.prefs.save();
    HS.get('/api/info').then(function (info) {
      var urls = (info.urls || []).filter(function (u) { return /\/\/\d+\.\d+\.\d+\.\d+/.test(u); });
      var url = urls[0] || location.origin + '/';
      if (/\/\/(localhost|127\.)/.test(url) && urls.length === 0) url = (info.urls || [])[0] || url;
      HS.dialog({ title: HS.t('ov.phone.title'), body:
        '<div class="phone-card"><div class="qr">' + qr(url) + '</div><div class="stack" style="gap:.7rem">' +
          '<p>' + HS.esc(HS.t('ov.phone.body')) + '</p><input class="input" readonly dir="ltr" value="' + HS.esc(url) + '">' +
          '<ol class="notes"><li>' + HS.esc(HS.t('ov.phone.s1')) + '</li><li>' + HS.esc(HS.t('ov.phone.s2')) + '</li><li>' + HS.esc(HS.t('ov.phone.s3')) + '</li></ol>' +
          (urls.length > 1 ? '<details><summary class="muted">' + HS.esc(HS.t('ov.phone.more')) + '</summary><ul class="notes" dir="ltr">' + urls.slice(1).map(function (u) { return '<li>' + HS.esc(u) + '</li>'; }).join('') + '</ul></details>' : '') +
        '</div></div><div class="tip">' + HS.icon('lock') + '<span>' + HS.esc(HS.t('ov.phone.safe')) + '</span></div>' });
    }, function (e) { HS.toast(U.errorText(e), 'bad'); });
  };

  /* ---------- the page ---------- */
  var timer = null, counted = false;
  HS.on('route', function (r) { if (r.path !== 'overview') { counted = false; clearInterval(timer); } });
  var reload = null;
  HS.on('data-changed', HS.debounce(function () { if (reload && HS.route().path === 'overview') reload(); }, 1500));
  HS.views.overview = HS.withData({
    selfRefresh: true,
    render: function () {
      var money = HS.can(['money.view', 'reports.view']);
      var kpis = [kpi(0, 'check', 'checked', { live: true, page: 'door' }), kpi(1, 'clock', 'sessions', { page: 'groups?tab=today' }),
        kpi(2, 'users', 'students', { page: 'students' }), kpi(3, 'bell', 'risk', { page: 'followup' })];
      if (money) kpis.push(kpi(4, 'sheet', 'money', { page: 'money' }), kpi(5, 'alert', 'owed', { page: 'followup?tab=debts' }));
      return '<div class="page-head"><div class="titles"><h1>' + greet() + '</h1><p>' + HS.esc(HS.t('ov.sub')) + ' <span class="faint">' + HS.esc(HS.fmt.longDate()) + '</span></p></div>' +
          '<button class="btn" data-a="phone">' + HS.icon('globe', 'sm') + HS.esc(HS.t('ov.phone.btn')) + '</button>' +
          '<button class="btn" data-a="tour">' + HS.icon('play', 'sm') + HS.esc(HS.t('ov.tour.btn')) + '</button></div>' +
        '<div class="grid kpis" data-tour="kpis">' + kpis.join('') + '</div>' +
        '<div class="phone-only" style="margin-top:var(--gap)">' + actions().replace(' data-tour="actions"', '') + '</div>' +   // on a phone the jobs sit right under the thumb
        '<div class="grid split" style="margin-top:var(--gap)"><div class="stack">' +
          '<section class="card advisor" data-tour="advisor"><header><span class="tile-ic">' + HS.icon('spark') + '</span><h3>' + HS.esc(HS.t('ov.advisor')) + '</h3><span class="faint" data-adv-count></span></header>' +
            '<p class="muted" style="margin:-.4rem 0 .9rem">' + HS.esc(HS.t('ov.advisor.sub')) + '</p><ul class="adv-list" data-advice>' +
            [0, 1, 2].map(function () { return '<li class="skeleton" style="height:3.6rem"></li>'; }).join('') + '</ul></section>' +
          '<section class="card"><header><span class="tile-ic">' + HS.icon('clock') + '</span><h3>' + HS.esc(HS.t('ov.now')) + '</h3><a class="btn ghost sm" href="#/door">' + HS.esc(HS.t('ov.now.door')) + '</a></header><div data-now><div class="skeleton" style="height:8rem"></div></div></section>' +
          '<div class="grid cols-2"><section class="card"><header><h3>' + HS.esc(HS.t('ov.trend')) + '</h3></header><div data-chart="att"></div></section>' +
            (money ? '<section class="card"><header><h3>' + HS.esc(HS.t('ov.trend.money')) + '</h3></header><div data-chart="money"></div></section>' : '') + '</div>' +
        '</div><div class="stack">' +
          '<div class="desk-only">' + actions() + '</div>' + guideHTML() + '<div data-status></div>' +
          '<section class="card"><header><h3>' + HS.esc(HS.t('ov.tips.title')) + '</h3></header><div class="stack" style="gap:.8rem">' +
            '<div class="row" style="align-items:flex-start">' + HS.icon('search') + '<span>' + HS.esc(HS.t('ov.tip.search')) + ' <i class="kbd">Ctrl K</i></span></div>' +
            '<div class="row" style="align-items:flex-start">' + HS.icon('keyboard') + '<span>' + HS.esc(HS.t('ov.tip.keys')) + ' <i class="kbd">?</i></span></div>' +
            '<div class="row" style="align-items:flex-start">' + HS.icon('globe') + '<span>' + HS.esc(HS.t('ov.tip.phone')) + '</span></div>' +
            '<a class="btn sm" href="#/help" style="justify-self:start">' + HS.icon('book', 'sm') + HS.esc(HS.t('ov.guide.btn')) + '</a></div></section>' +
          HS.sampleControls() +
        '</div></div>';
    },
    mount: function (root) {
      HS.mountSampleControls(root);
      var first = !counted;   // numbers count up once per visit, not on every live refresh
      counted = true;
      function setText(k, html) { var el = root.querySelector('[data-k="' + k + '"]'); if (el) el.innerHTML = html; }
      function count(k, n) { var el = root.querySelector('[data-k="' + k + '"]'); if (!el) return; if (first && window.requestAnimationFrame) HS.countUp(el, n); else el.textContent = HS.fmt.num(n); }
      function load() {
        if (root.isConnected === false) { clearInterval(timer); return; }
        HS.get('/api/c/dashboard').then(function (d) {
          if (root.isConnected === false) return;
          count('checked', d.checkedIn); count('sessions', d.sessions.length); count('students', d.students); count('risk', d.risk);
          if (d.todayTotal !== undefined) { setText('money', U.money(d.todayTotal)); setText('owed', U.money(d.owed));
            var h = root.querySelector('[data-h="owed"]'); if (h) h.textContent = HS.t('ov.hint.owedN', { n: HS.fmt.num(d.debtors || 0) }); }
          var running = d.sessions.filter(function (s) { var t = new Date(), m = t.getHours() * 60 + t.getMinutes(); return hm(s.start) <= m && m <= hm(s.end); }).length;
          var hs = root.querySelector('[data-h="sessions"]'); if (hs) hs.textContent = HS.t('ov.hint.sessionsN', { n: HS.fmt.num(running) });
          root.querySelector('[data-now]').innerHTML = nowHTML(d.sessions);
          var att = root.querySelector('[data-chart="att"]'); if (att) att.innerHTML = chart(series(d.trend, 'visits', d.date), 'area', HS.t('ov.trend'));
          var mon = root.querySelector('[data-chart="money"]'); if (mon && d.moneyTrend) mon.innerHTML = chart(series(d.moneyTrend, 'amount', d.date), 'bars', HS.t('ov.trend.money'));
          first = false;
        }).catch(function (e) {
          if (root.isConnected === false) return;
          root.querySelector('[data-now]').innerHTML = U.empty('alert', U.errorText(e), '', '<button class="btn" data-retry>' + HS.esc(HS.t('common.retry')) + '</button>');
        });
        HS.get('/api/c/status').then(function (st) {
          var box = root.querySelector('[data-status]'); if (box && root.isConnected !== false) box.innerHTML = statusHTML(st);
        }, function () { var box = root.querySelector('[data-status]'); if (box) box.innerHTML = ''; });
        HS.get('/api/c/advice').then(function (list) {
          if (root.isConnected === false) return;
          root.querySelector('[data-advice]').innerHTML = advisorHTML(list);
          var n = list.filter(function (a) { return a.level !== 'ok'; }).length;
          root.querySelector('[data-adv-count]').textContent = n ? HS.t('ov.advisor.n', { n: n }) : '';
        }).catch(function () { var el = root.querySelector('[data-advice]'); if (el) el.innerHTML = ''; });
      }
      root.addEventListener('click', function (e) {
        var a = e.target.closest('[data-a]');
        if (a && a.dataset.a === 'tour') HS.tour.start();
        if (a && a.dataset.a === 'phone' || e.target.closest('[data-phone]')) { e.preventDefault(); HS.phoneDialog(); }
        if (e.target.closest('[data-retry]')) load();
        var s = e.target.closest('[data-session]'); if (s) HS.go('door?session=' + encodeURIComponent(s.dataset.session));
      });
      root.addEventListener('keydown', function (e) { var s = e.key === 'Enter' && e.target.closest('[data-session]'); if (s) HS.go('door?session=' + encodeURIComponent(s.dataset.session)); });
      reload = load;
      load();
      clearInterval(timer);
      timer = setInterval(load, 30000);   // the figures and the advisor stay fresh on a screen left open at the desk
      if (timer && timer.unref) timer.unref();
    }
  });
})();
