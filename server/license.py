"""Monthly subscription: Hessa works on a PC only with an activation code made for that PC (owner's request, 2026-10-07).

How it works, without the internet:
1. The PC shows its REQUEST CODE: a short code made from this Windows installation's id (MachineGuid). The centre sends
   it to the seller (WhatsApp).
2. The seller runs `python tools/seller.py issue <request code> --days 31 --centre "..."` with his PRIVATE key (kept
   on the seller's own PC, never in the program or the repository) and sends back the ACTIVATION CODE.
3. The PC checks the code with the PUBLIC key built into the program (license_key.py): the signature, that it was made
   for THIS PC, and the date. A code copied to another PC, changed by one letter, or older than the last one is refused.
   The last paid day (`until`) is fixed inside the signed code; nothing in the program extends it.

What makes copying or cheating harder:
- every code names the PCs it is for (a hash of their MachineGuid);
- nobody can make a code without the seller's private key (Ed25519);
- moving the clock back does not bring days back: the program remembers the latest time it has seen - here, in the data's
  signed history, and (when online) the last trusted server date from the licence hub;
- when the centre is online, the hub's clock can end the paid month even if the PC date is wrong; when offline, the
  program does not lock just because the network is down.

What happens at the end: from 7 days before the end a bar at the bottom of every screen says how many days are left;
after the end there are 3 days of grace (red bar), then the program is LOCKED until a new code is entered.
"""
import email.utils
import hashlib
import json
import os
import struct
import sys
import threading
import urllib.request
from datetime import date, datetime, time as dt_time, timedelta

import ed25519
import node as node_mod

EPOCH = date(2026, 1, 1)
TRIAL_DAYS = 7
WARN_DAYS = 7
GRACE_DAYS = 3
CLOCK_SLACK = timedelta(hours=2)
KIND_ACTIVATE, KIND_RESET = 1, 2
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   # no 0/O, 1/I: codes are read out on the phone and typed by hand


def _compiled():
    """The installed Hessa.exe (Nuitka) - there, nothing outside the program may replace the key or switch checks off."""
    return '__compiled__' in globals() or getattr(sys, 'frozen', False)


def public_key():
    """The seller's public key. In the tests (never in Hessa.exe) another key can be given with HS_LICENSE_PUB."""
    override = os.environ.get('HS_LICENSE_PUB')
    if override and not _compiled():
        return bytes.fromhex(override)
    from license_key import PUBLIC_KEY
    return bytes.fromhex(PUBLIC_KEY)


def parse_server_moment(value):
    """A calendar moment from the licence hub (ISO date or date-time). None when unknown."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        s = str(value)
        if 'T' in s:
            return datetime.fromisoformat(s[:19])
        return datetime.combine(date.fromisoformat(s[:10]), dt_time(12, 0))
    except (ValueError, TypeError):
        return None


def probe_http_date(url, timeout=10, opener=None):
    """Lightweight online check: HTTPS Date header from the hub (fail-open: None on any error)."""
    url = (url or '').rstrip('/')
    if not url:
        return None
    try:
        req = urllib.request.Request(url + '/', method='HEAD')
        open_ = opener or urllib.request.urlopen
        with open_(req, timeout=timeout) as resp:
            raw = resp.headers.get('Date')
        if not raw:
            return None
        return email.utils.parsedate_to_datetime(raw).astimezone().replace(tzinfo=None)
    except Exception:
        return None


# ---------------------------------------------------------------- codes people can read and type
def encode(raw):
    """bytes -> groups of 5 letters/digits from ALPHABET, with a check letter at the end (catches a typo before anything else)."""
    n, bits, out = int.from_bytes(raw, 'big'), len(raw) * 8, []
    for _ in range((bits + 4) // 5):
        out.append(ALPHABET[n & 31])
        n >>= 5
    s = ''.join(reversed(out))
    s += ALPHABET[sum(ALPHABET.index(c) * (i + 1) for i, c in enumerate(s)) % 32]
    return '-'.join(s[i:i + 5] for i in range(0, len(s), 5))


def decode(code, length):
    s = ''.join(c for c in str(code or '').upper() if c.isalnum())   # dashes, spaces and small letters do not matter
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
    """MachineGuid on Windows (/etc/machine-id elsewhere), read here and never taken from the environment in Hessa.exe:
    otherwise HS_MACHINE_ID=<a licensed PC's id> would let a copy pretend to be that PC."""
    if not _compiled() and os.environ.get('HS_MACHINE_ID'):
        return os.environ['HS_MACHINE_ID']                     # the tests only
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography', 0,
                            winreg.KEY_READ | getattr(winreg, 'KEY_WOW64_64KEY', 0)) as k:
            return str(winreg.QueryValueEx(k, 'MachineGuid')[0])
    except (ImportError, OSError):
        for p in ('/etc/machine-id', '/var/lib/dbus/machine-id'):
            try:
                with open(p, encoding='ascii') as f:
                    return f.read().strip()
            except OSError:
                pass
    return node_mod.platform.node().lower()


