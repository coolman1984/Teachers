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
  function qr(text) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; }
  }
  /* Hessa online: the seller's service - one click with the subscription code, nothing to set up */
  function online(s) {
    var body;
    if (s.centre) {
      body = '<div class="tip ' + (s.active === false ? 'bad' : 'ok') + '">' + HS.icon(s.active === false ? 'alert' : 'check') + '<span><b>' +
        HS.esc(HS.t(s.active === false ? 'gw.online.ended' : 'gw.online.on', { d: s.until ? HS.fmt.date(s.until) : '…' })) + '</b></span></div>';
    } else if (!s.service) {
      body = '<p class="muted">' + HS.esc(HS.t('gw.online.none')) + '</p>';
    } else {
      body = '<p class="muted">' + HS.esc(HS.t(s.licensed ? 'gw.online.b' : 'gw.online.needLicence')) + '</p><div class="row wrap" style="gap:.5rem">' +
        '<button class="btn primary" data-gw-join' + (s.licensed ? '' : ' disabled') + '>' + HS.icon('link', 'sm') + HS.esc(HS.t('gw.online.go')) + '</button>' +
        (s.licensed ? '' : '<a class="btn ghost" href="#/settings?tab=license">' + HS.esc(HS.t('set.tab.license')) + '</a>') + '</div>';
    }
    return '<section class="card stack"><header><span class="tile-ic">' + HS.icon('globe') + '</span><h2>' + HS.esc(HS.t('gw.online.t')) + '</h2></header>' + body + '</section>';
  }
  /* the owner's phones: the centre live from anywhere (gateway page /o/) */
  function phones(o) {
    if (!o) return '';
    var list = o.phones || [];
    return '<section class="card stack" data-owner><header><span class="tile-ic">' + HS.icon('eye') + '</span><h2>' + HS.esc(HS.t('own.t')) + '</h2></header>' +
      '<p class="muted">' + HS.esc(HS.t('own.b')) + '</p>' +
      (list.length ? '<ul class="list">' + list.map(function (p) {
        return '<li class="row" style="justify-content:space-between;gap:.6rem"><span><b>' + HS.esc(p.label) + '</b><br><small class="faint">' + HS.esc(HS.t('own.added', { at: HS.fmt.date(String(p.at || '').slice(0, 10)), by: p.by || '' })) + '</small></span>' +
          '<button class="btn sm ghost" data-own-remove="' + HS.esc(p.id) + '">' + HS.esc(HS.t('own.remove')) + '</button></li>';
      }).join('') + '</ul>' : '<p class="faint">' + HS.esc(HS.t('own.none')) + '</p>') +
      (o.gateway ? '<form class="row wrap" data-own-add style="gap:.5rem"><input class="input grow" name="label" maxlength="60" placeholder="' + HS.esc(HS.t('own.labelPh')) + '" aria-label="' + HS.esc(HS.t('own.label')) + '">' +
        '<button class="btn primary" type="submit">' + HS.icon('plus', 'sm') + HS.esc(HS.t('own.add')) + '</button></form>' : '<p class="faint">' + HS.esc(HS.t('own.needGw')) + '</p>') + '</section>';
  }
  /* automatic WhatsApp to parents (server/wa_auto.py): what goes out by itself through Hessa online */
  function waAuto(w) {
    if (!w) return '';
    var c = w.config || {}, svc = w.service || {}, tip = '';
    if (!w.online) tip = '<p class="faint">' + HS.esc(HS.t('own.needGw')) + '</p>';
    else if (svc.error || !svc.ready) tip = '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(svc.error ? HS.t(svc.error.key) : HS.t('wa.err.notReady')) + '</span></div>';
    else if (!w.sender) tip = '<div class="tip">' + HS.icon('info') + '<span>' + HS.esc(HS.t('wauto.notSender')) + '</span></div>';
    else if (w.lastError) tip = '<div class="tip bad">' + HS.icon('alert') + '<span>' + HS.esc(HS.t(w.lastError.key, w.lastError.vars || {})) + '</span></div>';
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (d) { return '<option value="' + d + '"' + (Number(c.day) === d ? ' selected' : '') + '>' + HS.esc(HS.t('day.' + d)) + '</option>'; }).join('');
    var log = (w.log || []).slice(0, 12);
    return '<section class="card stack" data-wauto><header><span class="tile-ic">' + HS.icon('chat') + '</span><h2>' + HS.esc(HS.t('wauto.t')) + '</h2></header>' +
      '<p class="muted">' + HS.esc(HS.t('wauto.b')) + '</p>' + tip +
      '<p><b>' + HS.esc(HS.t('wauto.consent', { n: w.consented || 0, m: w.withMobile || 0 })) + '</b><br><small class="faint">' + HS.esc(HS.t('wauto.consent.h')) + '</small></p>' +
      '<form class="stack" data-wauto-form><label class="row" style="gap:.5rem"><input type="checkbox" name="absence"' + (c.absence ? ' checked' : '') + '><span>' + HS.esc(HS.t('wauto.absence')) + '</span></label>' +
      '<label class="row" style="gap:.5rem"><input type="checkbox" name="receipt"' + (c.receipt ? ' checked' : '') + '><span>' + HS.esc(HS.t('wauto.receipt')) + '</span></label>' +
      '<div class="row wrap" style="gap:.5rem;align-items:flex-end"><label class="field"><span class="lbl">' + HS.esc(HS.t('wauto.report')) + '</span><select class="input" name="report">' +
        ['off', 'weekly', 'monthly'].map(function (k) { return '<option value="' + k + '"' + (c.report === k ? ' selected' : '') + '>' + HS.esc(HS.t('wauto.report.' + k)) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="lbl">' + HS.esc(HS.t('wauto.day')) + '</span><select class="input" name="day">' + days + '</select></label>' +
        '<label class="field"><span class="lbl">' + HS.esc(HS.t('wauto.hour')) + '</span><input class="input" type="number" min="0" max="23" dir="ltr" name="hour" value="' + HS.esc(c.hour === undefined ? 19 : c.hour) + '" style="max-width:6rem"></label></div>' +
      '<div class="row wrap" style="gap:.5rem"><button class="btn primary" type="submit"' + (w.online ? '' : ' disabled') + '>' + HS.esc(HS.t('common.save')) + '</button>' +
        '<button class="btn" type="button" data-wauto-run' + (w.online && w.sender ? '' : ' disabled') + '>' + HS.icon('sync', 'sm') + HS.esc(HS.t('wauto.run')) + '</button>' +
        (svc.ready ? '<span class="grow faint" style="align-self:center">' + HS.esc(HS.t('wauto.month', { n: svc.sent || 0 })) + '</span>' : '') + '</div></form>' +
      (log.length ? '<details><summary class="muted">' + HS.esc(HS.t('wauto.log')) + '</summary><ul class="list">' + log.map(function (x) {
        return '<li class="row" style="gap:.5rem"><small class="faint num">' + HS.esc(String(x.at || '').slice(5, 16).replace('T', ' ')) + '</small><span class="grow">' + HS.esc(HS.t('wauto.k.' + x.kind)) + ' · ' + HS.esc(x.name) + '</span>' +
          '<span class="badge ' + (x.status === 'sent' ? 'ok' : 'bad') + '">' + HS.esc(HS.t('wauto.s.' + (x.status || 'failed'))) + '</span></li>';
      }).join('') + '</ul></details>' : '') + '</section>';
  }
  var waState = null;
  function body(s) {
    var hasUrl = !!s.url, hasSecrets = s.configured, tested = !!s.lastOk;
    var own = s.centre ? '' : ' open';
    return online(s) + (HS.me && HS.me.admin ? phones(ownerState) + waAuto(waState) : '') + '<details class="card gw-own"' + (s.centre || (s.service && !s.configured) ? '' : own) + '><summary><b>' + HS.esc(HS.t(s.service ? 'gw.own.t' : 'set.tab.gateway')) + '</b></summary><div class="stack" style="margin-top:.6rem">' +
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
        '<div data-gateway-result role="status"></div><p class="faint">' + HS.esc(HS.t('gw.guide')) + '</p></div></details></div></details>';
  }
  var ownerState = null;
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
      function load() {
        var own = HS.me && HS.me.admin ? Promise.all([HS.get('/api/owner/phones').then(function (o) { ownerState = o; }, function () { ownerState = null; }),
          HS.get('/api/wa-auto').then(function (w) { waState = w; }, function () { waState = null; })]) : Promise.resolve();
        return own.then(function () { return HS.get('/api/gateway'); }).then(paint, function (e) { host.innerHTML = U.empty('alert', U.errorText(e)); });
      }
      load();
      function act(name, data, btn) {
        return U.run(HS.post('/api/gateway/' + name, data || {}), name === 'test' ? 'gw.tested' : name === 'send' ? 'gw.sent' : 'common.saved', btn)
          .then(function (r) { return load().then(function () { return r; }); }, function (e) { load(); throw e; });
      }
      host.addEventListener('submit', function (e) {
        var wf = e.target.closest('[data-wauto-form]');
        if (wf) {
          e.preventDefault();
          U.run(HS.post('/api/wa-auto', { absence: wf.absence.checked, receipt: wf.receipt.checked, report: wf.report.value, day: Number(wf.day.value), hour: Number(wf.hour.value) }),
            'common.saved', wf.querySelector('[type=submit]')).then(load, function () {});
          return;
        }
        var add = e.target.closest('[data-own-add]');
        if (add) {
          e.preventDefault();
          U.run(HS.post('/api/owner/phones', { label: add.label.value.trim() }), null, add.querySelector('button')).then(function (r) {
            HS.dialog({ title: HS.t('own.t'), body: '<div class="phone-card"><div class="qr">' + qr(r.link) + '</div><div class="stack" style="gap:.7rem">' +
              '<p>' + HS.esc(HS.t('own.scan')) + '</p><input class="input" readonly dir="ltr" value="' + HS.esc(r.link) + '"></div></div>',
              footer: '<button class="btn primary" data-close>' + HS.esc(HS.t('common.done')) + '</button>' });
            load();
          }, function () {});
          return;
        }
        var f = e.target.closest('[data-gw-url]'); if (!f) return; e.preventDefault();
        act('save', { url: f.url.value.trim(), pollSeconds: (st && st.pollSeconds) || 60 }, f.querySelector('button')).catch(function () {});
      });
      host.addEventListener('change', function (e) {
        if (e.target.matches('[data-gw-poll]')) act('save', { url: (st && st.url) || '', pollSeconds: Number(e.target.value) || 60 }).catch(function () {});
      });
      host.addEventListener('click', function (e) {
        var run = e.target.closest('[data-wauto-run]');
        if (run) {
          U.run(HS.post('/api/wa-auto/run', {}), null, run).then(function (r) { HS.toast(HS.t('wauto.ran', { n: r.sent || 0 })); load(); }, function () { load(); });
          return;
        }
        var rm = e.target.closest('[data-own-remove]');
        if (rm) {
          U.confirm({ title: HS.t('own.remove'), body: HS.t('own.remove.b'), danger: true, ok: HS.t('own.remove') }).then(function (yes) {
            if (yes) U.run(HS.post('/api/owner/phones/remove', { id: rm.dataset.ownRemove }), 'common.saved', rm).then(load, function () {});
          });
          return;
        }
        var j = e.target.closest('[data-gw-join]');
        if (j) {
          var go = function (replace) { act('join', { replace: !!replace }, j).catch(function () {}); };
          if (st && st.configured) U.confirm({ title: HS.t('gw.online.go'), body: HS.t('gw.online.replace'), danger: true, ok: HS.t('gw.online.go') }).then(function (yes) { if (yes) go(true); });
          else go(false);
          return;
        }
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
