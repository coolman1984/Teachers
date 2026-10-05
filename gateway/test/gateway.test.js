import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { sha256Hex } from '../src/worker.js';
import { newEnv, call, office, putCard, TOKEN } from './helpers.js';

test('a parent reads the card by its token, and only by the right token', async () => {
  const env = newEnv();
  await putCard(env);
  const r = await call(env, 'GET', '/api/card/' + TOKEN);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.card.name, 'Synthetic Child');
  assert.ok(j.sentAt);
  assert.equal((await call(env, 'GET', '/api/card/Tk_zzzzzzzzzzzzzzzzzzzzzz')).status, 404);
  assert.equal((await call(env, 'GET', '/api/card/short')).status, 404);
});

test('the parent side is read only: every old phone write route is gone', async () => {
  const env = newEnv();
  await putCard(env);
  for (const [m, p] of [['POST', '/api/card/' + TOKEN], ['PUT', '/api/card/' + TOKEN], ['DELETE', '/api/card/' + TOKEN]]) {
    assert.equal((await call(env, m, p, { body: m === 'DELETE' ? undefined : '{}' })).status, 405, m);
  }
  for (const p of ['/api/bind/' + TOKEN, '/api/event/' + TOKEN, '/api/photo/' + TOKEN + '/x']) {
    assert.equal((await call(env, 'POST', p, { body: '{}' })).status, 404, p);
  }
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map((x) => x.name);
  assert.deepEqual(tables.filter((t) => ['events', 'photos'].includes(t)), []);
});

test('the token itself is never stored', async () => {
  const env = newEnv();
  await putCard(env);
  await call(env, 'GET', '/api/card/' + TOKEN);
  for (const t of ['cards', 'nonces', 'rate']) {
    const rows = await env.DB.prepare(`SELECT * FROM ${t}`).all();
    assert.ok(!JSON.stringify(rows.results).includes(TOKEN), t);
  }
});

test('replacing a link revokes every older link of that child and a stale PC cannot revive it', async () => {
  const env = newEnv(), newer = 'Tk_newerabcdefghijklmnop';
  const old = await putCard(env);
  await putCard(env, {}, newer);
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
  await putCard(env); // an old disconnected PC finally uploads its old card
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
  assert.equal((await call(env, 'GET', '/api/card/' + newer)).status, 200);
  const row = await env.DB.prepare('SELECT * FROM revoked_links WHERE token_hash = ?').bind(old).first();
  assert.ok(row);
});

test('explicit revocation survives cleanup and cannot be overwritten by a stale upload', async () => {
  const env = newEnv();
  const th = await putCard(env);
  await office(env, 'PUT', '/office/cards', { remove: [th] });
  await env.DB.prepare('UPDATE cards SET expires_at = ?').bind(Math.floor(Date.now() / 1000) - 40 * 86400).run();
  await worker.scheduled({}, env);
  await putCard(env);
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
});

test('deleted students revoke links published by a different office PC', async () => {
  const env = newEnv();
  await putCard(env);
  const response = await office(env, 'PUT', '/office/cards', { revokeStudents: ['st1'] });
  assert.equal(response.status, 200);
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
  await putCard(env);
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
});

test('a replaced link says "stopped" (410) and is cleaned up later; an expired one says so', async () => {
  const env = newEnv();
  const th = await putCard(env);
  const removed = await office(env, 'PUT', '/office/cards', { remove: [th, 'not-a-hash'] });
  assert.equal(removed.status, 200);
  const r = await call(env, 'GET', '/api/card/' + TOKEN);
  assert.equal(r.status, 410);
  const j = await r.json();
  assert.equal(j.revoked, true);
  assert.ok(!JSON.stringify(j).includes('Synthetic'), 'nothing of the child is left');
  const st = await (await office(env, 'GET', '/office/status')).json();
  assert.equal(st.cards, 0, 'a stopped link is not counted as a card');
  await env.DB.prepare('UPDATE cards SET expires_at = ?').bind(Math.floor(Date.now() / 1000) - 8 * 86400).run();
  await worker.scheduled({}, env);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM cards').first()).n, 0);
  const expiredToken = 'Tk_expiredabcdefghijklmn';
  await putCard(env, { expiresAt: Math.floor(Date.now() / 1000) - 10 }, expiredToken);
  const ex = await call(env, 'GET', '/api/card/' + expiredToken);
  assert.equal(ex.status, 410);
  assert.equal((await ex.json()).expired, true);
});

test('a student who left (cancelled card) cannot be read', async () => {
  const env = newEnv();
  await putCard(env, { cancelled: true });
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
  await putCard(env, { cancelled: false });                 // back again: the same link works
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 200);
});

