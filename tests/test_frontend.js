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
    ['overview', 'door', 'students', 'groups', 'money', 'exams', 'followup', 'settlements', 'reports', 'watch', 'activity', 'devices', 'settings', 'help']);
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

test('forms keep fields apart: list drawers and settings put fields in a spaced container, switches are whole rows', () => {
  // the subject drawer and the rules tab put every field straight into a plain <form>: each label touched the box above it
  for (const lang of ['en','ar']) {
    const HS = startup(lang); HS.lang = lang;
    HS.me = {perms:['rooms.manage','settings.edit']}; HS.data.state = {settings:{}, subjects:[]};
    const sw = HS.ui.field({key:'active', label:'f.active', type:'bool', help:'set.doorSounds.h'}, true);
    assert.ok(sw.includes('class="toggle-row" for="f-active"'));                      // the whole row toggles
    assert.ok(sw.includes('aria-describedby="f-active-h"') && sw.includes('id="f-active-h"'));
    assert.ok(sw.indexOf('class="lbl"') < sw.indexOf('class="switch"'));             // words first, switch at the end
    let opened; HS.panel.open = o => { opened = o; };
    HS.lists.edit('subjects');
    assert.ok(opened.body.startsWith('<form class="fields" data-list-form>'));
    const rules = HS.views.settings.render({route:{q:{tab:'rules'}}});
    assert.equal((rules.match(/class="form-sec"/g) || []).length, 3);
    for (const id of ['door','school','risk']) assert.ok(rules.includes(HS.esc(HS.t('set.sec.' + id))));
    assert.ok(rules.includes('class="fields cols"') && rules.includes('class="form-foot"'));
    assert.ok(rules.includes(HS.esc(HS.t('set.lateMinutes.h'))));
    assert.ok(!rules.includes('set.sec.') && !rules.includes('.h<'));                 // no raw dictionary keys
    assert.ok(HS.views.settings.render({route:{q:{tab:'messages'}}}).includes('class="fields cols pairs"'));
  }
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
    assert.ok(html.includes('data-gw-root'));               // the guided setup page (filled from /api/gateway after mount)
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

test('devices page shows PCs and decisions escaped once, admin-only controls, and the light follows the user', async () => {
  for (const lang of ['en', 'ar']) {
    const HS = startup(lang); HS.lang = lang;
    HS.data.state = { students: [], groups: [], teachers: [], rooms: [], subjects: [] }; HS.data.reindex && HS.data.reindex();
    HS.me = { username: 'owner', perms: ['users.manage'] };
    const now = new Date().toISOString().slice(0, 19);
    const dev = { me: { name: 'Centre <PC>', role: 'authority', backup: false, port: 8463, addresses: ['192.168.1.10'] }, summary: { state: 'ok', online: 1, peers: 1, files_missing: 0 },
      nodes: [{ id: 'a', name: 'Centre <PC>', self: true, authority: true, status: 'active', enrolled_at: now },
              { id: 'b', name: 'R&D door', self: false, authority: false, status: 'active', enrolled_at: now, status_now: { state: 'online', agree: true, last_ok: now } }],
      alerts: [{ key: 'k', kind: 'divergence', severity: 'error', last_ts: now, detail: 'Data <differs>', count: 2 }], missing_files: [], last_verify: { ts: now, ok: true }, key_saved: '', adding_until: '', requests: [] };
    const conf = [{ entity: 'students', id: 's1', title: 'Students', name: 'Ann & Bob', kind: 'conflict', detail: { name: [
      { value: 'Ann', win: true, by: { actor: 'A&B', node_name: 'Desk', ts: now } }, { value: 'Anne', win: false, by: { actor: 'Tea', node_name: 'Door', ts: now } }] } }];
    HS.$ = () => null;                              // no DOM here: the top-bar light has nothing to paint
    HS.get = async url => url === '/api/devices' ? dev : conf;
    HS.post = async () => ({});
    const nodes = { '[data-sub]': {}, '[data-tabs]': {}, '[data-body]': {} };
    const root = { isConnected: true, querySelector: sel => nodes[sel], addEventListener() {} };
    HS.views.devices.mount(root, { route: { q: {} } });
    await new Promise(r => setImmediate(r));
    const html = nodes['[data-body]'].innerHTML;
    assert.ok(html.includes('R&amp;D door'), lang); assert.ok(!html.includes('&amp;amp;'), lang);
    assert.ok(html.includes('data-add') && html.includes('data-key'), 'the centre PC can add a PC and must save the key');
    assert.ok(html.includes('data-revoke="b"') && !html.includes('data-revoke="a"'), 'a PC can remove the others, never itself');
    assert.ok(html.includes('192.168.1.10'));
    assert.ok(nodes['[data-sub]'].innerHTML.includes('Centre &lt;PC&gt;'));
    assert.ok(nodes['[data-tabs]'].innerHTML.includes('(1)'), 'one warning is counted on its tab');
    // the decisions tab: names and values escaped once, one button per value
    const n2 = { '[data-sub]': {}, '[data-tabs]': {}, '[data-body]': {} };
    HS.views.devices.mount({ isConnected: true, querySelector: sel => n2[sel], addEventListener() {} }, { route: { q: { tab: 'conflicts' } } });
    await new Promise(r => setImmediate(r));
    assert.ok(n2['[data-body]'].innerHTML.includes('Ann &amp; Bob') && n2['[data-body]'].innerHTML.includes('A&amp;B'));
    assert.ok(!n2['[data-body]'].innerHTML.includes('&amp;amp;'));
    assert.equal((n2['[data-body]'].innerHTML.match(/data-keep=/g) || []).length, 2);
    // a backup centre PC cannot save the key or remove the centre PC
    dev.me.backup = true; dev.nodes[0].self = false; dev.nodes[0].status_now = { state: 'online' }; dev.nodes[1].self = true;
    const n3 = { '[data-sub]': {}, '[data-tabs]': {}, '[data-body]': {} };
    HS.views.devices.mount({ isConnected: true, querySelector: sel => n3[sel], addEventListener() {} }, { route: { q: {} } });
    await new Promise(r => setImmediate(r));
    assert.ok(!n3['[data-body]'].innerHTML.includes('data-key') && !n3['[data-body]'].innerHTML.includes('data-add'));
    assert.ok(!n3['[data-body]'].innerHTML.includes('data-revoke="a"'));
  }
});

test('the sync light: administrators see every state, others only a problem, a single PC shows nothing', () => {
  const HS = startup('en'); HS.lang = 'en'; const el = { hidden: true, className: '', innerHTML: '', title: '', setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; } };
  HS.$ = sel => sel === '#sync-pill' ? el : null;
  const light = state => { HS.sync = state ? { state } : null; HS.emit('sync', HS.sync); return el; };
  HS.me = { perms: ['users.manage'] };
  assert.equal(light('single').hidden, true);
  assert.equal(light('ok').hidden, false); assert.ok(el.className.includes('s-ok') && el.href === '#/devices');
  assert.ok(light('offline').innerHTML.includes('Working on this PC'));
  HS.me = { perms: ['students.view'] };
  assert.equal(light('ok').hidden, true); assert.equal(light('offline').hidden, true);
  assert.equal(light('problem').hidden, false); assert.ok(el.innerHTML.includes('Tell the administrator') && el.href === undefined);
});

test('the history is readable in both languages: fields, values, hidden numbers, ids as names - escaped once', async () => {
  for (const lang of ['en', 'ar']) {
    const HS = startup(lang); HS.lang = lang; const A = HS.audit;
    HS.get = async () => ({ version: 1, teachers: [{ id: 't1', name: 'Mr <T>' }], students: [], groups: [], rooms: [], subjects: [] }); await HS.data.load();
    const upd = { op: 'update', entity: 'students', entity_id: 's1', changes: JSON.stringify({ name: ['Ann', 'Anne'], nameKey: ['ann', 'anne'], parentMobile: ['•••', '•••'], active: [true, false], teacherId: [null, 't1'] }) };
    const rows = A.rows(upd);
    assert.deepEqual(Array.from(rows, r => r.f), ['name', 'parentMobile', 'active', 'teacherId'], 'derived fields (nameKey) are not shown');
    const html = A.detailHTML(upd);
    assert.ok(html.includes(HS.esc(A.field('name'))) && html.includes(HS.t('act.col.before')) && html.includes(HS.t('act.col.after')));
    assert.ok(html.includes('Mr &lt;T&gt;') && !html.includes('&amp;lt;'), 'the id shows as the name, escaped once');
    assert.ok(html.includes(HS.t('act.hidden.s')) && !html.includes('01'), 'a hidden phone says so and shows nothing');
    assert.ok(html.includes(HS.t('common.no')) && html.includes(HS.t('dev.empty')));
    assert.ok(A.summary(upd).includes(A.field('name')));
    assert.equal(A.summary({ op: 'insert' }), HS.t('act.sum.added')); assert.equal(A.summary({ op: 'delete' }), HS.t('act.sum.deleted'));
    const ins = { op: 'insert', entity: 'payments', entity_id: 'p', after: JSON.stringify({ id: 'p', no: 'A-1', amount: 150, method: 'cash', note: '', voidOf: null, feeHistory: [{ from: '2026-01-01', fee: 1 }] }) };
    const inRows = A.rows(ins);
    assert.deepEqual(Array.from(inRows, r => r.f), ['no', 'amount', 'method', 'feeHistory'], 'empty fields and bookkeeping are left out');
    assert.ok(A.detailHTML(ins).includes('150') && A.detailHTML(ins).includes(HS.t('pay.method.cash')) && A.detailHTML(ins).includes(HS.t('act.opaque')));
    assert.equal(A.name(ins), 'A-1');
    assert.ok(A.lines(upd).some(l => l.includes('→')), 'the spreadsheet gets "before → after" text');
    assert.equal(A.entity('payments'), HS.t('ent.payments')); assert.equal(A.entity('mystery'), 'mystery'); assert.equal(A.field('mystery'), 'mystery');
  }
});

test('a spreadsheet never runs a typed name as a formula, and keeps numbers, phones and Arabic', () => {
  const HS = startup('en'); const csv = HS.ui.csv([['=HYPERLINK("http://x")', '+2010123456', '-5', '@cmd', 'علي, حسن', 'plain']]);
  assert.ok(csv.startsWith('﻿'));
  const line = csv.slice(1);
  assert.ok(line.startsWith('"\'=HYPERLINK(""http://x"")"'), line);
  assert.ok(line.includes(',+2010123456,-5,\'@cmd,"علي, حسن",plain'), line);
});

test('the activity log: tabs follow the permissions, entries are escaped once, hidden numbers and failures are marked', async () => {
  for (const lang of ['en', 'ar']) {
    const HS = startup(lang); HS.lang = lang;
    HS.data.state = { students: [], groups: [], teachers: [], rooms: [], subjects: [] }; HS.data.reindex && HS.data.reindex();
    const nodes = {}, listeners = {};
    const el = sel => nodes[sel] || (nodes[sel] = { innerHTML: '', hidden: false });
    const root = { isConnected: true, querySelector: el, addEventListener(t, fn) { listeners[t] = fn; } };
    const entry = { ts: '2026-10-05T10:00:00', user: 'A&B', node_name: 'Door <PC>', label: 'Rename <student>', entity: 'students', entity_id: 's1', op: 'update',
      changes: JSON.stringify({ name: ['Ann', 'Anne'], parentMobile: ['•••', '•••'] }), before: null, after: null, kind: 'data' };
    const calls = [];
    HS.get = async url => { calls.push(url); return url.startsWith('/api/security')
      ? { total: 2, rows: [{ ts: '2026-10-05T09:00:00', user: 'boss', ip: '10.0.0.5', event: 'login-failed', target: 'x<y', detail: 'bad', node_name: 'Centre' },
                           { ts: '2026-10-05T08:00:00', user: 'boss', ip: '10.0.0.5', event: 'login', target: 'boss', detail: '', node_name: 'Centre' }], users: ['boss'], nodes: [{ id: 'n', name: 'Centre' }] }
      : { total: 150, rows: [entry], users: ['A&B'], nodes: [{ id: 'n1', name: 'Door <PC>' }, { id: 'n2', name: 'Desk' }] }; };
    HS.me = { perms: ['logs.view'], admin: false };
    HS.views.activity.mount(root);
    await new Promise(r => setImmediate(r));
    let body = nodes['[data-body]'].innerHTML;
    assert.equal(nodes['[data-tabs]'].innerHTML, '', 'a person who may only read the changes sees no tabs');
    assert.ok(body.includes('Rename &lt;student&gt;') && body.includes('A&amp;B') && body.includes('Door &lt;PC&gt;'), lang);
    assert.ok(!body.includes('&amp;amp;') && !body.includes('<student>'));
    assert.ok(body.includes('data-more') && body.includes(HS.esc(HS.t('act.count', { shown: '1', total: '150' }))), 'more entries can be loaded');
    assert.ok(body.includes(HS.t('act.hidden.s')), 'a hidden phone is marked');
    assert.ok(nodes['[data-f=node]'].innerHTML.includes('Door &lt;PC&gt;') && nodes['[data-f=node]'].hidden === false, 'two PCs: the PC filter is offered');
    assert.ok(calls[0].startsWith('/api/audit?limit=100&offset=0'));
    // an administrator with the security permission gets the second tab
    HS.me = { perms: ['logs.view', 'logs.security', 'users.manage'], admin: true };
    HS.views.activity.mount(root); await new Promise(r => setImmediate(r));
    assert.ok(nodes['[data-tabs]'].innerHTML.includes('data-tab="security"'));
    listeners.click({ target: { closest: s => s === '[data-tab]' ? { dataset: { tab: 'security' } } : null } });
    await new Promise(r => setImmediate(r));
    body = nodes['[data-body]'].innerHTML;
    assert.ok(calls.some(c => c.startsWith('/api/security?')));
    assert.ok(body.includes(HS.esc(HS.t('sec.login-failed'))) && body.includes('x&lt;y') && !body.includes('&amp;lt;'));
    assert.ok(body.includes('is-bad') && body.includes(HS.esc(HS.t('act.fail.n', { n: '1' }))), 'refused attempts stand out and are counted');
    // filters go to the server, empty results explain themselves
    HS.get = async () => ({ total: 0, rows: [], users: [], nodes: [] });
    listeners.input({ target: { closest: s => s === '[data-f]' ? { dataset: { f: 'typ' }, value: 'login-blocked' } : null } });
    await new Promise(r => setImmediate(r));
    assert.ok(nodes['[data-body]'].innerHTML.includes(HS.esc(HS.t('act.none.f'))));
  }
});

test('the overview status card shows only what the server sent, with a tone for each line and a place to fix it', async () => {
  for (const lang of ['en', 'ar']) {
    const HS = startup(lang); HS.lang = lang;
    HS.data.state = { settings: {}, groups: [], rooms: [], teachers: [], students: [], attendance: [] };
    HS.prefs.data = {}; HS.prefs.save = () => {}; HS.me = { username: 'owner', perms: ['overview.view', 'backups.manage', 'users.manage', 'gateway.manage'] };
    const els = {}, root = { isConnected: true, addEventListener() {}, querySelector: s => els[s] || (els[s] = { innerHTML: '', textContent: '' }) };
    const now = new Date().toISOString().slice(0, 19);
    let status = { backup: { last: null, folders: 0, error: '' }, sync: { state: 'ok', multi: true, conflicts: 2, verify_ok: false, verify_at: now, pcs: 2 }, gateway: { configured: false } };
    HS.get = async url => url.includes('status') ? status : url.includes('advice') ? [] : { date: '2026-10-05', checkedIn: 0, sessions: [], students: 0, risk: 0, trend: [], moneyTrend: [] };
    HS.views.overview.mount(root); await new Promise(r => setImmediate(r));
    let html = els['[data-status]'].innerHTML;
    assert.ok(html.includes(HS.t('st.title')) && html.includes(HS.t('st.backup.none')) && html.includes(HS.t('st.second.off')), lang);
    assert.ok(/st-row bad[^>]*href="#\/settings\?tab=data"/.test(html), 'no backup at all is a red line that leads to the fix');
    assert.ok(html.includes('href="#/devices?tab=conflicts"') && html.includes('>2<'), 'two changes wait for a decision');
    assert.ok(html.includes(HS.t('st.verify.bad')) && html.includes(HS.t('st.gateway.off')));
    status = { backup: { last: now, folders: 1, error: '' }, sync: { state: 'single', multi: false, conflicts: 0, verify_ok: true, verify_at: now, pcs: 1 } };
    HS.views.overview.mount(root); await new Promise(r => setImmediate(r));
    html = els['[data-status]'].innerHTML;
    assert.ok(!html.includes('st-row bad') && !html.includes('st-row warn'), 'everything in order: no warning colours');
    assert.ok(html.includes(HS.t('st.sync.single')) && html.includes(HS.t('st.second.on')) && !html.includes(HS.t('st.gateway')), 'one PC says so; the parent links line is only for those who manage them');
    status = {};
    HS.views.overview.mount(root); await new Promise(r => setImmediate(r));
    assert.equal(els['[data-status]'].innerHTML, '', 'a person with no system permissions gets no card');
  }
});

test('a new person: the profile list shows the profile whose ticks are shown; ready-made names are translated', async () => {
  for (const lang of ['ar', 'en']) {
    const HS = startup(lang); HS.lang = lang; HS.data.state = { settings: {}, teachers: [] };
    HS.me = { perms: ['users.manage'] };
    const profiles = [{ id: 'full-access', name: 'Centre manager', perms: ['overview.view', 'money.view'] }, { id: 'viewer', name: 'Viewer', perms: ['overview.view'] }];
    HS.get = async url => url === '/api/users' ? { users: [], profiles, permissions: [['Pages', [['overview.view', 'Overview'], ['money.view', 'Money']]]], authority: true } : { users: [] };
    HS.accessTab.reset(); HS.rerender = () => {};
    HS.accessTab.mount({ innerHTML: '', addEventListener() {} });
    await new Promise(resolve => setImmediate(resolve));
    let click, opened; HS.panel.open = opts => { opened = opts; };
    HS.accessTab.mount({ addEventListener: (_, fn) => { click = fn; } });
    click({ target: { closest: s => s === '[data-adduser]' ? {} : null } });
    const selected = opened.body.match(/<option value="([^"]*)" selected>([^<]*)</);
    assert.equal(selected[1], 'Viewer');                       // was the first profile (Centre manager) over the Viewer ticks
    assert.equal(selected[2], HS.t('prof.viewer'));
    assert.ok(opened.body.includes('data-perm="overview.view" checked'));
    assert.ok(!opened.body.includes('data-perm="money.view" checked'));
    assert.equal(HS.roleLabel('Front desk'), HS.t('prof.secretary'));
    assert.equal(HS.roleLabel('My own profile'), 'My own profile');
    assert.equal(HS.roleLabel(''), HS.t('acc.custom'));
  }
});

