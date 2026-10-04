"""Hessa - the office side of the internet mailbox (the gateway) for the parents' links.

The office PC never listens on the internet: it only calls out to the gateway. It pushes one small read-only "card"
per student who has a parent link (attendance, marks, money, timetable - only that child's data, never a phone number).
The parent opens the link on any phone; the office keeps working without internet and pushes again later.

Secrets (the office secret shared with the gateway and the link secret that makes the links) live in gateway.json in
the data folder of each PC - never in the shared database, never in logs.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets as pysecrets
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

log = logging.getLogger('hs.gateway')


class GatewayError(Exception):
    """A problem with a message for the person at the office."""


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def link_token(link_secret, student_id, nonce):
    """22 characters, made from the link secret, so any office PC can make the same link again ("send again")."""
    return b64url(hmac.new(link_secret.encode(), f'HS-LINK1|{student_id}|{nonce}'.encode(), hashlib.sha256).digest()[:16])


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def sign_headers(secret, method, path, body=b'', t=None, nonce=None):
    t = str(int(t if t is not None else time.time()))
    nonce = nonce or pysecrets.token_hex(16)
    msg = '\n'.join([method, path, t, nonce, hashlib.sha256(body).hexdigest()])
    return {'X-HS-Time': t, 'X-HS-Nonce': nonce, 'X-HS-Sig': hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()}


# --------------------------------------------------------------------------- secrets of this PC
class Secrets:
    """gateway.json: {url, officeSecret, linkSecret, pollSeconds}. The setup code moves them to the other office PCs."""

    def __init__(self, path):
        self.path = path
        self.data = {}
        self.load()

    def load(self):
        try:
            with open(self.path, encoding='utf-8') as f:
                self.data = json.load(f)
        except (OSError, ValueError):
            self.data = {}

    def save(self):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.data, f)
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, self.path)

    @property
    def url(self):
        return (self.data.get('url') or '').rstrip('/')

    @property
    def configured(self):
        return bool(self.url and self.data.get('officeSecret') and self.data.get('linkSecret'))

    def set_url(self, url):
        url = str(url or '').strip().rstrip('/')
        if url and not re.fullmatch(r'https://[A-Za-z0-9.-]+(:\d+)?', url) and not re.fullmatch(r'http://(127\.0\.0\.1|localhost)(:\d+)?', url):
            raise GatewayError('The address must start with https:// (for example https://hessa.yourname.workers.dev).')
        self.data['url'] = url
        self.save()

    def generate(self):
        self.data['officeSecret'] = pysecrets.token_urlsafe(32)
        self.data['linkSecret'] = pysecrets.token_urlsafe(32)
        self.save()

    def setup_code(self):
        if not self.configured:
            raise GatewayError('The mailbox is not set up yet.')
        return b64url(json.dumps({'v': 1, 'u': self.url, 'o': self.data['officeSecret'], 'l': self.data['linkSecret']}).encode())

    def from_code(self, code):
        try:
            raw = re.sub(r'\s+', '', str(code))
            d = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
            assert d['v'] == 1 and d['o'] and d['l']
        except Exception:
            raise GatewayError('This setup code is not valid. Copy it again from the first office PC.')
        self.set_url(d['u'])
        self.data['officeSecret'], self.data['linkSecret'] = d['o'], d['l']
        self.save()


# --------------------------------------------------------------------------- talking to the gateway
class Client:
    def __init__(self, url, secret, timeout=25):
        self.url, self.secret, self.timeout = url.rstrip('/'), secret, timeout

    def call(self, method, path, obj=None, raw=False):
        body = b'' if obj is None else json.dumps(obj).encode()
        req = urllib.request.Request(self.url + path, data=body if method != 'GET' else None, method=method,
                                     headers={**sign_headers(self.secret, method, path, body if method != 'GET' else b''), 'Content-Type': 'application/json',
                                              'User-Agent': 'Hessa-Office'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                data = r.read()
                return data if raw else json.loads(data or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise GatewayError('The mailbox refused this PC. The secret does not match the one set on the gateway.')
            if e.code == 503:
                raise GatewayError('The mailbox is running but has no secret yet. Set OFFICE_SECRET on it (see the setup guide).')
            raise GatewayError(f'The mailbox answered with an error ({e.code}).')
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise GatewayError('Cannot reach the mailbox. Check the internet on this PC and the address.') from e

    def status(self):
        return self.call('GET', '/office/status')

    def put_cards(self, cards, remove=()):
        return self.call('PUT', '/office/cards', {'cards': cards, 'remove': list(remove)})

    def inbox(self, limit=100):
        return self.call('GET', f'/office/inbox?limit={int(limit)}')

    def photo(self, uid):
        return self.call('GET', f'/office/photo/{uid}', raw=True)

    def ack(self, events, photos):
        return self.call('POST', '/office/ack', {'events': list(events), 'photos': list(photos)})


# --------------------------------------------------------------------------- cards and events
def _epoch(iso):
    try:
        d = datetime.fromisoformat(str(iso))
        return int((d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp())
    except (TypeError, ValueError):
        return None


def card_for(store, student_id, center_name=''):
    """What the parent's page shows - nothing else leaves the office (no phone numbers, no other children)."""
    import center
    f = center.student_file(store, student_id)
    st = f['student']
    groups = {g['id']: g for g in store.rows('groups')}
    teachers = {t['id']: t.get('name') for t in store.rows('teachers')}
    subjects = {s['id']: s for s in store.rows('subjects')}
    ens = []
    for e in f['enrollments']:
        if e.get('status') not in (None, '', 'active'):
            continue
        g = groups.get(e['groupId']) or {}
        m = e.get('money') or {}
        sub = subjects.get(g.get('subjectId')) or {}
        ens.append({'group': g.get('name', ''), 'teacher': teachers.get(g.get('teacherId'), ''), 'subject': sub.get('name', ''), 'subjectEn': sub.get('nameEn', ''),
                    'slots': g.get('slots') or [], 'feeType': m.get('feeType'), 'balance': m.get('balance'), 'unit': m.get('unit'),
                    'sessionsLeft': m.get('sessionsLeft'), 'held': e.get('held', 0)})
    gname = lambda gid: (groups.get(gid) or {}).get('name', '')  # noqa: E731
    att = [{'date': a.get('date'), 'group': gname(a.get('groupId')), 'status': a.get('status'), 'at': a.get('at')} for a in f['attendance'][:30]]
    marks = [{'title': m['title'], 'date': m['date'], 'kind': m['kind'], 'score': m['score'], 'max': m['maxScore'], 'absent': bool(m['absent']),
              'rank': m.get('rank'), 'of': m.get('of')} for m in f['marks'] if _published(store, m['examId'])][-20:]
    pays = [{'date': p.get('date'), 'no': p.get('no'), 'amount': p.get('amount'), 'kind': p.get('kind'), 'group': gname(p.get('groupId'))}
            for p in f['payments'][:15]]
    return {'studentId': st['id'], 'name': st.get('name'), 'code': st.get('code'), 'grade': st.get('gradeCode'), 'system': st.get('system'),
            'track': st.get('track'), 'center': center_name, 'groups': ens, 'attendance': att, 'marks': marks, 'payments': pays,
            'wallet': f['wallet'], 'updatedAt': _now()}


