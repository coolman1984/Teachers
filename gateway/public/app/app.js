/* Hessa parent page: one child's card, read only. The link token is the key; the card comes from /api/card/<token>.
   Offline: the service worker keeps the last copy on this phone and the page says how old it is. A stopped link removes it. */
(function () {
  'use strict';
  var P = window.P, app = document.getElementById('app');
  var m = location.pathname.match(/^\/t\/([A-Za-z0-9_-]{16,64})$/);
  var token = m ? m[1] : '';
  var pm = location.pathname.match(/^\/p\/([a-z0-9-]{3,40})$/);   // a teacher's public page (no student data at all)
  var slug = pm ? pm[1] : '';
  var S = { card: null, savedAt: '', sentAt: '' };

  function num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function money(n) { return P.lang === 'ar' ? num(n) + ' ' + P.t('currency') : P.t('currency') + ' ' + num(n); }
  function loc() { return P.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB'; }
  function day(iso, opts) {
    try { return new Intl.DateTimeFormat(loc(), opts || { day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00')); } catch (e) { return iso; }
  }
  function ago(iso) {
    var t = new Date(iso).getTime(); if (!t) return '';
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 2) return P.t('now');
    if (mins < 60) return P.t('minutes', { n: mins });
    if (mins < 48 * 60) return P.t('hours', { n: Math.round(mins / 60) });
    return P.t('days', { n: Math.round(mins / 1440) });
  }
  function ltr(s) { return '<bdi dir="ltr">' + P.esc(s) + '</bdi>'; }
  function section(title, body, cls) { return '<section class="card' + (cls ? ' ' + cls : '') + '"><h2>' + P.esc(title) + '</h2>' + body + '</section>'; }

  /* ---------- the card ---------- */
  function header(c) {
    var grade = P.has('grade_' + c.grade) ? P.t('grade_' + c.grade) : (c.grade || '');
    return '<header class="top"><div class="brand"><span class="mark" aria-hidden="true"></span><span>' + P.esc(c.center || P.t('app')) + '</span></div>' +
      '<button class="chip" data-lang>' + P.esc(P.t('lang')) + '</button></header>' +
      '<div class="who"><h1>' + P.esc(c.name) + '</h1><p>' + P.esc(grade) + ' · ' + P.esc(P.t('code')) + ' ' + ltr(c.code) + '</p></div>';
  }
  function freshness() {
    if (S.savedAt) return '<p class="note warn" role="status">' + P.esc(P.t('saved', { t: ago(S.savedAt) })) + '</p>';
    return '<p class="note" role="status">' + P.esc(P.t('updated', { t: ago(S.card.updatedAt || S.sentAt) })) + ' · ' + P.esc(P.t('readOnly')) + '</p>';
  }
  function moneyCard(c) {
    var rows = (c.groups || []).map(function (g) {
      var b = Number(g.balance) || 0, tone = b < -0.009 ? 'bad' : b > 0.009 ? 'ok' : '';
      var sub = [P.t('fee_' + (g.feeType || 'session')), g.unit ? money(g.unit) : '', g.sessionsLeft !== undefined && g.sessionsLeft !== null ? P.t('left', { n: g.sessionsLeft }) : ''].filter(Boolean).join(' · ');
      return '<li><div class="grow"><b>' + P.esc(P.lang === 'en' && g.subjectEn ? g.subjectEn : g.subject || g.group) + '</b><small>' + P.esc(g.group) + (g.teacher ? ' · ' + P.esc(g.teacher) : '') + '</small><small>' + P.esc(sub) + '</small></div>' +
        '<span class="bal ' + tone + '"><b>' + P.esc(money(Math.abs(b))) + '</b><small>' + P.esc(P.t(b < -0.009 ? 'owes' : b > 0.009 ? 'credit' : 'clear')) + '</small></span></li>';
    }).join('');
    return section(P.t('money'), (rows ? '<ul class="rows">' + rows + '</ul>' : '') + (Number(c.wallet) > 0 ? '<p class="note">' + P.esc(P.t('wallet', { a: money(c.wallet) })) + '</p>' : ''));
  }
  function weekCard(c) {
    var t = new Date(), iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    var today = iso(t), tm = new Date(t.getTime() + 86400000), tomorrow = iso(tm);
    var list = (c.week || []).filter(function (w) { return w.date >= today; });
    if (!list.length) return section(P.t('week'), '<p class="empty">' + P.esc(P.t('noWeek')) + '</p>');
    return section(P.t('week'), '<ul class="rows">' + list.map(function (w) {
      var label = w.date === today ? P.t('today') : w.date === tomorrow ? P.t('tomorrow') : day(w.date, { weekday: 'long', day: 'numeric', month: 'short' });
      return '<li' + (w.date === today ? ' class="hi"' : '') + '><div class="grow"><b>' + P.esc(label) + '</b><small>' + P.esc(w.group) + '</small></div><span class="time">' + ltr(w.start + '–' + w.end) + '</span></li>';
    }).join('') + '</ul>');
  }
  function attCard(c) {
    var a = c.attendance || [];
    if (!a.length) return section(P.t('att', { n: 0 }), '<p class="empty">' + P.esc(P.t('noAtt')) + '</p>');
    var came = a.filter(function (x) { return x.status === 'present' || x.status === 'late'; }).length;
    var dots = a.slice().reverse().map(function (x) {
      return '<i class="d ' + P.esc(x.status) + '" title="' + P.esc(day(x.date) + ' · ' + x.group + ' · ' + P.t(x.status)) + '"></i>';
    }).join('');
    var last = a.slice(0, 5).map(function (x) { return '<li><div class="grow"><b>' + P.esc(day(x.date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</b><small>' + P.esc(x.group) + '</small></div><span class="tag ' + P.esc(x.status) + '">' + P.esc(P.t(x.status)) + '</span></li>'; }).join('');
    return section(P.t('att', { n: a.length }), '<p class="big">' + P.esc(P.t('attRate', { p: Math.round(came * 100 / a.length) })) + '</p><div class="dots" role="img" aria-label="' + P.esc(P.t('attRate', { p: Math.round(came * 100 / a.length) })) + '">' + dots + '</div>' +
      '<p class="legend">' + ['present', 'late', 'absent', 'excused'].map(function (k) { return '<span><i class="d ' + k + '"></i>' + P.esc(P.t(k)) + '</span>'; }).join('') + '</p><ul class="rows">' + last + '</ul>');
  }
  function marksCard(c) {
    var list = (c.marks || []).slice().reverse();
    if (!list.length) return section(P.t('marks'), '<p class="empty">' + P.esc(P.t('noMarks')) + '</p>');
    return section(P.t('marks'), '<ul class="rows">' + list.map(function (x) {
      var pct = !x.absent && x.max ? Math.round(Number(x.score) * 100 / Number(x.max)) : null;
      return '<li><div class="grow"><b>' + P.esc(x.title) + '</b><small>' + P.esc(day(x.date)) + (x.rank && x.of ? ' · ' + P.esc(P.t('rank', { r: x.rank, n: x.of })) : '') + '</small>' +
        (pct !== null ? '<span class="meter"><i class="w' + Math.max(0, Math.min(10, Math.round(pct / 10))) + '"></i></span>' : '') + '</div>' +
        '<span class="score">' + (x.absent ? P.esc(P.t('absentExam')) : ltr(num(x.score) + ' / ' + num(x.max)) + '<small>' + pct + '%</small>') + '</span></li>';
    }).join('') + '</ul>');
  }
  function payCard(c) {
    var list = c.payments || [];
    if (!list.length) return section(P.t('payments'), '<p class="empty">' + P.esc(P.t('noPay')) + '</p>');
    return section(P.t('payments'), '<ul class="rows">' + list.map(function (p) {
      return '<li><div class="grow"><b>' + P.esc(day(p.date)) + '</b><small>' + P.esc(p.amount < 0 ? P.t('reversed') : P.t('receipt', { no: '' })) + ltr(p.no || '') + (p.group ? ' · ' + P.esc(p.group) : '') + '</small></div>' +
        '<span class="amt' + (p.amount < 0 ? ' neg' : '') + '">' + P.esc(money(p.amount)) + '</span></li>';
    }).join('') + '</ul>');
  }
  function draw() {
    var c = S.card;
    app.innerHTML = header(c) + freshness() + moneyCard(c) + weekCard(c) + marksCard(c) + attCard(c) + payCard(c) +
      '<footer class="foot"><button class="chip" data-refresh>' + P.esc(P.t('refresh')) + '</button></footer>';
  }
  function message(kind) {
    app.innerHTML = '<header class="top"><div class="brand"><span class="mark" aria-hidden="true"></span><span>' + P.esc(P.t('app')) + '</span></div><button class="chip" data-lang>' + P.esc(P.t('lang')) + '</button></header>' +
      '<section class="card msg ' + kind + '"><h1>' + P.esc(P.t(kind)) + '</h1><p>' + P.esc(P.t(kind + '_b')) + '</p>' +
      (kind === 'offline' || kind === 'busy' || kind === 'notyet' ? '<button class="btn" data-refresh>' + P.esc(P.t('retry')) + '</button>' : '') + '</section>';
  }

  /* ---------- a teacher's public page ---------- */
  var DAYS = { ar: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'], en: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] };
  function teacherPage(t) {
    var subs = (t.subjects || []).map(function (x) { return P.lang === 'en' && x.nameEn ? x.nameEn : x.name; }).join(' · ');
    var groups = (t.groups || []).map(function (g) {
      var grade = P.has('grade_' + g.grade) ? P.t('grade_' + g.grade) : (g.grade || '');
      var times = (g.slots || []).map(function (sl) { return (DAYS[P.lang] || DAYS.ar)[sl.day] + ' ' + sl.start + '–' + sl.end; }).join('، ');
      var seats = g.seats === null || g.seats === undefined ? '' : g.seats > 0 ? '<span class="tag present">' + P.esc(P.t('seats', { n: g.seats })) + '</span>' : '<span class="tag absent">' + P.esc(P.t('full')) + '</span>';
      var book = t.booking && g.seats !== 0 ? '<a class="btn" href="https://wa.me/' + P.esc(t.booking) + '?text=' + encodeURIComponent(P.t('bookText', { group: g.name, teacher: t.name })) + '" rel="noopener">' + P.esc(P.t('book')) + '</a>' : '';
      return '<li><div class="grow"><b>' + P.esc(g.name) + '</b><small>' + P.esc(grade) + (g.fee ? ' · ' + P.esc(money(g.fee)) + ' ' + P.esc(P.t('fee_' + (g.feeType || 'session'))) : '') + '</small><small>' + P.esc(times) + '</small></div>' +
        '<div class="grp-side">' + seats + book + '</div></li>';
    }).join('');
    app.innerHTML = '<header class="top"><div class="brand"><span class="mark" aria-hidden="true"></span><span>' + P.esc(t.center || P.t('app')) + '</span></div><button class="chip" data-lang>' + P.esc(P.t('lang')) + '</button></header>' +
      '<div class="who"><h1>' + P.esc(t.name) + '</h1>' + (subs ? '<p>' + P.esc(subs) + '</p>' : '') + '</div>' +
      (t.bio ? section(P.t('about'), '<p class="bio" dir="auto">' + P.esc(t.bio) + '</p>') : '') +
      section(P.t('groupsOpen'), groups ? '<ul class="rows">' + groups + '</ul>' : '<p class="empty">' + P.esc(P.t('noGroups')) + '</p>');
  }
  function loadPage() {
    app.innerHTML = '<p class="boot">' + P.esc(P.t('loading')) + '</p>';
    fetch('/api/page/' + slug, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.ok && d.page) { S.page = d.page; teacherPage(d.page); } else message(r.status === 429 ? 'busy' : 'nopage');
      });
    }, function () { message('offline'); });
  }

  /* ---------- loading ---------- */
  function forget() {
    // a stopped link: nothing of this child stays on the phone (the service worker drops its copy too)
    try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ forget: location.pathname }); } catch (e) { /* ignore */ }
  }
  function load() {
    if (slug) { loadPage(); return; }
    if (!token) { message('bad'); return; }
    if (!S.card) app.innerHTML = '<p class="boot">' + P.esc(P.t('loading')) + '</p>';
    fetch('/api/card/' + token, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.ok && d.card) { S.card = d.card; S.sentAt = d.sentAt || ''; S.savedAt = r.headers.get('X-Hessa-Saved') || ''; draw(); return; }
        if (r.status === 404) { S.card = null; forget(); message('notyet'); return; }
        if (r.status === 410) { S.card = null; forget(); message(d.expired ? 'expired' : 'revoked'); return; }
        if (r.status === 429) { if (!S.card) message('busy'); return; }
        if (!S.card) message('bad');
      });
    }, function () { if (!S.card) message('offline'); });
  }
  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-lang]')) { P.setLang(P.lang === 'ar' ? 'en' : 'ar'); if (S.page) teacherPage(S.page); else if (S.card) draw(); else load(); return; }
    if (e.target.closest('[data-refresh]')) load();
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.card) load(); });
  window.addEventListener('online', load);
  if ('serviceWorker' in navigator && token) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () { /* the page still works without it */ });
  load();
})();
