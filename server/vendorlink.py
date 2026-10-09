"""Hessa - the link to the seller's Control Center (owner's request, 2026-10-08; Apps-Factory ADR-0002).

What it does, and nothing more:
- SELF-CHECK on this PC (backup age, free disk, subscription, sync, recent server errors), shown on the Help page to
  everyone and used for everything below.
- HELP REQUEST: anyone signed in can send a short message to the seller. The page shows the person the exact text that
  will leave the PC first; phone numbers, e-mails, national ids and secrets are removed here, and again by the Control Center.
- SUPPORT WINDOW: only an administrator can let the seller in, for 30-120 minutes, naming what is allowed. It can be ended
  at any moment. Without an open window the seller can see nothing beyond the heartbeat and can repair nothing.
- REPAIRS: the seller may only ask for a short list of safe actions (check the data, take a backup, collect the error
  list). They run only while the window is open and each one is written in the security log.
- HEARTBEAT: every few hours, a fixed list of numbers (version, subscription state, last backup time, error count, free
  disk). No names, no phones, no money, no records.

It is OFF until an administrator, on the centre PC itself, enters the Control Center address and this PC's install code.
The address must be HTTPS (plain http only for 127.0.0.1 tests). The code is kept in support.json on this PC only - never in
the shared database, never logged, never shown again (only its last 4 letters).
"""
import json
import os
import re
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

FILE = 'support.json'
SCOPES = ('view_diagnostics', 'screen_session', 'repair')
MINUTES = (30, 60, 120)
REPAIRS = ('integrity_check', 'retry_failed_backup', 'collect_extended_logs', 'rebuild_search_index')
LICENCE_MAP = {'ok': 'active', 'warn': 'active', 'trial': 'active', 'grace': 'grace', 'locked': 'expired',
               'trialEnded': 'expired', 'clock': 'invalid', 'off': 'none'}
HEARTBEAT_EVERY = 6 * 3600
WINDOW_POLL = 60
TIMEOUT = 15
_REDACT = [
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'), '[EMAIL]'),
    (re.compile(r'(?<![\d٠-٩])(?:\+?20|0)?1[0125]\d{8}(?!\d)'), '[PHONE]'),
    (re.compile(r'(?<!\d)[23]\d{13}(?!\d)'), '[NATIONAL_ID]'),
    (re.compile(r'(?i)\b(bearer|token|password|passwd|secret|api[_-]?key)\b\s*[:=]\s*\S+'), r'\1=[SECRET]'),
    (re.compile(r'sk-ant-[A-Za-z0-9_-]+'), '[SECRET]'),
    (re.compile(r'\bins_[A-Za-z0-9_-]{20,}'), '[SECRET]'),
]


class LinkError(Exception):
    """A problem a person can understand: key is a dictionary key (sup.err.*)."""

    def __init__(self, key, text):
        super().__init__(text)
        self.key = key


def redact(value):
    """Removes personal data and secrets from anything that may leave the PC."""
    if isinstance(value, str):
        value = ''.join(chr(ord(c) - 0x0660 + 48) if '٠' <= c <= '٩' else c for c in value)  # Arabic digits too
        for pattern, repl in _REDACT:
            value = pattern.sub(repl, value)
        return value
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    return value


