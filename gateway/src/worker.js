// Hessa gateway - a Cloudflare Worker + D1 mailbox for the parents' links and the owner's phone. No dependencies.
// One gateway can serve many centres (the seller's "Hessa online" service): a centre joins with its subscription code (signed
// by the seller, checked here with the seller's public key) and gets its own office secret; everything it writes is kept apart
// by centre. A gateway with OFFICE_SECRET set also keeps working for the one centre that set it up itself (the older setup).
// Parents' phones only READ one card at /api/card/<token> (the link token is the key). Office PCs write cards at /office/ (signed
// requests). Tokens are never stored or logged: the database keys everything by sha256(token). Nothing here can change the
// centre's data - the office database is the only source of truth.

const enc = new TextEncoder();
const MAX_CARDS_BODY = 1024 * 1024;
const MAX_CARD = 16 * 1024;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const LIMIT_TOKEN = 60, LIMIT_IP = 300, WINDOW = 600;      // requests per 10 minutes
const MAX_OWNER = 256 * 1024;                              // the owner's live picture of the centre
const LIMIT_OWNER = 240;                                   // an owner's phone refreshes every few seconds while it is open
const CENTRE_RE = /^[0-9a-f]{32}$/;
// The seller's public key (server/license_key.py). A test gateway may be given another one in SELLER_PUB.
const SELLER_PUB_DEFAULT = '95bc7fd139eb6c024ccd3ccb20b756af29c9db165b74e03b7e2608fb7708dc86';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EPOCH_MS = Date.UTC(2026, 0, 1);
const GRACE_DAYS = 3;                                      // as in the program: three days after the last paid day
const KIND_ACTIVATE = 1;
const today = () => Math.floor((Date.now() - EPOCH_MS) / 86400000);
const dayIso = (n) => new Date(EPOCH_MS + n * 86400000).toISOString().slice(0, 10);

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Cache-Control': 'no-store',
};

const now = () => Math.floor(Date.now() / 1000);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (data) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const iso = (s) => new Date(s * 1000).toISOString();

function reply(status, data, extra) {
  const h = { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...(extra || {}) };
  return new Response(data === null ? null : JSON.stringify(data), { status, headers: h });
}
class Fail extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

async function readBody(request, max) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) throw new Fail(413, 'Too large');
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > max) throw new Fail(413, 'Too large');
  return buf;
}
async function readJson(request, max) {
  const buf = await readBody(request, max);
  try { return { data: JSON.parse(new TextDecoder().decode(buf)), buf }; } catch { throw new Fail(400, 'Not JSON'); }
}

// ---------------------------------------------------------------- the seller's subscription codes (server/license.py, same format)
function decodeCode(code, length) {
  const s = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 2 || [...s].some((c) => ALPHABET.indexOf(c) < 0)) throw new Fail(400, 'Bad subscription code');
  const body = s.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += ALPHABET.indexOf(body[i]) * (i + 1);
  if (ALPHABET[sum % 32] !== s[s.length - 1]) throw new Fail(400, 'Bad subscription code');
  let n = 0n;
  for (const c of body) n = n * 32n + BigInt(ALPHABET.indexOf(c));
  if (n >> BigInt(length * 8)) throw new Fail(400, 'Bad subscription code');
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) { out[i] = Number(n & 255n); n >>= 8n; }
  return out;
}
async function readLicence(env, code) {
  const s = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pubHex = env.SELLER_PUB || SELLER_PUB_DEFAULT;
  const pub = await crypto.subtle.importKey('raw', Uint8Array.from(pubHex.match(/../g).map((h) => parseInt(h, 16))), { name: 'Ed25519' }, false, ['verify']);
  for (let n = 1; n <= 8; n++) {
    const length = 11 + 8 * n + 64;                       // an activation code (a password-reset code is never accepted here)
    if (s.length - 1 !== Math.floor((length * 8 + 4) / 5)) continue;
    const raw = decodeCode(s, length), body = raw.slice(0, -64), sig = raw.slice(-64);
    const msg = new Uint8Array([...enc.encode('hessa-license|'), ...body]);
    if (!await crypto.subtle.verify('Ed25519', pub, sig, msg)) throw new Fail(400, 'Bad subscription code');
    const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const ver = v.getUint8(0), kind = v.getUint8(1), issued = v.getUint16(2), until = v.getUint16(4), serial = v.getUint32(6), count = v.getUint8(10);
    if (ver !== 1 || kind !== KIND_ACTIVATE || count !== n) throw new Fail(400, 'Bad subscription code');
    const machines = [];
    for (let i = 0; i < count; i++) machines.push(hex(body.slice(11 + 8 * i, 19 + 8 * i)));
    return { issued, until, serial, machines };
  }
  throw new Fail(400, 'Bad subscription code');
}

