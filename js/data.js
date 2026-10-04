/* Hessa - data layer: the whole state and the trust insights are kept in memory, refreshed when the server
   version changes, and every save goes through HS.data.commit (optimistic version check on the server). */
(function () {
  'use strict';
  var HS = window.HS;
  var D = HS.data = { state: null, insights: {}, version: null, loading: null };
  var index = {};

  function reindex() {
    index = {};
    Object.keys(D.state || {}).forEach(function (k) {
      if (Array.isArray(D.state[k])) { var m = index[k] = {}; D.state[k].forEach(function (r) { m[r.id] = r; }); }
    });
  }
  D.load = function () {
    if (D.loading) return D.loading;
    var wantInsights = HS.can('trips.view');
    D.loading = Promise.all([HS.get('/api/state'), wantInsights ? HS.get('/api/insights') : Promise.resolve({})]).then(function (r) {
      D.state = r[0]; D.insights = r[1] || {}; D.version = r[0].version; reindex(); D.loading = null;
      HS.emit('data', D);
      return D;
    }, function (e) { D.loading = null; throw e; });
    return D.loading;
  };
  D.get = function (entity, id) { return (index[entity] || {})[id] || null; };
  D.list = function (entity) { return (D.state && D.state[entity]) || []; };
  D.name = function (entity, id, field) { var r = D.get(entity, id); return r ? (r[field || 'name'] || '') : ''; };
  D.catName = function (id) { var c = D.get('tripCategories', id); return c ? (HS.lang === 'ar' && c.nameAr ? c.nameAr : c.name) : ''; };
  D.placeName = function (p) { return p ? (HS.lang === 'ar' && p.nameAr ? p.nameAr : p.name) : ''; };
  D.trust = function (id) { return D.insights[id] || { trust: 'grey', reasons: [] }; };

  /* one save = one change in the history. ops: [{e, id, op:'put'|'del', row, ver}] */
  D.commit = function (label, ops) {
    return HS.post('/api/commit', { label: label, ops: ops }).then(function (r) { return D.load().then(function () { return r; }); }, function (e) {
      if (e.code === 409) { HS.toast(HS.t('data.conflict'), 'bad', 5000); D.load().then(function () { HS.rerender(); }); }
      throw e;
    });
  };
  D.remove = function (entity, id, label) {
    var r = D.get(entity, id);
    return D.commit(label || HS.t('data.deleted'), [{ e: entity, id: id, op: 'del', ver: r ? r.ver : undefined }]);
  };
  D.save = function (entity, id, row, label) {
    var cur = D.get(entity, id), clean = {};
    Object.keys(row).forEach(function (k) { if (k !== 'ver' && k !== 'id') clean[k] = row[k]; });
    return D.commit(label, [{ e: entity, id: id, op: 'put', ver: cur ? cur.ver : null, row: clean }]);
  };
  D.newId = function (prefix) {
    var a = new Uint8Array(7); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return prefix + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };

  /* follow other users and other PCs: reload when the version changed, repaint when nothing is being edited */
  var timer = null;
  D.startPolling = function () {
    clearInterval(timer);
    timer = setInterval(function () {
      HS.get('/api/version').then(function (v) {
        if (D.version !== null && v.version !== D.version) {
          D.load().then(function () { if (!HS.overlay.isOpen && !HS.panel.count()) HS.rerender(); else D.dirty = true; });
        }
      }, function () { /* offline or signed out: HS.api handles 401 */ });
    }, 4000);
  };
  D.stopPolling = function () { clearInterval(timer); };
  HS.on('overlay-closed', function () { if (D.dirty && !HS.panel.count()) { D.dirty = false; HS.rerender(); } });
})();
