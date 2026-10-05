/* Hessa - centre reference lists, with audited version-checked edits. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui, D = HS.data;
  var L = HS.lists = {};
  function field(key, type, extra) {
    var f = { key: key, label: 'f.' + key, type: type || 'text' };
    Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; }); return f;
  }
  function choices(values, prefix) { return values.map(function (v) { return { v: v, l: HS.t(prefix + v) }; }); }
  L.config = function (entity) {
    var name = field('name', 'text', { required: true }), active = field('active', 'bool');
    var color = field('color', 'select', { options: choices(['signal', 'ok', 'info', 'warn'], 'color.') });
    var config = {
      subjects: { perm: 'rooms.manage', fields: [name, field('nameEn'), color, field('order', 'number'), active] },
      rooms: { perm: 'rooms.manage', fields: [name, field('capacity', 'number'), field('costPerHour', 'number'), field('notes', 'textarea'), active] },
      teachers: { perm: 'teachers.manage', fields: [name, field('mobile', 'tel', { ltr: true }),
        field('subjectIds', 'multi', { options: D.list('subjects').map(function (s) { return { v: s.id, l: D.subjectName(s.id) }; }) }),
        field('gradeCodes', 'multi', { options: choices(['P1','P2','P3','P4','P5','P6','M1','M2','M3','S1','S2','S3'], 'grade.') }),
        field('settleModel', 'select', { blank: false, options: choices(['centerPct','rentSession','rentStudent','rentMonth','mixed'], 'settle.model.') }),
        field('centerPct', 'number'), field('rentSession', 'number'), field('rentStudent', 'number'), field('rentMonth', 'number'),
        color, field('bio', 'textarea'), active] },
      materials: { perm: 'materials.manage', fields: [name, field('teacherId', 'ref', { entity: 'teachers' }),
        field('gradeCode', 'select', { options: choices(['P1','P2','P3','P4','P5','P6','M1','M2','M3','S1','S2','S3'], 'grade.') }),
        field('price', 'number'), field('cost', 'number'), field('stock', 'number'), active] }
    };
    if (config[entity] && !HS.can('contacts.view')) config[entity].fields = config[entity].fields.filter(function (f) { return f.key !== 'mobile'; });
    return config[entity];
  };
  L.terms = function (row) { return Number(row.rentMonth || 0) + Number(row.rentSession || 0) * 20 + Number(row.rentStudent || 0) * 300 + Number(row.centerPct || 0) * 100; };
  L.normalizeTerms = function (row) {
    ['centerPct','rentSession','rentStudent','rentMonth'].forEach(function (k) {
      if (row.settleModel !== 'mixed' && row.settleModel !== k) row[k] = 0;
    }); return row;
  };
  L.edit = function (entity, id) {
    var cfg = L.config(entity); if (!cfg || !HS.can(cfg.perm)) return;
    var cur = D.get(entity, id), values = cur || { active: true, settleModel: 'centerPct' };
    HS.panel.open({ title: HS.t('list.' + entity), body: '<form data-list-form>' + U.fields(cfg.fields, values) +
      (entity === 'teachers' ? '<p data-terms-preview class="notice" role="status"></p>' : '') + '</form>',
      footer: '<button class="btn primary" data-save>' + HS.esc(HS.t('common.save')) + '</button>' +
        (cur ? '<button class="btn danger" data-delete>' + HS.esc(HS.t('common.delete')) + '</button>' : '') +
        (cur && HS.can('logs.view') ? '<button class="btn ghost" data-lhist>' + HS.icon('activity', 'sm') + HS.esc(HS.t('stu.tab.history')) + '</button>' : ''),
      mount: function (root) {
        function terms() {
          if (entity !== 'teachers') return;
          var row = U.read(root, cfg.fields).values, model = row.settleModel;
          ['centerPct','rentSession','rentStudent','rentMonth'].forEach(function (key) {
            root.querySelector('[name="' + key + '"]').closest('.field').hidden = model !== 'mixed' && key !== model;
          });
          root.querySelector('[data-terms-preview]').textContent = HS.t('settle.example', { amount: L.terms(L.normalizeTerms(row)) });
        }
        root.addEventListener('input', terms); root.addEventListener('change', terms); terms();
        var hist = root.querySelector('[data-lhist]');
        if (hist) hist.addEventListener('click', function () { HS.audit.historyDialog(entity, id); });
        root.querySelector('[data-save]').addEventListener('click', function (event) {
          var read = U.read(root, cfg.fields);
          if (read.missing.length) { HS.toast(HS.t('form.missing', { f: read.missing.join(', ') }), 'bad'); return; }
          var row = Object.assign({}, cur || {}, read.values);
          if (entity === 'teachers') L.normalizeTerms(row);
          U.run(D.save(entity, id || D.newId(entity.slice(0, 2)), row, 'Save ' + entity), 'common.saved', event.currentTarget)
            .then(function () { HS.panel.close(); HS.rerender(); }).catch(function () {});
        });
        root.querySelector('[data-list-form]').addEventListener('submit', function (e) { e.preventDefault(); root.querySelector('[data-save]').click(); });
        var del = root.querySelector('[data-delete]');
        if (del) del.addEventListener('click', function () {
          U.confirm({ title: HS.t('common.delete'), body: HS.t('list.deleteConfirm', { name: cur.name }), danger: true }).then(function (ok) {
            if (ok) U.run(D.remove(entity, id, 'Delete ' + entity), 'list.deleted.toast', del).then(function () { HS.panel.close(); HS.rerender(); }).catch(function () {});
          });
        });
      }
    });
  };
  L.render = function (entity) {
    var cfg = L.config(entity), rows = D.list(entity); if (!cfg) return '';
    var can = HS.can(cfg.perm);
    return '<div class="toolbar"><h2>' + HS.esc(HS.t('list.' + entity)) + '</h2><span class="grow"></span>' +
      (can ? '<button class="btn primary" data-list-new="' + entity + '">' + HS.esc(HS.t('common.new')) + '</button>' : '') + '</div>' +
      (rows.length ? U.table([{ h: 'f.name', cell: function (r) { return can ? '<button class="btn ghost" data-list-edit="' + HS.esc(r.id) + '" data-entity="' + entity + '">' + HS.esc(r.name) + '</button>' : HS.esc(r.name); } },
        { h: 'f.active', cell: function (r) { return HS.esc(HS.t(r.active === false ? 'f.inactive' : 'f.activeYes')); } }], rows)
        : U.empty('layers', HS.t('list.empty'), HS.t('list.emptyHelp')));
  };
  L.mount = function (root) {
    root.addEventListener('click', function (e) {
      var add = e.target.closest('[data-list-new]'), edit = e.target.closest('[data-list-edit]');
      if (add) L.edit(add.dataset.listNew); if (edit) L.edit(edit.dataset.entity, edit.dataset.listEdit);
    });
  };
})();
