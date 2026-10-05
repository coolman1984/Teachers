/* Hessa - data layer: the startup state and incremental changes are kept in memory, refreshed when the server
   version changes, and every save goes through HS.data.commit (optimistic version check on the server). */
(function () {
  'use strict';
  var HS = window.HS;
  var D = HS.data = { state: null, version: null, loading: null, connected: true };
  var index = {}, generation = 0;

  function reindex() {
    index = {};
    Object.keys(D.state || {}).forEach(function (k) {
      if (Array.isArray(D.state[k])) { var m = index[k] = {}; D.state[k].forEach(function (r) { m[r.id] = r; }); }
    });
  }
  D.load = function () {
    if (D.loading) return D.loading;
    var epoch = generation;
    D.loading = HS.get('/api/state').then(function (state) {
      if (epoch !== generation) return D;
      D.state = state; D.version = state.version; reindex(); D.loading = null;
      HS.emit('data', D);
      return D;
    }, function (e) { if (epoch === generation) D.loading = null; throw e; });
    return D.loading;
  };
  D.get = function (entity, id) { return (index[entity] || {})[id] || null; };
  D.list = function (entity) { return (D.state && D.state[entity]) || []; };
  D.name = function (entity, id, field) { var r = D.get(entity, id); return r ? (r[field || 'name'] || '') : ''; };
  D.teacherName = function (id) { return D.name('teachers', id); };
  D.groupName = function (id) { return D.name('groups', id); };
  D.subjectName = function (id) {
    var s = D.get('subjects', id); return s ? (HS.lang === 'en' ? s.nameEn || s.name : s.name) : '';
  };

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

  /* One refresh at a time; preserve open editors while accepting other PCs' writes. */
  var timer = null, refreshing = null;
  function repaint() {
    // busy screens (the door while someone types, the live overview) refresh their own parts instead of a full redraw
    if (HS.currentView && HS.currentView.selfRefresh && HS.data.state) { D.dirty = false; HS.emit('data-changed', D); return; }
    if (!HS.overlay.isOpen && !HS.panel.count()) { D.dirty = false; HS.rerender(); }
    else D.dirty = true;
  }
  function connection(ok) {
    if (D.connected !== ok) {
      D.connected = ok;
      var h = document.documentElement;   // css/base.css shows the offline bar and dims the save buttons
      if (h && h.setAttribute) { if (ok) h.removeAttribute('data-offline'); else h.setAttribute('data-offline', ''); }
      HS.emit('connection', ok);
    }
  }
  D.refresh = function () {
    if (refreshing) return refreshing;
    if (D.loading) return D.loading;
    var epoch = generation;
    refreshing = HS.get('/api/version').then(function (v) {
      if (epoch !== generation) return;
      connection(true);
      HS.sync = v.sync || null; HS.emit('sync', HS.sync);   // the top-bar light (js/views/devices.js) rides on the poll that already runs
      if (D.version === null || v.version === D.version) return;
      return HS.get('/api/delta?since=' + encodeURIComponent(D.version)).then(function (d) {
        if (epoch !== generation) return;
        if (d.full) return D.load().then(function () { if (epoch === generation) repaint(); });
        Object.keys(d.rows || {}).forEach(function (e) {
          var changed = {};
          (d.rows[e] || []).forEach(function (r) { changed[r.id] = r; });
          var list = D.list(e).map(function (r) {
            if (!changed[r.id]) return r;
            var row = changed[r.id]; delete changed[r.id]; return row;
          });
          Object.keys(changed).forEach(function (id) { list.push(changed[id]); });
          D.state[e] = list;
        });
        Object.keys(d.gone || {}).forEach(function (e) {
          D.state[e] = D.list(e).filter(function (r) { return d.gone[e].indexOf(r.id) < 0; });
        });
        D.version = D.state.version = d.version;
        reindex(); HS.emit('data', D); repaint();
      });
    }).catch(function (e) {
      if (epoch === generation) connection(false);
      throw e;
    }).then(function (r) { if (epoch === generation) refreshing = null; return r; },
      function (e) { if (epoch === generation) refreshing = null; throw e; });
    return refreshing;
  };
  D.startPolling = function () {
    clearInterval(timer); D.polling = true;
    timer = setInterval(function () { D.refresh().catch(function () {}); }, 2000);
  };
  D.stopPolling = function () { clearInterval(timer); timer = null; D.polling = false; connection(true); };
  function flushDirty() { if (D.dirty && !HS.overlay.isOpen && !HS.panel.count()) repaint(); }
  HS.on('overlay-closed', flushDirty);
  HS.on('panel-closed', flushDirty);
  HS.on('logged-out', function () {
    generation++; D.stopPolling(); D.state = null; D.version = null; D.loading = null; refreshing = null;
    D.dirty = false; index = {};
  });
})();
