'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startup } = require('./test_startup.js');

test('sample controls require both permissions and cancellation never writes', async () => {
  for (const lang of ['en','ar']) {
    const HS=startup(lang);HS.lang=lang;HS.data.state={settings:{}};
    HS.me={perms:['data.import']};assert.ok(!HS.sampleControls().includes('data-sample='));
    HS.me.perms.push('users.manage');assert.ok(HS.sampleControls().includes('data-sample="load"'));
    HS.data.state.settings['smp-centre']={};assert.ok(HS.sampleControls().includes('data-sample="delete"'));
    let click,writes=0;HS.post=async () => {writes++;};HS.ui.confirm=async () => false;
    HS.mountSampleControls({addEventListener:(_,fn) => {click=fn;}});
    click({target:{closest:()=>({dataset:{sample:'delete'}})}});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);
    HS.ui.confirm=async () => true;HS.ui.run=promise=>promise;HS.data.load=async()=>{};HS.rerender=()=>{};
    click({target:{closest:()=>({dataset:{sample:'load'}})}});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,1);
  }
});

test('import preview escapes records, retains selection and saves only after confirmation', async () => {
  const HS=startup('en');HS.lang='en';HS.data.state={settings:{},groups:[{id:'g1',name:'Example group'}]};
  HS.me={perms:['students.manage']};assert.ok(!HS.views.importx.render().includes('data-import-form'));
  HS.me.perms.push('contacts.view');assert.ok(HS.views.importx.render().includes('data-import-form'));
  const handlers={},formHandlers={},file={name:'example.csv'},input={files:[file]},submit={disabled:false};
  const preview={innerHTML:'',addEventListener:(type,fn)=>{handlers[type]=fn;},querySelector:()=>({checked:true})};
  const form={addEventListener:(type,fn)=>{formHandlers[type]=fn;},querySelector:selector=>selector==='[name="file"]'?input:selector==='[type="submit"]'?submit:{value:'S1'}};
  const root={isConnected:true,querySelector:selector=>selector==='[data-import-form]'?form:preview};
  let writes=0,saved,calls=0,confirmed=false;
  HS.api=async (method,url,body,opts)=>{calls++;assert.equal(method,'POST');assert.ok(url.startsWith('/api/import/preview'));assert.equal(body,file);assert.equal(opts.raw,true);
    return {rows:[{name:'<script>bad</script>',code:'10001',gradeCode:'S1',parentMobile:'',groupId:'g1',match:'',warnings:['imp.noGrade']}]};};
  HS.post=async (url,body)=>{writes++;saved=body;assert.equal(url,'/api/c/import');};
  HS.ui.confirm=async()=>confirmed;HS.ui.run=promise=>promise;HS.data.load=async()=>{};
  HS.views.importx.mount(root);formHandlers.submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(writes,0);assert.equal(submit.disabled,false);
  assert.ok(preview.innerHTML.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(!preview.innerHTML.includes('<script>bad'));
  assert.ok(preview.innerHTML.includes(HS.t('imp.noGrade')));
  const button={};const saveEvent={target:{closest:selector=>selector==='[data-import-save]'?button:null}};
  handlers.click(saveEvent);await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);
  confirmed=true;handlers.click(saveEvent);await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,1);
  assert.equal(saved.rows.length,1);assert.equal(saved.rows[0].consent,true);assert.equal(preview.innerHTML,'');
});