async function limited(env, key, max) {
  const w = Math.floor(now() / WINDOW);
  const r = await env.DB.prepare('INSERT INTO rate(key, window, count) VALUES(?, ?, 1) ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count').bind(key, w).first();
  return r.count > max;
}

// ---------------------------------------------------------------- parent side: read one card, nothing else
async function parent(request, env, url, parts) {
  if (parts[1] !== 'card' || parts.length !== 3) throw new Fail(404, 'Not found');
  if (request.method !== 'GET') throw new Fail(405, 'Read only', { 'Allow': 'GET' });
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const token = parts[2];
  if (!TOKEN_RE.test(token || '')) throw new Fail(404, 'Not found');
  const th = await sha256Hex(token);
  if (await limited(env, 'ip:' + ip, LIMIT_IP) || await limited(env, 'tk:' + th, LIMIT_TOKEN)) throw new Fail(429, 'Too many requests', { 'Retry-After': '60' });
  if (await env.DB.prepare('SELECT token_hash FROM revoked_links WHERE token_hash = ?').bind(th).first())
    throw new Fail(410, 'This link was stopped by the centre', { revoked: true });
  const card = await env.DB.prepare('SELECT body, cancelled, expires_at, updated_at FROM cards WHERE token_hash = ?').bind(th).first();
  if (!card) throw new Fail(404, 'Unknown link');
  if (card.expires_at && card.expires_at < now()) throw new Fail(410, 'This link has expired', { expired: true });
  if (card.cancelled) throw new Fail(410, 'This link was stopped by the centre', { revoked: true });
  return reply(200, { card: JSON.parse(card.body), sentAt: iso(card.updated_at), serverTime: iso(now()) });
}

// ---------------------------------------------------------------- a teacher's public page: subjects, groups, free seats (no student)
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
async function publicPage(request, env, slug) {
  if (request.method !== 'GET') throw new Fail(405, 'Read only', { 'Allow': 'GET' });
  if (!SLUG_RE.test(slug || '')) throw new Fail(404, 'Not found');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (await limited(env, 'ip:' + ip, LIMIT_IP)) throw new Fail(429, 'Too many requests', { 'Retry-After': '60' });
  const p = await env.DB.prepare('SELECT body, updated_at FROM pages WHERE slug = ?').bind(slug).first();
  if (!p) throw new Fail(404, 'No such page');
  return reply(200, { page: JSON.parse(p.body), sentAt: iso(p.updated_at) }, { 'Cache-Control': 'public, max-age=60' });
}

