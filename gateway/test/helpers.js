import worker, { hmacHex, sha256Hex } from '../src/worker.js';
import { makeEnv } from '../dev/server.js';
import { randomBytes } from 'node:crypto';

export const SECRET = 'test-secret-0123456789abcdef';
export const newEnv = () => makeEnv({ OFFICE_SECRET: SECRET });
export const call = (env, method, path, { body, headers } = {}) =>
  worker.fetch(new Request('http://gw.test' + path, { method, headers: { 'CF-Connecting-IP': '9.9.9.9', ...(headers || {}) }, body }), env);

export async function office(env, method, path, obj, over = {}) {
  const body = obj === undefined ? undefined : (obj instanceof Uint8Array ? obj : JSON.stringify(obj));
  const t = String(over.time ?? Math.floor(Date.now() / 1000)), nonce = over.nonce ?? randomBytes(16).toString('hex');
  const bytes = body === undefined ? new Uint8Array(0) : (typeof body === 'string' ? new TextEncoder().encode(body) : body);
  const sig = over.sig ?? await hmacHex(over.secret ?? SECRET, [method, path, t, nonce, await sha256Hex(bytes)].join('\n'));
  return call(env, method, path, { body, headers: { 'X-HS-Time': t, 'X-HS-Nonce': nonce, 'X-HS-Sig': sig } });
}

export const TOKEN = 'Tk_abcdefghijklmnopqrstuv';
export const CARD = { name: 'Synthetic Child', code: '10001', grade: 'S1', center: 'Synthetic Centre', groups: [], week: [], attendance: [], marks: [], payments: [], wallet: 0 };
export async function putCard(env, extra = {}, token = TOKEN) {
  const tokenHash = await sha256Hex(token);
  const r = await office(env, 'PUT', '/office/cards', { cards: [{ tokenHash, studentId: 'st1', body: CARD, expiresAt: Math.floor(Date.now() / 1000) + 86400, ...extra }] });
  if (r.status !== 200) throw new Error('card ' + r.status);
  return tokenHash;
}