test('every step-by-step guide and situation is complete in both languages and names real buttons', () => {
  for (const lang of ['ar', 'en']) {
    const HS = startup(lang); HS.lang = lang; HS.prefs.data = {}; HS.data.state = { settings: {} };
    const G = HS.guides;
    assert.ok(G.list.length >= 30 && G.situations.length >= 40);
    const ids = new Set();
    const texts = [];
    for (const g of G.list) {
      assert.ok(!ids.has(g.id), 'duplicate guide ' + g.id); ids.add(g.id);
      assert.ok(G.cats.includes(g.cat), g.id);
      for (const k of ['t', 'd', 'ok']) { assert.ok(HS.has('gd.' + g.id + '.' + k), lang + ' gd.' + g.id + '.' + k); texts.push(HS.t('gd.' + g.id + '.' + k)); }
      assert.ok(!HS.has('gd.' + g.id + '.' + (g.steps.length + 1)), 'text for a step that does not exist: ' + g.id);
      g.steps.forEach((s, i) => {
        assert.ok(G.kinds[s.k], g.id + ' kind ' + s.k);
        assert.ok(HS.has('gd.' + g.id + '.' + (i + 1)), lang + ' gd.' + g.id + '.' + (i + 1)); texts.push(HS.t('gd.' + g.id + '.' + (i + 1)));
      });
    }
    for (const x of G.situations) { for (const k of ['q', 'a']) { assert.ok(HS.has('sit.' + x[0] + '.' + k), lang + ' sit.' + x[0]); texts.push(HS.t('sit.' + x[0] + '.' + k)); } }
    for (const t of texts) for (const m of t.matchAll(/\[\[([^\]]+)\]\]/g)) assert.ok(HS.has(m[1]), lang + ': [[' + m[1] + ']] is not a dictionary key');
    // the library: escaped, permission-aware, nothing missing
    HS.me = { perms: ['door.use', 'money.collect'] };
    const html = G.html('door');
    assert.ok(html.includes('data-guide="checkin"') && html.includes('data-guide="pay"'));
    assert.ok(!html.includes('data-guide="people"'));                     // administrator guides only for administrators
    assert.ok(!/undefined|\[\[|gd\.[a-z]+\.\d/.test(html), 'missing text in the guide library');
    assert.ok(G.rich('<b>[[door.checkin]]</b>').startsWith('&lt;b&gt;<b class="ui-name">«' + HS.esc(HS.t('door.checkin'))));
    const sit = G.situationsHTML();
    assert.ok(!/undefined|\[\[|sit\.[a-zA-Z]+\.[qa]/.test(sit));
  }
});

test('the subscription screens have words for every state in both languages and show the request code', () => {
  for (const lang of ['ar', 'en']) {
    const HS = startup(lang); HS.lang = lang;
    for (const s of ['ok', 'warn', 'grace', 'locked', 'trial', 'trialEnded', 'clock', 'off']) {
      assert.ok(HS.has('lic.s.' + s) && HS.has('lic.state.' + s), lang + ' ' + s);
    }
    for (const k of ['locked', 'trialEnded', 'clock']) assert.ok(HS.has('err.license.' + k));
    for (const k of ['typo', 'forged', 'kind', 'otherPc', 'older', 'expired', 'clock']) assert.ok(HS.has('err.code.' + k), k);
    for (const k of ['forged', 'otherPc', 'used', 'expired']) assert.ok(HS.has('err.reset.' + k), k);
    HS.me = { perms: ['users.manage'], admin: false };
    assert.ok(!HS.licenseTab.render().includes('data-lic>'));      // staff never see the request code or the activation box
    HS.me.admin = true;
    assert.ok(HS.licenseTab.render().includes('data-lic'));
  }
});

test('owner 2026-10-08: daylight theme and the system font by default, no slideshow on the first sign-in', () => {
  const fs = require('fs'), path = require('path'), js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  assert.match(js('prefs.js'), /DEFAULTS = \{ lang: 'ar', theme: 'daylight', font: 'system'/);
  assert.match(js('boot.js'), /p\.theme \|\| 'daylight'/);
  assert.match(js('boot.js'), /p\.font \|\| 'system'/);
  assert.doesNotMatch(js('shell.js'), /welcomed\) setTimeout\(function \(\) \{ HS\.slides\.open/);
});

test('owner 2026-10-08: every problem\'s "Guide me" points to a real guide, and help reads in polished Egyptian Arabic', () => {
  const HS = startup('ar');
  const guides = new Set(HS.guides.list.map(g => g.id)), sits = new Set(HS.guides.situations.map(x => x[0]));
  for (const [sid, gid] of Object.entries(HS.guides.sitGuide)) {
    assert.ok(sits.has(sid), 'unknown situation ' + sid);
    assert.ok(guides.has(gid), 'unknown guide ' + gid);
  }
  assert.ok(Object.keys(HS.guides.sitGuide).length >= 40);
  const fs = require('fs'), path = require('path');
  const ar = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n', 'ar.js'), 'utf8');
  const help = ar.split('\n').filter(l => /^\s{4}'(gd|sit|hq|help|guide|sup|tour|slide)\./.test(l));
  assert.ok(help.length > 700);
  const heavy = /(يُرجى|نظرًا ل|يتعذّر|تعذّر|يجب عليك|الرجاء)/;
  assert.deepEqual(help.filter(l => heavy.test(l)), []);
});
