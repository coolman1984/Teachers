// Hessa gateway - a Cloudflare Worker + D1 mailbox for the parents' links. No dependencies.
// Parents' phones only READ one card at /api/card/<token> (the link token is the key). Office PCs write cards at /office/ (signed
// requests). Tokens are never stored or logged: the database keys everything by sha256(token). Nothing here can change the
// centre's data - the office database is the only source of truth.

const enc = new TextEncoder();
const MAX_CARDS_BODY = 1024 * 1024;
const MAX_CARD = 16 * 1024;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const LIMIT_TOKEN = 60, LIMIT_IP = 300, WINDOW = 600;      // requests per 10 minutes

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

// ---------------------------------------------------------------- office side
async function officeAuth(request, env, url, bodyBytes) {
  if (!env.OFFICE_SECRET) throw new Fail(503, 'The gateway has no office secret yet');
  const t = Number(request.headers.get('X-HS-Time')), nonce = request.headers.get('X-HS-Nonce') || '', sig = (request.headers.get('X-HS-Sig') || '').toLowerCase();
  if (!t || Math.abs(now() - t) > 300 || !/^[0-9a-f]{16,64}$/.test(nonce) || !sig) throw new Fail(401, 'Unauthorised');
  const expected = await hmacHex(env.OFFICE_SECRET, [request.method, url.pathname + url.search, String(t), nonce, await sha256Hex(bodyBytes)].join('\n'));
  if (!same(expected, sig)) throw new Fail(401, 'Unauthorised');
  const r = await env.DB.prepare('INSERT OR IGNORE INTO nonces(nonce, at) VALUES(?, ?)').bind(nonce, now()).run();
  if (!(r.meta ? r.meta.changes : r.changes)) throw new Fail(401, 'Replayed request');
}

async function office(request, env, url, parts) {
  const bodyBytes = request.method === 'GET' ? new Uint8Array(0) : await readBody(request, MAX_CARDS_BODY);
  await officeAuth(request, env, url, bodyBytes);
  const what = parts[1], m = request.method;
  const json = () => { try { return JSON.parse(new TextDecoder().decode(bodyBytes)); } catch { throw new Fail(400, 'Not JSON'); } };

  if (what === 'cards' && m === 'PUT') {
    const d = json(), stmts = [];
    for (const c of (d.cards || []).slice(0, 500)) {
      const owner = c.studentId;
      if (!/^[0-9a-f]{64}$/.test(c.tokenHash || '') || !owner) throw new Fail(400, 'Bad card');
      const body = JSON.stringify(c.body || {});
      if (body.length > MAX_CARD) throw new Fail(400, 'Card too large');
      stmts.push(env.DB.prepare('INSERT INTO cards(token_hash, student_id, body, cancelled, expires_at, updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET student_id = excluded.student_id, body = excluded.body, cancelled = excluded.cancelled, expires_at = excluded.expires_at, updated_at = excluded.updated_at')
        .bind(c.tokenHash, String(owner), body, c.cancelled ? 1 : 0, c.expiresAt || null, now()));
    }
    // a replaced or removed link keeps an empty "stopped" row for 30 days, so the parent reads "this link no longer works"
    // (and the phone drops its saved copy) instead of "not ready yet"; the daily cleanup deletes it afterwards
    for (const h of (d.remove || []).slice(0, 500)) {
      if (!/^[0-9a-f]{64}$/.test(String(h))) continue;
      stmts.push(env.DB.prepare("INSERT INTO cards(token_hash, student_id, body, cancelled, expires_at, updated_at) VALUES(?, '', '{}', 1, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET body = '{}', cancelled = 1, expires_at = excluded.expires_at, updated_at = excluded.updated_at")
        .bind(String(h), now() + 30 * 86400, now()));
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
      stmts.push(env.DB.prepare('INSERT INTO pages(slug, body, updated_at) VALUES(?,?,?) ON CONFLICT(slug) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').bind(p.slug, body, now()));
    }
    for (const slug of (d.remove || []).slice(0, 200)) stmts.push(env.DB.prepare('DELETE FROM pages WHERE slug = ?').bind(String(slug)));
    if (stmts.length) await env.DB.batch(stmts);
    return reply(200, { ok: true, pages: (d.pages || []).length });
  }
  // older office programs still ask for an inbox; parents' pages never write, so it is always empty
  if (what === 'inbox' && m === 'GET') return reply(200, { events: [], photos: [] });
  if (what === 'ack' && m === 'POST') return reply(200, { ok: true });
  if (what === 'status' && m === 'GET') {
    const c = await env.DB.prepare('SELECT COUNT(*) n, MAX(updated_at) t FROM cards WHERE cancelled = 0').first();
    return reply(200, { version: 2, cards: c.n, lastCardAt: c.t ? iso(c.t) : null, serverTime: iso(now()) });
  }
  throw new Fail(404, 'Not found');
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
  return new Response(text, { status: 200, headers: { 'Content-Type': MIME[path.split('.').pop()] || 'text/plain' } });
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
    ]);
  },
};

export { hmacHex, sha256Hex };
