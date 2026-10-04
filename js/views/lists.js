/* Hessa - list pages driven by a small configuration: vehicles, drivers, people (+ departments), places (+ standard routes),
   trip categories (in Settings). One table, one side-panel form, soft delete, search - the same for every list. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;

  var OWN = function () { return [{ v: 'own', l: HS.t('own.own') }, { v: 'rent', l: HS.t('own.rent') }]; };
  var SHEETS = ['All Car', 'SUV Rent', 'Microbus Rent'].map(function (x) { return { v: x, l: x }; });

  // each list: entity, title key, manage permission, columns, form fields, searchable text, new-record defaults, sort
  var LISTS = {
    vehicles: {
      entity: 'vehicles', perm: 'vehicles.manage', icon: 'car', add: 'list.add.vehicle',
      cols: [
        { h: 'f.plate', cell: function (r) { return HS.ui.plate(r.plate); } },
        { h: 'f.type', cell: function (r) { return HS.esc(r.type || ''); } },
        { h: 'f.category', cell: function (r) { return HS.esc(HS.data.catName(r.categoryId)); } },
        { h: 'f.ownership', cell: function (r) { return r.ownership ? '<span class="badge ' + (r.ownership === 'rent' ? 'info' : '') + '">' + HS.esc(HS.t('own.' + r.ownership)) + '</span>' : ''; } },
        { h: 'f.vendor', cell: function (r) { return HS.esc(r.vendor || ''); } },
        { h: 'f.trips', cell: function (r) { return U.num(HS.data.list('trips').filter(function (t) { return t.vehicleId === r.id && t.status !== 'cancelled'; }).length); } },
        { h: 'f.active', cell: function (r) { return activeBadge(r); } }
      ],
      fields: function () { return [
        { key: 'plate', label: 'f.plate', required: true, help: 'help.plate' },
        { key: 'type', label: 'f.type' },
        { key: 'categoryId', label: 'f.category', type: 'ref', entity: 'tripCategories' },
        { key: 'ownership', label: 'f.ownership', type: 'select', options: OWN() },
        { key: 'vendor', label: 'f.vendor' },
        { key: 'startKm', label: 'f.baselineKm', type: 'number', ltr: true, help: 'help.baselineKm' },
        { key: 'notes', label: 'f.notes', type: 'textarea' },
        { key: 'active', label: 'f.active', type: 'bool' }]; },
      text: function (r) { return [r.plate, r.type, r.vendor, HS.data.catName(r.categoryId)].join(' '); },
      defaults: { active: true, ownership: 'own' },
      title: function (r) { return r.plate; }
    },
    drivers: {
      entity: 'drivers', perm: 'drivers.manage', icon: 'wheel', add: 'list.add.driver',
      cols: [
        { h: 'f.name', cell: function (r) { return '<b>' + HS.esc(r.name) + '</b>'; } },
        { h: 'f.mobile', cell: function (r) { return r.mobile ? '<span class="num">' + HS.esc(r.mobile) + '</span>' : '<span class="faint">–</span>'; } },
        { h: 'f.vendor', cell: function (r) { return HS.esc(r.vendor || ''); } },
        { h: 'f.licenseExpiry', cell: function (r) { return licenseCell(r); } },
        { h: 'f.trips', cell: function (r) { return U.num(HS.data.list('trips').filter(function (t) { return t.driverId === r.id && t.status !== 'cancelled'; }).length); } },
        { h: 'f.active', cell: function (r) { return activeBadge(r); } }
      ],
      fields: function () { return [
        { key: 'name', label: 'f.name', required: true },
        { key: 'mobile', label: 'f.mobile', type: 'tel', ltr: true, help: 'help.mobile' },
        { key: 'vendor', label: 'f.vendor' },
        { key: 'licenseNo', label: 'f.licenseNo', ltr: true },
        { key: 'licenseExpiry', label: 'f.licenseExpiry', type: 'date' },
        { key: 'active', label: 'f.active', type: 'bool' }]; },
      text: function (r) { return [r.name, r.mobile, r.vendor].join(' '); },
      defaults: { active: true },
      title: function (r) { return r.name; }
    },
    people: {
      entity: 'people', perm: 'people.manage', icon: 'users', add: 'list.add.person',
      cols: [
        { h: 'f.name', cell: function (r) { return '<b>' + HS.esc(r.name) + '</b>'; } },
        { h: 'f.department', cell: function (r) { return HS.esc(HS.data.name('departments', r.departmentId)); } },
        { h: 'f.role', cell: function (r) { return (r.isRequester ? '<span class="badge info">' + HS.esc(HS.t('role.requester')) + '</span> ' : '') + (r.isPassenger ? '<span class="badge">' + HS.esc(HS.t('role.passenger')) + '</span>' : ''); } },
        { h: 'f.mobile', cell: function (r) { return r.mobile ? '<span class="num">' + HS.esc(r.mobile) + '</span>' : '<span class="faint">–</span>'; } },
        { h: 'f.trips', cell: function (r) { return U.num(HS.data.list('trips').filter(function (t) { return t.requesterId === r.id; }).length); } },
        { h: 'f.active', cell: function (r) { return activeBadge(r); } }
      ],
      fields: function () { return [
        { key: 'name', label: 'f.name', required: true },
        { key: 'departmentId', label: 'f.department', type: 'ref', entity: 'departments', allowNew: true },
        { key: 'mobile', label: 'f.mobile', type: 'tel', ltr: true },
        { key: 'isRequester', label: 'role.requester', type: 'bool' },
        { key: 'isPassenger', label: 'role.passenger', type: 'bool' },
        { key: 'active', label: 'f.active', type: 'bool' }]; },
      text: function (r) { return [r.name, r.mobile, HS.data.name('departments', r.departmentId)].join(' '); },
      defaults: { active: true, isRequester: true, isPassenger: true },
      title: function (r) { return r.name; },
      dupWarn: true
    },
    departments: {
      entity: 'departments', perm: 'people.manage', icon: 'layers', add: 'list.add.department',
      cols: [
        { h: 'f.name', cell: function (r) { return '<b>' + HS.esc(r.name) + '</b>'; } },
        { h: 'f.code', cell: function (r) { return HS.esc(r.code || ''); } },
        { h: 'f.people', cell: function (r) { return U.num(HS.data.list('people').filter(function (p) { return p.departmentId === r.id; }).length); } },
        { h: 'f.trips', cell: function (r) { return U.num(HS.data.list('trips').filter(function (t) { return t.departmentId === r.id && t.status !== 'cancelled'; }).length); } },
        { h: 'f.active', cell: function (r) { return activeBadge(r); } }
      ],
      fields: function () { return [{ key: 'name', label: 'f.name', required: true }, { key: 'code', label: 'f.code', ltr: true }, { key: 'active', label: 'f.active', type: 'bool' }]; },
      text: function (r) { return [r.name, r.code].join(' '); },
      defaults: { active: true },
      title: function (r) { return r.name; }
    },
    places: {
      entity: 'places', perm: 'places.manage', icon: 'pin', add: 'list.add.place',
      cols: [
        { h: 'f.name', cell: function (r) { return '<b>' + HS.esc(r.name) + '</b>'; } },
        { h: 'f.nameAr', cell: function (r) { return HS.esc(r.nameAr || ''); } },
        { h: 'f.aliases', cell: function (r) { return (r.aliases || []).slice(0, 4).map(function (a) { return '<span class="badge">' + HS.esc(a) + '</span>'; }).join(' '); } },
        { h: 'f.active', cell: function (r) { return activeBadge(r); } }
      ],
      fields: function () { return [
        { key: 'name', label: 'f.name', required: true },
        { key: 'nameAr', label: 'f.nameAr' },
        { key: 'aliases', label: 'f.aliases', type: 'textarea', help: 'help.aliases' },
        { key: 'active', label: 'f.active', type: 'bool' }]; },
      toForm: function (r) { return Object.assign({}, r, { aliases: (r.aliases || []).join('\n') }); },
      fromForm: function (v) { v.aliases = String(v.aliases || '').split(/\n|,|،/).map(function (x) { return x.trim(); }).filter(Boolean); return v; },
      text: function (r) { return [r.name, r.nameAr, (r.aliases || []).join(' ')].join(' '); },
      defaults: { active: true, aliases: [] },
      title: function (r) { return r.name; }
    },
    tripCategories: {
      entity: 'tripCategories', perm: 'categories.manage', icon: 'layers', add: 'list.add.category',
      cols: [
        { h: 'f.name', cell: function (r) { return '<b>' + HS.esc(r.name) + '</b>' + (r.nameAr ? ' <span class="muted">' + HS.esc(r.nameAr) + '</span>' : ''); } },
        { h: 'f.exportSheet', cell: function (r) { return '<span class="badge info">' + HS.esc(r.exportSheet || '') + '</span>'; } },
        { h: 'f.openLimit', cell: function (r) { return r.openLimitHours ? '<span class="num">' + r.openLimitHours + '</span> h' : '<span class="faint">–</span>'; } },
        { h: 'f.ratePerKm', cell: function (r) { return U.num(r.ratePerKm); } },
        { h: 'f.vendor', cell: function (r) { return HS.esc(r.vendor || ''); } },
        { h: 'f.trips', cell: function (r) { return U.num(HS.data.list('trips').filter(function (t) { return t.categoryId === r.id && t.status !== 'cancelled'; }).length); } }
      ],
      fields: function () { return [
        { key: 'name', label: 'f.name', required: true },
        { key: 'nameAr', label: 'f.nameAr' },
        { key: 'exportSheet', label: 'f.exportSheet', type: 'select', options: SHEETS, help: 'help.exportSheet' },
        { key: 'hasSequence', label: 'f.hasSequence', type: 'bool', help: 'help.hasSequence' },
        { key: 'openLimitHours', label: 'f.openLimit', type: 'number', ltr: true, help: 'help.openLimit' },
        { key: 'ratePerKm', label: 'f.ratePerKm', type: 'number', ltr: true },
        { key: 'ratePerOtHour', label: 'f.ratePerOt', type: 'number', ltr: true },
        { key: 'vendor', label: 'f.vendor' }]; },
      text: function (r) { return [r.name, r.nameAr, r.exportSheet, r.vendor].join(' '); },
      defaults: { exportSheet: 'All Car', openLimitHours: 16 },
      title: function (r) { return r.name; }
    }
  };
  HS.lists = LISTS;

  function activeBadge(r) { return r.active === false ? '<span class="badge">' + HS.esc(HS.t('f.inactive')) + '</span>' : '<span class="badge ok">' + HS.esc(HS.t('f.activeYes')) + '</span>'; }
  function licenseCell(r) {
    if (!r.licenseExpiry) return '<span class="faint">–</span>';
    var days = Math.round((new Date(r.licenseExpiry + 'T00:00:00') - new Date()) / 86400000);
    var tone = days < 0 ? 'bad' : days < 30 ? 'warn' : '';
    return '<span class="badge ' + tone + '">' + HS.esc(U.day(r.licenseExpiry)) + '</span>';
  }

  /* ---------- the form in a side panel ---------- */
  function openForm(cfg, rec) {
    var fields = cfg.fields();
    var values = rec ? (cfg.toForm ? cfg.toForm(rec) : rec) : cfg.defaults;
    var title = rec ? cfg.title(rec) : HS.t(cfg.add);
    HS.panel.open({
      title: title,
      body: '<form id="rec-form" autocomplete="off" class="stack">' + U.fields(fields, values) + '<div class="tip err" hidden role="alert" style="background:var(--bad-soft);color:var(--bad)"></div></form>',
      footer: (rec && HS.can(cfg.perm) ? '<button class="btn danger" data-del style="margin-inline-end:auto">' + HS.icon('x', 'sm') + HS.esc(HS.t('common.delete')) + '</button>' : '') +
        '<button class="btn ghost" data-cancel>' + HS.esc(HS.t('common.cancel')) + '</button><button class="btn primary" data-save>' + HS.esc(HS.t('common.save')) + '</button>',
      mount: function (el) {
        var form = el.querySelector('#rec-form'), err = el.querySelector('.err');
        function save() {
          var r = U.read(form, fields);
          if (r.missing.length) { err.hidden = false; err.textContent = HS.t('form.missing', { f: r.missing.join('، ') }); return; }
          var row = Object.assign({}, rec || {}, cfg.fromForm ? cfg.fromForm(r.values) : r.values);
          delete row.ver; delete row.id;
          var ops = [];
          r.newRefs.forEach(function (n) {   // a typed department that does not exist yet is created in the same save
            var nid = HS.data.newId(n.entity.slice(0, 2)); ops.push({ e: n.entity, id: nid, op: 'put', row: { name: n.text, active: true } }); row[n.field] = nid;
          });
          var id = rec ? rec.id : HS.data.newId(cfg.entity.slice(0, 2));
          ops.push({ e: cfg.entity, id: id, op: 'put', ver: rec ? rec.ver : null, row: row });
          var btn = el.querySelector('[data-save]');
          U.run(HS.data.commit(HS.t(rec ? 'list.saved.edit' : 'list.saved.new', { n: cfg.title(row) }), ops), 'common.saved', btn).then(function () { HS.panel.close(); HS.rerender(); }, function (e) { err.hidden = false; err.textContent = U.errorText(e); });
        }
        form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
        el.querySelector('[data-save]').addEventListener('click', save);
        el.querySelector('[data-cancel]').addEventListener('click', function () { HS.panel.close(); });
        var del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', function () {
          U.confirm({ title: HS.t('common.delete'), body: HS.t('list.delete.body', { n: cfg.title(rec) }), danger: true, ok: HS.t('common.delete') }).then(function (ok) {
            if (ok) U.run(HS.data.remove(cfg.entity, rec.id, HS.t('list.deleted', { n: cfg.title(rec) })), 'list.deleted.toast').then(function () { HS.panel.close(); HS.rerender(); });
          });
        });
        var first = form.querySelector('input,select,textarea'); if (first) first.focus();
      }
    });
  }
  HS.openListForm = openForm;

  /* ---------- the page ---------- */
  function tableHTML(cfg, q) {
    var rows = HS.data.list(cfg.entity).slice();
    var n = U.key(q);
    if (n) rows = rows.filter(function (r) { return U.key(cfg.text(r)).indexOf(n) >= 0; });
    rows.sort(function (a, b) { return String(cfg.title(a)).localeCompare(String(cfg.title(b)), HS.lang); });
    if (!rows.length) return U.empty(cfg.icon, HS.t(q ? 'list.none.search' : 'list.none.title'), HS.t(q ? 'list.none.search.b' : 'list.none.body'),
      !q && HS.can(cfg.perm) ? '<button class="btn primary" data-add>' + HS.icon('plus', 'sm') + HS.esc(HS.t(cfg.add)) + '</button>' : '');
    return U.table(cfg.cols, rows, { click: true, rowAttr: function (r) { return 'data-id="' + HS.esc(r.id) + '"'; } });
  }
  function listPage(cfg) {
    return '<div class="toolbar"><input class="input" data-q type="search" placeholder="' + HS.esc(HS.t('list.search')) + '" style="max-width:22rem" aria-label="' + HS.esc(HS.t('list.search')) + '">' +
      '<span class="grow"></span><span class="muted"><span class="num" data-count>' + HS.data.list(cfg.entity).length + '</span></span>' +
      (HS.can(cfg.perm) ? '<button class="btn primary" data-add>' + HS.icon('plus', 'sm') + HS.esc(HS.t(cfg.add)) + '</button>' : '') + '</div><div data-body>' + tableHTML(cfg, '') + '</div>';
  }
  function mountList(root, cfg) {
    var body = root.querySelector('[data-body]'), q = root.querySelector('[data-q]');
    function open(id) { var r = HS.data.get(cfg.entity, id); if (r) openForm(cfg, r); }
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-add]')) { if (HS.can(cfg.perm)) openForm(cfg); return; }
      var tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id);
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var tr = e.target.closest && e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); } });
    q.addEventListener('input', HS.debounce(function () { body.innerHTML = tableHTML(cfg, q.value); }, 120));
  }

  function head(titleKey, descKey, extra) {
    return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t(titleKey)) + '</h1><p>' + HS.esc(HS.t(descKey)) + '</p></div>' + (extra || '') + '</div>';
  }
  function tabs(active, ids, base) {
    return '<div class="toolbar"><div class="seg" role="tablist">' + ids.map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t + '" aria-pressed="' + (t === active) + '">' + HS.esc(HS.t('tab.' + t)) + '</button>'; }).join('') + '</div></div>';
  }
  function needData(fn) {
    return function (ctx) {
      if (!HS.data.state) return '<div class="stack">' + [1, 2, 3, 4].map(function () { return '<div class="skeleton" style="height:3rem"></div>'; }).join('') + '</div>';
      return fn(ctx);
    };
  }
  function withData(view) {
    return {
      render: needData(view.render),
      mount: function (root, ctx) {
        if (!HS.data.state) { HS.data.load().then(function () { HS.rerender(); }); return; }
        view.mount(root, ctx);
      }
    };
  }
  HS.withData = withData;
  HS.pageHead = head;

  function grouped(pageId, ids, descFor) {   // a page with tabs, one list per tab
    return withData({
      render: function (ctx) {
        var tab = ids.indexOf(ctx.route.q.tab) >= 0 ? ctx.route.q.tab : ids[0];
        return head('nav.' + pageId, descFor(tab)) + (ids.length > 1 ? tabs(tab, ids) : '') + listPage(LISTS[tab]);
      },
      mount: function (root, ctx) {
        var tab = ids.indexOf(ctx.route.q.tab) >= 0 ? ctx.route.q.tab : ids[0];
        var tl = root.querySelector('[role="tablist"]');
        if (tl) tl.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) HS.go(pageId + '?tab=' + b.dataset.tab); });
        mountList(root, LISTS[tab]);
      }
    });
  }
  HS.views.vehicles = grouped('vehicles', ['vehicles'], function () { return 'page.vehicles.d'; });
  HS.views.drivers = grouped('drivers', ['drivers'], function () { return 'page.drivers.d'; });
  HS.views.people = grouped('people', ['people', 'departments'], function () { return 'page.people.d'; });
  HS.views.places = grouped('places', ['places'], function () { return 'page.places.d'; });
  // the tabs bar of single-list pages is hidden by CSS (one tab is not a choice)
  HS.listTable = tableHTML;
  HS.listPage = listPage;
  HS.mountList = mountList;
})();
