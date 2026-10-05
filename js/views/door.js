/* Hessa - the front desk (door): find a student by card code, scanner, name or mobile; check in to the right session;
   see the money of every enrolment and take a payment (opening the cash shift first when needed); print the receipt.
   Below: today's sessions with live counters; each opens the roll-call panel. The most used screen of the centre. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var METHODS = ['cash', 'vodafone', 'instapay', 'fawry', 'wallet'];

  /* ---------- sounds (short, optional; a USB scanner user hears ok / warning without looking) ---------- */
  var audio = null;
  function beep(kind) {
    if (HS.prefs.data.doorSounds === false) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = kind === 'ok' ? 'sine' : 'square';
      o.frequency.value = kind === 'ok' ? 880 : 220;
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ok' ? 0.15 : 0.35));
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.4);
    } catch (e) { /* no sound device: the colours still tell */ }
  }

  function hm(s) { var p = String(s || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join(''); }
  function groupLabel(id) { return HS.data.groupName(id) || id; }

  /* ---------- the student card ---------- */
  function riskBadge(r) {
    var cfg = (HS.data.state && HS.data.state.settings) || {};
    if (!r || !r.score || r.score < (cfg.riskCall || 35)) return '';
    var high = r.score >= (cfg.riskHigh || 60);
    return '<div class="tip ' + (high ? 'bad' : 'warn') + '">' + HS.icon('bell') + '<span><b>' + HS.esc(HS.t(high ? 'door.riskHigh' : 'door.risk')) + '</b> ' +
      (r.why || []).map(function (w) { return '<span class="badge ' + (high ? 'bad' : 'warn') + '">' + HS.esc(HS.t(w)) + '</span>'; }).join(' ') + '</span></div>';
  }
  function sessionButtons(c) {
    if (!c.candidates.length) return '<p class="muted">' + HS.esc(HS.t('door.noSession')) + '</p>';
    return '<div class="cand">' + c.candidates.map(function (x) {
      var s = x.session, sel = s.id === c.pick;
      return '<button class="cand-btn' + (sel ? ' on' : '') + (x.done ? ' done' : '') + '" data-pick="' + HS.esc(s.id) + '" aria-pressed="' + sel + '">' +
        '<span class="num">' + U.bdi(s.start + '–' + s.end) + '</span><b class="ellipsis">' + HS.esc(groupLabel(s.groupId)) + '</b>' +
        '<span class="row" style="gap:.3rem;flex-wrap:wrap">' + (x.makeup ? '<span class="badge info">' + HS.esc(HS.t('door.makeup')) + '</span>' : '') +
          (!x.now ? '<span class="badge">' + HS.esc(HS.t('door.notNow')) + '</span>' : '') + (x.done ? U.att(x.status) : '') + '</span></button>';
    }).join('') + '</div>';
  }
  function moneyRows(c) {
    if (!c.enrollments.length) return '<p class="muted">' + HS.esc(HS.t('door.noGroups')) + '</p>';
    return '<ul class="money-rows">' + c.enrollments.map(function (e) {
      var m = e.money || {}, bal = Number(m.balance) || 0;
      return '<li><div class="grow"><b class="ellipsis" style="display:block">' + HS.esc(groupLabel(e.groupId)) + '</b><span class="muted">' + HS.esc(HS.t('fee.' + (m.feeType || 'session'))) +
          (m.unit ? ' · ' + U.money(m.unit) : '') + (m.sessionsLeft !== undefined ? ' · ' + HS.esc(HS.t('door.left', { n: m.sessionsLeft })) : '') + '</span></div>' +
        '<span class="bal ' + (bal < 0 ? 'bad' : bal > 0 ? 'ok' : '') + '">' + U.money(Math.abs(bal)) + '<small>' + HS.esc(HS.t(bal < 0 ? 'door.owes' : bal > 0 ? 'door.credit' : 'door.clear')) + '</small></span>' +
        (HS.can('money.collect') ? '<button class="btn sm' + (bal < 0 ? ' primary' : '') + '" data-pay="' + HS.esc(e.id) + '">' + HS.icon('sheet', 'sm') + HS.esc(HS.t('door.pay')) + '</button>' : '') + '</li>';
    }).join('') + '</ul>' + (c.wallet ? '<p class="muted">' + HS.esc(HS.t('door.wallet')) + ' ' + U.money(c.wallet) + '</p>' : '');
  }
  function cardHTML(c) {
    var s = c.student, done = c.candidates.filter(function (x) { return x.session.id === c.pick && x.done; })[0];
    var canCheck = HS.can('attendance.mark') && c.pick && !done;
    return '<div class="stu-head"><span class="avatar">' + HS.esc(initials(s.name)) + '</span><div class="grow"><h2>' + HS.esc(s.name) + '</h2>' +
        '<div class="row wrap" style="gap:.4rem;margin-top:.25rem"><span class="badge signal num">' + U.bdi(s.code || '') + '</span>' + (s.gradeCode ? '<span class="badge">' + U.grade(s.gradeCode, s.system, s.track) + '</span>' : '') +
        (s.exempt ? '<span class="badge ok">' + HS.esc(HS.t('door.exempt')) + '</span>' : '') + (s.active === false ? '<span class="badge bad">' + HS.esc(HS.t('f.inactive')) + '</span>' : '') + '</div></div>' +
        (HS.can('students.view') ? '<a class="icon-btn" href="#/students?id=' + encodeURIComponent(s.id) + '" title="' + HS.esc(HS.t('door.file')) + '" aria-label="' + HS.esc(HS.t('door.file')) + '">' + HS.icon('external') + '</a>' : '') + '</div>' +
      riskBadge(c.risk) +
      '<section><h3 class="sec">' + HS.esc(HS.t('door.session')) + '</h3>' + sessionButtons(c) + '</section>' +
      '<div class="checkin-row">' + (done ? '<div class="done-banner">' + HS.icon('check') + '<span>' + HS.esc(HS.t('door.already', { status: HS.t('att.' + done.status) })) + '</span></div>'
        : '<button class="btn primary xl" data-checkin' + (canCheck ? '' : ' disabled') + '>' + HS.icon('check') + HS.esc(HS.t('door.checkin')) + ' <i class="kbd">Enter</i></button>') + '</div>' +
      '<section><h3 class="sec">' + HS.esc(HS.t('door.money')) + '</h3>' + moneyRows(c) + '</section>' +
      (c.lastReceipt ? '<div class="tip">' + HS.icon('check') + '<span class="grow">' + HS.t('door.receipt', { no: { html: U.bdi(c.lastReceipt.no) } }) + ' · ' + U.money(c.lastReceipt.amount) + '</span>' +
        '<button class="btn sm" data-print>' + HS.icon('printer', 'sm') + HS.esc(HS.t('receipt.print')) + '</button></div>' : '') +
      (HS.can('messages.send') && HS.can('contacts.view') && s.parentMobile ? '<div class="row wrap"><button class="btn sm" data-wa>' + HS.icon('chat', 'sm') + HS.esc(HS.t('door.message')) + '</button></div>' : '');
  }

  /* ---------- payments ---------- */
  function ensureShift() {
    return HS.get('/api/c/shift').then(function (r) {
      if (r && r.shift && r.shift.status === 'open') return r.shift;
      return new Promise(function (resolve, reject) {
        var el = HS.dialog({ title: HS.t('shift.open'), body: '<p class="muted">' + HS.esc(HS.t('shift.open.b')) + '</p>' +
            '<div class="field"><label for="sh-o">' + HS.esc(HS.t('shift.opening')) + '</label><input class="input big-num" id="sh-o" type="number" inputmode="decimal" min="0" value="0" dir="ltr"></div>',
          footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.esc(HS.t('shift.open')) + '</button>' });
        var opened = false, inp = el.querySelector('#sh-o'); inp.select();
        function go() {
          U.run(HS.post('/api/c/shift/open', { opening: inp.value }), 'shift.opened', el.querySelector('[data-ok]')).then(function (sh) { opened = true; HS.overlay.close(); resolve(sh); }, function () {});
        }
        el.querySelector('[data-ok]').addEventListener('click', go);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        var off = function () { HS.off('overlay-closed', off); if (!opened) reject(new Error('cancelled')); };
        HS.on('overlay-closed', off);
      });
    });
  }
  HS.ensureShift = ensureShift;

  function payDialog(card, enrolment, done) {
    var m = enrolment.money || {}, g = HS.data.get('groups', enrolment.groupId) || {};
    var suggested = m.due || m.unit || '';   // what clears the debt, else one unit (a session, a month or a package)
    ensureShift().then(function () {
      var method = 'cash';
      var el = HS.dialog({ title: HS.t('pay.title', { name: card.student.name }), body:
        '<div class="tip">' + HS.icon('layers') + '<span><b>' + HS.esc(g.name || '') + '</b> · ' + HS.esc(HS.t('fee.' + (m.feeType || 'session'))) + (m.balance < 0 ? ' · ' + HS.esc(HS.t('door.owes')) + ' ' + U.money(-m.balance) : '') + '</span></div>' +
        '<div class="field"><label for="pay-a">' + HS.esc(HS.t('pay.amount')) + '</label><input class="input big-num" id="pay-a" type="number" inputmode="decimal" min="0" step="any" dir="ltr" value="' + HS.esc(suggested) + '"></div>' +
        '<div class="field"><span class="lbl">' + HS.esc(HS.t('pay.method')) + '</span><div class="seg wrap" role="group" data-methods>' + METHODS.filter(function (x) { return x !== 'wallet' || card.wallet > 0; }).map(function (x) {
          return '<button type="button" data-m="' + x + '" aria-pressed="' + (x === method) + '">' + HS.esc(HS.t('pay.method.' + x)) + '</button>'; }).join('') + '</div></div>' +
        '<div class="field" data-ref hidden><label for="pay-r">' + HS.esc(HS.t('pay.ref')) + '</label><input class="input" id="pay-r" dir="ltr" autocomplete="off"></div>' +
        (m.feeType === 'month' ? '<div class="field"><label for="pay-p">' + HS.esc(HS.t('pay.period')) + '</label><input class="input" id="pay-p" type="month" value="' + U.today().slice(0, 7) + '"></div>' : '') +
        '<div class="tip bad" data-err hidden role="alert"></div>',
        footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.icon('check', 'sm') + HS.esc(HS.t('pay.save')) + '</button>' });
      var amount = el.querySelector('#pay-a'); amount.focus(); amount.select();
      el.querySelector('[data-methods]').addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]'); if (!b) return;
        method = b.dataset.m;
        el.querySelectorAll('[data-m]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        el.querySelector('[data-ref]').hidden = ['vodafone', 'instapay', 'fawry'].indexOf(method) < 0;
      });
      function save() {
        var err = el.querySelector('[data-err]'), btn = el.querySelector('[data-ok]'), p = el.querySelector('#pay-p');
        btn.disabled = true;
        HS.post('/api/c/pay', { studentId: card.student.id, groupId: enrolment.groupId, kind: 'fee', amount: amount.value, method: method,
          ref: (el.querySelector('#pay-r') || {}).value || '', period: p ? p.value : '' }).then(function (r) {
          HS.overlay.close(); beep('ok');
          HS.toast(HS.t('pay.done', { no: r.no }));
          if (HS.printReceipt && HS.prefs.data.autoReceipt) HS.printReceipt(r);
          done(r);
        }, function (e) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(e); beep('warn'); });
      }
      el.querySelector('[data-ok]').addEventListener('click', save);
      amount.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
    }, function () { /* the shift was not opened: nothing happens */ });
  }

  /* ---------- roll call panel (also used by Groups and the overview) ---------- */
  var STATES = ['present', 'late', 'absent', 'excused'];
  HS.openRoster = function (sessionId) {
    HS.get('/api/c/roster?session=' + encodeURIComponent(sessionId)).then(function (r) {
      var marks = {};
      r.rows.forEach(function (x) { marks[x.student.id] = x.status || 'absent'; });
      var can = HS.can('attendance.mark'), s = r.session || {};
      function rowsHTML() {
        return '<ul class="roll">' + r.rows.map(function (x) {
          var st = marks[x.student.id];
          return '<li><div class="grow"><b>' + HS.esc(x.student.name) + '</b> <span class="faint num">' + U.bdi(x.student.code || '') + '</span>' + (x.guest ? ' <span class="badge info">' + HS.esc(HS.t('door.makeup')) + '</span>' : '') + '</div>' +
            '<div class="seg att-seg" role="group" data-sid="' + HS.esc(x.student.id) + '">' + STATES.map(function (k) {
              return '<button type="button" class="st-' + k + '" data-st="' + k + '" aria-pressed="' + (st === k) + '"' + (can ? '' : ' disabled') + ' title="' + HS.esc(HS.t('att.' + k)) + '">' + HS.esc(HS.t('att.short.' + k)) + '</button>'; }).join('') + '</div></li>';
        }).join('') + '</ul>';
      }
      function counts() { var n = 0; Object.keys(marks).forEach(function (k) { if (marks[k] === 'present' || marks[k] === 'late') n++; }); return HS.t('roll.count', { n: n, m: r.rows.length }); }
      var el = HS.panel.open({ title: (r.group || {}).name || HS.t('roll.title'), body:
          '<div class="row wrap"><span class="badge num">' + U.bdi((s.start || '') + '–' + (s.end || '')) + '</span><span class="badge">' + HS.esc(U.day(s.date).replace(/<[^>]+>/g, '')) + '</span><span class="grow"></span><b data-count>' + HS.esc(counts()) + '</b></div>' +
          (r.rows.length ? (can ? '<div class="row wrap"><button class="btn sm" data-all>' + HS.icon('check', 'sm') + HS.esc(HS.t('roll.all')) + '</button></div>' : '') + '<div data-rows>' + rowsHTML() + '</div>'
            : U.empty('users', HS.t('roll.empty'), HS.t('roll.empty.b'))),
        footer: can && r.rows.length ? '<button class="btn ghost" data-pclose2>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-save>' + HS.icon('check', 'sm') + HS.esc(HS.t('roll.save')) + '</button>' : '',
        mount: function (p) {
          p.addEventListener('click', function (e) {
            var b = e.target.closest('[data-st]');
            if (b) { var sid = b.closest('[data-sid]').dataset.sid; marks[sid] = b.dataset.st;
              b.parentNode.querySelectorAll('[data-st]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
              p.querySelector('[data-count]').textContent = counts(); return; }
            if (e.target.closest('[data-all]')) { Object.keys(marks).forEach(function (k) { if (marks[k] === 'absent') marks[k] = 'present'; }); p.querySelector('[data-rows]').innerHTML = rowsHTML(); p.querySelector('[data-count]').textContent = counts(); return; }
            if (e.target.closest('[data-pclose2]')) { HS.panel.close(); return; }
            var sv = e.target.closest('[data-save]');
            if (sv) U.run(HS.post('/api/c/roll', { sessionId: sessionId, marks: marks }), 'roll.saved', sv).then(function () { HS.panel.close(); HS.emit('roll-saved', sessionId); }, function () {});
          });
        } });
      return el;
    }, function (e) { HS.toast(U.errorText(e), 'bad', 5000); });
  };

  /* ---------- today's sessions strip ---------- */
  function todayHTML(list) {
    if (!list.length) return U.empty('clock', HS.t('ov.now.none'), HS.t('ov.now.none.b'));
    var t = new Date(), m = t.getHours() * 60 + t.getMinutes();
    return '<div class="today-strip">' + list.map(function (s, i) {
      var live = hm(s.start) <= m && m <= hm(s.end), g = HS.data.get('groups', s.groupId) || {};
      return '<button class="today-s' + (live ? ' live' : '') + (s.status === 'cancelled' ? ' off' : '') + '" data-roster="' + HS.esc(s.id) + '" style="--i:' + Math.min(i, 12) + ';--c:' + HS.esc(g.color || 'var(--brand)') + '">' +
        '<span class="num">' + U.bdi(s.start) + '</span><b class="ellipsis">' + HS.esc(g.name || s.groupId) + '</b>' +
        '<span class="muted ellipsis">' + HS.esc(HS.data.name('rooms', s.roomId) || '') + '</span>' +
        '<span class="cnt">' + (live ? '<span class="pulse-dot"></span>' : '') + '<b class="num">' + HS.fmt.num(s.present) + '</b><span class="faint num">/' + HS.fmt.num(s.enrolled) + '</span></span></button>';
    }).join('') + '</div>';
  }

  /* ---------- the page ---------- */
  var lastQuery = '', refreshToday = null;
  HS.on('roll-saved', function () { if (refreshToday && HS.route().path === 'door') refreshToday(); });
  HS.on('data-changed', HS.debounce(function () { if (refreshToday && HS.route().path === 'door') refreshToday(); }, 800));
  HS.views.door = HS.withData({
    selfRefresh: true,
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.door')) + '</h1><p>' + HS.esc(HS.t('page.door.d')) + '</p></div>' +
          '<span data-shift></span></div>' +
        '<div class="door">' +
          '<section class="card door-find"><label class="sr" for="door-q">' + HS.esc(HS.t('door.search')) + '</label>' +
            '<div class="door-input">' + HS.icon('search', 'lg') + '<input id="door-q" class="input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="go" autofocus placeholder="' + HS.esc(HS.t('door.search')) + '" value="' + HS.esc(lastQuery) + '">' +
              (window.isSecureContext && 'BarcodeDetector' in window ? '<button class="icon-btn" data-camera title="' + HS.esc(HS.t('door.camera')) + '" aria-label="' + HS.esc(HS.t('door.camera')) + '">' + HS.icon('camera') + '</button>' : '') + '</div>' +
            '<p class="faint door-hint">' + HS.esc(HS.t('door.hint')) + ' <i class="kbd">F2</i></p>' +
            '<ul class="door-results" data-results role="listbox"></ul></section>' +
          '<section class="card door-card" data-card aria-live="polite">' + U.empty('board', HS.t('door.wait'), HS.t('door.wait.b')) + '</section>' +
        '</div>' +
        '<section class="card" style="margin-top:var(--gap)"><header><span class="tile-ic">' + HS.icon('clock') + '</span><h3>' + HS.esc(HS.t('door.today')) + '</h3><span class="faint">' + HS.esc(HS.t('door.today.b')) + '</span></header><div data-today><div class="skeleton" style="height:5rem"></div></div></section>';
    },
    mount: function (root, ctx) {
      var q = root.querySelector('#door-q'), results = root.querySelector('[data-results]'), cardBox = root.querySelector('[data-card]');
      var list = [], sel = 0, card = null, typedAt = [], fromScanner = false;

      function paintShift() {
        if (!HS.can('money.collect')) return;
        HS.get('/api/c/shift').then(function (r) {
          var box = root.querySelector('[data-shift]'); if (!box) return;
          var open = r && r.shift && r.shift.status === 'open';
          box.innerHTML = open ? '<a class="badge ok" href="#/money">' + HS.icon('lock', 'sm') + HS.esc(HS.t('shift.mine', { no: r.shift.no })) + ' · ' + U.money(r.expected) + '</a>'
            : '<button class="btn" data-openshift>' + HS.icon('lock', 'sm') + HS.esc(HS.t('shift.open')) + '</button>';
        }, function () {});
      }
      function paintToday() {
        HS.get('/api/c/today').then(function (r) { var box = root.querySelector('[data-today]'); if (box) box.innerHTML = todayHTML(r.sessions); },
          function (e) { var box = root.querySelector('[data-today]'); if (box) box.innerHTML = U.empty('alert', U.errorText(e)); });
      }
      function paintResults() {
        results.innerHTML = list.map(function (s, i) {
          return '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '"><span class="avatar sm">' + HS.esc(initials(s.name)) + '</span><div class="grow"><b>' + HS.esc(s.name) + '</b>' +
            '<span class="muted">' + U.grade(s.gradeCode, s.system, s.track) + '</span></div><span class="badge num">' + U.bdi(s.code || '') + '</span></li>';
        }).join('') || (q.value.trim().length >= 2 ? '<li class="faint none">' + HS.esc(HS.t('door.none')) + '</li>' : '');
      }
      var search = HS.debounce(function () {
        var text = q.value.trim(); lastQuery = text;
        if (text.length < 2 && !/^\d+$/.test(text)) { list = []; paintResults(); return; }
        HS.get('/api/c/find?q=' + encodeURIComponent(text)).then(function (r) { if (q.value.trim() !== text) return; list = r; sel = 0; paintResults(); }, function () {});
      }, 160);

      function openCard(id, auto) {
        cardBox.innerHTML = '<div class="stack">' + [1, 2, 3].map(function () { return '<div class="skeleton" style="height:3.4rem"></div>'; }).join('') + '</div>';
        return HS.get('/api/c/card?id=' + encodeURIComponent(id)).then(function (c) {
          card = c; c.pick = c.suggested || ((c.candidates.filter(function (x) { return x.own; })[0] || c.candidates[0] || {}).session || {}).id;
          paintCard();
          if (window.innerWidth < 900 && cardBox.scrollIntoView) cardBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
          var own = c.candidates.filter(function (x) { return x.own && x.now && !x.done; });
          var done = c.candidates.filter(function (x) { return x.session.id === c.pick && x.done; })[0];
          if (auto && HS.prefs.data.autoCheckin !== false && c.suggested && own.length === 1 && HS.can('attendance.mark')) checkin();
          else if (done) { beep('warn'); if (auto) HS.toast(HS.t('door.already', { status: HS.t('att.' + done.status) }), 'bad'); }   // the same card scanned twice
        }, function (e) { cardBox.innerHTML = U.empty('alert', U.errorText(e)); beep('warn'); });
      }
      function paintCard() { if (card) cardBox.innerHTML = cardHTML(card); }
      function checkin() {
        if (!card || !card.pick) return;
        var btn = cardBox.querySelector('[data-checkin]'); if (btn) btn.disabled = true;
        HS.post('/api/c/checkin', { studentId: card.student.id, sessionId: card.pick, via: fromScanner ? 'scan' : 'code' }).then(function (r) {
          beep(r.already ? 'warn' : 'ok');
          HS.toast(HS.t(r.already ? 'door.already' : 'door.done', { name: card.student.name, status: HS.t('att.' + r.status) }), r.already ? 'bad' : '');
          q.value = ''; lastQuery = ''; list = []; paintResults(); q.focus();
          paintToday();
          return openCard(card.student.id, false);
        }, function (e) { if (btn) btn.disabled = false; beep('warn'); HS.toast(U.errorText(e), 'bad', 5000); });
      }

      q.addEventListener('input', function () {
        var now = Date.now(); typedAt.push(now); typedAt = typedAt.filter(function (t) { return now - t < 400; });
        search();
      });
      q.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); paintResults(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paintResults(); e.preventDefault(); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          var text = q.value.trim();
          fromScanner = typedAt.length >= 4;   // a scanner types the whole code in a few milliseconds, then Enter
          if (!text && card) { checkin(); return; }
          if (/^\d{3,6}$/.test(text)) {
            HS.get('/api/c/find?q=' + encodeURIComponent(text)).then(function (r) {
              var exact = r.filter(function (s) { return s.code === text; })[0];
              if (exact) { q.value = ''; lastQuery = ''; list = []; paintResults(); openCard(exact.id, true); }
              else { list = r; sel = 0; paintResults(); if (!r.length) beep('warn'); }
            });
          } else if (list[sel]) { openCard(list[sel].id, false); }
        }
      });
      results.addEventListener('click', function (e) { var li = e.target.closest('[data-i]'); if (li) openCard(list[Number(li.dataset.i)].id, false); });
      cardBox.addEventListener('click', function (e) {
        var p = e.target.closest('[data-pick]');
        if (p) { card.pick = p.dataset.pick; paintCard(); return; }
        if (e.target.closest('[data-checkin]')) { fromScanner = false; checkin(); return; }
        var pay = e.target.closest('[data-pay]');
        if (pay) {
          var en = card.enrollments.filter(function (x) { return x.id === pay.dataset.pay; })[0];
          payDialog(card, en, function (receipt) { paintShift(); openCard(card.student.id, false).then(function () { if (card) { card.lastReceipt = receipt; paintCard(); } }); });
          return;
        }
        if (e.target.closest('[data-print]') && card.lastReceipt) { HS.printReceipt(card.lastReceipt); return; }
        if (e.target.closest('[data-wa]')) {
          HS.get('/api/c/wa?studentId=' + encodeURIComponent(card.student.id) + '&kind=monthly&lang=' + HS.lang).then(function (r) {
            if (r.to) window.open('https://wa.me/' + r.to + '?text=' + encodeURIComponent(r.text), '_blank', 'noopener');
          }, function (er) { HS.toast(U.errorText(er), 'bad'); });
        }
      });
      root.addEventListener('click', function (e) {
        var r = e.target.closest('[data-roster]'); if (r) { HS.openRoster(r.dataset.roster); return; }
        if (e.target.closest('[data-openshift]')) ensureShift().then(paintShift, function () {});
        if (e.target.closest('[data-camera]')) scanCamera(function (code) { q.value = code; q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
      });
      refreshToday = paintToday;
      paintShift(); paintToday(); paintResults();
      if (lastQuery) search();
      if (ctx && ctx.route && ctx.route.q.session) HS.openRoster(ctx.route.q.session);
      setTimeout(function () { if (!HS.overlay.isOpen && !HS.panel.count()) q.focus(); }, 60);
    }
  });

  /* ---------- camera scan (only where the browser allows it: localhost or HTTPS) ---------- */
  function scanCamera(found) {
    var det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] }), stream = null, stop = false;
    var el = HS.dialog({ title: HS.t('door.camera'), body: '<video playsinline muted style="width:100%;border-radius:var(--r-2);background:#000"></video>' });
    var v = el.querySelector('video');
    function end() { stop = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }
    var off = function () { HS.off('overlay-closed', off); end(); }; HS.on('overlay-closed', off);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
      stream = s; v.srcObject = s; v.play();
      (function tick() {
        if (stop) return;
        det.detect(v).then(function (codes) {
          var c = codes[0] && String(codes[0].rawValue || '').replace(/\D/g, '');
          if (c) { HS.overlay.close(); found(c); } else setTimeout(tick, 200);
        }, function () { setTimeout(tick, 400); });
      })();
    }, function (e) { HS.overlay.close(); HS.toast(e.message || HS.t('common.error'), 'bad'); });
  }
})();
