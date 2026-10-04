/* Hessa - spreadsheet import is previewed and selected before a single audited save. */
(function () {
  'use strict';
  var HS=window.HS,U=HS.ui;
  var grades=['P1','P2','P3','P4','P5','P6','M1','M2','M3','S1','S2','S3'];
  function options(rows,value) {return '<option value="">–</option>'+rows.map(function (r) {return '<option value="'+HS.esc(r.v)+'"'+(r.v===value?' selected':'')+'>'+HS.esc(r.l)+'</option>';}).join('');}
  var page=HS.withData({
    render:function () {
      var head='<div class="page-head"><div class="titles"><h1>'+HS.esc(HS.t('nav.importx'))+'</h1><p>'+HS.esc(HS.t('page.importx.d'))+'</p></div></div>';
      if(!HS.can('students.manage')||!HS.can('contacts.view')) return head+U.empty('lock',HS.t('imp.permission'),'');
      return head+'<section class="card"><p>'+HS.esc(HS.t('imp.help'))+'</p><form data-import-form>'+U.field({key:'file',label:'imp.file',type:'file'})+
        U.field({key:'gradeCode',label:'imp.defaultGrade',type:'select',options:grades.map(function (v) {return {v:v,l:HS.t('grade.'+v)};})})+
        '<button type="submit" class="btn primary">'+HS.esc(HS.t('imp.preview'))+'</button></form></section><section class="card" data-import-preview aria-live="polite">'+HS.esc(HS.t('imp.help'))+'</section>';
    },
    mount:function (root) {
      var form=root.querySelector('[data-import-form]'); if(!form) return;
      var fileInput=form.querySelector('[name="file"]');fileInput.accept='.csv,.tsv,.xlsx,.xls,.ods';
      var preview=root.querySelector('[data-import-preview]'),rows=[],pageIndex=0,consent=false;
      function groupOptions(value) {return options(HS.data.list('groups').map(function (g) {return {v:g.id,l:g.name};}),value);}
      function input(r,i,key) {return '<input class="input" data-field="'+key+'" aria-label="'+HS.esc(HS.t('f.'+key))+'" value="'+HS.esc(r[key]||'')+'"'+(key==='parentMobile'?' dir="ltr"':'')+'>';}
      function draw() {
        var start=pageIndex*100,slice=rows.slice(start,start+100);
        preview.innerHTML='<h2>'+HS.esc(HS.t('imp.summary',{n:rows.filter(function (r) {return !r.match;}).length,m:rows.filter(function (r) {return r.match;}).length}))+'</h2>'+U.table([
          {h:'imp.select',cell:function (r) {return '<input type="checkbox" data-selected aria-label="'+HS.esc(HS.t('imp.select'))+'"'+(r.selected?' checked':'')+'>'; }},
          {h:'f.name',cell:function (r) {return input(r,0,'name');}},
          {h:'f.code',cell:function (r) {return input(r,0,'code');}},
          {h:'f.gradeCode',cell:function (r) {return '<select class="input" data-field="gradeCode" aria-label="'+HS.esc(HS.t('f.gradeCode'))+'">'+options(grades.map(function(v){return {v:v,l:HS.t('grade.'+v)};}),r.gradeCode)+'</select>';}},
          {h:'f.parentMobile',cell:function (r) {return input(r,0,'parentMobile');}},
          {h:'f.group',cell:function (r) {return '<select class="input" data-field="groupId" aria-label="'+HS.esc(HS.t('f.group'))+'">'+groupOptions(r.groupId)+'</select>';}},
          {h:'imp.result',cell:function (r) {return HS.esc(HS.t(r.match?'imp.matched':'imp.new'))+(r.warnings||[]).map(function(k){return '<p class="warn">'+HS.esc(HS.t(k))+'</p>';}).join('');}}
        ],slice,{rowAttr:function(r){return 'data-row="'+rows.indexOf(r)+'"';}})+
          '<div class="toolbar"><button class="btn" data-import-prev'+(pageIndex===0?' disabled':'')+'>'+HS.esc(HS.t('imp.previous'))+'</button><span>'+U.num(start+1)+'–'+U.num(start+slice.length)+' / '+U.num(rows.length)+'</span>'+
          '<button class="btn" data-import-next'+(start+100>=rows.length?' disabled':'')+'>'+HS.esc(HS.t('imp.next'))+'</button></div>'+U.field({key:'consent',label:'imp.consent',type:'bool'},consent)+
          '<button class="btn primary" data-import-save>'+HS.esc(HS.t('imp.save'))+'</button>';
      }
      form.addEventListener('submit',function (e) {
        e.preventDefault();var file=fileInput.files[0];if(!file)return;
        var button=form.querySelector('[type="submit"]');button.disabled=true;
        rows=[];preview.innerHTML=HS.esc(HS.t('common.loading'));
        HS.api('POST','/api/import/preview?name='+encodeURIComponent(file.name)+'&grade='+encodeURIComponent(form.querySelector('[name="gradeCode"]').value),file,{raw:true})
          .then(function(data){if(root.isConnected===false)return;rows=data.rows.map(function(r){r.selected=true;return r;});pageIndex=0;draw();})
          .catch(function(err){if(root.isConnected===false)return;preview.innerHTML=U.empty('alert',U.errorText(err),'');}).then(function(){button.disabled=false;});
      });
      preview.addEventListener('change',function(e){if(e.target.name==='consent'){consent=e.target.checked;return;}var tr=e.target.closest('[data-row]');if(!tr)return;var row=rows[Number(tr.dataset.row)];
        if(e.target.hasAttribute('data-selected'))row.selected=e.target.checked;
        else if(e.target.dataset.field){row[e.target.dataset.field]=e.target.value;if(e.target.dataset.field==='name'||e.target.dataset.field==='parentMobile')row.match='';}
      });
      preview.addEventListener('click',function(e){
        if(e.target.closest('[data-import-prev]')){pageIndex--;draw();return;}if(e.target.closest('[data-import-next]')){pageIndex++;draw();return;}
        var button=e.target.closest('[data-import-save]');if(!button)return;
        consent=preview.querySelector('[name="consent"]').checked;
        var chosen=rows.filter(function(r){return r.selected;}).map(function(r){return Object.assign({},r,{consent:consent});});
        if(!chosen.length||chosen.some(function(r){return !r.name||!r.gradeCode;})){HS.toast(HS.t('imp.missing'),'bad');return;}
        U.confirm({title:HS.t('imp.save'),body:HS.t('imp.confirm',{n:chosen.length})}).then(function(ok){if(!ok)return;
          return U.run(HS.post('/api/c/import',{rows:chosen,enrol:true}),'common.saved',button).then(function(){rows=[];preview.innerHTML='';return HS.data.load();});
        }).catch(function(){});
      });
    }
  });
  HS.views.importx=page;
})();
