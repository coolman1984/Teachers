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
    """A problem with a message for the person at the office; key is the dictionary text the page shows (gw.err.*)."""

    def __init__(self, message, key='gw.err.other', **vars_):
        super().__init__(message)
        self.key, self.vars = key, vars_


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
            raise GatewayError('The address must start with https:// (for example https://hessa.yourname.workers.dev).', 'gw.err.address')
        self.data['url'] = url
        self.save()

    def generate(self):
        self.data['officeSecret'] = pysecrets.token_urlsafe(32)
        self.data['linkSecret'] = pysecrets.token_urlsafe(32)
        self.save()

    def setup_code(self):
        if not self.configured:
            raise GatewayError('The mailbox is not set up yet.', 'gw.err.notSetUp')
        return b64url(json.dumps({'v': 1, 'u': self.url, 'o': self.data['officeSecret'], 'l': self.data['linkSecret'], 'c': self.centre}).encode())

    def from_code(self, code):
        try:
            raw = re.sub(r'\s+', '', str(code))
            d = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
            assert d['v'] == 1 and d['o'] and d['l']
        except Exception:
            raise GatewayError('This setup code is not valid. Copy it again from the first office PC.', 'gw.err.code')
        self.set_url(d['u'])
        self.data['officeSecret'], self.data['linkSecret'] = d['o'], d['l']
        self.data['centre'] = d.get('c') or ''
        self.save()

    @property
    def centre(self):
        """The centre's id on the seller's "Hessa online" service ('' when the centre runs its own gateway)."""
        return str(self.data.get('centre') or '')

    def join(self, url, licence, name=''):
        """Connect to the seller's service with the subscription code: new secrets, then the gateway gives the centre its id."""
        self.set_url(url)
        office, link = pysecrets.token_urlsafe(32), pysecrets.token_urlsafe(32)
        res = Client(self.url, office).join(licence, name)
        self.data.update(officeSecret=office, linkSecret=link, centre=res['centre'], until=res.get('until'), licenceSent=_code_key(licence))
        self.save()
        return res


# --------------------------------------------------------------------------- talking to the gateway
def _code_key(code):
    return hashlib.sha256(''.join(c for c in str(code or '').upper() if c.isalnum()).encode()).hexdigest()[:16]