test('office requests must be signed, fresh, unrepeated and untampered', async () => {
  const env = newEnv();
  assert.equal((await call(env, 'GET', '/office/status')).status, 401, 'no signature');
  assert.equal((await office(env, 'GET', '/office/status', undefined, { secret: 'wrong-secret' })).status, 401);
  assert.equal((await office(env, 'GET', '/office/status', undefined, { time: Math.floor(Date.now() / 1000) - 600 })).status, 401, 'too old');
  const nonce = 'ab'.repeat(16);
  assert.equal((await office(env, 'GET', '/office/status', undefined, { nonce })).status, 200);
  assert.equal((await office(env, 'GET', '/office/status', undefined, { nonce })).status, 401, 'replayed');
  const good = { cards: [] };
  const bytes = new TextEncoder().encode(JSON.stringify(good));
  const t = String(Math.floor(Date.now() / 1000)), n = 'cd'.repeat(16);
  const { hmacHex } = await import('../src/worker.js');
  const sig = await hmacHex('test-secret-0123456789abcdef', ['PUT', '/office/cards', t, n, await sha256Hex(bytes)].join('\n'));
  const r = await call(env, 'PUT', '/office/cards', { body: JSON.stringify({ cards: [], remove: ['x'] }), headers: { 'X-HS-Time': t, 'X-HS-Nonce': n, 'X-HS-Sig': sig } });
  assert.equal(r.status, 401);
  const noSecret = newEnv(); noSecret.OFFICE_SECRET = '';
  assert.equal((await office(noSecret, 'GET', '/office/status')).status, 503);
});

test('a card larger than 16 KB or without a student is refused', async () => {
  const env = newEnv();
  const th = await sha256Hex(TOKEN);
  assert.equal((await office(env, 'PUT', '/office/cards', { cards: [{ tokenHash: th, body: {} }] })).status, 400);
  assert.equal((await office(env, 'PUT', '/office/cards', { cards: [{ tokenHash: th, studentId: 's', body: { x: 'y'.repeat(17000) } }] })).status, 400);
});

test('older office programs: the inbox is always empty and ack is accepted', async () => {
  const env = newEnv();
  const box = await (await office(env, 'GET', '/office/inbox?limit=100')).json();
  assert.deepEqual(box, { events: [], photos: [] });
  assert.equal((await office(env, 'POST', '/office/ack', { events: [], photos: [] })).status, 200);
});

test('an existing v1 mailbox upgrades without losing cards or revocation history', async () => {
  const { readFileSync } = await import('node:fs');
  const env = newEnv(), th = await sha256Hex(TOKEN);
  env.DB.db.exec('DROP INDEX cards_student; ALTER TABLE cards RENAME COLUMN student_id TO trip_id');
  await env.DB.prepare("INSERT INTO cards VALUES (?, ?, ?, 0, NULL, ?)").bind(th, 'st1', '{"name":"Synthetic preserved child"}', 1).run();
  const revoked = 'ab'.repeat(32);
  await env.DB.prepare('INSERT INTO revoked_links VALUES (?, ?)').bind(revoked, 1).run();
  env.DB.db.exec(readFileSync(new URL('../migrate-v1.sql', import.meta.url), 'utf8'));
  const result = await (await call(env, 'GET', '/api/card/' + TOKEN)).json();
  assert.equal(result.card.name, 'Synthetic preserved child');
  assert.ok(await env.DB.prepare('SELECT * FROM revoked_links WHERE token_hash = ?').bind(revoked).first());
  await putCard(env, {}, 'Tk_migratedabcdefghijklmn');
  assert.equal((await call(env, 'GET', '/api/card/' + TOKEN)).status, 410);
});

test('rate limits: 60 requests per token and 300 per address in ten minutes', async () => {
  const env = newEnv();
  await putCard(env);
  let last;
  for (let i = 0; i < 61; i++) last = await call(env, 'GET', '/api/card/' + TOKEN);
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('Retry-After'));
  assert.equal((await call(env, 'GET', '/api/card/Tk_otherotherotherother1')).status, 404);
});

test('every response carries the security headers; pages and the service worker are served', async () => {
  const env = newEnv();
  for (const path of ['/', '/t/' + TOKEN, '/sw.js', '/app/app.js', '/nope']) {
    const r = await call(env, 'GET', path);
    assert.ok(r.headers.get('content-security-policy').includes("default-src 'self'"), path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer', path);
    assert.match(r.headers.get('permissions-policy'), /camera=\(\)/, path);
  }
  assert.equal((await call(env, 'GET', '/sw.js')).headers.get('service-worker-allowed'), '/');
});

test('the parent page is small enough for an old phone on a weak line (under 120 KB)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  const first = ['index.html', 'app/style.css', 'app/i18n.js', 'app/app.js', 'app/icon.svg'];
  const size = first.reduce((a, f) => a + readFileSync(join(pub, f)).length, 0);
  assert.ok(size < 120 * 1024, `first load ${size} bytes`);
  assert.deepEqual(readdirSync(join(pub, 'app')).filter((f) => /outbox|camera/.test(f)), []);
  const page = readFileSync(join(pub, 'app', 'app.js'), 'utf8');
  assert.ok(!/style=/.test(page), 'no inline styles: the page CSP forbids them');
  assert.ok(!/method:\s*'(POST|PUT|DELETE)'/.test(page), 'the parent page never writes');
});

test('the single-file bundle serves the parent page without any asset binding', async () => {
  const { execFileSync } = await import('node:child_process');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  execFileSync('node', [join(here, '..', 'build.js')]);
  const bundle = (await import(pathToFileURL(join(here, '..', 'dist', 'hessa-gateway.js')).href + '?t=' + Date.now())).default;
  const env = newEnv();
  delete env.ASSETS;
  const get = (p) => bundle.fetch(new Request('http://gw.test' + p, { headers: { 'CF-Connecting-IP': '1.1.1.1' } }), env);
  const page = await get('/t/' + TOKEN);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<main id="app"/);
  assert.equal((await get('/app/app.js')).status, 200);
  assert.match((await get('/app/style.css')).headers.get('content-type'), /css/);
  assert.equal((await get('/sw.js')).headers.get('service-worker-allowed'), '/');
});