def machine_hash(fingerprint=None):
    """8 bytes that name this Windows installation (MachineGuid; the computer's name is left out, so renaming the PC does
    not need a new code)."""
    fp = fingerprint or _machine_id()
    return hashlib.sha256(b'hessa-license|' + fp.encode('utf-8')).digest()[:8]


def _day(d):
    return (d - EPOCH).days


def _date(n):
    return EPOCH + timedelta(days=n)


# request: kind(1) machine(8) nonce(4)            -> 13 bytes
# answer:  version(1) kind(1) issued(2) until(2) serial(4) n(1) machines(8n) [nonce(4) for a reset] + signature(64)
def request_code(kind, machine, nonce):
    return encode(struct.pack('>B8sI', kind, machine, nonce))


def read_request(code):
    kind, machine, nonce = struct.unpack('>B8sI', decode(code, 13))
    if kind not in (KIND_ACTIVATE, KIND_RESET):
        raise ValueError('kind')
    return kind, machine, nonce


def make_code(seed, kind, machines, until=None, issued=None, serial=0, nonce=0):
    """The seller's side (tools/seller.py): sign an activation (until = last day it works) or a password reset."""
    issued = issued or date.today()
    until = until or issued
    body = struct.pack('>BBHHIB', 1, kind, _day(issued), _day(until), serial & 0xFFFFFFFF, len(machines)) + b''.join(machines)
    if kind == KIND_RESET:
        body += struct.pack('>I', nonce)
    return encode(body + ed25519.sign(seed, b'hessa-license|' + body))


def read_code(code, pub=None):
    """{kind, issued, until, serial, machines, nonce} of a genuine code, or ValueError (typo, forged, changed)."""
    s = ''.join(c for c in str(code or '').upper() if c.isalnum())
    for n in range(1, 9):                  # the length follows from the number of PCs in it
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


