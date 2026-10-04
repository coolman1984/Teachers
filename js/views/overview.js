/* Hessa - live centre overview and safe sample-centre entry point. */
(function () {
  'use strict';
  var HS=window.HS, U=HS.ui;
  HS.sampleControls=function () {
    var active=(HS.data.state||{}).settings && HS.data.state.settings['smp-centre'];
    return '<section class="card"><h2>' + HS.esc(HS.t('sample.title')) + '</h2><p>' + HS.esc(HS.t(active?'sample.active':'sample.help')) + '</p>' +
      (HS.can('data.import') && HS.can('users.manage') ? '<button class="btn '+(active?'danger':'primary')+'" data-sample="'+(active?'delete':'load')+'">'+
        HS.esc(HS.t(active?'sample.delete':'sample.load'))+'</button>' : '') +
      (HS.can('students.manage') && HS.can('contacts.view') ? ' <a class="btn" href="#/students/import">'+HS.esc(HS.t('sample.importReal'))+'</a>' : '') + '</section>';
  };
  HS.mountSampleControls=function (root) {
    root.addEventListener('click',function (e) {
      var button=e.target.closest('[data-sample]'); if (!button) return;
      var removing=button.dataset.sample==='delete';
      U.confirm({title:HS.t(removing?'sample.delete':'sample.load'),body:HS.t(removing?'sample.deleteConfirm':'sample.loadConfirm'),danger:removing})
        .then(function (ok) { if (!ok) return;
          return U.run(HS.post('/api/c/sample'+(removing?'/delete':''),{}),'common.saved',button).then(function () {
            if (HS.dataTab) HS.dataTab.reset(); return HS.data.load();
          }).then(function () { HS.rerender(); });
        }).catch(function () {});
    });
  };
  function metrics(d) {
    var values=[['ov.checked',d.checkedIn],['ov.sessions',d.sessions.length],['ov.students',d.students],['ov.risk',d.risk]];
    if (d.todayTotal!==undefined) values.push(['ov.money',U.money(d.todayTotal)],['ov.owed',U.money(d.owed)]);
    return '<div class="grid">'+values.map(function (v) {return '<section class="card"><h2>'+HS.esc(HS.t(v[0]))+'</h2><div class="num">'+(typeof v[1]==='string'?v[1]:U.num(v[1]))+'</div></section>';}).join('')+'</div>';
  }
  HS.views.overview=HS.withData({
    render:function () { return '<div class="page-head"><div class="titles"><h1>'+HS.esc(HS.t('nav.overview'))+'</h1><p>'+HS.esc(HS.t('page.overview.d'))+'</p></div></div>'+
      HS.sampleControls()+'<div data-dashboard data-tour="kpis" role="status">'+HS.esc(HS.t('common.loading'))+'</div>'; },
    mount:function (root) {
      HS.mountSampleControls(root);
      var target=root.querySelector('[data-dashboard]');
      function load() {
        HS.get('/api/c/dashboard').then(function (d) {
          if (root.isConnected===false) return;
          target.innerHTML=metrics(d)+'<section class="card"><h2>'+HS.esc(HS.t('ov.today'))+'</h2>'+U.table([
            {h:'f.name',cell:function (s) {return HS.esc(HS.data.groupName(s.groupId));}},
            {h:'f.time',cell:function (s) {return U.bdi(s.start+'–'+s.end);}},
            {h:'ov.attendance',cell:function (s) {return U.num(s.present)+' / '+U.num(s.enrolled);}}
          ],d.sessions)+'</section><section class="card"><h2>'+HS.esc(HS.t('ov.trend'))+'</h2>'+U.table([
            {h:'f.time',cell:function (r) {return U.day(r.date);}}, {h:'ov.attendance',cell:function (r) {return U.num(r.visits);}}
          ],d.trend)+'</section>';
        }).catch(function (e) { if (root.isConnected===false) return; target.innerHTML=U.empty('alert',U.errorText(e),'','<button class="btn" data-dashboard-retry>'+HS.esc(HS.t('common.retry'))+'</button>'); });
      }
      root.addEventListener('click',function (e) {if(e.target.closest('[data-dashboard-retry]')) load();});load();
    }
  });
})();
