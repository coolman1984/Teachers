/* Hessa - Settings. Phase 1 ships the Appearance tab (language, theme, font, size, density, animations) with a live preview. */
(function () {
  'use strict';
  var HS = window.HS;
  var THEMES = ['auto', 'daylight', 'night', 'asphalt', 'highway', 'contrast'];
  var FONTS = { plex: "'HS Plex Arabic','HS Plex'", cairo: "'HS Cairo'", tajawal: "'HS Tajawal'", kufi: "'HS Kufi'", system: "'Segoe UI',Tahoma,sans-serif" };
  var TABS = ['appearance', 'centre', 'rules', 'lists', 'messages', 'gateway', 'remote', 'ai', 'access', 'data'];

  /* Work from outside the centre (docs/REMOTE_ACCESS.md): a secure tunnel on this PC, switched on here, for chosen people only */
  var remote = {
    render: function () {
      if (!(HS.me && HS.me.admin)) return HS.ui.empty('lock', HS.t('set.admin.only'), '');
      return '<div data-remote><div class="skeleton" style="height:14rem"></div></div>';
    },
    body: function (r) {
      var U = HS.ui, seen = r.seen || {};
      return '<section class="card stack"><header><span class="tile-ic">' + HS.icon('globe') + '</span><h2>' + HS.esc(HS.t('rm.title')) + '</h2></header>' +
        '<p class="muted">' + HS.esc(HS.t('rm.intro')) + '</p>' +
        '<div class="row wrap" style="gap:.6rem;align-items:center"><div class="seg" role="group"><button type="button" data-rm="0" aria-pressed="' + !r.on + '">' + HS.esc(HS.t('rm.off')) + '</button>' +
          '<button type="button" data-rm="1" aria-pressed="' + !!r.on + '"' + (r.here ? '' : ' disabled') + '>' + HS.esc(HS.t('rm.on')) + '</button></div>' +
          '<span class="badge ' + (r.on ? 'ok' : '') + '">' + HS.esc(HS.t(r.on ? 'rm.isOn' : 'rm.isOff')) + '</span></div>' +
        (r.here ? '' : '<p class="faint">' + HS.esc(HS.t('rm.onlyHere')) + '</p>') +
        '<div class="tip ' + (seen.at ? 'ok' : '') + '">' + HS.icon(seen.at ? 'check' : 'info') + '<span>' + (seen.at ? HS.esc(HS.t('rm.seen', { t: U.ago ? U.ago(seen.at) : seen.at, who: seen.user || '–' })) : HS.esc(HS.t('rm.notSeen'))) + '</span></div>' +
        '<div><b>' + HS.esc(HS.t('rm.people')) + '</b> ' + (r.people.length ? r.people.map(function (n) { return '<span class="chip">' + HS.esc(n) + '</span>'; }).join(' ') : '<span class="muted">' + HS.esc(HS.t('rm.nobody')) + '</span>') +
          ' <a href="#/settings?tab=access">' + HS.esc(HS.t('rm.give')) + '</a></div>' +
        '<h3 class="sec">' + HS.esc(HS.t('rm.how')) + '</h3><ol class="rm-ways">' +
          '<li><b>' + HS.esc(HS.t('rm.a')) + '</b> <span class="badge ok">' + HS.esc(HS.t('rm.recommended')) + '</span><p class="muted">' + HS.esc(HS.t('rm.a.b')) + '</p></li>' +
          '<li><b>' + HS.esc(HS.t('rm.b')) + '</b><p class="muted">' + HS.esc(HS.t('rm.b.b')) + '</p></li></ol>' +
        '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('rm.pcOff')) + '</span></div>' +
        '<p class="faint">' + HS.esc(HS.t('rm.guide')) + '</p></section>';
    },
    mount: function (root) {
      var box = root.querySelector('[data-remote]'); if (!box) return;
      function load() { HS.get('/api/remote').then(function (r) { box.innerHTML = remote.body(r); }, function (e) { box.innerHTML = HS.ui.empty('alert', HS.ui.errorText(e)); }); }
      load();
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-rm]'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
        var on = b.dataset.rm === '1';
        var go = function () { HS.ui.run(HS.post('/api/remote', { on: on }), on ? 'rm.turnedOn' : 'rm.turnedOff', b).then(load, function () {}); };
        if (on) HS.ui.confirm({ title: HS.t('rm.on'), body: HS.t('rm.confirm'), ok: HS.t('rm.on') }).then(function (yes) { if (yes) go(); });
        else go();
      });
    }
  };

  /* the optional AI question generator (review G04): the key stays in this PC's data folder, the page sees only its last letters */
  var aiTab = {
    render: function () {
      if (!(HS.me && HS.me.admin)) return HS.ui.empty('lock', HS.t('set.admin.only'), '');
      return '<div data-ai><div class="skeleton" style="height:12rem"></div></div>';
    },
    body: function (r) {
      return '<section class="card stack"><header><span class="tile-ic">' + HS.icon('spark') + '</span><h2>' + HS.esc(HS.t('ai.title')) + '</h2></header>' +
        '<p class="muted">' + HS.esc(HS.t('ai.intro')) + '</p>' +
        '<div class="row wrap" style="gap:.6rem;align-items:center"><span class="badge ' + (r.configured ? 'ok' : '') + '">' + HS.esc(HS.t(r.configured ? 'ai.on' : 'ai.off')) + '</span>' +
          (r.configured ? '<span class="faint" dir="ltr">sk-ant-…' + HS.esc(r.ends) + '</span>' : '') + '</div>' +
        '<ol class="rm-ways"><li>' + HS.esc(HS.t('ai.step1')) + '</li><li>' + HS.esc(HS.t('ai.step2')) + '</li><li>' + HS.esc(HS.t('ai.step3')) + '</li></ol>' +
        '<form class="row wrap" data-aiform autocomplete="off" style="gap:.5rem"><input class="input" name="key" type="password" dir="ltr" spellcheck="false" autocomplete="off" placeholder="sk-ant-…" aria-label="' + HS.esc(HS.t('ai.key')) + '" style="max-width:26rem">' +
          '<button class="btn primary" data-aisave>' + HS.icon('check', 'sm') + HS.esc(HS.t('ai.save')) + '</button>' +
          (r.configured ? '<button type="button" class="btn danger" data-aiclear>' + HS.icon('x', 'sm') + HS.esc(HS.t('ai.clear')) + '</button>' : '') + '</form>' +
        '<div class="tip">' + HS.icon('shield') + '<span>' + HS.esc(HS.t('ai.privacy')) + '</span></div>' +
        '<div class="tip warn">' + HS.icon('alert') + '<span>' + HS.esc(HS.t('ai.cost')) + '</span></div></section>';
    },
    mount: function (root) {
      var box = root.querySelector('[data-ai]'); if (!box) return;
      function load() { HS.get('/api/ai').then(function (r) { box.innerHTML = aiTab.body(r); }, function (e) { box.innerHTML = HS.ui.empty('alert', HS.ui.errorText(e)); }); }
      load();
      box.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target, b = f.querySelector('[data-aisave]');
        HS.ui.run(HS.post('/api/ai/key', { key: f.key.value.trim() }), 'ai.saved', b).then(load, function () {});
      });
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-aiclear]'); if (!b) return;
        HS.ui.confirm({ title: HS.t('ai.clear'), body: HS.t('ai.clear.b'), danger: true, ok: HS.t('ai.clear') }).then(function (yes) {
          if (yes) HS.ui.run(HS.post('/api/ai/key', { clear: true }), 'ai.cleared', b).then(load, function () {});
        });
      });
    }
  };

  function sw(theme) {
    var colors = '<i style="background:var(--side-bg)"></i><b style="background:var(--canvas)">' +
      '<em style="background:var(--surface);height:.9rem"></em><em style="background:var(--signal);width:60%"></em></b>';
    return '<div class="sw" data-theme="' + (theme === 'auto' ? 'daylight' : theme) + '">' + colors + '</div>';
  }
  function seg(key, values, labelKey, current) {
    return '<div class="seg" role="group">' + values.map(function (v) {
      return '<button type="button" data-pref="' + key + '" data-v="' + v + '" aria-pressed="' + (String(current) === v) + '">' + HS.esc(HS.t(labelKey + v)) + '</button>';
    }).join('') + '</div>';
  }
  function block(title, help, body) {
    return '<div class="field" style="padding-block:1.1rem;border-bottom:1px solid var(--line-2)"><label>' + HS.esc(title) + '</label><span class="help">' + HS.esc(help) + '</span><div style="margin-top:.5rem">' + body + '</div></div>';
  }
  function appearance() {
    var d = HS.prefs.data;
    var themes = '<div class="swatches">' + THEMES.map(function (k) {
      return '<button type="button" class="swatch" data-pref="theme" data-v="' + k + '" aria-pressed="' + (d.theme === k) + '">' + sw(k) + '<small>' + HS.esc(HS.t('ap.theme.' + k)) + '</small></button>';
    }).join('') + '</div>';
    var fonts = '<div class="swatches">' + Object.keys(FONTS).map(function (k) {
      return '<button type="button" class="swatch" data-pref="font" data-v="' + k + '" aria-pressed="' + (d.font === k) + '" style="width:8.6rem"><div style="font-family:' + FONTS[k] + ';font-size:1.5rem;padding:.4rem .2rem;line-height:1.1">أبجد Abc<br><span style="font-size:.95rem">١٢٣ 123</span></div><small>' + HS.esc(HS.t('ap.font.' + k)) + '</small></button>';
    }).join('') + '</div>';
    return block(HS.t('ap.language'), HS.t('ap.language.d'), '<div class="seg" role="group"><button type="button" data-pref="lang" data-v="ar" aria-pressed="' + (d.lang === 'ar') + '">العربية</button><button type="button" data-pref="lang" data-v="en" aria-pressed="' + (d.lang === 'en') + '">English</button></div>') +
      block(HS.t('ap.theme'), HS.t('ap.theme.d'), themes) +
      block(HS.t('ap.font'), HS.t('ap.font.d'), fonts) +
      block(HS.t('ap.size'), HS.t('ap.size.d'), seg('size', ['s', 'm', 'l', 'xl'], 'ap.size.', d.size)) +
      block(HS.t('ap.density'), HS.t('ap.density.d'), seg('density', ['comfortable', 'compact'], 'ap.density.', d.density)) +
      block(HS.t('ap.motion'), HS.t('ap.motion.d'), seg('motion', ['auto', 'on', 'off'], 'ap.motion.', d.motion)) +
      block(HS.t('ap.paper'), HS.t('ap.paper.d'), seg('receiptPaper', ['80', '58', 'a5'], 'ap.paper.', d.receiptPaper) +
        '<div class="row wrap" style="margin-top:.6rem;gap:.6rem">' + seg('autoReceipt', ['off', 'on'], 'ap.auto.', d.autoReceipt) +
        '<button type="button" class="btn sm" data-testprint>' + HS.icon('printer', 'sm') + HS.esc(HS.t('ap.testPrint')) + '</button></div>') +
      '<div class="row wrap" style="padding-top:1rem"><button class="btn" data-reset>' + HS.icon('refresh', 'sm') + HS.esc(HS.t('ap.reset')) + '</button><span class="faint">' + HS.esc(HS.t('ap.saved.local')) + '</span></div>';
  }
  function preview() {
    return '<aside class="card"><header><h3>' + HS.esc(HS.t('ap.preview')) + '</h3></header>' +
      '<div class="preview-box"><div class="row wrap"><b>' + HS.esc(HS.t('ap.preview.title')) + '</b>' +
      '<span class="grow"></span>' + HS.ui.att('present') + '</div><div class="muted">' +
      HS.esc(HS.t('ap.preview.body')) + '</div><div class="row wrap">' + HS.ui.bdi('10000') +
      '<span class="grow"></span>' + HS.ui.money(1250) + '</div><div class="row wrap">' +
      '<button class="btn primary sm" type="button">' + HS.esc(HS.t('common.save')) + '</button>' +
      '<button class="btn sm" type="button">' + HS.esc(HS.t('common.cancel')) + '</button></div></div></aside>';
  }
  function settingFields(tab) {
    var keys = tab === 'centre' ? ['systemName','logoText','receiptFooter','currency','academicYear','bookingPhone']
      : ['lateMinutes','doorEarlyMinutes','doorLateMinutes','schoolTreasuryPct','schoolTeacherPct','schoolMaxFee','schoolMaxStudents','riskCall','riskHigh','autoCheckin','doorSounds'];
    return keys.map(function (key) { return { key: key, label: 'set.' + key, help: tab === 'centre' ? null : 'set.' + key + '.h', wide: key === 'receiptFooter',
      type: tab === 'centre' ? (key === 'receiptFooter' ? 'textarea' : 'text') : (key === 'autoCheckin' || key === 'doorSounds' ? 'bool' : 'number') }; });
  }
  // the rules tab in three groups the owner thinks in (the door, school groups, follow-up), each with one line saying what it changes
  var RULE_GROUPS = [{ id: 'door', keys: ['lateMinutes','doorEarlyMinutes','doorLateMinutes','autoCheckin','doorSounds'] },
    { id: 'school', keys: ['schoolTreasuryPct','schoolTeacherPct','schoolMaxFee','schoolMaxStudents'] },
    { id: 'risk', keys: ['riskCall','riskHigh'] }];
  function ruleGroups(settings) {
    var fields = settingFields('rules');
    return RULE_GROUPS.map(function (g) {
      var mine = fields.filter(function (f) { return g.keys.indexOf(f.key) >= 0; });
      var plain = mine.filter(function (f) { return f.type !== 'bool'; }), toggles = mine.filter(function (f) { return f.type === 'bool'; });
      return '<section class="form-sec"><header><h3>' + HS.esc(HS.t('set.sec.' + g.id)) + '</h3><p class="muted">' + HS.esc(HS.t('set.sec.' + g.id + '.d')) + '</p></header>' +
        '<div class="fields cols">' + HS.ui.fields(plain, settings) + '</div>' + (toggles.length ? '<div class="fields toggles">' + HS.ui.fields(toggles, settings) + '</div>' : '') + '</section>';
    }).join('');
  }
  var KINDS = ['monthly','absence','late','payment','risk','portal'];
  function templatesFields() {
    var fields = [];
    KINDS.forEach(function (kind) { ['ar','en'].forEach(function (lang) { fields.push({ key: kind + '_' + lang, label: 'msg.' + kind + '.' + lang, type: 'textarea' }); }); });
    return fields;
  }
  function templateValues(settings) {
    var out = {}, templates = settings.waTemplates || {};
    KINDS.forEach(function (kind) { ['ar','en'].forEach(function (lang) { out[kind + '_' + lang] = (templates[kind] || {})[lang] || ''; }); }); return out;
  }
  var DEFAULTS = { lateMinutes:15, doorEarlyMinutes:90, doorLateMinutes:30, schoolTreasuryPct:15, schoolTeacherPct:80,
    schoolMaxFee:100, schoolMaxStudents:25, riskCall:35, riskHigh:60, autoCheckin:true, doorSounds:true, currency:'EGP' };
  function settingsBody(tab) {
    var settings = Object.assign({}, DEFAULTS, (HS.data.state || {}).settings || {});
    var fields = tab === 'messages' ? templatesFields() : settingFields(tab);
    var body = tab === 'rules' ? ruleGroups(settings)
      : '<div class="fields cols' + (tab === 'messages' ? ' pairs' : '') + '">' + (tab === 'messages' ? '<p class="notice wide">' + HS.esc(HS.t('msg.variables')) + '</p>' : '') +
        HS.ui.fields(fields, tab === 'messages' ? templateValues(settings) : settings) +
        (tab === 'messages' ? '<div class="notice wide" data-message-preview role="status"></div>' : '') + '</div>';
    return '<form data-settings-form class="card set-form">' + body +
      (HS.can('settings.edit') ? '<div class="form-foot"><button type="submit" class="btn primary">' + HS.esc(HS.t('common.save')) + '</button></div>' : '') + '</form>' +
      (tab === 'centre' ? extrasCard() : '');
  }
  // the basic menu holds the daily work; the owner adds the extra pages one by one when the centre is ready for them
  function extrasCard() {
    var edit = HS.can('settings.edit');
    return '<form data-extras-form class="card stack set-form" style="margin-top:1rem"><header><span class="tile-ic">' + HS.icon('layers') + '</span><h2>' +
      HS.esc(HS.t('set.extras')) + '</h2></header><p class="faint">' + HS.esc(HS.t('set.extras.d')) + '</p>' +
      HS.EXTRAS.map(function (id) {
        return '<label class="row" style="gap:.6rem;align-items:flex-start"><input type="checkbox" name="' + id + '"' + (HS.extraOn(id) ? ' checked' : '') +
          (edit ? '' : ' disabled') + '><span><b>' + HS.esc(HS.t('nav.' + id)) + '</b><br><small class="faint">' + HS.esc(HS.t('set.extras.' + id)) + '</small></span></label>';
      }).join('') +
      (edit ? '<div><button type="submit" class="btn primary">' + HS.esc(HS.t('common.save')) + '</button></div>' : '') + '</form>';
  }
  function mountExtras(root) {
    var form = root.querySelector('[data-extras-form]');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (!HS.can('settings.edit')) return;
      var on = HS.EXTRAS.filter(function (id) { return form.elements[id].checked; });
      var ver = (HS.data.state || {}).settingsVer || {};
      HS.ui.run(HS.data.commit('Choose the extra pages in the menu', [{ e:'settings', id:'extras', op:'put', ver:ver.extras || null, row:{ value:on } }]),
        'common.saved', form.querySelector('[type="submit"]')).then(function () { HS.shell.rebuild(); }).catch(function () {});
    });
  }
  function mountSettings(root, tab) {
    var form = root.querySelector('[data-settings-form]');
    var fields = tab === 'messages' ? templatesFields() : settingFields(tab);
    if (!HS.can('settings.edit')) form.querySelectorAll('input,textarea,select').forEach(function (el) { el.disabled = true; });
    if (tab === 'messages') {
      var preview = form.querySelector('[data-message-preview]');
      function update(e) {
        var text = e && e.target && e.target.tagName === 'TEXTAREA' ? e.target.value : form.querySelector('textarea').value;
        var examples = { student:HS.t('msg.exampleStudent'), group:HS.t('msg.exampleGroup'), date:HS.ui.today(), amount:'100', balance:'-50', center:'Hessa', link:'https://example.invalid/parent' };
        Object.keys(examples).forEach(function (key) { text = text.split('{' + key + '}').join(examples[key]); });
        preview.textContent = text;
      }
      form.addEventListener('input', update); update();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (!HS.can('settings.edit')) return;
      var read = HS.ui.read(form, fields), values = read.values;
      if (tab === 'messages') {
        var templates = {};
        KINDS.forEach(function (kind) { templates[kind] = { ar:values[kind + '_ar'], en:values[kind + '_en'] }; }); values = { waTemplates:templates };
      }
      var ver = (HS.data.state || {}).settingsVer || {};
      var ops = Object.keys(values).map(function (key) { return { e:'settings', id:key, op:'put', ver:ver[key] || null, row:{ value:values[key] } }; });
      HS.ui.run(HS.data.commit('Save centre ' + tab + ' settings', ops), 'common.saved', form.querySelector('[type="submit"]'))
        .then(function () { HS.rerender(); }).catch(function () {});
    });
  }


  HS.views.settings = HS.withData({
    render: function (ctx) {
      var tab = TABS.indexOf(ctx.route.q.tab) >= 0 ? ctx.route.q.tab : 'appearance';
      var tabs = '<div class="seg" role="tablist" style="max-width:100%;overflow:auto">' + TABS.map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t + '" aria-pressed="' + (t === tab) + '">' + HS.esc(HS.t('set.tab.' + t)) + '</button>';
      }).join('') + '</div>';
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('set.title')) + '</h1><p>' + HS.esc(HS.t('set.sub')) + '</p></div></div>' +
        '<div class="toolbar">' + tabs + '</div>' +
        (tab === 'appearance' ? '<div class="grid two-col"><section class="card">' + appearance() + '</section>' + preview() + '</div>'
          : tab === 'access' ? HS.accessTab.render()
          : tab === 'data' ? HS.dataTab.render()
          : tab === 'gateway' ? HS.mailboxTab.render()
          : tab === 'remote' ? remote.render()
          : tab === 'ai' ? aiTab.render()
          : tab === 'lists' ? '<div class="stack">' + ['subjects','rooms','teachers','materials'].map(HS.lists.render).join('') + '</div>'
          : settingsBody(tab));
    },
    mount: function (root, ctx) {
      if (['centre','rules','messages'].indexOf(ctx.route.q.tab) >= 0) mountSettings(root, ctx.route.q.tab);
      if (ctx.route.q.tab === 'centre') mountExtras(root);
      if (ctx.route.q.tab === 'lists') HS.lists.mount(root);
      if (ctx.route.q.tab === 'data') HS.dataTab.mount(root);
      if (ctx.route.q.tab === 'gateway') HS.mailboxTab.mount(root);
      if (ctx.route.q.tab === 'remote') remote.mount(root);
      if (ctx.route.q.tab === 'ai') aiTab.mount(root);
      if (ctx.route.q.tab === 'access') { HS.data.load().then(function () { HS.accessTab.mount(root); }); }
      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pref]');
        if (b) { var v = b.dataset.v; HS.prefs.set(b.dataset.pref, v); if (b.dataset.pref !== 'lang') HS.rerender(); return; }
        var t = e.target.closest('[data-tab]');
        if (t) { HS.go('settings?tab=' + t.dataset.tab); return; }
        if (e.target.closest('[data-reset]')) { HS.prefs.reset(); HS.rerender(); }
        if (e.target.closest('[data-testprint]') && HS.printTestReceipt) HS.printTestReceipt();
      });
    }
  });
})();