test('command centre shows scoped numbers, escaped advice, permission-aware actions and retry', async () => {
  for (const lang of ['ar','en']) {
    const HS=startup(lang);HS.lang=lang;HS.data.state={settings:{},groups:[],rooms:[],teachers:[],students:[],attendance:[]};
    HS.prefs.data={};HS.prefs.save=()=>{};HS.me={username:'desk',perms:['overview.view']};
    let html=HS.views.overview.render({});
    assert.ok(!html.includes('data-k="money"'));assert.ok(!html.includes('quick-btn'));assert.ok(!html.includes('undefined'));
    HS.me.perms.push('money.view','door.use','students.manage');html=HS.views.overview.render({});
    assert.ok(html.includes('data-k="money"'));assert.ok(html.includes('href="#/door"'));assert.ok(html.includes(HS.t('ov.act.student')));
    assert.ok(html.includes(HS.t('ov.guide.title')));                                   // an empty centre gets the guide
    const els={},root={isConnected:true,addEventListener(){},querySelector:s=>els[s]||(els[s]={innerHTML:'',textContent:''})};
    HS.get=async url=>url.includes('advice')
      ?[{id:'groupsFull',level:'info',page:'groups',icon:'layers',vars:{n:1,name:'<b>G</b>'}},{id:'debts',level:'warn',page:'followup?tab=debts',icon:'sheet',vars:{n:2,amount:1500}}]
      :{date:'2026-10-05',checkedIn:12,sessions:[],students:40,risk:3,trend:[],todayTotal:500,owed:150,debtors:2,moneyTrend:[]};
    HS.views.overview.mount(root);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(els['[data-k="checked"]'].textContent,'12');assert.equal(els['[data-k="students"]'].textContent,'40');
    const advice=els['[data-advice]'].innerHTML;
    assert.ok(advice.includes('href="#/followup?tab=debts"'));assert.ok(advice.includes('1,500'));
    assert.ok(advice.includes('&lt;b&gt;G&lt;/b&gt;'));assert.ok(!advice.includes('<b>G</b>'));
    assert.ok(advice.indexOf('adv info')<advice.indexOf('adv warn'));                    // the server's order is kept
    assert.equal(els['[data-adv-count]'].textContent,HS.t('ov.advisor.n',{n:2}));
    HS.get=async()=>{throw new Error('Offline');};HS.views.overview.mount(root);
    await new Promise(resolve=>setImmediate(resolve));assert.ok(els['[data-now]'].innerHTML.includes('data-retry'));
  }
});

