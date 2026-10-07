/* Hessa owner page: the centre live on the owner's phone. Read only - nothing here can change the centre's data.
   The centre PC gives the phone a key once (a QR code: /o/#k=<key>); the key is kept on this phone and sent in a header.
   The PC sends a new picture within seconds of every change and at least every three minutes while it is on. */
(function () {
  'use strict';
  var KEY = 'hs-owner-key', LANG = 'hs-owner-lang', EVERY = 15000;
  var W = {
    ar: {
      title: 'المالك', lang: 'English', today: 'دخل اليوم', egp: 'جنيه', expenses: 'المصروفات', net: 'الصافي', receipts: 'الإيصالات', voids: 'قيود عكسية',
      checkedIn: 'حضروا اليوم', methods: 'طرق الدفع', drawers: 'الأدراج المفتوحة', noDrawer: 'لا يوجد درج مفتوح الآن.', since: 'منذ {t}', cash: 'المفروض في الدرج',
      now: 'في الحصص الآن', noNow: 'لا توجد حصة الآن.', later: 'باقي اليوم', alerts: 'تنبيهات الرقابة', noAlerts: 'لا توجد تنبيهات مفتوحة. ✓', feed: 'ما يحدث الآن',
      noFeed: 'لا شيء اليوم حتى الآن.', owing: 'أكبر المستحقات', month: 'هذا الشهر', mIncome: 'الدخل', mExp: 'المصروفات', mOwed: 'مستحقات', mDebtors: 'طلاب عليهم مستحقات',
      online: 'المتصلون الآن', pcOn: 'كمبيوتر المركز متصل · آخر تحديث {t}', pcOff: 'كمبيوتر المركز غير متصل منذ {t}', never: 'لم يصل شيء من كمبيوتر المركز بعد.',
      offline: 'لا يوجد إنترنت على هذا الهاتف؛ هذه آخر صورة محفوظة ({t}).', ended: 'انتهى اشتراك حصة أونلاين؛ هذه آخر بيانات وصلت. جدّد من الإعدادات ← الاشتراك.',
      gate: 'افتح رابط هاتف المالك من كمبيوتر المركز: الإعدادات ← أونلاين وواتساب ← هاتف المالك ← إضافة هاتف.', gateT: 'حصة · هاتف المالك',
      removed: 'أُزيل هذا الهاتف من كمبيوتر المركز. اطلب رابطًا جديدًا إن كان ذلك خطأ.', retry: 'إعادة المحاولة', install: 'لإضافته كتطبيق: قائمة المتصفح ← «إضافة إلى الشاشة الرئيسية».',
      ago0: 'الآن', agoM: 'منذ {n} د', agoH: 'منذ {n} س', agoD: 'منذ {n} يوم', all: 'الكل', money: 'المال', att: 'الحضور', lv: { critical: 'خطير', high: 'راجعه اليوم', warn: 'يستحق نظرة', info: 'للعلم' },
      pm: { cash: 'نقدي', vodafone: 'فودافون كاش', instapay: 'إنستاباي', fawry: 'فوري', card: 'بطاقة', wallet: 'رصيد', bank: 'بنك', transfer: 'تحويل' }, by: 'بواسطة {n}',
    },
    en: {
      title: 'Owner', lang: 'العربية', today: 'Today\'s income', egp: 'EGP', expenses: 'Expenses', net: 'Net', receipts: 'Receipts', voids: 'Reversals',
      checkedIn: 'Came today', methods: 'Payment methods', drawers: 'Open drawers', noDrawer: 'No drawer is open now.', since: 'since {t}', cash: 'Should be in the drawer',
      now: 'In class now', noNow: 'No class right now.', later: 'Later today', alerts: 'Watch alerts', noAlerts: 'No open alerts. ✓', feed: 'Happening now',
      noFeed: 'Nothing yet today.', owing: 'Largest amounts owed', month: 'This month', mIncome: 'Income', mExp: 'Expenses', mOwed: 'Owed', mDebtors: 'Students owing',
      online: 'Signed in now', pcOn: 'Centre PC on · updated {t}', pcOff: 'Centre PC off since {t}', never: 'Nothing has arrived from the centre PC yet.',
      offline: 'No internet on this phone; this is the last saved picture ({t}).', ended: 'The Hessa online subscription has ended; this is the last data received. Renew in Settings → Subscription.',
      gate: 'Open the owner\'s phone link from the centre PC: Settings → Online & WhatsApp → The owner\'s phone → Add a phone.', gateT: 'Hessa · Owner\'s phone',
      removed: 'This phone was removed on the centre PC. Ask for a new link if that was a mistake.', retry: 'Try again', install: 'To add it as an app: browser menu → "Add to Home screen".',
      ago0: 'just now', agoM: '{n} min ago', agoH: '{n} h ago', agoD: '{n} d ago', all: 'All', money: 'Money', att: 'Attendance', lv: { critical: 'Critical', high: 'Check today', warn: 'Worth a look', info: 'For your information' },
      pm: { cash: 'Cash', vodafone: 'Vodafone Cash', instapay: 'InstaPay', fawry: 'Fawry', card: 'Card', wallet: 'Credit', bank: 'Bank', transfer: 'Transfer' }, by: 'by {n}',
    },
  };
  var lang = read(LANG) === 'en' ? 'en' : 'ar', data = null, filter = 'all', timer = null, app = document.getElementById('app');

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode: works for this visit */ } }
  function t(k, v) { var s = W[lang][k] !== undefined ? W[lang][k] : k; return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] !== undefined ? v[x] : m; }) : s; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); }
  function n(v) { var x = Number(v) || 0; return x.toLocaleString('en-US', { maximumFractionDigits: 2 }); }   // the same digits as the receipts and the program
  function money(v) { return '<span class="num">' + esc(n(v)) + '</span>'; }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!(s >= 0)) return '';
    if (s < 60) return t('ago0');
    if (s < 3600) return t('agoM', { n: n(Math.floor(s / 60)) });
    if (s < 86400) return t('agoH', { n: n(Math.floor(s / 3600)) });
    return t('agoD', { n: n(Math.floor(s / 86400)) });
  }
  function setDoc() { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.title = (lang === 'ar' ? 'حصة · ' : 'Hessa · ') + t('title'); }

  // the key arrives once in the #part of the address (never sent to a server there); it is kept and the address cleaned
  (function takeKey() {
    var m = /[#&]k=([A-Za-z0-9_-]{16,64})/.exec(location.hash || '');
    if (m) { write(KEY, m[1]); try { history.replaceState(null, '', '/o/'); } catch (e) { location.hash = ''; } }
  })();

  function gate(msg) {
    setDoc();
    app.innerHTML = '<div class="gate"><img src="/app/icon-192.png" alt=""><h1>' + esc(t('gateT')) + '</h1><p>' + esc(msg) + '</p>' +
      '<button class="btn" data-lang>' + esc(t('lang')) + '</button></div>';
  }

  function feedIcon(k) { return { pay: '💵', void: '↩️', expense: '🧾', shift: '🗄️', in: '✅' }[k] || '•'; }
  function render(r) {
    setDoc();
    var s = r.state, saved = r.saved;
    if (!s) { app.innerHTML = head(null, r) + '<div class="wrap"><div class="card"><p class="empty">' + esc(t('never')) + '</p></div></div>'; return; }
    var d = s.today || {}, m = s.month || {};
    var html = head(s, r) + '<div class="wrap">';
    if (saved) html += '<div class="notice">' + esc(t('offline', { t: ago(saved) })) + '</div>';
    if (r.active === false) html += '<div class="notice bad">' + esc(t('ended')) + '</div>';
    html += '<div class="kpis">' +
      kpi(t('expenses'), money(d.expenses), d.expenses ? 'bad' : '') + kpi(t('net'), money(d.net), d.net >= 0 ? 'ok' : 'bad') + kpi(t('checkedIn'), money(d.checkedIn)) +
      kpi(t('receipts'), money(d.receipts)) + kpi(t('voids'), money(d.voids), d.voids ? 'bad' : '') + kpi(t('mOwed'), money(m.owed), m.owed ? 'bad' : '') + '</div>';
    var methods = Object.keys(d.byMethod || {}).filter(function (k) { return d.byMethod[k]; });
    if (methods.length) html += card(t('methods'), '', '<div class="chips">' + methods.map(function (k) { return '<span class="tag ok">' + esc((W[lang].pm || {})[k] || k) + ' · ' + money(d.byMethod[k]) + '</span>'; }).join('') + '</div>');
    var al = (s.alerts || []).filter(function (a) { return a.level !== 'info'; }), counts = s.alertCounts || {};   // the administrators' own changes stay as a count
    html += card(t('alerts'), al.length ? n(al.length) : '', (Object.keys(counts).some(function (k) { return counts[k]; }) ? '<div class="chips gap-b">' +
      ['critical', 'high', 'warn', 'info'].filter(function (k) { return counts[k]; }).map(function (k) { return '<span class="tag ' + (k === 'critical' || k === 'high' ? 'bad' : k === 'warn' ? 'warn' : '') + '">' + esc(t('lv')[k]) + ' · ' + money(counts[k]) + '</span>'; }).join('') + '</div>' : '') +
      (al.length ? '<ul class="rows">' + al.slice(0, 12).map(function (a) {
        return '<li class="alert ' + esc(a.level) + '"><div class="main">' + esc(a[lang] || a.en) + '<span class="by">' + esc(a.user ? t('by', { n: a.user }) + ' · ' : '') + esc(String(a.ts || '').replace('T', ' ').slice(0, 16)) + '</span></div></li>';
      }).join('') + '</ul>' : '<p class="empty">' + esc(t('noAlerts')) + '</p>'));
    html += card(t('drawers'), (s.drawers || []).length ? n(s.drawers.length) : '', (s.drawers || []).length ? '<ul class="rows">' + s.drawers.map(function (x) {
      return '<li><span class="ic shift">🗄️</span><div class="main"><b>' + esc(x.who) + '</b><span class="by">' + esc(t('since', { t: String(x.since || '').slice(11) || x.since })) + '</span></div><span class="amt">' + (x.cash === null || x.cash === undefined ? '' : esc(t('cash', { a: '' })) + money(x.cash)) + '</span></li>';
    }).join('') + '</ul>' : '<p class="empty">' + esc(t('noDrawer')) + '</p>');
    html += card(t('now'), '', (s.now || []).length ? '<ul class="rows">' + s.now.map(sess).join('') + '</ul>' : '<p class="empty">' + esc(t('noNow')) + '</p>') ;
    if ((s.later || []).length) html += card(t('later'), n(s.later.length), '<ul class="rows">' + s.later.map(sess).join('') + '</ul>');
    var feed = (s.feed || []).filter(function (f) { return filter === 'all' || (filter === 'money' ? f.kind !== 'in' : f.kind === 'in'); });
    html += card(t('feed'), '', '<div class="tabs" role="group">' + ['all', 'money', 'att'].map(function (k) { return '<button type="button" data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' + esc(t(k)) + '</button>'; }).join('') + '</div>' +
      (feed.length ? '<ul class="rows">' + feed.slice(0, 50).map(function (f) {
        var amt = f.amount === undefined ? '' : '<span class="amt ' + (f.amount < 0 ? 'minus' : 'plus') + '">' + (f.amount > 0 ? '+' : '') + money(f.amount) + '</span>';
        return '<li><span class="t num">' + esc(f.at || '') + '</span><span class="ic ' + esc(f.kind) + '">' + feedIcon(f.kind) + '</span><div class="main">' + esc(f[lang] || f.en) +
          (f.by ? '<span class="by">' + esc(t('by', { n: f.by })) + '</span>' : '') + '</div>' + amt + '</li>';
      }).join('') + '</ul>' : '<p class="empty">' + esc(t('noFeed')) + '</p>'));
    html += card(t('month'), '', '<div class="grid2">' + mini(t('mIncome'), money(m.income)) + mini(t('mExp'), money(m.expenses)) + mini(t('mOwed'), money(m.owed)) + mini(t('mDebtors'), money(m.debtors)) + '</div>');
    if ((s.owing || []).length) html += card(t('owing'), '', '<ul class="rows">' + s.owing.map(function (o) { return '<li><div class="main">' + esc(o.name) + '</div><span class="amt minus">' + money(o.amount) + '</span></li>'; }).join('') + '</ul>');
    if ((s.online || []).length) html += card(t('online'), n(s.online.length), '<div class="chips">' + s.online.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('') + '</div>');
    html += '</div><p class="foot">' + esc(t('install')) + '</p>';
    app.innerHTML = html;
    // widths are set here: the page's security rules allow no style written inside the page
    Array.prototype.forEach.call(app.querySelectorAll('[data-pct]'), function (el) { el.style.width = el.getAttribute('data-pct') + '%'; });
  }
  function head(s, r) {
    var at = r.sentAt, fresh = at && (Date.now() - new Date(at).getTime()) < 7 * 60 * 1000 && !r.saved;
    var d = (s && s.today) || {};
    return '<header class="hero"><div class="hero-top"><div class="brand"><img src="/app/icon-192.png" alt=""><h1>' + esc((s && s.centre) || (lang === 'ar' ? 'حصة' : 'Hessa')) + '</h1></div>' +
      '<button class="chip" data-lang>' + esc(t('lang')) + '</button></div>' +
      '<div class="pulse"><span class="dot ' + (at ? (fresh ? 'on' : 'off') : '') + '"></span><span>' + esc(at ? t(fresh ? 'pcOn' : 'pcOff', { t: ago(at) }) : t('never')) + '</span></div>' +
      (s ? '<div class="big"><small>' + esc(t('today')) + '</small><b>' + money(d.income) + '<em>' + esc(t('egp')) + '</em></b></div>' : '') + '</header>';
  }
  function kpi(label, value, tone) { return '<div class="kpi ' + (tone || '') + '"><small>' + esc(label) + '</small><b>' + value + '</b></div>'; }
  function card(title, count, body) { return '<section class="card"><h2><span>' + esc(title) + '</span><span class="count">' + esc(count || '') + '</span></h2>' + body + '</section>'; }
  function mini(label, value) { return '<div class="mini"><small>' + esc(label) + '</small><b>' + value + '</b></div>'; }
  function sess(x) {
    var pct = x.enrolled ? Math.min(100, Math.round(100 * x.present / x.enrolled)) : 0;
    return '<li><div class="main"><b>' + esc(x.group) + '</b><span class="by">' + esc(x.teacher) + ' · <span class="num">' + esc(x.start + '–' + x.end) + '</span></span>' +
      '<div class="bar"><i data-pct="' + pct + '"></i></div></div><span class="amt num">' + esc(n(x.present) + '/' + n(x.enrolled)) + '</span></li>';
  }

  function load() {
    var key = read(KEY);
    if (!key) { gate(t('gate')); return; }
    fetch('/api/owner', { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store' }).then(function (res) {
      if (res.status === 401) {
        write(KEY, null);
        if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ forget: true });
        gate(t('removed'));
        return null;
      }
      if (!res.ok) throw new Error('status ' + res.status);
      var saved = res.headers.get('X-Hessa-Saved');
      return res.json().then(function (j) { j.saved = saved; data = j; render(j); });
    }).catch(function () { if (data) render(data); else gate(t('gate')); });
  }
  function schedule() {
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) load(); }, EVERY);
  }

  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-lang]')) { lang = lang === 'ar' ? 'en' : 'ar'; write(LANG, lang); if (data) render(data); else gate(t(read(KEY) ? 'never' : 'gate')); return; }
    var f = e.target.closest('[data-filter]');
    if (f && data) { filter = f.getAttribute('data-filter'); render(data); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('/owner-sw.js', { scope: '/o/' }).catch(function () {}); } catch (e) { /* no offline copy */ } }
  load();
  schedule();
})();
