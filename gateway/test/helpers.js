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

// The seller's service: codes made by server/license.py with a synthetic test key (never the real seller key).
export const TEST_SELLER_PUB = '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8';
export const CODES = {
  pc1: 'ACAJB-C7W3G-AAAAR-WSDK9-CHK3C-HJSQX-ZSQY5-XQM6J-GJYFU-MV7MU-6CMCS-83A9H-PWDYD-WVFH7-VSTNK-52G5Q-Z7YF5-5FXK4-SD3HM-3LGQK-RM4J6-SXPUY-N6LZX-4X3HT-UQDUV-A5788-XJPE',
  pc1and2: 'ABAEA-TQ4NV-AAAAH-4SCW9-TDW6T-DWJHL-5D94S-9NRQA-VJG3L-3KY2K-YPJL7-CNHTG-Y2KSR-5LBLP-WRG2S-E9E94-QR4QQ-LZMVG-H5YLN-FZK9D-DRMNV-QEM2R-HNFX8-ZGUZ9-K4MLB-AQD8U-TYHW6-3MY2V-VARMS-BV',
  expired: 'ACAJA-AAAAU-AAAAR-XSDK9-CHK3C-HJSQX-Z7GEV-3KYYK-HM8YA-E4P5G-ZKKPS-TFTKF-Q239X-FVVQS-HPV26-G5LHM-2PH7V-6Q8RW-BTHV5-L9CKE-BFG24-J4WSL-XQ9T7-4SDZF-3VA8V-CCB99-L2QZ',
  pc2: 'ACAJB-C7W3G-AAAAR-YADD9-4S9NR-QAVJG-52QWP-6XLY2-QTVM9-GA8C2-4EUJJ-YEQXG-CPQAY-CXPVX-9UA8F-FWM8N-TVA7P-HT9S2-JAQUB-MFM3S-NWAHN-NQR8S-LU2AY-J39YH-ZG5K9-JPZPM-5SQC',
};
export const serviceEnv = () => makeEnv({ OFFICE_SECRET: '', SELLER_PUB: TEST_SELLER_PUB });
export async function joinCentre(env, licence, secret = randomBytes(24).toString('hex'), ip = '7.7.7.7') {
  const r = await worker.fetch(new Request('http://gw.test/office/join', { method: 'POST', headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify({ licence, secret, name: 'Synthetic Centre' }) }), env);
  return { r, j: await r.json(), secret };
}
export async function officeAs(env, centre, secret, method, path, obj) {
  const body = obj === undefined ? undefined : JSON.stringify(obj);
  const t = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('hex');
  const bytes = new TextEncoder().encode(body || '');
  const sig = await hmacHex(secret, [method, path, t, nonce, await sha256Hex(bytes)].join('\n'));
  return call(env, method, path, { body, headers: { 'X-HS-Centre': centre, 'X-HS-Time': t, 'X-HS-Nonce': nonce, 'X-HS-Sig': sig } });
}