test('the home-screen manifest is linked and its icons exist', () => {
  const fs=require('node:fs'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.ok(html.includes('rel="manifest" href="lib/manifest.json"'));assert.ok(html.includes('apple-touch-icon'));
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','lib','manifest.json'),'utf8'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(__dirname,'..',icon.src)),icon.src);
  assert.equal(manifest.display,'standalone');
});

test('centre navigation uses server permissions and supported routes', () => {
  const HS = startup('en');
  assert.deepEqual(Array.from(HS.pages, p => p.id),
    ['overview', 'door', 'students', 'groups', 'money', 'exams', 'followup', 'settlements', 'reports', 'activity', 'settings', 'help']);
  HS.me = { perms: ['students.manage'] };
  const routes = [];
  HS.go = route => routes.push(route);
  HS.quickAdd('student'); HS.quickAdd('payment'); HS.quickAdd('group');
  assert.deepEqual(routes, ['students?new=1']);
  HS.me.perms.push('money.collect');
  HS.quickAdd('payment');
  assert.equal(routes[1], 'money?pay=1');
});

test('palette searches only permitted records and contact searches require contacts.view', () => {
  const HS = startup('en');
  HS.me = { perms: ['students.view'] };
  HS.data.state = { students: [{ id: 'st1', code: '10000', name: 'Example', parentMobile: 'contact-marker' }],
    groups: [{ id: 'g1', name: 'Example group' }] };
  assert.equal(HS.paletteRecords('Example').length, 1);
  assert.equal(HS.paletteRecords('contact-marker').length, 0);
  HS.me.perms.push('contacts.view', 'groups.view');
  assert.equal(HS.paletteRecords('contact-marker').length, 1);
  assert.equal(HS.paletteRecords('Example').length, 2);
  HS.go = route => { assert.equal(route, 'students?id=st1'); };
  HS.paletteRecords('10000')[0].run();
});

test('money, attendance and domain errors are translated and escaped', () => {
  for (const lang of ['ar', 'en']) {
    const HS = startup(lang);
    HS.lang = lang;
    HS.data.state = { settings: { currency: 'EGP' } };
    assert.ok(HS.ui.money(-1250.255).includes('1,250.26'));
    assert.ok(HS.ui.money(-1).includes('bad'));
    assert.ok(HS.ui.att('present').includes(HS.dict[lang]['att.present']));
    assert.equal(HS.ui.errorText({ message: 'raw', data: { key: 'currency.EGP' } }), HS.t('currency.EGP'));
    assert.equal(HS.ui.bdi('<img>'), '<bdi dir="ltr">&lt;img&gt;</bdi>');
    assert.ok(HS.ui.grade('S1', 'bac').includes(HS.dict[lang]['grade.S1']));
  }
});

async function dataSetup() {
  const HS = startup('en', { app: false });
  HS.get = async url => {
    assert.equal(url, '/api/state');
    return { version: 1, settings: {}, students: [{ id: 's1', name: 'Old' }, { id: 's2', name: 'Deleted' }],
      attendance: [], subjects: [{ id: 'sub1', name: 'العربية', nameEn: 'Arabic' }] };
  };
  await HS.data.load();
  HS.rerender = () => {};
  return HS;
}

test('delta merges changed and new rows, removes gone rows and rebuilds lookup indexes', async () => {
  const HS = await dataSetup();
  let paints = 0, emitted = 0;
  HS.rerender = () => { paints++; };
  HS.on('data', () => { emitted++; });
  const calls = [];
  HS.get = async url => {
    calls.push(url);
    return url === '/api/version' ? { version: 2 } : { version: 2,
      rows: { students: [{ id: 's1', name: 'New' }, { id: 's3', name: 'Added' }],
        attendance: [{ id: 'at1', status: 'present' }] }, gone: { students: ['s2'] } };
  };
  await HS.data.refresh();
  assert.deepEqual(calls, ['/api/version', '/api/delta?since=1']);
  assert.equal(HS.data.get('students', 's1').name, 'New');
  assert.equal(HS.data.get('students', 's2'), null);
  assert.equal(HS.data.get('attendance', 'at1').status, 'present');
  assert.equal(HS.data.state.version, 2);
  assert.equal(paints, 1); assert.equal(emitted, 1);
  HS.lang = 'en'; assert.equal(HS.data.subjectName('sub1'), 'Arabic');
  HS.lang = 'ar'; assert.equal(HS.data.subjectName('sub1'), 'العربية');
});

test('delta updates wait for a panel or dialog to close before repainting', async () => {
  const HS = await dataSetup();
  let paints = 0, openPanels = 1;
  HS.rerender = () => { paints++; };
  HS.panel.count = () => openPanels;
  HS.get = async url => url === '/api/version' ? { version: 2 } : { version: 2, rows: {}, gone: {} };
  await HS.data.refresh();
  assert.equal(paints, 0); assert.equal(HS.data.dirty, true);
  HS.emit('overlay-closed'); assert.equal(paints, 0);
  openPanels = 0; HS.overlay.isOpen = true;
  HS.emit('panel-closed'); assert.equal(paints, 0);
  HS.overlay.isOpen = false; HS.emit('overlay-closed');
  assert.equal(paints, 1); assert.equal(HS.data.dirty, false);
});

test('full delta fallback reloads state and concurrent refreshes share one request', async () => {
  const HS = await dataSetup();
  const calls = [];
  HS.get = async url => {
    calls.push(url);
    if (url === '/api/version') return { version: 2 };
    if (url.startsWith('/api/delta')) return { full: true };
    return { version: 2, students: [{ id: 's4', name: 'Reloaded' }] };
  };
  const one = HS.data.refresh(), two = HS.data.refresh();
  assert.equal(one, two);
  await one;
  assert.deepEqual(calls, ['/api/version', '/api/delta?since=1', '/api/state']);
  assert.equal(HS.data.get('students', 's1'), null);
  assert.equal(HS.data.get('students', 's4').name, 'Reloaded');
});

test('failed refresh preserves data and a later request recovers connection', async () => {
  const HS = await dataSetup();
  const events = [];
  HS.on('connection', ok => events.push(ok));
  HS.get = async () => { throw new Error('offline'); };
  await assert.rejects(HS.data.refresh(), /offline/);
  assert.equal(HS.data.get('students', 's1').name, 'Old');
  HS.get = async () => ({ version: 1 });
  await HS.data.refresh();
  assert.deepEqual(events, [false, true]);
});

test('a pending refresh cannot repopulate data after logout', async () => {
  const HS = await dataSetup();
  let complete;
  HS.get = () => new Promise(resolve => { complete = resolve; });
  const request = HS.data.refresh();
  HS.emit('logged-out');
  complete({ version: 2 });
  await request;
  assert.equal(HS.data.state, null);
  assert.equal(HS.data.version, null);
  assert.equal(HS.data.get('students', 's1'), null);
});


test('multi-select fields escape choices, keep selection and validate empty required values', () => {
  const HS = startup('en');
  const field = {key:'subjects', label:'f.subjectIds', type:'multi', required:true,
    options:[{v:'a',l:'<script>'},{v:'b',l:'Beta'}]};
  const html = HS.ui.field(field, ['b']);
  assert.ok(html.includes('multiple'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('value="b" selected'));
  const el = { options:[{value:'a',selected:false},{value:'b',selected:true}] };
  const root = { querySelector:() => el };
  assert.deepEqual(Array.from(HS.ui.read(root,[field]).values.subjects), ['b']);
  el.options[1].selected=false;
  assert.equal(HS.ui.read(root,[field]).missing.length, 1);
});

test('reference list editors hide contacts, preserve mixed settlement terms and escape names', () => {
  const HS = startup('en');
  HS.me = {perms:['teachers.manage']};
  HS.data.state = {teachers:[{id:'t1',name:'<img onerror=attack()>',active:true}], subjects:[]};
  assert.equal(HS.lists.config('teachers').fields.some(f => f.key === 'mobile'), false);
  const html=HS.lists.render('teachers');
  assert.ok(html.includes('&lt;img onerror=attack()&gt;'));
  assert.equal(html.includes('<img onerror='), false);
  const terms={settleModel:'mixed',rentMonth:1000,rentSession:50,rentStudent:2,centerPct:20};
  assert.equal(HS.lists.terms(HS.lists.normalizeTerms(terms)), 4600);
  terms.settleModel='rentSession';
  HS.lists.normalizeTerms(terms);
  assert.equal(HS.lists.terms(terms), 1000);
  let opened=false;
  HS.panel.open=()=>{opened=true;};
  HS.me.perms=[];
  HS.lists.edit('teachers','t1');
  assert.equal(opened,false);
});

test('settings show centre forms and keep save controls permission aware in both languages', () => {
  for (const lang of ['en','ar']) {
    const HS=startup(lang);
    HS.lang=lang;
    HS.data.state={settings:{systemName:'<script>bad</script>'},subjects:[],rooms:[],teachers:[],materials:[]};
    HS.me={perms:[]};
    const ctx={route:{q:{tab:'centre'}}};
    let html=HS.views.settings.render(ctx);
    assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
    assert.equal(html.includes('type="submit"'),false);
    HS.me.perms=['settings.edit','rooms.manage','gateway.manage'];
    html=HS.views.settings.render(ctx);
    assert.ok(html.includes('type="submit"'));
    ctx.route.q.tab='lists';
    html=HS.views.settings.render(ctx);
    assert.ok(html.includes(HS.t('list.subjects')));
    assert.ok(html.includes('data-list-new="rooms"'));
    ctx.route.q.tab='messages';
    html=HS.views.settings.render(ctx);
    assert.equal((html.match(/<textarea/g)||[]).length,12);
    assert.ok(html.includes('data-message-preview'));
    ctx.route.q.tab='gateway';
    html=HS.views.settings.render(ctx);
    assert.ok(html.includes('data-gateway-form'));
    assert.equal(html.includes('officeSecret'),false);
  }
});

test('one-click enrolment uses the same late-join default as the dialog (next month after day 20, monthly groups only)', () => {
  const HS = startup('en');
  const month = { id: 'g1', feeType: 'month' }, session = { id: 'g2', feeType: 'session' };
  const at = day => { HS.ui.today = () => day; return HS.defaultBillFrom; };
  assert.equal(at('2026-10-05')(month), undefined);          // early in the month: the current month is charged
  assert.equal(at('2026-10-20')(month), undefined);
  assert.equal(at('2026-10-21')(month), '2026-11-01');       // late in the month: start with next month
  assert.equal(at('2026-12-28')(month), '2027-01-01');       // across the year end
  assert.equal(at('2026-10-28')(session), undefined);        // only monthly groups have a first billed month
  assert.equal(at('2026-10-28')(null), undefined);
});
