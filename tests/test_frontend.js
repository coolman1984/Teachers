'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startup } = require('./test_startup.js');

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
