/* Hessa — Settings → Subscription (commercial / licence-hub flow, same as Yousef-Transportation). */
(function () {
  'use strict';
  var HS = window.HS;
  var TRIAL_BANNER_DAYS = 14;

  function trialDaysKey(n) {
    return n === 1 ? 'lic.trialDaysLeft.one' : 'lic.trialDaysLeft';
  }
  function trialBannerKey(n) {
    return n === 1 ? 'lic.trialBanner.one' : 'lic.trialBanner';
  }

  function trialCountdown(lic) {
    if (lic.state === 'trial' && lic.days_left != null) {
      return '<p class="lic-trial-count" role="status">' + HS.esc(HS.t(trialDaysKey(lic.days_left), { n: lic.days_left })) + '</p>';
    }
    if (lic.state === 'expired' && (lic.edition === 'trial' || lic.reason === 'expired')) {
      return '<p class="lic-trial-expired" role="status">' + HS.esc(HS.t('lic.trialExpired')) + '</p>';
    }
    return '';
  }

  function banner() {
    var host = HS.$('#lic-banner');
    if (!host) return;
    var lic = HS.me && HS.me.licence;
    var ciWarning = lic && lic.build_channel === 'ci-test' ? '<div class="tip bad" role="alert">' + HS.icon('alert') + '<b>' + HS.esc(HS.t('lic.ciTest')) + '</b></div>' : '';
    var parts = [ciWarning];
    if (lic && lic.state === 'trial' && lic.days_left != null && lic.days_left <= TRIAL_BANNER_DAYS) {
      parts.push('<div class="tip lic-banner lic-trial-banner">' + HS.icon('clock') + '<span>' + HS.esc(HS.t(trialBannerKey(lic.days_left), { n: lic.days_left })) +
        '</span><a class="btn sm" href="#/settings?tab=licence">' + HS.esc(HS.t('set.tab.license')) + '</a></div>');
    }
    if (!lic || lic.full) { host.innerHTML = parts.join(''); return; }
    parts.push('<div class="tip lic-banner">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('lic.banner')) + '</span><a class="btn sm" href="#/settings?tab=licence">' + HS.esc(HS.t('set.tab.license')) + '</a></div>');
    host.innerHTML = parts.join('');
  }
  HS.licenceBanner = banner;
  HS.on('licence', function (lic) { if (HS.me && lic) { HS.me.licence = lic; banner(); } });
  HS.on('route', banner);

  HS.afLicenceTab = {
    render: function () { return '<section class="card" data-licence><div class="skeleton skeleton-block"></div></section>'; },
    mount: function (root) {
      var host = root.querySelector('[data-licence]'), timer = null, showDetails = false, defaultShop = '', draftCode = '', draftShop = '';
      var canEdit = HS.can(['settings.edit', 'users.manage']);
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function reasonText(r) { return HS.has('lic.refused.' + r) ? HS.t('lic.refused.' + r) : HS.t('lic.refused.other'); }
      function shopValue() {
        var el = host.querySelector('#lic-shop');
        var typed = el ? el.value.trim() : '';
        return typed || draftShop || defaultShop;
      }
      function line(q) {
        var wait = q.status === 'sending' || q.status === 'waiting' || (q.status === 'failed' && /^(offline|http_|busy|token|relay_off)/.test(q.error || ''));
        var cls = 'busy', icon = 'clock', text = '';
        if (!q.available) { cls = ''; icon = 'info'; text = HS.t('lic.req.off'); }
        else if (q.status === 'sending') text = HS.t('lic.req.sending');
        else if (q.status === 'waiting' && !q.error) text = HS.t(q.stage === 'approved' ? 'lic.req.approved' : 'lic.req.sentWaiting');
        else if (wait) { cls = 'warn'; icon = 'alert'; text = HS.t('lic.req.offline', { when: q.next_try || '' }); }
        else if (q.status === 'failed') { cls = 'warn'; icon = 'alert'; text = HS.t('lic.req.codeBad'); }
        else if (q.status === 'refused') { cls = 'bad'; icon = 'x'; text = reasonText(q.reason); }
        else if (q.status === 'closed' && q.reason === 'manual') { cls = 'good'; icon = 'check'; text = HS.t('lic.req.closedManual'); }
        else if (q.status === 'closed') { cls = 'warn'; icon = 'alert'; text = HS.t('lic.req.closed'); }
        else if (q.status === 'activated') { cls = 'good'; icon = 'check'; text = HS.t('lic.req.activated'); }
        return { wait: wait, html: text ? '<div class="lic-line ' + cls + '" role="status">' + HS.icon(icon) + '<span>' + HS.esc(text) + '</span></div>' : '' };
      }
      function requestOpen(q) {
        return q.status === 'sending' || q.status === 'waiting' || (q.status === 'failed' && /^(offline|http_|busy|token|relay_off)/.test(q.error || ''));
      }
      function draw(lic) {
        var codeEl = host.querySelector('#lic-code');
        var shopEl = host.querySelector('#lic-shop');
        if (codeEl) draftCode = codeEl.value;
        if (shopEl) draftShop = shopEl.value;
        var q = lic.request || { status: 'none', available: false }, ln = line(q);
        var good = ['trial', 'active', 'grace', 'contract'].indexOf(lic.state) >= 0;
        var showLicenceTools = canEdit && lic.enforced && (!lic.full || lic.state === 'trial' || lic.state === 'expired');
        var canHubRequest = showLicenceTools && q.available && !lic.full && q.status === 'none';
        var showRequestLine = showLicenceTools && q.status !== 'none' && ln.html;
        var shopField = showLicenceTools && q.available ? '<div class="field"><label for="lic-shop">' + HS.esc(HS.t('lic.orgName')) + '</label><input id="lic-shop" class="input" maxlength="60" value="' + HS.esc(draftShop || defaultShop) + '"></div>' : '';
        host.innerHTML = (lic.build_channel === 'ci-test' ? '<div class="tip bad" role="alert">' + HS.icon('alert') + '<b>' + HS.esc(HS.t('lic.ciTest')) + '</b></div>' : '') +
          '<div class="lic ' + (good ? 'good' : '') + '">' +
          '<div class="lic-state">' + HS.icon(good ? 'shield' : 'lock') + '<div><b data-lic-state>' + HS.esc(HS.t('lic.state.' + lic.state)) + '</b>' +
          (lic.edition ? '<div class="small">' + HS.esc(HS.t('lic.kind.' + lic.edition)) + '</div>' : '') +
          (lic.last_day && lic.state !== 'trial' ? '<div class="small muted">' + HS.esc(HS.t('lic.until', { day: lic.last_day, n: lic.days_left })) + '</div>' : '') +
          trialCountdown(lic) + '</div></div>' +
          (lic.state === 'contract' ? '<p class="muted">' + HS.esc(HS.t('lic.contract')) + '</p>' : '') +
          (showLicenceTools ? '<div class="lic-simple">' +
            shopField +
            (showRequestLine ? ln.html : '') +
            (ln.wait ? '<button class="btn" data-retry>' + HS.esc(HS.t('lic.req.retry')) + '</button>' : '') +
            (['refused', 'closed', 'activated', 'failed'].indexOf(q.status) >= 0 && !ln.wait ? '<button class="btn" data-again>' + HS.esc(HS.t('lic.req.again')) + '</button>' : '') +
            '<div class="field lic-device-block"><span class="label">' + HS.esc(HS.t('lic.device')) + '</span>' +
            '<p class="help">' + HS.esc(HS.t('lic.sendDeviceCode')) + '</p>' +
            '<div class="row"><code class="num lic-device-big" id="dev" dir="ltr"><bdi>' + HS.esc(lic.device || '') + '</bdi></code>' +
            '<button class="btn sm" data-copy>' + HS.esc(HS.t('common.copy')) + '</button></div></div>' +
            '<div class="field"><label for="lic-code">' + HS.esc(HS.t('lic.pasteActivation')) + '</label>' +
            '<textarea id="lic-code" class="input code-box" dir="ltr" spellcheck="false" autocomplete="off">' + HS.esc(draftCode) + '</textarea>' +
            '<span class="err small" id="lic-err" role="alert"></span></div>' +
            '<button class="btn primary lic-simple-cta" data-activate>' + HS.esc(HS.t('lic.activate')) + '</button>' +
            '</div>' : '') +
          (showLicenceTools ? '<button type="button" class="btn ghost sm lic-details-toggle" data-details>' + HS.esc(HS.t('lic.details')) + '</button>' : '') +
          (showLicenceTools && showDetails ? '<div class="lic-details" data-lic-details>' +
            '<div class="field"><span class="label">' + HS.esc(HS.t('lic.device')) + '</span><div class="row"><code class="num" dir="ltr"><bdi>' + HS.esc(lic.device || '') + '</bdi></code></div>' +
            '<span class="help">' + HS.esc(HS.t('lic.deviceHint')) + '</span></div>' +
            '<div class="lic-auto" aria-live="polite"><div class="row wrap">' +
            (canHubRequest ? '<button class="btn" data-req="trial">' + HS.esc(HS.t('lic.req.trial')) + '</button>' : '') +
            (showLicenceTools && q.available && q.status === 'none' ? '<button class="btn" data-req="monthly">' + HS.esc(HS.t('lic.req.monthly')) + '</button><button class="btn" data-req="permanent">' + HS.esc(HS.t('lic.req.permanent')) + '</button>' : '') +
            (q.available ? '<button class="btn ghost sm" data-what>' + HS.esc(HS.t('lic.req.what')) + '</button>' : '') + '</div></div></div>' : '') +
          (!good ? '<div class="tip">' + HS.icon('info') + '<span>' + HS.esc(HS.t('lic.readOnly')) + '</span></div>' : '') + '</div>';
        var cp = host.querySelector('[data-copy]');
        if (cp) cp.addEventListener('click', function () { var d = host.querySelector('#dev'); try { navigator.clipboard.writeText(lic.device).then(function () { HS.toast(HS.t('link.copied')); }); } catch (e) { getSelection().selectAllChildren(d); } });
        var act = host.querySelector('[data-activate]');
        if (act) act.addEventListener('click', function () {
          var code = host.querySelector('#lic-code').value.trim();
          if (code) {
            HS.ui.run(HS.post('/api/licence/activate', { code: code }), 'lic.done', act).then(function (r) { HS.me.licence = r; banner(); draw(r); }, function (e) { host.querySelector('#lic-err').textContent = HS.ui.errorText(e); });
            return;
          }
          if (canHubRequest) {
            send('trial', act, shopValue());
            return;
          }
          host.querySelector('#lic-code').focus();
        });
        host.querySelectorAll('[data-req]').forEach(function (b) { b.addEventListener('click', function () { send(b.dataset.req, b, shopValue()); }); });
        [['[data-retry]', '/api/licence/request/retry'], ['[data-again]', '/api/licence/request/clear']].forEach(function (p) {
          var b = host.querySelector(p[0]); if (b) b.addEventListener('click', function () { HS.ui.run(HS.post(p[1], {}), null, b).then(refresh); });
        });
        var det = host.querySelector('[data-details]');
        if (det) det.addEventListener('click', function () { showDetails = !showDetails; draw(lic); });
        var what = host.querySelector('[data-what]');
        if (what) what.addEventListener('click', function () {
          HS.get('/api/licence/preview?kind=trial').then(function (p) {
            var sends = Object.assign({}, p.sends || {});
            var shop = shopValue();
            if (shop) sends.shop = shop.slice(0, 60);
            HS.dialog({ title: HS.t('lic.req.what'), body: '<p>' + HS.esc(HS.t('lic.req.whatBody')) + '</p><pre dir="ltr" class="report-preview">' + HS.esc(JSON.stringify(sends, null, 2)) + '</pre>', footer: '<button class="btn" data-close>' + HS.esc(HS.t('common.close')) + '</button>' });
          });
        });
        stop();
        if (requestOpen(q)) timer = setInterval(function () { if (!host.isConnected) { stop(); return; } refresh(); }, 8000);
      }
      function send(kind, btn, shop) {
        var body = { kind: kind };
        if (shop !== undefined && String(shop).trim()) body.shop = String(shop).trim().slice(0, 60);
        HS.ui.run(HS.post('/api/licence/request', body), null, btn).then(refresh, function () { /* the toast says why */ });
      }
      function refresh() {
        return HS.get('/api/licence').then(function (lic) { HS.me.licence = lic; banner(); draw(lic); }, function (e) { host.innerHTML = '<p>' + HS.esc(HS.ui.errorText(e)) + '</p>'; });
      }
      HS.get('/api/licence/preview?kind=trial').then(function (p) { defaultShop = (p.sends && p.sends.shop) || ''; refresh(); }, refresh);
    }
  };
})();
