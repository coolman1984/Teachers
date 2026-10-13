"""Monthly subscription: activation on this PC via seller codes (tools/seller.py) and optional online 14-day trials (licence-hub).

Paid months use the seller's private key on the owner's PC only. The Cloudflare Worker holds a separate trial-only signing key (kid trial-hub).
"""
import hashlib
import json
import os
import struct
import sys
import threading
import time
from datetime import date, datetime, timedelta

import ed25519
import node as node_mod

from license_hub_mixin import LicenseHubMixin

EPOCH = date(2026, 1, 1)
TRIAL_DAYS = 7
WARN_DAYS = 7
GRACE_DAYS = 3
CLOCK_SLACK = timedelta(hours=2)
RUN_LIMIT = timedelta(hours=30)
KIND_ACTIVATE, KIND_RESET = 1, 2
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def _compiled():
    return ('__compiled__' in globals() or '__uncompiled__' in globals()
            or getattr(sys, 'frozen', False))


def public_key():
    override = os.environ.get('HS_LICENSE_PUB')
    if override and not _compiled():
        return bytes.fromhex(override)
    from license_key import PUBLIC_KEY
    return bytes.fromhex(PUBLIC_KEY)


def encode(raw):
    n, bits, out = int.from_bytes(raw, 'big'), len(raw) * 8, []
    for _ in range((bits + 4) // 5):
        out.append(ALPHABET[n & 31])
        n >>= 5
    s = ''.join(reversed(out))
    s += ALPHABET[sum(ALPHABET.index(c) * (i + 1) for i, c in enumerate(s)) % 32]
    return '-'.join(s[i:i + 5] for i in range(0, len(s), 5))


def decode(code, length):
    s = ''.join(c for c in str(code or '').upper() if c.isalnum())
    if len(s) < 2 or any(c not in ALPHABET for c in s):
        raise ValueError('bad characters')
    body, check = s[:-1], s[-1]
    if ALPHABET[sum(ALPHABET.index(c) * (i + 1) for i, c in enumerate(body)) % 32] != check:
        raise ValueError('typo')
    n = 0
    for c in body:
        n = n * 32 + ALPHABET.index(c)
    if n >> (length * 8):
        raise ValueError('too long')
    return n.to_bytes(length, 'big')


def _machine_id():
    if not _compiled() and os.environ.get('HS_MACHINE_ID'):
        return os.environ['HS_MACHINE_ID']
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography', 0,
                            winreg.KEY_READ | getattr(winreg, 'KEY_WOW64_64KEY', 0)) as k:
            return str(winreg.QueryValueEx(k, 'MachineGuid')[0])
    except (ImportError, OSError):
        pass
    for p in ('/etc/machine-id', '/var/lib/dbus/machine-id'):
        try:
            with open(p, encoding='ascii') as f:
                return f.read().strip()
        except OSError:
            pass
    return node_mod.platform.node().lower()


def machine_hash(fingerprint=None):
    fp = fingerprint or _machine_id()
    return hashlib.sha256(b'hessa-license|' + fp.encode('utf-8')).digest()[:8]


def _day(d):
    return (d - EPOCH).days


def _date(n):
    return EPOCH + timedelta(days=n)


def request_code(kind, machine, nonce):
    return encode(struct.pack('>B8sI', kind, machine, nonce))


def read_request(code):
    kind, machine, nonce = struct.unpack('>B8sI', decode(code, 13))
    if kind not in (KIND_ACTIVATE, KIND_RESET):
        raise ValueError('kind')
    return kind, machine, nonce


def make_code(seed, kind, machines, until=None, issued=None, serial=0, nonce=0):
    issued = issued or date.today()
    until = until or issued
    body = struct.pack('>BBHHIB', 1, kind, _day(issued), _day(until), serial & 0xFFFFFFFF, len(machines)) + b''.join(machines)
    if kind == KIND_RESET:
        body += struct.pack('>I', nonce)
    return encode(body + ed25519.sign(seed, b'hessa-license|' + body))


