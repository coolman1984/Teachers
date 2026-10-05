/* Hessa - Settings → Parent links: the guided setup of the internet mailbox (docs/GATEWAY_SETUP.md) and its live status.
   Four steps the owner follows once - address, secrets, the office secret pasted on Cloudflare, a test - and then one line
   that says whether parents see today's data. The secrets stay in gateway.json on each PC, never in the shared data. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var st = null;

  function errText(s) { return s.lastErrorKey ? HS.t(s.lastErrorKey, s.lastErrorVars || {}) : (s.lastError || ''); }
  function step(n, done, title, body) {
    return '<li class="gw-step' + (done ? ' done' : '') + '"><span class="gw-n">' + (done ? HS.icon('check', 'sm') : n) + '</span><div class="grow"><b>' + HS.esc(HS.t(title)) + '</b>' + body + '</div></li>';
  }
  function statusHTML(s) {
    if (!s.configured) return '<div class="tip">' + HS.icon('info') + '<span>' + HS.esc(HS.t('gw.off')) + '</span></div>';
    if (s.lastError && (!s.lastOk || s.lastTry > s.lastOk)) return '<div class="tip bad">' + HS.icon('alert') + '<span><b>' + HS.esc(HS.t('gw.problem')) + '</b> ' + HS.esc(errText(s)) +
      (s.lastOk ? '<br><small>' + HS.esc(HS.t('gw.lastOk', { t: U.ago ? U.ago(s.lastOk) : s.lastOk })) + '</small>' : '') + '</span></div>';
    if (!s.lastOk) return '<div class="tip">' + HS.icon('clock') + '<span>' + HS.esc(HS.t('gw.waiting')) + '</span></div>';
    var behind = s.cards !== null && s.cards !== undefined && s.links > s.cards;
    return '<div class="tip ' + (behind ? 'warn' : 'ok') + '">' + HS.icon(behind ? 'clock' : 'check') + '<span><b>' + HS.esc(HS.t(behind ? 'gw.behind' : 'gw.ok')) + '</b> ' +
      HS.esc(HS.t('gw.counts', { links: s.links || 0, cards: s.cards === null || s.cards === undefined ? '–' : s.cards })) +
      '<br><small>' + HS.esc(HS.t('gw.lastOk', { t: U.ago ? U.ago(s.lastOk) : s.lastOk })) + '</small></span></div>';
  }
  function body(s) {
    var hasUrl = !!s.url, hasSecrets = s.configured, tested = !!s.lastOk;
    return '<section class="card stack"><header><span class="tile-ic">' + HS.icon('link') + '</span><h2>' + HS.esc(HS.t('set.tab.gateway')) + '</h2></header>' +
      '<p class="muted">' + HS.esc(HS.t('gw.intro')) + '</p>' +
      '<div data-gw-status role="status">' + statusHTML(s) + '</div>' +
      '<ol class="gw-steps">' +
        step(1, hasUrl, 'gw.s1', '<p class="muted">' + HS.esc(HS.t('gw.s1.b')) + '</p><form class="row wrap" data-gw-url style="gap:.5rem"><input class="input grow" name="url" type="url" dir="ltr" placeholder="https://hessa-yourcentre.name.workers.dev" value="' + HS.esc(s.url || '') + '" aria-label="' + HS.esc(HS.t('gateway.url')) + '">' +
          '<button class="btn' + (hasUrl ? '' : ' primary') + '" type="submit">' + HS.esc(HS.t('common.save')) + '</button></form>') +
        step(2, hasSecrets, 'gw.s2', '<p class="muted">' + HS.esc(HS.t(hasSecrets ? 'gw.s2.done' : 'gw.s2.b')) + '</p><div class="row wrap" style="gap:.5rem">' +
          (hasSecrets ? '<button class="btn sm ghost" data-gw="regen">' + HS.esc(HS.t('gw.regen')) + '</button>' : '<button class="btn' + (hasUrl ? ' primary' : '') + '" data-gw="generate"' + (hasUrl ? '' : ' disabled') + '>' + HS.esc(HS.t('gateway.generate')) + '</button>') +
          '<button class="btn sm" data-gw-paste>' + HS.esc(HS.t('gw.paste')) + '</button></div>') +
        step(3, tested, 'gw.s3', '<p class="muted">' + HS.esc(HS.t('gw.s3.b')) + '</p><div class="row wrap" style="gap:.5rem"><button class="btn" data-gw-secret' + (hasSecrets ? '' : ' disabled') + '>' + HS.icon('copy', 'sm') + HS.esc(HS.t('gw.copySecret')) + '</button></div><div data-gw-reveal></div>') +
        step(4, tested, 'gw.s4', '<p class="muted">' + HS.esc(HS.t('gw.s4.b')) + '</p><div class="row wrap" style="gap:.5rem"><button class="btn' + (hasSecrets && !tested ? ' primary' : '') + '" data-gw="test"' + (hasSecrets ? '' : ' disabled') + '>' + HS.esc(HS.t('gateway.test')) + '</button>' +
          '<button class="btn" data-gw="send"' + (hasSecrets ? '' : ' disabled') + '>' + HS.icon('sync', 'sm') + HS.esc(HS.t('gw.sendNow')) + '</button></div>') +
      '</ol>' +
      '<details class="gw-more"><summary>' + HS.esc(HS.t('gw.more')) + '</summary><div class="stack" style="margin-top:.6rem">' +
        '<p class="muted">' + HS.esc(HS.t('gw.otherPc')) + '</p><div class="row wrap" style="gap:.5rem"><button class="btn sm" data-gateway-code' + (hasSecrets ? '' : ' disabled') + '>' + HS.esc(HS.t('gateway.showCode')) + '</button></div>' +
        '<label class="field"><span class="lbl">' + HS.esc(HS.t('gateway.poll')) + '</span><input class="input" type="number" min="15" max="600" dir="ltr" data-gw-poll value="' + HS.esc(s.pollSeconds || 60) + '" style="max-width:8rem"></label>' +
        '<div data-gateway-result role="status"></div><p class="faint">' + HS.esc(HS.t('gw.guide')) + '</p></div></details></section>';
  }
  function reveal(root, label, text, help) {
    var box = root.querySelector('[data-gw-reveal]') || root.querySelector('[data-gateway-result]');
    box.innerHTML = '<label class="field"><span class="lbl">' + HS.esc(label) + '</span><textarea class="input" readonly dir="ltr" rows="2">' + HS.esc(text) + '</textarea><span class="help">' + HS.esc(help) + '</span></label>';
    var ta = box.querySelector('textarea'); ta.select();
    try { if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { HS.toast(HS.t('link.copied')); }, function () {}); } catch (e) { /* the text stays selected */ }
  }
  var tab = {
    render: function () {
      if (!HS.can('gateway.manage')) return U.empty('lock', HS.t('set.admin.only'), '');
      return '<div data-gw-root>' + (st ? body(st) : '<div class="skeleton" style="height:18rem"></div>') + '</div>';
    },
    mount: function (root) {
      if (!HS.can('gateway.manage')) return;
      var host = root.querySelector('[data-gw-root]');
      function paint(s) { st = s; host.innerHTML = body(s); }
      function load() { return HS.get('/api/gateway').then(paint, function (e) { host.innerHTML = U.empty('alert', U.errorText(e)); }); }
      load();
      function act(name, data, btn) {
        return U.run(HS.post('/api/gateway/' + name, data || {}), name === 'test' ? 'gw.tested' : name === 'send' ? 'gw.sent' : 'common.saved', btn)
          .then(function (r) { return load().then(function () { return r; }); }, function (e) { load(); throw e; });
      }
      host.addEventListener('submit', function (e) {
        var f = e.target.closest('[data-gw-url]'); if (!f) return; e.preventDefault();
        act('save', { url: f.url.value.trim(), pollSeconds: (st && st.pollSeconds) || 60 }, f.querySelector('button')).catch(function () {});
      });
      host.addEventListener('change', function (e) {
        if (e.target.matches('[data-gw-poll]')) act('save', { url: (st && st.url) || '', pollSeconds: Number(e.target.value) || 60 }).catch(function () {});
      });
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-gw]');
        if (b) {
          var a = b.dataset.gw;
          if (a === 'regen') {
            U.confirm({ title: HS.t('gw.regen'), body: HS.t('gw.regen.b'), danger: true, ok: HS.t('gw.regen') }).then(function (yes) { if (yes) act('generate', { replace: true }, b).catch(function () {}); });
            return;
          }
          act(a, {}, b).catch(function () {});
          return;
        }
        if (e.target.closest('[data-gw-secret]')) {
          HS.get('/api/gateway/secret').then(function (r) { reveal(host, HS.t('gw.secretLabel'), r.secret, HS.t('gw.secretHelp')); }, function (er) { HS.toast(U.errorText(er), 'bad'); });
          return;
        }
        if (e.target.closest('[data-gateway-code]')) {
          HS.get('/api/gateway/code').then(function (r) {
            var box = host.querySelector('[data-gateway-result]');
            box.innerHTML = '<label class="field"><span class="lbl">' + HS.esc(HS.t('gateway.codeHelp')) + '</span><textarea class="input" id="gateway-code" readonly dir="ltr" rows="3">' + HS.esc(r.code) + '</textarea></label>';
            box.querySelector('textarea').select();
          }, function (er) { HS.toast(U.errorText(er), 'bad'); });
          return;
        }
        if (e.target.closest('[data-gw-paste]')) {
          var el = HS.dialog({ title: HS.t('gw.paste'), body: '<p class="muted">' + HS.esc(HS.t('gw.paste.b')) + '</p><textarea class="input" rows="4" dir="ltr" data-code></textarea><div class="tip bad" data-err hidden role="alert"></div>',
            footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-ok>' + HS.esc(HS.t('common.save')) + '</button>' });
          el.querySelector('[data-ok]').addEventListener('click', function () {
            var btn = this, err = el.querySelector('[data-err]'); btn.disabled = true;
            HS.post('/api/gateway/code', { code: el.querySelector('[data-code]').value }).then(function () { HS.overlay.close(); HS.toast(HS.t('common.saved')); load(); },
              function (er) { btn.disabled = false; err.hidden = false; err.textContent = U.errorText(er); });
          });
        }
      });
    }
  };
  HS.mailboxTab = tab;
  HS.views.mailbox = HS.withData(tab);
})();
