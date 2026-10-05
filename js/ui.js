/* Hessa - shared interface pieces: money, grades, attendance badges, confirm dialog, forms, tables, name matching. */
(function () {
  'use strict';
  var HS = window.HS;
  var U = HS.ui = {};

  /* Shared here because centre views load before the list editor. */
  HS.withData = function (view) {
    var failed = false;
    return {
      selfRefresh: !!view.selfRefresh,   // the page updates its own parts on 'data-changed' instead of being redrawn
      render: function (ctx) {
        if (HS.data.state) return view.render(ctx);
        if (failed) return U.empty('alert', HS.t('common.error'), '',
          '<button class="btn primary" data-load-retry>' + HS.esc(HS.t('common.retry')) + '</button>');
        return '<div class="stack" role="status" aria-label="' + HS.esc(HS.t('common.loading')) + '">' +
          [1, 2, 3, 4].map(function () { return '<div class="skeleton" aria-hidden="true" style="height:3rem"></div>'; }).join('') + '</div>';
      },
      mount: function (root, ctx) {
        if (HS.data.state) { failed = false; if (view.mount) view.mount(root, ctx); return; }
        function load() {
          failed = false;
          HS.data.load().then(function () { HS.rerender(); }, function () { failed = true; HS.rerender(); });
        }
        if (failed) {
          root.querySelector('[data-load-retry]').addEventListener('click', function () { failed = false; HS.rerender(); });
        } else load();
      }
    };
  };

  /* ---------- name matching (mirrors server/domain.py key_text) ---------- */
  U.key = function (s) {
    return String(s || '').normalize('NFKC').replace(/ـ/g, '').replace(/[ً-ٰٟ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }).toLowerCase().replace(/[^\w؀-ۿ\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  /* ---------- small pieces ---------- */
  U.bdi = function (text) { return '<bdi dir="ltr">' + HS.esc(text) + '</bdi>'; };
  U.money = function (n) {
    var amount = Number(n) || 0, settings = HS.data.state && HS.data.state.settings || {}, currency = settings.currency || 'EGP';
    var label = currency === 'EGP' ? HS.t('currency.EGP') : currency;
    var value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
    return '<span class="num' + (amount < 0 ? ' bad' : '') + '">' +
      (HS.lang === 'ar' ? U.bdi(value) + ' ' + HS.esc(label) : HS.esc(label) + ' ' + U.bdi(value)) + '</span>';
  };
  U.pct = function (x) { return U.bdi(HS.fmt.num(Math.round((Number(x) || 0) * 100) / 100) + '%'); };
  U.grade = function (code, system, track) {
    return [code ? HS.t('grade.' + code) : '', system ? HS.t('system.' + system) : '',
      track ? HS.t('track.' + track) : ''].filter(Boolean).map(HS.esc).join(' · ');
  };
  var ATT_TONE = { present: 'ok', late: 'warn', absent: 'bad', excused: 'info' };
  U.att = function (status) {
    return '<span class="badge ' + (ATT_TONE[status] || '') + '">' + HS.esc(HS.t('att.' + status)) + '</span>';
  };
  U.empty = function (icon, title, text, action) {
    return '<div class="empty"><div class="art">' + HS.icon(icon, 'lg') + '</div><h3>' + HS.esc(title) + '</h3>' + (text ? '<p>' + HS.esc(text) + '</p>' : '') + (action || '') + '</div>';
  };
  U.dt = function (s) { if (!s) return '–'; var d = new Date(s); return isNaN(d) ? HS.esc(s) : HS.fmt.date(d) + ' ' + HS.fmt.time(d); };
  U.day = function (s) { if (!s) return '–'; var d = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s); return isNaN(d) ? HS.esc(s) : HS.fmt.date(d); };
  U.today = function () { var d = new Date(); return d.getFullYear() + '-' + HS.fmt.pad(d.getMonth() + 1) + '-' + HS.fmt.pad(d.getDate()); };
  /* record colours are theme token names (signal, ok, info, warn), so they follow light and dark themes */
  var TONES = { signal: 1, ok: 1, info: 1, warn: 1, bad: 1, brand: 1 };
  U.tone = function (name) { return 'var(--' + (TONES[name] ? name : 'brand') + ')'; };
  // a group is drawn in its teacher's colour (one teacher = one colour across the timetable), else its own
  U.groupTone = function (g) { var t = g && HS.data.get('teachers', g.teacherId); return U.tone((t && t.color) || (g && g.color)); };

  /* a tiny line of values (0-100) for marks and trends; no library */
  U.spark = function (values, w, h) {
    w = w || 160; h = h || 36;
    if (!values || values.length < 2) return '';
    var max = Math.max.apply(null, values.concat([100])), step = (w - 4) / (values.length - 1);
    var pts = values.map(function (v, i) { return (2 + i * step).toFixed(1) + ',' + (h - 2 - (v / max) * (h - 4)).toFixed(1); });
    var last = pts[pts.length - 1].split(',');
    return '<svg class="sparkline" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline points="' + pts.join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3"/></svg>';
  };
  U.num = function (n) { return n === null || n === undefined || n === '' ? '<span class="faint">–</span>' : '<span class="num">' + HS.fmt.num(n) + '</span>'; };

  U.confirm = function (o) {
    return new Promise(function (resolve) {
      var el = HS.dialog({ title: o.title, body: '<p>' + HS.esc(o.body || '') + '</p>' + (o.reason ? '<div class="field"><label for="cf-reason">' + HS.esc(o.reason) + '</label><input class="input" id="cf-reason" autocomplete="off"></div>' : ''),
        footer: '<button class="btn ghost" data-close>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-ok>' + HS.esc(o.ok || HS.t('common.done')) + '</button>' });
      var done = false;
      el.querySelector('[data-ok]').addEventListener('click', function () {
        var r = el.querySelector('#cf-reason');
        if (r && r.value.trim().length < 3) { r.focus(); r.style.borderColor = 'var(--bad)'; return; }
        done = true; var val = r ? r.value.trim() : true; HS.overlay.close(); resolve(val);
      });
      var off = function () { HS.off('overlay-closed', off); if (!done) resolve(false); };
      HS.on('overlay-closed', off);
    });
  };

  U.errorText = function (e) {
    return e && e.data && e.data.key ? HS.t(e.data.key, e.data.vars) : (e && e.message) || HS.t('common.error');
  };

  /* ---------- forms ---------- */
  // field: { key, label, type: text|number|tel|date|datetime|select|bool|textarea|ref, entity, options, required, help, ltr, placeholder, allowNew }
  function refOptions(f) {
    var rows = HS.data.list(f.entity).filter(function (r) { return r.active !== false; });
    return rows.map(function (r) { return { v: r.id, l: f.entity === 'subjects' ? HS.data.subjectName(r.id) : r.name }; })
      .sort(function (a, b) { return String(a.l).localeCompare(String(b.l), HS.lang); });
  }
  U.field = function (f, value) {
    var id = 'f-' + f.key, lab = HS.t(f.label), val = value === undefined || value === null ? '' : value;
    var attrs = (f.required ? ' required' : '') + (f.ltr ? ' dir="ltr"' : '') + (f.placeholder ? ' placeholder="' + HS.esc(HS.t(f.placeholder)) + '"' : '');
    var input;
    if (f.type === 'multi') {
      input = '<select class="input" multiple id="' + id + '" name="' + f.key + '"' + attrs + '>' + f.options.map(function (o) {
        return '<option value="' + HS.esc(o.v) + '"' + (Array.isArray(val) && val.indexOf(o.v) >= 0 ? ' selected' : '') + '>' + HS.esc(o.l) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'select') {
      input = '<select class="input" id="' + id + '" name="' + f.key + '">' + (f.blank !== false ? '<option value="">–</option>' : '') + f.options.map(function (o) {
        return '<option value="' + HS.esc(o.v) + '"' + (String(val) === String(o.v) ? ' selected' : '') + '>' + HS.esc(o.l) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'ref') {
      var opts = refOptions(f), cur = opts.filter(function (o) { return o.v === val; })[0];
      input = '<input class="input" id="' + id + '" name="' + f.key + '" list="dl-' + id + '" autocomplete="off" value="' + HS.esc(cur ? cur.l : '') + '"' + attrs + ' data-ref="' + f.entity + '">' +
        '<datalist id="dl-' + id + '">' + opts.map(function (o) { return '<option value="' + HS.esc(o.l) + '"></option>'; }).join('') + '</datalist>';
    } else if (f.type === 'bool') {
      return '<div class="field"><div class="row"><span class="switch"><input type="checkbox" id="' + id + '" name="' + f.key + '"' + (val ? ' checked' : '') + '><span></span></span><label for="' + id + '" style="font-weight:600">' + HS.esc(lab) + '</label></div>' +
        (f.help ? '<span class="help">' + HS.esc(HS.t(f.help)) + '</span>' : '') + '</div>';
    } else if (f.type === 'textarea') {
      input = '<textarea class="input" id="' + id + '" name="' + f.key + '" rows="3"' + attrs + '>' + HS.esc(val) + '</textarea>';
    } else {
      var type = f.type === 'datetime' ? 'datetime-local' : (f.type || 'text');
      input = '<input class="input" id="' + id + '" name="' + f.key + '" type="' + type + '"' + (type === 'number' ? ' inputmode="numeric" step="any"' : '') + ' value="' + HS.esc(type === 'datetime-local' ? String(val).slice(0, 16) : val) + '"' + attrs + (f.suggest ? ' list="dl-' + id + '" autocomplete="off"' : '') + '>' +
        (f.suggest ? '<datalist id="dl-' + id + '">' + f.suggest().map(function (x) { return '<option value="' + HS.esc(x) + '"></option>'; }).join('') + '</datalist>' : '');
    }
    return '<div class="field"><label for="' + id + '">' + HS.esc(lab) + (f.required ? ' <span class="faint">*</span>' : '') + '</label>' + input + (f.help ? '<span class="help">' + HS.esc(HS.t(f.help)) + '</span>' : '') + '</div>';
  };
  U.fields = function (fields, values) { return fields.map(function (f) { return U.field(f, (values || {})[f.key]); }).join(''); };

  // returns { values, missing: [labels], newRefs: [{field, entity, text}] }
  U.read = function (root, fields) {
    var values = {}, missing = [], newRefs = [];
    fields.forEach(function (f) {
      var el = root.querySelector('[name="' + f.key + '"]');
      if (!el) return;
      var v;
      if (f.type === 'multi') v = Array.prototype.filter.call(el.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
      else if (f.type === 'bool') v = el.checked;
      else if (f.type === 'number') v = el.value === '' ? null : Number(el.value);
      else if (f.type === 'datetime') v = el.value ? el.value + ':00' : '';
      else if (f.type === 'ref') {
        var text = el.value.trim(), hit = refOptions(f).filter(function (o) { return U.key(o.l) === U.key(text); })[0];
        if (hit) v = hit.v; else if (text && f.allowNew) { v = ''; newRefs.push({ field: f.key, entity: f.entity, text: text }); } else { v = ''; if (text) missing.push(HS.t(f.label)); }
      } else v = el.value.trim();
      if (f.required && (v === '' || v === null || Array.isArray(v) && !v.length)) missing.push(HS.t(f.label));
      values[f.key] = v;
    });
    return { values: values, missing: missing, newRefs: newRefs };
  };

  /* ---------- table ---------- */
  // cols: [{ h: headerKey, cell: function(row) -> html, cls }]
  U.table = function (cols, rows, opts) {
    opts = opts || {};
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + HS.esc(HS.t(c.h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr style="--i:' + Math.min(i, 14) + '"' + (opts.rowAttr ? ' ' + opts.rowAttr(r) : '') + (opts.click ? ' tabindex="0" role="button" style="cursor:pointer;--i:' + Math.min(i, 14) + '"' : '') + '>' +
          cols.map(function (c) { return '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.cell(r) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  };

  /* ---------- run a save with the standard feedback ---------- */
  U.run = function (promise, okKey, btn) {
    if (btn) btn.disabled = true;
    return promise.then(function (r) { if (okKey) HS.toast(HS.t(okKey)); return r; }, function (e) {
      if (btn) btn.disabled = false;
      HS.toast(U.errorText(e), 'bad', 5000);
      throw e;
    });
  };
})();