# ---------------------------------------------------------------- this PC's subscription
class License:
    def __init__(self, home, data_time=None, required=True, now=None):
        """home: where license.json lives (the PC's data, never synced). data_time(): the latest and earliest time in the
        signed history of the data, so a deleted license.json or a clock moved back is noticed."""
        self.path = os.path.join(home, 'license.json')
        self.data_time = data_time or (lambda: (None, None))
        self.required = required
        self.now = now or datetime.now
        self.lock = threading.Lock()
        self.machine = machine_hash()
        self.data = self._load()

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

    def _trusted_day(self):
        raw = self.data.get('trustedDate')
        if not raw:
            return None
        try:
            return date.fromisoformat(str(raw)[:10])
        except ValueError:
            return None

    def _seen(self, t):
        """The latest time this PC has ever seen (the high-water mark), raised to now when the clock is honest."""
        latest, _ = self.data_time()
        marks = [self.data.get('seen') or '', latest or '']
        trust = self._trusted_day()
        if trust:
            marks.append(datetime.combine(trust, dt_time(12, 0)).isoformat(timespec='seconds'))
        hw = max(marks)
        if t.isoformat(timespec='seconds') > hw:
            self.data['seen'] = t.isoformat(timespec='seconds')
            try:
                if not self.data.get('_saved') or self.data['seen'][:13] != self.data['_saved']:   # write at most once an hour
                    self.data['_saved'] = self.data['seen'][:13]
                    self._save()
            except OSError:
                pass
            return None
        return hw

    def note_online(self, server_moment):
        """Trusted hub time (polling or HTTPS Date). Fail-open: None does nothing; never locks because the network failed."""
        when = parse_server_moment(server_moment)
        if when is None:
            return
        with self.lock:
            day = when.date()
            prev = self._trusted_day()
            if prev is None or day > prev:
                self.data['trustedDate'] = day.isoformat()
            mark = when.isoformat(timespec='seconds')
            if mark > (self.data.get('seen') or ''):
                self.data['seen'] = mark
            self.data['onlineAt'] = self.now().isoformat(timespec='seconds')
            try:
                self._save()
            except OSError:
                pass

    def _clock_bad(self, t, behind):
        if behind and t + CLOCK_SLACK < datetime.fromisoformat(behind[:19]):
            return True
        trust = self._trusted_day()
        return bool(trust and t.date() < trust)

    def _billing_day(self, t):
        """Calendar day used for until/grace: local, raised by a trusted server date when the PC is behind the hub."""
        today = t.date()
        trust = self._trusted_day()
        if trust and today < trust:
            return today
        return max(today, trust) if trust else today

    def _state_for_until(self, until, billing_day):
        left = (until - billing_day).days + 1
        if left > WARN_DAYS:
            return 'ok', left
        if left > 0:
            return 'warn', left
        if left > -GRACE_DAYS:
            return 'grace', left
        return 'locked', left

    def request(self):
        return request_code(KIND_ACTIVATE, self.machine, 0)

    def status(self):
        """Everything the screens need. state: ok | warn | grace | locked | trial | trialEnded | clock | off."""
        with self.lock:
            t = self.now()
            today = t.date()
            behind = self._seen(t)
            out = {'request': self.request(), 'required': self.required, 'machineOk': True, 'centre': self.data.get('centre') or '',
                   'until': None, 'daysLeft': None, 'serial': self.data.get('serial'), 'history': (self.data.get('history') or [])[-12:]}
            code = self.data.get('code')
            info = None
            if code:
                try:
                    info = read_code(code)
                    if info['kind'] != KIND_ACTIVATE or self.machine not in info['machines']:
                        out['machineOk'] = False      # a license.json copied from another PC
                        info = None
                except ValueError:
                    info = None
            trust = self._trusted_day()
            if trust and today < trust and info:
                state, left = self._state_for_until(info['until'], trust)
                if state == 'locked':
                    return {**out, 'state': 'locked' if self.required else 'off', 'until': info['until'].isoformat(),
                            'daysLeft': left, 'graceLeft': max(0, left + GRACE_DAYS) if left <= 0 else None,
                            'issued': info['issued'].isoformat()}
            if self._clock_bad(t, behind):
                seen = behind or (self.data.get('trustedDate') or '')[:16]
                return {**out, 'state': 'clock' if self.required else 'off', 'clockSeen': str(seen)[:16].replace('T', ' ')}
            if not info:
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
            billing = self._billing_day(t)
            state, left = self._state_for_until(info['until'], billing)
            return {**out, 'state': state if self.required else 'off', 'until': info['until'].isoformat(), 'daysLeft': left,
                    'graceLeft': max(0, left + GRACE_DAYS) if left <= 0 else None, 'issued': info['issued'].isoformat()}

    def blocked(self):
        """True when nothing new may be saved (the data stays readable and exportable)."""
        return self.status()['state'] in ('locked', 'trialEnded', 'clock')

    def activate(self, code, who=''):
        """Check and keep an activation code for this PC. Raises ValueError with a reason the screen translates."""
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
            if cur:
                try:
                    old = read_code(cur)
                    if (old['until'], old['issued'], old['serial']) > (info['until'], info['issued'], info['serial']):
                        raise ValueError('older')       # an old code cannot replace a newer one (re-using last month's code)
                except ValueError as e:
                    if str(e) == 'older':
                        raise
            t = self.now()
            behind = self._seen(t)
            if self._clock_bad(t, behind):
                raise ValueError('clock')
            if info['until'] < t.date():
                raise ValueError('expired')
            self.data.update(code=''.join(c for c in code.upper() if c.isalnum()), serial=info['serial'])
            hist = self.data.setdefault('history', [])
            hist.append({'at': t.isoformat(timespec='seconds'), 'by': who, 'until': info['until'].isoformat(), 'serial': info['serial']})
            self.data['history'] = hist[-50:]
            self._save()
        return {'until': info['until'].isoformat(), 'serial': info['serial']}

    # -------------------------------------------------- forgotten administrator password
    def reset_request(self):
        """A new one-time request (valid 2 days) for a password reset code from the seller."""
        with self.lock:
            nonce = int.from_bytes(os.urandom(4), 'big')
            self.data['reset'] = {'nonce': nonce, 'at': self.now().isoformat(timespec='seconds')}
            self._save()
            return request_code(KIND_RESET, self.machine, nonce)

    def use_reset(self, code):
        """True when the code answers the open reset request of this PC; the request is then used up."""
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
