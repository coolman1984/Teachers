// The seller's "Hessa online" service: many centres on one gateway, joined by their subscription codes; and the owner's phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { sha256Hex } from '../src/worker.js';
import { call, CARD, CODES, joinCentre, officeAs, serviceEnv } from './helpers.js';

test('a centre joins with its subscription code; a copied, forged or ended code cannot open another centre', async () => {
  const env = serviceEnv();
  const a = await joinCentre(env, CODES.pc1);
  assert.equal(a.r.status, 200);
  assert.match(a.j.centre, /^[0-9a-f]{32}$/);
  assert.equal(a.j.until, '2099-12-31');
  assert.equal((await joinCentre(env, CODES.pc1)).r.status, 409, 'one code, one centre');
  assert.equal((await joinCentre(env, CODES.expired)).r.status, 402);
  const forged = CODES.pc2.slice(0, 20) + (CODES.pc2[20] === 'A' ? 'B' : 'A') + CODES.pc2.slice(21);
  assert.equal((await joinCentre(env, forged)).r.status, 400);
  assert.equal((await joinCentre(env, 'HELLO')).r.status, 400);
  // the secret is the centre's: a request signed with another secret is refused
  assert.equal((await officeAs(env, a.j.centre, a.secret, 'GET', '/office/status')).status, 200);
  assert.equal((await officeAs(env, a.j.centre, 'x'.repeat(48), 'GET', '/office/status')).status, 401);
  assert.equal((await officeAs(env, 'f'.repeat(32), a.secret, 'GET', '/office/status')).status, 401);
  // without OFFICE_SECRET the older one-centre door stays shut
  assert.equal((await call(env, 'GET', '/office/status')).status, 503);
});

test('two centres never see or stop each other\'s cards, even with the same student ids', async () => {
  const env = serviceEnv();
  const a = await joinCentre(env, CODES.pc1), b = await joinCentre(env, CODES.pc2);
  const ta = 'Tk_centreAaaaaaaaaaaaaaaa', tb = 'Tk_centreBbbbbbbbbbbbbbbb';
  const put = (c, tok, name) => sha256Hex(tok).then((h) => officeAs(env, c.j.centre, c.secret, 'PUT', '/office/cards', { cards: [{ tokenHash: h, studentId: 'st1', body: { ...CARD, name } }] }));
  assert.equal((await put(a, ta, 'Child of A')).status, 200);
  assert.equal((await put(b, tb, 'Child of B')).status, 200);
  assert.equal((await (await call(env, 'GET', '/api/card/' + ta)).json()).card.name, 'Child of A');
  assert.equal((await (await call(env, 'GET', '/api/card/' + tb)).json()).card.name, 'Child of B', 'a new link in centre A did not revoke st1 of centre B');
  // B stops "its" st1 and tries to overwrite or revoke A's card by its hash: A's parent still reads A's card
  await officeAs(env, b.j.centre, b.secret, 'PUT', '/office/cards', { revokeStudents: ['st1'], remove: [await sha256Hex(ta)] });
  await officeAs(env, b.j.centre, b.secret, 'PUT', '/office/cards', { cards: [{ tokenHash: await sha256Hex(ta), studentId: 'st9', body: { ...CARD, name: 'Hijack' } }] });
  assert.equal((await (await call(env, 'GET', '/api/card/' + ta)).json()).card.name, 'Child of A');
  assert.equal((await call(env, 'GET', '/api/card/' + tb)).status, 410);
  const sa = await (await officeAs(env, a.j.centre, a.secret, 'GET', '/office/status')).json();
  assert.equal(sa.cards, 1);
  // a teacher page address belongs to the centre that took it first
  await officeAs(env, a.j.centre, a.secret, 'PUT', '/office/pages', { pages: [{ slug: 'mr-ahmed', body: { name: 'A' } }] });
  await officeAs(env, b.j.centre, b.secret, 'PUT', '/office/pages', { pages: [{ slug: 'mr-ahmed', body: { name: 'B' } }], remove: [] });
  await officeAs(env, b.j.centre, b.secret, 'PUT', '/office/pages', { pages: [], remove: ['mr-ahmed'] });
  assert.equal((await (await call(env, 'GET', '/api/page/mr-ahmed')).json()).page.name, 'A');
});