// ---------------------------------------------------------------- the owner's phone: read the live picture of the centre, nothing else
// The phone keeps a long random key (given once by the centre PC as a QR code); the key is sent in a header, never in an address.
async function ownerRead(request, env) {
  if (request.method !== 'GET') throw new Fail(405, 'Read only', { 'Allow': 'GET' });
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!TOKEN_RE.test(token)) throw new Fail(401, 'Unknown phone', { revoked: true });
  const th = await sha256Hex(token);
  if (await limited(env, 'ip:' + ip, LIMIT_IP * 4) || await limited(env, 'ow:' + th, LIMIT_OWNER)) throw new Fail(429, 'Too many requests', { 'Retry-After': '30' });
  const dev = await env.DB.prepare('SELECT centre FROM owner_devices WHERE token_hash = ?').bind(th).first();
  if (!dev) throw new Fail(401, 'This phone was removed by the centre', { revoked: true });
  const st = await env.DB.prepare('SELECT body, updated_at FROM owner_state WHERE centre = ?').bind(dev.centre).first();
  const c = dev.centre ? await env.DB.prepare('SELECT until FROM centres WHERE id = ?').bind(dev.centre).first() : null;
  return reply(200, { state: st ? JSON.parse(st.body) : null, sentAt: st ? iso(st.updated_at) : null, serverTime: iso(now()),
    ...(c ? { until: dayIso(c.until), active: c.until + GRACE_DAYS >= today() } : {}) });
}

// ---------------------------------------------------------------- office side
// Returns the centre that signed the request: '' for the older one-centre setup (OFFICE_SECRET), else its id.
async function officeAuth(request, env, url, bodyBytes) {
  const centreId = request.headers.get('X-HS-Centre') || '';
  let secret = env.OFFICE_SECRET, centre = null;
  if (centreId) {
    if (!CENTRE_RE.test(centreId)) throw new Fail(401, 'Unauthorised');
    centre = await env.DB.prepare('SELECT * FROM centres WHERE id = ?').bind(centreId).first();
    if (!centre) throw new Fail(401, 'Unauthorised');
    secret = centre.secret;
  } else if (!secret) throw new Fail(503, 'The gateway has no office secret yet');
  const t = Number(request.headers.get('X-HS-Time')), nonce = request.headers.get('X-HS-Nonce') || '', sig = (request.headers.get('X-HS-Sig') || '').toLowerCase();
  if (!t || Math.abs(now() - t) > 300 || !/^[0-9a-f]{16,64}$/.test(nonce) || !sig) throw new Fail(401, 'Unauthorised');
  const expected = await hmacHex(secret, [request.method, url.pathname + url.search, String(t), nonce, await sha256Hex(bodyBytes)].join('\n'));
  if (!same(expected, sig)) throw new Fail(401, 'Unauthorised');
  const r = await env.DB.prepare('INSERT OR IGNORE INTO nonces(nonce, at) VALUES(?, ?)').bind(nonce, now()).run();
  if (!(r.meta ? r.meta.changes : r.changes)) throw new Fail(401, 'Replayed request');
  if (centre) await env.DB.prepare('UPDATE centres SET seen_at = ? WHERE id = ?').bind(now(), centre.id).run();
  return { id: centreId, row: centre };
}

// A centre joins the seller's service with its subscription code; nothing else is needed (no account, no password).
// One code joins one centre: a copied code cannot open a second centre. The secret it brings is then its office secret.
async function join(request, env) {
  if (request.method !== 'POST') throw new Fail(405, 'Post only', { 'Allow': 'POST' });
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (await limited(env, 'join:' + ip, 20)) throw new Fail(429, 'Too many requests', { 'Retry-After': '60' });
  const { data } = await readJson(request, 8 * 1024);
  const secret = String(data.secret || '');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) throw new Fail(400, 'Bad secret');
  const lic = await readLicence(env, data.licence);
  if (lic.until + GRACE_DAYS < today()) throw new Fail(402, 'The subscription has ended', { expired: true });
  const used = await env.DB.prepare('SELECT centre FROM licences WHERE serial = ?').bind(lic.serial).first();
  if (used) throw new Fail(409, 'This subscription code is already connected', { joined: true });
  const id = hex(crypto.getRandomValues(new Uint8Array(16)));
  const name = String(data.name || '').slice(0, 120);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO centres(id, secret, name, machines, until, created_at, seen_at) VALUES(?,?,?,?,?,?,?)').bind(id, secret, name, lic.machines.join(','), lic.until, now(), now()),
    env.DB.prepare('INSERT INTO licences(serial, centre, at) VALUES(?,?,?)').bind(lic.serial, id, now()),
  ]);
  return reply(200, { ok: true, centre: id, until: dayIso(lic.until) });
}

