import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey } from 'node:crypto';
import { newD1 } from './d1-mock.js';
import {
  handleLicence, approveRequest, refuseRequest, issueOfflineCustomer, derivePollToken, purgeStaleCodes,
  deviceKey, deviceLockKey, trialDays, claimTrialLocks, REASON_PAID_IN_STUDIO,
} from '../src/licence-api.js';
import { importSigningKey } from '../src/afcodes.js';

const SECRET = 'test-session-secret-0123456789abcdef';
const MACHINE_A = 'a'.repeat(64);
const MACHINE_B = 'b'.repeat(64);

function pemFromSeed(seed32) {
  const seed = Buffer.from(seed32);
  const pk = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
    format: 'der',
    type: 'pkcs8',
  });
  return pk.export({ type: 'pkcs8', format: 'pem' });
}

function env() {
  return {
    DB: newD1(),
    SESSION_SECRET: SECRET,
    LICENCE_PRODUCTS: 'teachers',
    TRIAL_DAYS: '14',
    LICENCE_CALENDAR_TZ: 'Africa/Cairo',
    PENDING_TTL_SEC: '900',
  };
}

function body(over = {}) {
  return {
    product: 'teachers',
    kind: 'trial',
    device: '7KD2M-QX9TP',
    machine: MACHINE_A,
    nonce: 'nonce-' + crypto.randomUUID(),
    shop: 'Shop',
    ref: 'ref',
    version: '1.0',
    ...over,
  };
}

async function postRequest(e, payload) {
  const req = new Request('https://hub.test/licence/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: JSON.stringify(payload),
  });
  const res = await handleLicence(req, e, new URL(req.url));
  return { res, data: await res.json() };
}

async function getStatus(e, id, poll) {
  const req = new Request('https://hub.test/licence/status?id=' + id, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + poll },
  });
  const res = await handleLicence(req, e, new URL(req.url));
  return { res, data: await res.json() };
}

test('permanent and monthly requests are refused at submit (paid in Licence Studio)', async () => {
  const e = env();
  const perm = await postRequest(e, body({ kind: 'permanent' }));
  assert.equal(perm.data.status, 'refused');
  assert.equal(perm.data.reason, REASON_PAID_IN_STUDIO);
  const mon = await postRequest(e, body({ kind: 'monthly', nonce: 'monthly-nonce-1' }));
  assert.equal(mon.data.status, 'refused');
  assert.equal(mon.data.reason, REASON_PAID_IN_STUDIO);
});

test('nonce replay returns the same poll token', async () => {
  const e = env();
  const payload = body();
  const first = await postRequest(e, payload);
  const second = await postRequest(e, payload);
  assert.equal(second.data.replay, true);
  assert.equal(second.data.poll_token, first.data.poll_token);
  assert.equal(second.data.id, first.data.id);
});

test('TRIAL_DAYS above 14 is clamped when issuing', async () => {
  assert.equal(trialDays({ TRIAL_DAYS: '99' }), 14);
  const e = env();
  e.TRIAL_DAYS = '99';
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 8)));
  const { data } = await postRequest(e, body({ nonce: 'clamp-trial' }));
  const signed = await approveRequest(e, data.id, key);
  const first = Date.parse(signed.first_day + 'T12:00:00Z');
  const last = Date.parse(signed.last_day + 'T12:00:00Z');
  assert.equal(Math.round((last - first) / 86400000) + 1, 14);
});

test('concurrent claimTrialLocks: only one request_id owns the device lock', async () => {
  const e = env();
  const dkey = deviceKey('7KD2M-QX9TP');
  const lock = deviceLockKey(dkey);
  const t = 100;
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => claimTrialLocks(e, [lock], `req-${i}`, t + i)),
  );
  assert.equal(results.filter(Boolean).length, 1);
  const row = await e.DB.prepare('SELECT request_id FROM machine_trials WHERE machine = ?').bind(lock).first();
  assert.ok(row?.request_id?.startsWith('req-'));
});