test('the subscription is renewed with a code for the same PCs; an ended one stops publishing but not renewing', async () => {
  const env = serviceEnv();
  const a = await joinCentre(env, CODES.pc1);
  await env.DB.prepare('UPDATE centres SET until = 0').run();          // its paid days are over (1 January 2026)
  const put = () => officeAs(env, a.j.centre, a.secret, 'PUT', '/office/owner', { state: { x: 1 } });
  assert.equal((await put()).status, 402);
  const st = await (await officeAs(env, a.j.centre, a.secret, 'GET', '/office/status')).json();
  assert.equal(st.active, false);
  assert.equal((await officeAs(env, a.j.centre, a.secret, 'PUT', '/office/licence', { licence: CODES.pc2 })).status, 403, 'another centre\'s code');
  const r = await officeAs(env, a.j.centre, a.secret, 'PUT', '/office/licence', { licence: CODES.pc1and2 });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).until, '2099-12-31');
  assert.equal((await put()).status, 200);
  assert.equal((await joinCentre(env, CODES.pc1and2)).r.status, 409, 'the renewal code cannot open a second centre');
});

test('the owner\'s phone reads its own centre\'s live picture with its key, and stops when the PC removes it', async () => {
  const env = serviceEnv();
  const a = await joinCentre(env, CODES.pc1), b = await joinCentre(env, CODES.pc2);
  const key = 'Ow_ownerphonekey12345678', keyB = 'Ow_otherownerphonekey999';
  const read = (k) => call(env, 'GET', '/api/owner', { headers: k ? { Authorization: 'Bearer ' + k } : {} });
  assert.equal((await read(key)).status, 401);
  await officeAs(env, a.j.centre, a.secret, 'PUT', '/office/owner', { state: { today: { income: 1200 } }, devices: [{ tokenHash: await sha256Hex(key), label: 'Owner phone' }] });
  await officeAs(env, b.j.centre, b.secret, 'PUT', '/office/owner', { state: { today: { income: 5 } }, devices: [{ tokenHash: await sha256Hex(keyB), label: 'B' }] });
  const j = await (await read(key)).json();
  assert.equal(j.state.today.income, 1200);
  assert.equal(j.until, '2099-12-31');
  assert.equal((await (await read(keyB)).json()).state.today.income, 5);
  assert.equal((await read()).status, 401);
  assert.equal((await read('short')).status, 401);
  // B cannot take A's phone over, and A removing its phones leaves B's alone
  await officeAs(env, b.j.centre, b.secret, 'PUT', '/office/owner', { devices: [{ tokenHash: await sha256Hex(keyB) }, { tokenHash: await sha256Hex(key) }] });
  assert.equal((await (await read(key)).json()).state.today.income, 1200);
  await officeAs(env, a.j.centre, a.secret, 'PUT', '/office/owner', { devices: [] });
  assert.equal((await read(key)).status, 401);
  assert.equal((await read(keyB)).status, 200);
  // the key is never stored
  const rows = JSON.stringify((await env.DB.prepare('SELECT * FROM owner_devices').all()).results);
  assert.ok(!rows.includes(key) && !rows.includes(keyB));
  // the owner page and its service worker are served
  assert.equal((await call(env, 'GET', '/o/')).status, 200);
  assert.equal((await call(env, 'GET', '/o')).status, 301);
  const sw = await call(env, 'GET', '/owner-sw.js');
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('Service-Worker-Allowed'), '/o/');
});

test('the older one-centre gateway (OFFICE_SECRET) also has the owner\'s phone', async () => {
  const { newEnv, office } = await import('./helpers.js');
  const env = newEnv(), key = 'Ow_legacyownerkey1234567';
  await office(env, 'PUT', '/office/owner', { state: { ok: true }, devices: [{ tokenHash: await sha256Hex(key) }] });
  const r = await call(env, 'GET', '/api/owner', { headers: { Authorization: 'Bearer ' + key } });
  assert.equal((await r.json()).state.ok, true);
  void worker;
});