// A renewed subscription: the new code must name at least one PC of this centre.
async function renew(env, centre, data) {
  const lic = await readLicence(env, data.licence);
  const mine = new Set(String(centre.row.machines || '').split(',').filter(Boolean));
  if (!lic.machines.some((m) => mine.has(m))) throw new Fail(403, 'This subscription code belongs to another centre');
  const used = await env.DB.prepare('SELECT centre FROM licences WHERE serial = ?').bind(lic.serial).first();
  if (used && used.centre !== centre.id) throw new Fail(409, 'This subscription code is already connected', { joined: true });
  const machines = [...new Set([...mine, ...lic.machines])].join(',');
  await env.DB.batch([
    env.DB.prepare('UPDATE centres SET until = MAX(until, ?), machines = ? WHERE id = ?').bind(lic.until, machines, centre.id),
    env.DB.prepare('INSERT OR IGNORE INTO licences(serial, centre, at) VALUES(?,?,?)').bind(lic.serial, centre.id, now()),
  ]);
  const row = await env.DB.prepare('SELECT until FROM centres WHERE id = ?').bind(centre.id).first();
  return reply(200, { ok: true, until: dayIso(row.until) });
}

async function office(request, env, url, parts) {
  if (parts[1] === 'join') return join(request, env);
  const bodyBytes = request.method === 'GET' ? new Uint8Array(0) : await readBody(request, MAX_CARDS_BODY);
  const centre = await officeAuth(request, env, url, bodyBytes);
  const cid = centre.id;
  const what = parts[1], m = request.method;
  const json = () => { try { return JSON.parse(new TextDecoder().decode(bodyBytes)); } catch { throw new Fail(400, 'Not JSON'); } };
  if (what === 'licence' && m === 'PUT' && centre.row) return renew(env, centre, json());
  if (what === 'status' && m === 'GET') {
    const c = await env.DB.prepare('SELECT COUNT(*) n, MAX(updated_at) t FROM cards WHERE cancelled = 0 AND centre = ?').bind(cid).first();
    const o = await env.DB.prepare('SELECT COUNT(*) n FROM owner_devices WHERE centre = ?').bind(cid).first();
    return reply(200, { version: 3, cards: c.n, lastCardAt: c.t ? iso(c.t) : null, serverTime: iso(now()), owners: o.n,
      ...(centre.row ? { centre: cid, until: dayIso(centre.row.until), active: centre.row.until + GRACE_DAYS >= today() } : {}) });
  }
  // a centre whose subscription ended (after the grace days) can still renew and ask its status, but not publish
  if (centre.row && centre.row.until + GRACE_DAYS < today()) throw new Fail(402, 'The subscription has ended', { expired: true });

  if (what === 'cards' && m === 'PUT') {
    const d = json(), stmts = [];
    for (const c of (d.cards || []).slice(0, 500)) {
      const owner = c.studentId;
      if (!/^[0-9a-f]{64}$/.test(c.tokenHash || '') || typeof owner !== 'string' || !owner || owner.length > 200) throw new Fail(400, 'Bad card');
      const body = JSON.stringify(c.body || {});
      if (body.length > MAX_CARD) throw new Fail(400, 'Card too large');
      // Run together in one transaction: a revoked uploader cannot revoke the replacement, even after cleanup.
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO revoked_links(token_hash, at) SELECT token_hash, ? FROM cards WHERE student_id = ? AND centre = ? AND token_hash <> ? AND NOT EXISTS (SELECT 1 FROM revoked_links WHERE token_hash = ?)')
        .bind(now(), owner, cid, c.tokenHash, c.tokenHash));
      stmts.push(env.DB.prepare("UPDATE cards SET body = '{}', cancelled = 1, expires_at = ?, updated_at = ? WHERE student_id = ? AND centre = ? AND token_hash <> ? AND NOT EXISTS (SELECT 1 FROM revoked_links WHERE token_hash = ?)")
        .bind(now() + 30 * 86400, now(), owner, cid, c.tokenHash, c.tokenHash));
      // another centre's card is never overwritten (WHERE on the update)
      stmts.push(env.DB.prepare('INSERT INTO cards(token_hash, student_id, body, cancelled, expires_at, updated_at, centre) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM revoked_links WHERE token_hash = ?) ON CONFLICT(token_hash) DO UPDATE SET student_id = excluded.student_id, body = excluded.body, cancelled = excluded.cancelled, expires_at = excluded.expires_at, updated_at = excluded.updated_at WHERE cards.centre = excluded.centre')
        .bind(c.tokenHash, owner, body, c.cancelled ? 1 : 0, c.expiresAt || null, now(), cid, c.tokenHash));
    }
    // a replaced or removed link keeps an empty "stopped" row for 30 days, so the parent reads "this link no longer works"
    // (and the phone drops its saved copy) instead of "not ready yet"; the daily cleanup deletes it afterwards
    for (const h of (d.remove || []).slice(0, 500)) {
      if (!/^[0-9a-f]{64}$/.test(String(h))) continue;
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO revoked_links(token_hash, at) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM cards WHERE token_hash = ? AND centre <> ?)').bind(String(h), now(), String(h), cid));
      stmts.push(env.DB.prepare("INSERT INTO cards(token_hash, student_id, body, cancelled, expires_at, updated_at, centre) VALUES(?, '', '{}', 1, ?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET body = '{}', cancelled = 1, expires_at = excluded.expires_at, updated_at = excluded.updated_at WHERE cards.centre = excluded.centre")
        .bind(String(h), now() + 30 * 86400, now(), cid));
    }
    for (const id of (d.revokeStudents || []).slice(0, 500)) {
      if (typeof id !== 'string' || !id || id.length > 200) throw new Fail(400, 'Bad student');
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO revoked_links(token_hash, at) SELECT token_hash, ? FROM cards WHERE student_id = ? AND centre = ?').bind(now(), id, cid));
      stmts.push(env.DB.prepare("UPDATE cards SET body = '{}', cancelled = 1, expires_at = ?, updated_at = ? WHERE student_id = ? AND centre = ?")
        .bind(now() + 30 * 86400, now(), id, cid));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return reply(200, { ok: true, cards: (d.cards || []).length, removed: (d.remove || []).length });
  }
  if (what === 'pages' && m === 'PUT') {
    const d = json(), stmts = [];
    for (const p of (d.pages || []).slice(0, 200)) {
      if (!SLUG_RE.test(p.slug || '')) throw new Fail(400, 'Bad page address');
      const body = JSON.stringify(p.body || {});
      if (body.length > MAX_CARD) throw new Fail(400, 'Page too large');
      // a page address belongs to the centre that took it first
      stmts.push(env.DB.prepare('INSERT INTO pages(slug, body, updated_at, centre) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at WHERE pages.centre = excluded.centre').bind(p.slug, body, now(), cid));
    }
    for (const slug of (d.remove || []).slice(0, 200)) stmts.push(env.DB.prepare('DELETE FROM pages WHERE slug = ? AND centre = ?').bind(String(slug), cid));
    if (stmts.length) await env.DB.batch(stmts);
    return reply(200, { ok: true, pages: (d.pages || []).length });
  }
  // older office programs still ask for an inbox; parents' pages never write, so it is always empty
  if (what === 'inbox' && m === 'GET') return reply(200, { events: [], photos: [] });
  if (what === 'ack' && m === 'POST') return reply(200, { ok: true });
  if (what === 'owner' && m === 'PUT') {
    // the owner's live picture of the centre (replaced each time) and the list of the owner's phones (replaced when given)
    if (bodyBytes.length > MAX_OWNER) throw new Fail(413, 'Too large');
    const d = json(), stmts = [];
    if (d.state !== undefined) {
      const body = JSON.stringify(d.state || {});
      if (body.length > MAX_OWNER) throw new Fail(413, 'Too large');
      stmts.push(env.DB.prepare('INSERT INTO owner_state(centre, body, updated_at) VALUES(?,?,?) ON CONFLICT(centre) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').bind(cid, body, now()));
    }
    if (Array.isArray(d.devices)) {
      const keep = [];
      for (const dv of d.devices.slice(0, 20)) {
        if (!/^[0-9a-f]{64}$/.test(dv.tokenHash || '')) throw new Fail(400, 'Bad device');
        keep.push(dv.tokenHash);
        stmts.push(env.DB.prepare('INSERT INTO owner_devices(token_hash, centre, label, at) VALUES(?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET label = excluded.label WHERE owner_devices.centre = excluded.centre')
          .bind(dv.tokenHash, cid, String(dv.label || '').slice(0, 80), now()));
      }
      stmts.push(env.DB.prepare(`DELETE FROM owner_devices WHERE centre = ?${keep.length ? ' AND token_hash NOT IN (' + keep.map(() => '?').join(',') + ')' : ''}`).bind(cid, ...keep));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return reply(200, { ok: true });
  }
  if (what === 'whatsapp' && m === 'PUT') return whatsapp(env, cid, json());
  if (what === 'whatsapp' && m === 'GET') {
    const month = new Date().toISOString().slice(0, 7);
    const u = await env.DB.prepare('SELECT n FROM wa_usage WHERE centre = ? AND month = ?').bind(cid, month).first();
    return reply(200, { ready: !!(env.WA_TOKEN && env.WA_PHONE_ID), month, sent: u ? u.n : 0 });
  }
  throw new Fail(404, 'Not found');
}