def _published(store, exam_id):
    ex = store.row('exams', exam_id)
    return bool(ex and ex.get('published') is not False)


# --------------------------------------------------------------------------- the background service
class GatewaySync:
    def __init__(self, store, journal, node_id, secrets, save_file, log_fn=None):
        self.store, self.journal, self.node_id, self.secrets, self.save_file = store, journal, node_id, secrets, save_file
        self.say = log_fn or (lambda *a: None)
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.pushed = {}            # token hash -> signature of the card the gateway has
        self._pushed_version, self._pushed_at = None, 0
        self.stat = {'lastOk': None, 'lastError': None, 'lastTry': None, 'waiting': 0, 'oldestSeconds': 0, 'applied': 0}
        self._stop = False
        self._thread = None

    # -- control
    def start(self):
        if self._thread:
            return
        self._thread = threading.Thread(target=self._loop, name='gateway', daemon=True)
        self._thread.start()

    def stop(self):
        self._stop = True
        self.wake.set()

    def kick(self):
        self.wake.set()

    def client(self):
        if not self.secrets.configured:
            raise GatewayError('The mailbox is not set up yet.')
        return Client(self.secrets.url, self.secrets.data['officeSecret'])

    def _loop(self):
        delay = 5
        while not self._stop:
            self.wake.wait(delay if delay > 0 else 1)
            self.wake.clear()
            if self._stop:
                break
            if not self.secrets.configured:
                delay = 30
                continue
            try:
                self.cycle()
                delay = int(self.secrets.data.get('pollSeconds') or 60)
            except GatewayError as e:
                self.stat['lastError'] = str(e)
                delay = min(max(delay * 2, 10), 600)
            except Exception as e:      # never let the thread die; the next round tries again
                log.exception('gateway cycle failed')
                self.stat['lastError'] = 'Unexpected problem: ' + str(e)[:120]
                delay = min(max(delay * 2, 10), 600)

    def status(self):
        return {'configured': self.secrets.configured, 'url': self.secrets.url, 'pollSeconds': int(self.secrets.data.get('pollSeconds') or 60), **self.stat}

    # -- one round
    def cycle(self):
        with self.lock:
            self.stat['lastTry'] = _now()
            self.push_cards()
            self.pull()
            self.stat['lastOk'] = _now()
            self.stat['lastError'] = None

    def push_cards(self):
        """Cards of the students with a parent link; only the ones whose content changed are sent."""
        v = self.store.version()
        if v == self._pushed_version and time.time() - self._pushed_at < 3600:
            return
        import center
        name = str(center.settings(self.store).get('systemName') or '')
        cards, sigs = [], {}
        for st in self.store.rows('students', "portal_hash IS NOT NULL AND portal_hash<>''"):
            h = st['portalHash']
            body = card_for(self.store, st['id'], name)
            sig_body = {k: v for k, v in body.items() if k != 'updatedAt'}
            cancelled = st.get('active') is False
            exp = int(time.time()) + 400 * 86400
            sig = hashlib.sha1(json.dumps([sig_body, cancelled], sort_keys=True, default=str).encode()).hexdigest()
            if self.pushed.get(h) == sig:
                continue
            sigs[h] = sig
            cards.append({'tokenHash': h, 'tripId': st['id'], 'body': body, 'cancelled': cancelled, 'expiresAt': exp})
        if cards:
            cl = self.client()
            for i in range(0, len(cards), 100):
                cl.put_cards(cards[i:i + 100])
            self.pushed.update(sigs)
        self._pushed_version, self._pushed_at = v, time.time()

    def pull(self):
        """Parents' pages are read-only; whatever arrives in the mailbox is acknowledged and dropped."""
        cl = self.client()
        box = cl.inbox(100)
        events, photos = box.get('events', []), box.get('photos', [])
        self.stat['waiting'] = 0
        if events or photos:
            cl.ack([e['uuid'] for e in events], [p['uuid'] for p in photos])

    # -- links
    def make_link(self, student_id, nonce):
        if not self.secrets.configured:
            raise GatewayError('The mailbox is not set up yet. An administrator sets it up in Settings, Parent links.')
        tok = link_token(self.secrets.data['linkSecret'], student_id, nonce)
        return tok, f'{self.secrets.url}/t/{tok}'


def _now():
    return datetime.now().isoformat(timespec='seconds')


def new_nonce():
    return uuid.uuid4().hex[:12]