test('only one trial wins on concurrent approval for the same device', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 9)));
  const device = '7KD2M-QX9TP';
  const dkey = deviceKey(device);
  const t = 1;
  await e.DB.prepare(
    'INSERT INTO licence_requests(id, poll_token_hash, product, kind, device, device_key, machine, nonce, shop, ref, version, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind('a', 'h1', 'teachers', 'trial', device, dkey, MACHINE_A, 'n1', '', '', '', 'pending', t, t).run();
  await e.DB.prepare(
    'INSERT INTO licence_requests(id, poll_token_hash, product, kind, device, device_key, machine, nonce, shop, ref, version, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind('b', 'h2', 'teachers', 'trial', device, dkey, MACHINE_B, 'n2', '', '', '', 'pending', t, t).run();
  const [signedA, signedB] = await Promise.all([approveRequest(e, 'a', key), approveRequest(e, 'b', key)]);
  const winners = [signedA, signedB].filter((s) => s?.code);
  assert.equal(winners.length, 1);
  const rowB = await e.DB.prepare('SELECT status, reason FROM licence_requests WHERE id = ?').bind('b').first();
  const rowA = await e.DB.prepare('SELECT status, reason FROM licence_requests WHERE id = ?').bind('a').first();
  const refused = [rowA, rowB].find((r) => r.status === 'refused');
  assert.ok(refused);
  assert.equal(refused.reason, 'already_used');
});

test('second online trial for same machine hash is refused after install_id wipe (new device code)', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 7)));
  const first = await postRequest(e, body({ device: '7KD2M-QX9TP', machine: MACHINE_A, nonce: 'n1' }));
  await approveRequest(e, first.data.id, key);
  const second = await postRequest(e, body({ device: 'ABCDE-FGHJK', machine: MACHINE_A, nonce: 'n2' }));
  assert.equal(second.data.status, 'refused');
  assert.equal(second.data.reason, 'already_used');
});

test('offline mint blocks later online trial for that device', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 11)));
  await issueOfflineCustomer(e, key, '7KD2M-QX9TP', 'Shop', 'teachers');
  const rows = await e.DB.prepare('SELECT machine FROM machine_trials').bind().all();
  assert.equal(rows.results[0].machine, deviceLockKey(deviceKey('7KD2M-QX9TP')));
  const online = await postRequest(e, body({ nonce: 'n3' }));
  assert.equal(online.data.reason, 'already_used');
});

test('offline concurrent mint only succeeds once', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 12)));
  const device = '7KD2M-QX9TP';
  const results = await Promise.allSettled([
    issueOfflineCustomer(e, key, device, 'A', 'teachers'),
    issueOfflineCustomer(e, key, device, 'B', 'teachers'),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const bad = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason?.message, 'already_used');
});

test('short device code is rejected at request', async () => {
  const e = env();
  const { res, data } = await postRequest(e, body({ device: 'ABC', nonce: 'short' }));
  assert.equal(res.status, 400);
  assert.equal(data.field, 'device');
});

test('open pending is limited to one row per device until TTL expires', async () => {
  const e = env();
  const first = await postRequest(e, body({ nonce: 'p1' }));
  assert.equal(first.data.status, 'pending');
  const second = await postRequest(e, body({ nonce: 'p2' }));
  assert.equal(second.res.status, 400);
  assert.equal(second.data.field, 'device');
  const old = Math.floor(Date.now() / 1000) - 2000;
  await e.DB.prepare('UPDATE licence_requests SET created_at = ?, updated_at = ? WHERE id = ?')
    .bind(old, old, first.data.id).run();
  const third = await postRequest(e, body({ nonce: 'p3' }));
  assert.equal(third.data.status, 'pending');
});

test('status returns calendar_day as YYYY-MM-DD string', async () => {
  const e = env();
  const { data } = await postRequest(e, body());
  const st = await getStatus(e, data.id, data.poll_token);
  assert.match(st.data.calendar_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('ack marks delivered but keeps code for owner audit', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 2)));
  const { data } = await postRequest(e, body());
  const signed = await approveRequest(e, data.id, key);
  const poll = data.poll_token;
  const ackReq = new Request('https://hub.test/licence/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + poll },
    body: JSON.stringify({ id: data.id }),
  });
  await handleLicence(ackReq, e, new URL(ackReq.url));
  const row = await e.DB.prepare('SELECT code, status FROM licence_requests WHERE id = ?').bind(data.id).first();
  assert.equal(row.code, signed.code);
  assert.equal(row.status, 'delivered');
});

