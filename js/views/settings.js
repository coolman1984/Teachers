/* Hessa - Settings. Phase 1 ships the Appearance tab (language, theme, font, size, density, animations) with a live preview. */
(function () {
  'use strict';
  var HS = window.HS;
  var THEMES = ['auto', 'daylight', 'night', 'asphalt', 'highway', 'contrast'];
  var FONTS = { plex: "'HS Plex Arabic','HS Plex'", cairo: "'HS Cairo'", tajawal: "'HS Tajawal'", kufi: "'HS Kufi'", system: "'Segoe UI',Tahoma,sans-serif" };
  var TABS = ['appearance', 'centre', 'rules', 'lists', 'messages', 'gateway', 'access', 'data'];

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
      '<div class="row" style="padding-top:1rem"><button class="btn" data-reset>' + HS.icon('refresh', 'sm') + HS.esc(HS.t('ap.reset')) + '</button><span class="faint">' + HS.esc(HS.t('ap.saved.local')) + '</span></div>';
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
    var keys = tab === 'centre' ? ['systemName','logoText','receiptFooter','currency','academicYear']
      : ['lateMinutes','doorEarlyMinutes','doorLateMinutes','schoolTreasuryPct','schoolTeacherPct','schoolMaxFee','schoolMaxStudents','riskCall','riskHigh','autoCheckin','doorSounds'];
    return keys.map(function (key) { return { key: key, label: 'set.' + key,
      type: tab === 'centre' ? (key === 'receiptFooter' ? 'textarea' : 'text') : (key === 'autoCheckin' || key === 'doorSounds' ? 'bool' : 'number') }; });
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
    return '<form data-settings-form class="card">' + (tab === 'messages' ? '<p class="notice">' + HS.esc(HS.t('msg.variables')) + '</p>' : '') +
      HS.ui.fields(fields, tab === 'messages' ? templateValues(settings) : settings) +
      (tab === 'messages' ? '<div class="notice" data-message-preview role="status"></div>' : '') +
      (HS.can('settings.edit') ? '<button type="submit" class="btn primary">' + HS.esc(HS.t('common.save')) + '</button>' : '') + '</form>';
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
          : tab === 'lists' ? '<div class="stack">' + ['subjects','rooms','teachers','materials'].map(HS.lists.render).join('') + '</div>'
          : settingsBody(tab));
    },
    mount: function (root, ctx) {
      if (['centre','rules','messages'].indexOf(ctx.route.q.tab) >= 0) mountSettings(root, ctx.route.q.tab);
      if (ctx.route.q.tab === 'lists') HS.lists.mount(root);
      if (ctx.route.q.tab === 'data') HS.dataTab.mount(root);
      if (ctx.route.q.tab === 'gateway') HS.mailboxTab.mount(root);
      if (ctx.route.q.tab === 'access') { HS.data.load().then(function () { HS.accessTab.mount(root); }); }
      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pref]');
        if (b) { var v = b.dataset.v; HS.prefs.set(b.dataset.pref, v); if (b.dataset.pref !== 'lang') HS.rerender(); return; }
        var t = e.target.closest('[data-tab]');
        if (t) { HS.go('settings?tab=' + t.dataset.tab); return; }
        if (e.target.closest('[data-reset]')) { HS.prefs.reset(); HS.rerender(); }
      });
    }
  });
})();