def checks(facts, now=None):
    """The self-check as [{id, level ok|warn|bad, vars}] from plain facts the program already knows."""
    now = now or datetime.now()
    out = []
    last = facts.get('lastBackup')
    hours = None
    if last:
        try:
            hours = max(0, int((now - datetime.fromisoformat(last[:19])).total_seconds() // 3600))
        except ValueError:
            hours = None
    if facts.get('backupError'):
        out.append({'id': 'backup', 'level': 'bad', 'vars': {'h': hours if hours is not None else '-'}, 'state': 'error'})
    elif hours is None:
        out.append({'id': 'backup', 'level': 'bad', 'vars': {}, 'state': 'none'})
    else:
        out.append({'id': 'backup', 'level': 'ok' if hours <= 24 else 'warn' if hours <= 48 else 'bad', 'vars': {'h': hours}, 'state': 'age'})
    free = facts.get('diskFreeMb')
    if free is not None:
        out.append({'id': 'disk', 'level': 'ok' if free >= 2048 else 'warn' if free >= 500 else 'bad', 'vars': {'gb': round(free / 1024, 1)}})
    lic = facts.get('licence') or 'off'
    out.append({'id': 'licence', 'level': 'ok' if lic in ('ok', 'trial', 'off') else 'warn' if lic == 'warn' else 'bad', 'vars': {}, 'state': lic})
    sync = facts.get('sync') or 'single'
    out.append({'id': 'sync', 'level': 'ok' if sync in ('single', 'ok') else 'bad' if sync == 'problem' else 'warn', 'vars': {}, 'state': sync})
    errors = int(facts.get('errors') or 0)
    out.append({'id': 'errors', 'level': 'ok' if not errors else 'warn', 'vars': {'n': errors}})
    return out


class Link:
    def __init__(self, data_dir, version, facts_fn, repair_fns, log_fn=print, security_fn=None):
        self.path = os.path.join(data_dir, FILE)
        self.data_dir = data_dir
        self.version = version
        self.facts_fn = facts_fn          # () -> dict of facts (see checks)
        self.repair_fns = repair_fns      # {action: () -> short English result}
        self.log = log_fn
        self.security = security_fn or (lambda detail: None)
        self.lock = threading.Lock()
        self.last = {'heartbeat': None, 'error': None}
        self._wake = threading.Event()
        self._thread = None

    # ------------------------------------------------------------ settings (this PC only)
    def data(self):
        try:
            with open(self.path, encoding='utf-8') as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _write(self, d):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(d, f)
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, self.path)

    @property
    def configured(self):
        d = self.data()
        return bool(d.get('url') and d.get('token'))

    def status(self):
        d = self.data()
        win = d.get('window') or {}
        open_ = bool(win.get('until') and win['until'] > utcnow())
        return {'configured': self.configured, 'host': urllib.parse.urlparse(d.get('url') or '').netloc,
                'ends': (d.get('token') or '')[-4:], 'lastHeartbeat': self.last['heartbeat'], 'lastError': self.last['error'],
                'window': {**win, 'open': open_} if win else None}

    def save(self, url, token):
        url = str(url or '').strip().rstrip('/')
        token = str(token or '').strip()
        u = urllib.parse.urlparse(url)
        local = u.hostname in ('127.0.0.1', 'localhost')
        if u.scheme not in ('https', 'http') or not u.netloc or (u.scheme == 'http' and not local):
            raise LinkError('sup.err.url', 'The Control Center address must start with https://.')
        if not re.fullmatch(r'ins_[A-Za-z0-9_-]{20,80}', token):
            raise LinkError('sup.err.token', 'This does not look like an install code from the Control Center (it starts with ins_).')
        with self.lock:
            self._write({'url': url, 'token': token, 'at': datetime.now().isoformat(timespec='seconds')})
        self._wake.set()

    def clear(self):
        with self.lock:
            try:
                os.remove(self.path)
            except OSError:
                pass

    # ------------------------------------------------------------ talking to the Control Center
    def call(self, method, path, body=None):
        d = self.data()
        if not (d.get('url') and d.get('token')):
            raise LinkError('sup.err.off', 'The link to the seller is not set up on this PC.')
        req = urllib.request.Request(d['url'] + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json', 'X-Install-Token': d['token'],
                                              'User-Agent': 'Hessa/' + self.version})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read() or b'null')
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise LinkError('sup.err.refused', 'The Control Center does not accept this PC (the install code was changed or stopped).') from e
            raise LinkError('sup.err.failed', f'The Control Center answered {e.code}.') from e
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise LinkError('sup.err.unreachable', 'The Control Center cannot be reached (no internet?). Try again later.') from e

    def heartbeat_body(self, facts):
        """The complete list of what the heartbeat carries - the Control Center refuses any other field."""
        body = {'version': self.version, 'licence_state': LICENCE_MAP.get(facts.get('licence') or 'off', 'none'),
                'error_count': int(facts.get('errors') or 0)}
        if facts.get('lastBackup'):
            body['last_backup_at'] = facts['lastBackup'][:19]
        if facts.get('diskFreeMb') is not None:
            body['disk_free_mb'] = int(facts['diskFreeMb'])
        return body

    def heartbeat(self):
        res = self.call('POST', '/api/agent/heartbeat', self.heartbeat_body(self.facts_fn()))
        self.last.update(heartbeat=datetime.now().isoformat(timespec='seconds'), error=None)
        return res or {}

    def bundle(self, facts=None):
        """What a help request carries, exactly as the person sees it before sending."""
        facts = facts or self.facts_fn()
        return redact({'version': self.version, 'checks': [{'id': c['id'], 'level': c['level'], 'state': c.get('state', '')} for c in checks(facts)],
                       'licence': facts.get('licence'), 'lastBackup': facts.get('lastBackup'), 'diskFreeMb': facts.get('diskFreeMb'),
                       'sync': facts.get('sync'), 'recentErrors': [str(x)[:300] for x in (facts.get('errorSamples') or [])[:5]]})

    def send_ticket(self, subject, message, attach, who):
        subject, message = str(subject or '').strip(), str(message or '').strip()
        if len(subject) < 3 or len(message) < 3:
            raise LinkError('sup.err.short', 'Write a title and a few words about the problem.')
        body = {'subject': redact(subject)[:150], 'message': redact(f'{message}\n\n- {who}')[:4000],
                'bundle': self.bundle() if attach else {}}
        res = self.call('POST', '/api/agent/tickets', body)
        self.security('Help request sent to the seller')
        return res

    def tickets(self):
        return self.call('GET', '/api/agent/tickets') or []

    def open_window(self, minutes, scopes, approved_by):
        if minutes not in MINUTES:
            raise LinkError('sup.err.minutes', 'Choose 30, 60 or 120 minutes.')
        scopes = sorted({s for s in scopes or [] if s in SCOPES})
        if not scopes:
            raise LinkError('sup.err.scopes', 'Choose at least one thing the seller may do.')
        res = self.call('POST', '/api/agent/grants', {'scopes': scopes, 'minutes': minutes, 'approved_by': str(approved_by)[:80]})
        with self.lock:
            d = self.data()
            d['window'] = {'id': res['id'], 'code': res['code'], 'until': str(res['expires_at']).rstrip('Z'), 'scopes': scopes,
                           'by': str(approved_by)[:80]}
            self._write(d)
        self.security(f'Seller support window opened for {minutes} minutes')
        self._wake.set()
        return self.status()['window']

    def end_window(self):
        d = self.data()
        win = d.get('window')
        if win:
            try:
                self.call('DELETE', f"/api/agent/grants/{win['id']}")
            finally:
                with self.lock:
                    d = self.data()
                    d.pop('window', None)
                    self._write(d)
            self.security('Seller support window ended')
        return self.status()

    # ------------------------------------------------------------ repairs (only what the seller may ask for)
    def run_repairs(self):
        done = 0
        for job in self.call('GET', '/api/agent/repairs') or []:
            action = job.get('action')
            fn = self.repair_fns.get(action) if action in REPAIRS else None
            try:
                result, status = (fn() if fn else 'Not needed in Hessa'), 'done'
            except Exception as e:  # noqa: BLE001 - the seller sees the failure, the program keeps running
                result, status = f'Failed: {e}', 'failed'
            self.call('POST', f"/api/agent/repairs/{job['id']}", {'status': status, 'result': redact(str(result))[:4000]})
            self.security(f'Seller repair run: {action}')
            done += 1
        return done

    # ------------------------------------------------------------ background
    def check(self):
        """One round: heartbeat, then any approved repair while the support window is open."""
        res = self.heartbeat()
        win = self.status().get('window') or {}
        done = self.run_repairs() if res.get('repairs_waiting') and win.get('open') else 0
        return {'answer': res, 'repairs': done}

    def tick(self):
        if not self.configured:
            return
        try:
            self.check()
        except LinkError as e:
            self.last['error'] = e.key

    def start(self):
        def loop():
            time.sleep(30)
            while True:
                self.tick()
                win = self.status().get('window') or {}
                self._wake.wait(WINDOW_POLL if win.get('open') else HEARTBEAT_EVERY)
                self._wake.clear()
        self._thread = threading.Thread(target=loop, name='vendorlink', daemon=True)
        self._thread.start()


def disk_free_mb(path):
    try:
        return shutil.disk_usage(path).free // (1024 * 1024)
    except OSError:
        return None


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec='seconds')


def since(days):
    return (datetime.now() - timedelta(days=days)).date().isoformat()