test('owner force reissue replaces device trial lock', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 4)));
  const device = '7KD2M-QX9TP';
  const first = await postRequest(e, body({ nonce: 'f1' }));
  await approveRequest(e, first.data.id, key);
  const retry = await postRequest(e, body({ nonce: 'f2' }));
  assert.equal(retry.data.reason, 'already_used');
  await e.DB.prepare(
    'INSERT INTO licence_requests(id, poll_token_hash, product, kind, device, device_key, machine, nonce, shop, ref, version, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind('lost', 'hx', 'teachers', 'trial', device, deviceKey(device), MACHINE_A, 'n-lost', '', '', '', 'pending', 2, 2).run();
  const forced = await approveRequest(e, 'lost', key, { force: true });
  assert.ok(forced?.code);
});

test('issued row without machine lock is not returned until claim is repaired', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 6)));
  const { data } = await postRequest(e, body({ nonce: 'orphan' }));
  await e.DB.prepare(
    "UPDATE licence_requests SET status = 'issued', code = 'FAKE-CODE' WHERE id = ?",
  ).bind(data.id).run();
  const out = await approveRequest(e, data.id, key);
  assert.ok(out?.code);
  assert.notEqual(out.code, 'FAKE-CODE');
  assert.match(out.code, /^[0-9A-Z-]+$/);
  const lock = await e.DB.prepare('SELECT request_id FROM machine_trials WHERE machine = ?')
    .bind(deviceLockKey(deviceKey('7KD2M-QX9TP'))).first();
  assert.equal(lock.request_id, data.id);
});

test('purgeStaleCodes blanks old issued rows', async () => {
  const e = env();
  const old = Math.floor(Date.now() / 1000) - 20 * 86400;
  await e.DB.prepare(
    'INSERT INTO licence_requests(id, poll_token_hash, product, kind, device, device_key, machine, nonce, shop, ref, version, status, code, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind('old', 'h', 'teachers', 'trial', '7KD2M-QX9TP', deviceKey('7KD2M-QX9TP'), MACHINE_A, 'n', '', '', '', 'delivered', 'CODE-OLD', old, old).run();
  await purgeStaleCodes(e);
  const row = await e.DB.prepare('SELECT code FROM licence_requests WHERE id = ?').bind('old').first();
  assert.equal(row.code, null);
});

test('approve retry returns the same code', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 3)));
  const { data } = await postRequest(e, body());
  const first = await approveRequest(e, data.id, key);
  const second = await approveRequest(e, data.id, key);
  assert.equal(first.code, second.code);
});

test('monthly request is refused at submit (paid in Licence Studio)', async () => {
  const e = env();
  const { data, res } = await postRequest(e, body({ kind: 'monthly', nonce: 'monthly-submit-1' }));
  assert.equal(res.status, 200);
  assert.equal(data.status, 'refused');
  assert.equal(data.reason, REASON_PAID_IN_STUDIO);
});

test('monthly approval is refused (trial-only Worker key)', async () => {
  const e = env();
  const key = await importSigningKey(pemFromSeed(Buffer.alloc(32, 5)));
  await e.DB.prepare(
    'INSERT INTO licence_requests(id, poll_token_hash, product, kind, device, device_key, machine, nonce, shop, ref, version, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind('id1', 'hash', 'teachers', 'monthly', '7KD2M-QX9TP', '7KD2MQX9TP', MACHINE_A, 'n-old', '', '', '', 'pending', 1, 1).run();
  const out = await approveRequest(e, 'id1', key);
  assert.equal(out.refused, true);
  assert.equal(out.reason, REASON_PAID_IN_STUDIO);
});

test('trial request without machine hash is rejected', async () => {
  const e = env();
  const { data, res } = await postRequest(e, body({ machine: 'not-a-hash', nonce: 'bad-machine' }));
  assert.equal(res.status, 400);
  assert.equal(data.field, 'machine');
});

test('derivePollToken is stable for a nonce', async () => {
  const a = await derivePollToken(SECRET, 'fixed-nonce');
  const b = await derivePollToken(SECRET, 'fixed-nonce');
  assert.equal(a, b);
  assert.match(a, /^lp_[0-9a-f]+$/);
});