class Client:
    def __init__(self, url, secret, timeout=25, centre=''):
        self.url, self.secret, self.timeout, self.centre = url.rstrip('/'), secret, timeout, centre

    def call(self, method, path, obj=None, raw=False, signed=True):
        body = b'' if obj is None else json.dumps(obj).encode()
        headers = {'Content-Type': 'application/json', 'User-Agent': 'Hessa-Office'}
        if signed:
            headers.update(sign_headers(self.secret, method, path, body if method != 'GET' else b''))
            if self.centre:
                headers['X-HS-Centre'] = self.centre
        req = urllib.request.Request(self.url + path, data=body if method != 'GET' else None, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                data = r.read()
                return data if raw else json.loads(data or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise GatewayError('The mailbox refused this PC. The secret does not match the one set on the gateway.', 'gw.err.refused')
            if e.code == 402:
                raise GatewayError('The Hessa online subscription has ended. Renew it to publish again.', 'gw.err.ended')
            if e.code == 409:
                raise GatewayError('This subscription code is already connected. On another PC of the centre use "Paste the setup code".', 'gw.err.joined')
            if e.code == 400 and path == '/office/join':
                raise GatewayError('The online service did not accept the subscription code. Activate the program first.', 'gw.err.licence')
            if e.code == 429 and path.startswith('/office/whatsapp'):
                raise GatewayError('The daily WhatsApp limit of this centre is reached. The rest goes tomorrow; ask the seller for a higher limit.', 'wa.err.limit')
            if e.code == 503 and path.startswith('/office/whatsapp'):
                raise GatewayError('WhatsApp is not set up on the Hessa online service yet. Ask the seller.', 'wa.err.notReady')
            if e.code == 503:
                raise GatewayError('The mailbox is running but has no secret yet. Set OFFICE_SECRET on it (see the setup guide).', 'gw.err.noSecret')
            raise GatewayError(f'The mailbox answered with an error ({e.code}).', 'gw.err.status', code=e.code)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise GatewayError('Cannot reach the mailbox. Check the internet on this PC and the address.', 'gw.err.unreachable') from e

    def status(self):
        return self.call('GET', '/office/status')

    def join(self, licence, name=''):
        return self.call('POST', '/office/join', {'licence': licence, 'secret': self.secret, 'name': name}, signed=False)

    def renew(self, licence):
        return self.call('PUT', '/office/licence', {'licence': licence})

    def put_owner(self, state=None, devices=None):
        body = {}
        if state is not None:
            body['state'] = state
        if devices is not None:
            body['devices'] = devices
        return self.call('PUT', '/office/owner', body)

    def put_cards(self, cards, remove=(), revoke_students=()):
        return self.call('PUT', '/office/cards', {'cards': cards, 'remove': list(remove), 'revokeStudents': list(revoke_students)})

    def put_pages(self, pages, remove=()):
        return self.call('PUT', '/office/pages', {'pages': pages, 'remove': list(remove)})


# --------------------------------------------------------------------------- the card a parent reads
def _epoch(iso):
    try:
        d = datetime.fromisoformat(str(iso))
        return int((d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp())
    except (TypeError, ValueError):
        return None


def card_for(store, student_id, center_name=''):
    """What the parent's page shows - nothing else leaves the office: one child, no phone numbers, no other children, no staff,
    only exams the teacher published. Small on purpose (the gateway refuses more than 16 KB)."""
    import center
    import domain as D
    from datetime import date, timedelta
    f = center.student_file(store, student_id)
    st = f['student']
    groups = {g['id']: g for g in store.rows('groups')}
    teachers = {t['id']: t.get('name') for t in store.rows('teachers')}
    subjects = {s['id']: s for s in store.rows('subjects')}
    ens, mine = [], []
    for e in f['enrollments']:
        if e.get('status') not in (None, '', 'active'):
            continue
        g = groups.get(e['groupId']) or {}
        mine.append(g)
        m = e.get('money') or {}
        sub = subjects.get(g.get('subjectId')) or {}
        ens.append({'group': g.get('name', ''), 'teacher': teachers.get(g.get('teacherId'), ''), 'subject': sub.get('name', ''), 'subjectEn': sub.get('nameEn', ''),
                    'feeType': m.get('feeType'), 'balance': m.get('balance'), 'unit': m.get('unit'), 'due': m.get('due'),
                    'sessionsLeft': m.get('sessionsLeft'), 'held': e.get('held', 0)})
    today = date.today()
    week = []                                    # the next seven days as the timetable really is (temporary times included)
    for i in range(7):
        d = today + timedelta(days=i)
        for g in mine:
            for sl in D.slots_on(g, d):
                week.append({'date': d.isoformat(), 'start': sl['start'], 'end': sl['end'], 'group': g.get('name', '')})
    week.sort(key=lambda x: (x['date'], x['start']))
    gname = lambda gid: (groups.get(gid) or {}).get('name', '')  # noqa: E731
    att = [{'date': a.get('date'), 'group': gname(a.get('groupId')), 'status': a.get('status')} for a in f['attendance'][:30]]
    marks = [{'title': m['title'], 'date': m['date'], 'kind': m['kind'], 'score': m['score'], 'max': m['maxScore'], 'absent': bool(m['absent']),
              'rank': m.get('rank'), 'of': m.get('of')} for m in f['marks'] if _published(store, m['examId'])][-20:]
    pays = [{'date': p.get('date'), 'no': p.get('no'), 'amount': p.get('amount'), 'kind': p.get('kind'), 'group': gname(p.get('groupId'))}
            for p in f['payments'][:15]]
    return {'name': st.get('name'), 'code': st.get('code'), 'grade': st.get('gradeCode'), 'system': st.get('system'),
            'track': st.get('track'), 'center': center_name, 'groups': ens, 'week': week[:20], 'attendance': att, 'marks': marks, 'payments': pays,
            'wallet': f['wallet'], 'updatedAt': _now()}


def page_for(store, teacher, center_name='', booking=''):
    """The teacher's public page (<gateway>/p/<slug>, review G06): who the teacher is, the subjects, every active group with its
    times and the seats still free, and a WhatsApp link to book. Never a student, a parent or a price agreement."""
    import center
    import domain as D
    from datetime import date
    subjects = {s['id']: s for s in store.rows('subjects')}
    enrolled = center._enrolled_counts(store, date.today().isoformat())
    groups = []
    for g in store.rows('groups', 'teacher_id=?', (teacher['id'],)):
        if g.get('active') is False or g.get('kind') == 'school':
            continue
        sub = subjects.get(g.get('subjectId')) or {}
        cap = int(g.get('capacity') or 0)
        groups.append({'name': g.get('name', ''), 'subject': sub.get('name', ''), 'subjectEn': sub.get('nameEn', ''), 'grade': g.get('gradeCode'),
                       'system': g.get('system'), 'track': g.get('track'), 'slots': D.clean_slots(g.get('slots')), 'feeType': g.get('feeType'),
                       'fee': g.get('fee'), 'seats': max(0, cap - enrolled.get(g['id'], 0)) if cap else None})
    groups.sort(key=lambda x: (x['grade'] or '', x['name']))
    subs = [subjects[i] for i in (teacher.get('subjectIds') or []) if i in subjects]
    return {'name': teacher.get('name'), 'bio': (teacher.get('bio') or '')[:1500], 'center': center_name,
            'subjects': [{'name': x.get('name'), 'nameEn': x.get('nameEn')} for x in subs], 'groups': groups[:40],
            'booking': D.wa_number(booking) if booking else '', 'updatedAt': _now()}


def _published(store, exam_id):
    """A mark reaches the parent only when the teacher pressed "Show to parents" on that exam."""
    ex = store.row('exams', exam_id)
    return bool(ex and ex.get('published') is True)


# --------------------------------------------------------------------------- the background service
HEARTBEAT = 180        # seconds: the owner's phone says "PC off" after twice this without news


class GatewaySync:
    def __init__(self, store, journal, node_id, secrets, save_file, log_fn=None, owner_fn=None, licence_fn=None):
        self.store, self.journal, self.node_id, self.secrets, self.save_file = store, journal, node_id, secrets, save_file
        self.owner_fn = owner_fn            # () -> (state or None, [phone token hashes]) - the owner's live picture
        self.licence_fn = licence_fn        # () -> this PC's subscription code, sent again when it is renewed
        self._owner_sig, self._owner_at, self._phones_sig = None, 0, None
        self.wa = None                      # server/wa_auto.Sender - automatic WhatsApp through the seller's service
        self.say = log_fn or (lambda *a: None)
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.pushed = {}            # token hash -> signature of the card the gateway has
        # every link hash the gateway may hold a card for, kept on THIS PC (hashes only, no secrets) so that a link replaced or a student
        # removed is still revoked after an internet outage or a restart
        self.known_path = os.path.join(os.path.dirname(secrets.path), 'gateway-cards.json')
        self.known = self._load_known()
        self.pages_path = os.path.join(os.path.dirname(secrets.path), 'gateway-pages.json')   # slug -> signature of the published page
        try:
            with open(self.pages_path, encoding='utf-8') as f:
                self.pushed_pages = dict(json.load(f))
        except (OSError, ValueError, TypeError):
            self.pushed_pages = {}
        self._pushed_version, self._pushed_at = None, 0
        self.stat = {'lastOk': None, 'lastError': None, 'lastTry': None, 'cards': None, 'gatewayTime': None}
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
            raise GatewayError('The mailbox is not set up yet.', 'gw.err.notSetUp')
        return Client(self.secrets.url, self.secrets.data['officeSecret'], centre=self.secrets.centre)

    def _loop(self):
        delay, due = 5, 0
        while not self._stop:
            woken = self.wake.wait(delay if delay > 0 else 1)
            self.wake.clear()
            if self._stop:
                break
            if not self.secrets.configured:
                delay = 30
                continue
            try:
                if not woken and self._phones_sig and time.time() < due:
                    # between rounds, an owner's phone gets a change within seconds - and only a change: an idle centre
                    # writes nothing extra to the shared service (its free daily writes serve every centre)
                    if self.store.version() != getattr(self, '_owner_ver', None):
                        with self.lock:
                            self.push_owner()
                    delay = 10
                    continue
                self.cycle(force=False)
                due = time.time() + int(self.secrets.data.get('pollSeconds') or 60)
                delay = 10 if self._phones_sig else int(self.secrets.data.get('pollSeconds') or 60)
            except GatewayError as e:
                self.stat['lastError'], self.stat['lastErrorKey'], self.stat['lastErrorVars'] = str(e), e.key, e.vars
                delay = min(max(delay * 2, 10), 600)
            except Exception as e:      # never let the thread die; the next round tries again
                log.exception('gateway cycle failed')
                self.stat['lastError'], self.stat['lastErrorKey'], self.stat['lastErrorVars'] = 'Unexpected problem: ' + str(e)[:120], 'gw.err.other', {}
                delay = min(max(delay * 2, 10), 600)

    def status(self):
        return {'configured': self.secrets.configured, 'url': self.secrets.url, 'pollSeconds': int(self.secrets.data.get('pollSeconds') or 60), **self.stat}

    # -- one round
    def cycle(self, force=True):
        """One round. The status question costs the shared service a write, so the background asks it every five minutes;
        a person pressing "Send now" or "Test" (force) gets it at once."""
        with self.lock:
            self.stat['lastTry'] = _now()
            self.renew()
            self.push_cards()
            self.push_owner()
            self.send_whatsapp()
            if force or time.time() - getattr(self, '_checked_at', 0) >= 300:
                self.check()
                self._checked_at = time.time()
            self.stat['lastOk'] = _now()
            self.stat['lastError'], self.stat['lastErrorKey'], self.stat['lastErrorVars'] = None, None, {}

    def _load_known(self):
        try:
            with open(self.known_path, encoding='utf-8') as f:
                return {str(h) for h in json.load(f)}
        except (OSError, ValueError, TypeError):
            return set()

    def _save_known(self):
        tmp = self.known_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(sorted(self.known), f)
        os.replace(tmp, self.known_path)

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
            cards.append({'tokenHash': h, 'studentId': st['id'], 'body': body, 'cancelled': cancelled, 'expiresAt': exp})
        current = {r['portalHash'] for r in self.store.rows('students', "portal_hash IS NOT NULL AND portal_hash<>''")}
        stale = sorted(self.known - current)          # an old link (replaced, or the student was removed): the gateway must forget it
        # Signed soft deletions are shared by every office PC; revocation cannot depend on this PC's cache.
        with self.store.lock:
            removed = [r[0] for r in self.store.conn.execute("SELECT id FROM students WHERE deleted=1 AND portal_hash IS NOT NULL AND portal_hash<>''")]
        if cards or stale or removed:
            cl = self.client()
            for i in range(0, len(cards), 100):
                cl.put_cards(cards[i:i + 100])
            self.pushed.update(sigs)
            self.known |= {c['tokenHash'] for c in cards}
            for i in range(0, len(stale), 100):
                cl.put_cards([], remove=stale[i:i + 100])
                for h in stale[i:i + 100]:
                    self.known.discard(h)
                    self.pushed.pop(h, None)
            for i in range(0, len(removed), 100):
                cl.put_cards([], revoke_students=removed[i:i + 100])
            self._save_known()
        self.push_pages(cl if (cards or stale) else None, name)
        self._pushed_version, self._pushed_at = v, time.time()

    def push_pages(self, cl, name):
        """Teachers with a page address get a public page; a removed address (or teacher) is taken down."""
        import center
        booking = str(center.settings(self.store).get('bookingPhone') or '')
        pages, sigs = [], {}
        for t in self.store.rows('teachers', "slug IS NOT NULL AND slug<>''"):
            if t.get('active') is False:
                continue
            body = page_for(self.store, t, name, booking)
            sig = hashlib.sha1(json.dumps({k: v for k, v in body.items() if k != 'updatedAt'}, sort_keys=True, default=str).encode()).hexdigest()
            sigs[t['slug']] = sig
            if self.pushed_pages.get(t['slug']) != sig:
                pages.append({'slug': t['slug'], 'body': body})
        gone = sorted(set(self.pushed_pages) - set(sigs))
        if pages or gone:
            cl = cl or self.client()
            cl.put_pages(pages, remove=gone)
            self.pushed_pages = sigs
            self._save_pages()

    def _save_pages(self):
        tmp = self.pages_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.pushed_pages, f)
        os.replace(tmp, self.pages_path)

    def check(self):
        """How many cards the gateway holds: the settings page compares it with the links made here."""
        st = self.client().status()
        self.stat['cards'] = st.get('cards')
        self.stat['gatewayTime'] = st.get('serverTime')
        self.stat['owners'] = st.get('owners')
        if 'until' in st:
            self.stat['until'], self.stat['active'] = st.get('until'), st.get('active')

    def send_whatsapp(self, force=False):
        """Automatic WhatsApp (seller's service only). Its own problems are shown on its own card, never as a broken mailbox."""
        if not self.wa or not self.secrets.centre:
            return 0
        try:
            n = self.wa.run(self.client(), force)
            self.wa.last_error = None
            return n
        except GatewayError as e:
            self.wa.last_error = {'key': e.key, 'vars': e.vars, 'text': str(e)}
            return 0

    def renew(self):
        """On the seller's service: after the subscription was renewed on this PC, the service learns the new last day."""
        if not self.secrets.centre or not self.licence_fn:
            return
        code = self.licence_fn()
        if not code or self.secrets.data.get('licenceSent') == _code_key(code):
            return
        res = self.client().renew(code)
        self.secrets.data.update(licenceSent=_code_key(code), until=res.get('until'))
        self.secrets.save()

    def push_owner(self, force=False):
        """The owner's live picture: sent when the data changed (checked every round, so within seconds) and at least every
        minute while a phone is registered, so the phone also knows the PC is on. The list of phones is sent when it
        changes (remembered in gateway.json, so a phone removed while this PC was off is still removed)."""
        if not self.owner_fn:
            return
        hashes = sorted(self.owner_fn(want_state=False)[1])
        psig = hashlib.sha1(json.dumps(hashes).encode()).hexdigest() if hashes else ''
        phones_changed = psig != (self.secrets.data.get('phonesSent') or '')
        self._phones_sig = psig or None
        if not hashes and not phones_changed:
            return
        state, sig = None, None
        if hashes:
            ver = self.store.version()
            if not force and not phones_changed and ver == getattr(self, '_owner_ver', None) and time.time() - self._owner_at < HEARTBEAT:
                return
            import owner
            state = self.owner_fn(want_state=True)[0]
            sig = owner.signature(state)
            self._owner_ver = ver
        self.client().put_owner(state, [{'tokenHash': h} for h in hashes] if phones_changed else None)
        if phones_changed:
            self.secrets.data['phonesSent'] = psig
            self.secrets.save()
        if sig:
            self._owner_sig, self._owner_at = sig, time.time()

    # -- links
    def make_link(self, student_id, nonce):
        if not self.secrets.configured:
            raise GatewayError('The mailbox is not set up yet. An administrator sets it up in Settings, Parent links.', 'gw.err.notSetUp')
        tok = link_token(self.secrets.data['linkSecret'], student_id, nonce)
        return tok, f'{self.secrets.url}/t/{tok}'


def _now():
    return datetime.now().isoformat(timespec='seconds')


def new_nonce():
    return uuid.uuid4().hex[:12]