def read_code(code, pub=None):
    s = ''.join(c for c in str(code or '').upper() if c.isalnum())
    for n in range(1, 9):
        for extra in (0, 4):
            length = 11 + 8 * n + extra + 64
            if len(s) - 1 != (length * 8 + 4) // 5:
                continue
            raw = decode(code, length)
            body, sig = raw[:-64], raw[-64:]
            if not ed25519.verify(pub or public_key(), b'hessa-license|' + body, sig):
                raise ValueError('signature')
            ver, kind, issued, until, serial, count = struct.unpack('>BBHHIB', body[:11])
            machines = [body[11 + 8 * i:19 + 8 * i] for i in range(count)]
            nonce = struct.unpack('>I', body[11 + 8 * count:15 + 8 * count])[0] if kind == KIND_RESET else 0
            if ver != 1 or count != n or len(body) != 11 + 8 * count + (4 if kind == KIND_RESET else 0):
                raise ValueError('shape')
            return {'kind': kind, 'issued': _date(issued), 'until': _date(until), 'serial': serial, 'machines': machines, 'nonce': nonce}
    raise ValueError('length')


class License(LicenseHubMixin):
    def __init__(self, home, data_time=None, required=True, now=None, elapsed=None, monotonic=None,
                 assist=None, cfg=None, root=None, shop_name=lambda: ''):
        self.path = os.path.join(home, 'license.json')
        self.data_time = data_time or (lambda: (None, None))
        self.required = required
        self.now = now or datetime.now
        self._elapsed = elapsed
        self.monotonic = monotonic or time.monotonic
        self._mono_at = None
        self.lock = threading.Lock()
        self.machine = machine_hash()
        self.data = self._load()
        if assist is not None:
            self.init_hub(assist, cfg, root or home, home, shop_name)

    def _load(self):
        try:
            with open(self.path, encoding='utf-8') as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save(self):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, indent=1)
        os.replace(tmp, self.path)

    def _seen(self, t):
        latest, _ = self.data_time()
        marks = [self.data.get('seen') or '', latest or '']
        hw = max(marks)
        if t.isoformat(timespec='seconds') > hw:
            self.data['seen'] = t.isoformat(timespec='seconds')
            try:
                if not self.data.get('_saved') or self.data['seen'][:13] != self.data['_saved']:
                    self.data['_saved'] = self.data['seen'][:13]
                    self._save()
            except OSError:
                pass
            return None
        return hw

    def _tick_runtime(self, t):
        today = t.date().isoformat()
        run_day = self.data.get('runDay')
        run_sec = float(self.data.get('runSec') or 0)
        if self._elapsed is not None:
            delta = max(0.0, float(self._elapsed()))
        else:
            mono = self.monotonic()
            delta = max(0.0, mono - self._mono_at) if self._mono_at is not None else 0.0
            self._mono_at = mono
        if run_day != today:
            run_day, run_sec = today, 0.0
        run_sec += delta
        self.data['runDay'] = run_day
        self.data['runSec'] = run_sec
        try:
            if self.data.get('_runSaved') != run_sec:
                self.data['_runSaved'] = run_sec
                self._save()
        except OSError:
            pass
        return run_sec > RUN_LIMIT.total_seconds()

    def request(self):
        return request_code(KIND_ACTIVATE, self.machine, 0)

    def status(self, admin=False):
        with self.lock:
            t = self.now()
            today = t.date()
            behind = self._seen(t)
            frozen = self._tick_runtime(t)
            out = {'request': self.request(), 'required': self.required, 'machineOk': True, 'centre': self.data.get('centre') or '',
                   'until': None, 'daysLeft': None, 'serial': self.data.get('serial'), 'history': (self.data.get('history') or [])[-12:],
                   'hub': self.hub_enabled if getattr(self, 'a', None) else False}
            if admin and getattr(self, 'a', None) and self.hub_enabled:
                out['afDevice'] = self.af_device()
                out['hubRequest'] = self.hub_public()
            if behind and t + CLOCK_SLACK < datetime.fromisoformat(behind[:19]):
                return {**out, 'state': 'clock' if self.required else 'off', 'clockSeen': behind[:16].replace('T', ' ')}
            if frozen:
                return {**out, 'state': 'clock' if self.required else 'off', 'clockSeen': t.replace(microsecond=0).strftime('%Y-%m-%d %H:%M')}
            code = self.data.get('code')
            info = None
            if code:
                try:
                    info = read_code(code)
                    if info['kind'] != KIND_ACTIVATE or self.machine not in info['machines']:
                        out['machineOk'] = False
                        info = None
                except ValueError:
                    info = None
                if not info and self._looks_af_code(code):
                    r = self._af_check(code, today)
                    if r:
                        return self._af_to_legacy_state(r, out, self.required, today)
            if info:
                left = (info['until'] - today).days + 1
                state = 'ok' if left > WARN_DAYS else 'warn' if left > 0 else 'grace' if left > -GRACE_DAYS else 'locked'
                return {**out, 'state': state if self.required else 'off', 'until': info['until'].isoformat(), 'daysLeft': left,
                        'graceLeft': max(0, left + GRACE_DAYS) if left <= 0 else None, 'issued': info['issued'].isoformat()}
            _, earliest = self.data_time()
            start = min(d for d in (self.data.get('trialStart'), (earliest or '')[:10] or None, today.isoformat()) if d)
            if not self.data.get('trialStart'):
                self.data['trialStart'] = start
                try:
                    self._save()
                except OSError:
                    pass
            end = date.fromisoformat(start) + timedelta(days=TRIAL_DAYS - 1)
            left = (end - today).days + 1
            state = 'trial' if left > 0 else 'trialEnded'
            return {**out, 'state': state if self.required else 'off', 'until': end.isoformat(), 'daysLeft': max(0, left)}

    def blocked(self):
        return self.status()['state'] in ('locked', 'trialEnded', 'clock')

    def activate(self, code, who=''):
        code = str(code or '').strip()
        if self._looks_af_code(code):
            return self.activate_af(code, who=who, manual=True)
        try:
            info = read_code(code)
        except ValueError as e:
            raise ValueError('typo' if str(e) in ('typo', 'bad characters', 'length', 'too long') else 'forged')
        if info['kind'] != KIND_ACTIVATE:
            raise ValueError('kind')
        if self.machine not in info['machines']:
            raise ValueError('otherPc')
        with self.lock:
            cur = self.data.get('code')
            if cur and not self._looks_af_code(cur):
                try:
                    old = read_code(cur)
                    if (old['until'], old['issued'], old['serial']) > (info['until'], info['issued'], info['serial']):
                        raise ValueError('older')
                except ValueError as e:
                    if str(e) == 'older':
                        raise
            t = self.now()
            behind = self._seen(t)
            if behind and t + CLOCK_SLACK < datetime.fromisoformat(behind[:19]):
                raise ValueError('clock')
            if self._tick_runtime(t):
                raise ValueError('clock')
            if info['until'] < t.date():
                raise ValueError('expired')
            self.data.update(code=''.join(c for c in code.upper() if c.isalnum()), serial=info['serial'], codeKind='legacy')
            self.data.pop('afEdition', None)
            hist = self.data.setdefault('history', [])
            hist.append({'at': t.isoformat(timespec='seconds'), 'by': who, 'until': info['until'].isoformat(), 'serial': info['serial']})
            self.data['history'] = hist[-50:]
            self._save()
        return {'until': info['until'].isoformat(), 'serial': info['serial']}

    def reset_request(self):
        with self.lock:
            nonce = int.from_bytes(os.urandom(4), 'big')
            self.data['reset'] = {'nonce': nonce, 'at': self.now().isoformat(timespec='seconds')}
            self._save()
            return request_code(KIND_RESET, self.machine, nonce)

    def use_reset(self, code):
        with self.lock:
            req = self.data.get('reset') or {}
            try:
                info = read_code(code)
            except ValueError:
                raise ValueError('forged')
            if info['kind'] != KIND_RESET or self.machine not in info['machines']:
                raise ValueError('otherPc')
            if not req or info['nonce'] != req.get('nonce'):
                raise ValueError('used')
            if self.now() - datetime.fromisoformat(req['at']) > timedelta(days=2):
                raise ValueError('expired')
            self.data.pop('reset', None)
            self._save()
            return True