// ---------------------------------------------------------------- WhatsApp: the seller's official WhatsApp Business number sends the
// centre's messages with templates approved by Meta (docs/HESSA_ONLINE.md). The centre PC decides what to send; the service sends
// each message once (by its key), counts them per centre and month, and never keeps a phone number (only its hash).
const WA_TEMPLATES = { hessa_report: 7, hessa_absence: 5, hessa_receipt: 5 };   // the number of values each approved template takes
const WA_RE = /^20(10|11|12|15)\d{8}$/;                                         // Egyptian mobiles, international form
async function whatsapp(env, cid, d) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID) throw new Fail(503, 'WhatsApp is not set up on the service yet', { whatsapp: false });
  const out = [], month = new Date().toISOString().slice(0, 7);
  let sent = 0;
  for (const msg of (d.messages || []).slice(0, 40)) {
    const key = String(msg.key || '').slice(0, 120), to = String(msg.to || ''), tpl = String(msg.template || '');
    const params = Array.isArray(msg.params) ? msg.params.map((p) => String(p === null || p === undefined || p === '' ? '—' : p).replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').slice(0, 300)) : [];
    if (!key || !WA_RE.test(to) || !(tpl in WA_TEMPLATES) || params.length !== WA_TEMPLATES[tpl]) { out.push({ key, status: 'refused' }); continue; }
    const had = await env.DB.prepare('SELECT status, wamid FROM wa_sent WHERE centre = ? AND key = ?').bind(cid, key).first();
    if (had && had.status === 'sent') { out.push({ key, status: 'sent', wamid: had.wamid, again: true }); continue; }
    let status = 'failed', wamid = '', error = '';
    try {
      const r = await fetch(`${env.WA_API || 'https://graph.facebook.com'}/v21.0/${env.WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + env.WA_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl, language: { code: msg.lang === 'en' ? 'en' : 'ar' },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] } }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.messages && j.messages[0]) { status = 'sent'; wamid = String(j.messages[0].id || ''); }
      else error = String((j.error && (j.error.message || j.error.code)) || r.status).slice(0, 200);
    } catch (e) { error = 'network'; }
    await env.DB.prepare('INSERT INTO wa_sent(centre, key, to_hash, status, wamid, error, at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(centre, key) DO UPDATE SET status = excluded.status, wamid = excluded.wamid, error = excluded.error, at = excluded.at')
      .bind(cid, key, await sha256Hex('wa|' + to), status, wamid, error, now()).run();
    if (status === 'sent') sent++;
    out.push({ key, status, ...(error ? { error } : {}) });
  }
  if (sent) await env.DB.prepare('INSERT INTO wa_usage(centre, month, n) VALUES(?,?,?) ON CONFLICT(centre, month) DO UPDATE SET n = n + excluded.n').bind(cid, month, sent).run();
  return reply(200, { results: out });
}

// ---------------------------------------------------------------- static pages and the entry point
// In the single-file bundle (build.js) the parent page files are embedded here; with wrangler they come from env.ASSETS.
let EMBEDDED_ASSETS = null;
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', webmanifest: 'application/manifest+json', png: 'image/png' };
async function fetchAsset(env, request, path) {
  if (env.ASSETS) {
    const u = new URL(request.url);
    u.pathname = path;
    return env.ASSETS.fetch(new Request(u.toString(), { method: 'GET' }));
  }
  const text = EMBEDDED_ASSETS && EMBEDDED_ASSETS[path];
  if (text === undefined || text === null) return new Response('Not found', { status: 404 });
  const data = typeof text === 'object' ? Uint8Array.from(atob(text.b64), (c) => c.charCodeAt(0)) : text;   // pictures are kept as base64
  return new Response(data, { status: 200, headers: { 'Content-Type': MIME[path.split('.').pop()] || 'text/plain' } });
}
async function asset(env, request, path, extra) {
  const r = await fetchAsset(env, request, path);
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(HEADERS)) h.set(k, v);
  h.set('Cache-Control', path.startsWith('/app/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  for (const [k, v] of Object.entries(extra || {})) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      const m = request.method;
      if (parts[0] === 'api' && parts[1] === 'page' && parts.length === 3) return await publicPage(request, env, parts[2]);
      if (parts[0] === 'api' && parts[1] === 'owner' && parts.length === 2) return await ownerRead(request, env);
      if (url.pathname === '/o' && m === 'GET') return new Response(null, { status: 301, headers: { ...HEADERS, Location: '/o/' } });
      if (url.pathname === '/o/' && m === 'GET') return await asset(env, request, '/owner.html');
      if (parts[0] === 'owner-sw.js' && m === 'GET') return await asset(env, request, '/app/owner-sw.js', { 'Service-Worker-Allowed': '/o/', 'Content-Type': 'text/javascript; charset=utf-8' });
      if (parts[0] === 'api') return await parent(request, env, url, parts);
      if (parts[0] === 'p' && parts.length === 2 && m === 'GET') return await asset(env, request, '/index.html');
      if (parts[0] === 'office') return await office(request, env, url, parts);
      if (parts[0] === 't' && parts.length === 2 && m === 'GET') return await asset(env, request, '/index.html');
      if (parts[0] === 'sw.js' && m === 'GET') return await asset(env, request, '/app/sw.js', { 'Service-Worker-Allowed': '/', 'Content-Type': 'text/javascript; charset=utf-8' });
      if (parts[0] === 'app' && m === 'GET') return await asset(env, request, url.pathname);
      if (url.pathname === '/' && m === 'GET') return reply(200, { name: 'Hessa gateway', ok: true });
      return reply(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof Fail) return reply(e.status, { error: e.message, ...(e.extra && !e.extra['Retry-After'] ? e.extra : {}) }, e.extra && e.extra['Retry-After'] ? { 'Retry-After': e.extra['Retry-After'] } : undefined);
      return reply(500, { error: 'Server error' });
    }
  },

  async scheduled(_event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM cards WHERE expires_at IS NOT NULL AND expires_at < ?').bind(now() - 7 * 86400),
      env.DB.prepare('DELETE FROM nonces WHERE at < ?').bind(now() - 3600),
      env.DB.prepare('DELETE FROM rate WHERE window < ?').bind(Math.floor(now() / WINDOW) - 2),
      env.DB.prepare('DELETE FROM wa_sent WHERE at < ?').bind(now() - 90 * 86400),
    ]);
  },
};

export { hmacHex, sha256Hex };
