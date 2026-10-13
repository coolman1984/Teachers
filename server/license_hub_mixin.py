"""Online licence hub (trial only) and Apps-Factory code verification — mixed into server/license.py License."""
import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone

import afcodes

from version import VERSION

PRODUCT_ID = 'teachers'
KINDS = ('trial', 'monthly', 'permanent')
BACKOFF = (60, 300, 900, 3600)
POLL = ((600, 20), (3600, 120), (10 ** 9, 600))
SENT_FIELDS = ('product', 'kind', 'device', 'machine', 'nonce', 'shop', 'ref', 'version')
ACTIVE = ('sending', 'waiting', 'failed')
HUB_WATCH_KEY = 'licence_hub_watch'
HUB_CALENDAR_POLL_SEC = 6 * 3600
TRIAL_HUB_KIDS = frozenset({'trial-hub', 'trial_hub', 'hub-trial'})
_hub_lock = threading.RLock()


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt=None):
    return (dt or utcnow()).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse(text):
    try:
        return datetime.strptime(str(text), '%Y-%m-%dT%H:%M:%SZ')
    except (TypeError, ValueError):
        return None


def _machine_id_raw():
    if not globals().get('__compiled__') and os.environ.get('HS_MACHINE_ID'):
        return os.environ['HS_MACHINE_ID']
    import license as license_mod
    return license_mod._machine_id()


class LicenseHubMixin:
    """Hub trial requests + AF pasted codes (trial-hub kid only for hub trials)."""

    def init_hub(self, assist, cfg, root, home, shop_name=lambda: ''):
        self.a = assist
        self.cfg = cfg or {}
        self.root = root
        self.home = home
        self.shop_name = shop_name
        self.stop = False

    @property
    def hub_enabled(self):
        return bool(self.hub_url())

    def hub_url(self):
        if not self.a:
            return ''
        url = (os.environ.get('FACTORY_HUB_URL') or self.cfg.get('hub_url') or self.a.hub_url() or '').strip().rstrip('/')
        return url if url.startswith('https://') or url.startswith('http://127.0.0.1') or url.startswith('http://localhost') else ''

    def _trusted_key_entries(self):
        entries = []
        for raw in os.environ.get('HS_LICENCE_KEYS', os.environ.get('TO_LICENCE_KEYS', '')).split(','):
            raw = raw.strip()
            if not raw:
                continue
            if ':' in raw and len(raw.split(':', 1)[0]) <= 40:
                kid, key = raw.split(':', 1)
                entries.append((kid.strip(), key.strip()))
            else:
                entries.append(('', raw))
        for folder in (self.home, self.root):
            path = os.path.join(folder, 'licence_keys.txt')
            if not os.path.isfile(path):
                continue
            with open(path, encoding='utf-8') as f:
                for line in f:
                    line = line.split('#', 1)[0].strip()
                    if not line:
                        continue
                    if ':' in line and len(line.split(':', 1)[0]) <= 40:
                        kid, key = line.split(':', 1)
                        entries.append((kid.strip(), key.strip()))
                    else:
                        entries.append(('', line))
        return entries

    def trusted_af_keys(self):
        return [key for _, key in self._trusted_key_entries()]

    def trial_only_public_keys(self):
        keys = set()
        for kid, key in self._trusted_key_entries():
            if kid and kid.lower() in TRIAL_HUB_KIDS:
                keys.add(key)
        for raw in os.environ.get('HS_TRIAL_HUB_KEYS', '').split(','):
            raw = raw.strip()
            if raw:
                keys.add(raw.split(':', 1)[-1].strip())
        return frozenset(keys)

    def af_device(self):
        if not self.a:
            return ''
        return afcodes.device_code(_machine_id_raw(), self.a.kv('install_id'), PRODUCT_ID)

    def af_machine_tag(self):
        ident = _machine_id_raw()
        return hashlib.sha256(f'AF-MACHINE/1|{ident}|{PRODUCT_ID}'.encode('utf-8')).hexdigest()

    def _looks_af_code(self, text):
        try:
            norm = afcodes.normalize(str(text or ''))
        except ValueError:
            return False
        expected = (afcodes.CODE_LEN * 8 + 4) // 5
        return len(norm) == expected

    def _af_check(self, code, today=None):
        keys = self.trusted_af_keys()
        if not keys:
            return None
        today = today or date.today()
        r = afcodes.read_code(code, keys, PRODUCT_ID, self.af_device(), today,
                              trial_only_keys=self.trial_only_public_keys())
        if not r.valid and r.state == 'invalid':
            return None
        return r

    def _af_to_legacy_state(self, r, base_out, required, today):
        """Map AF CodeResult to license status dict (ok/warn/grace/locked/trial)."""
        terms = r.terms or {}
        edition = terms.get('edition')
        if r.state in ('invalid', 'not_yet_valid'):
            return {**base_out, 'state': 'locked' if required else 'off'}
        if r.state == 'expired' or not r.full_access:
            return {**base_out, 'state': 'locked' if required else 'off', 'edition': edition}
        try:
            last = date.fromisoformat(str(terms.get('last_day')))
        except (TypeError, ValueError):
            last = today
        left = (last - today).days + 1
        if edition == 'trial':
            state = 'trial' if left > 0 else 'trialEnded'
            return {**base_out, 'state': state if required else 'off', 'until': last.isoformat(),
                    'daysLeft': max(0, left), 'edition': edition, 'full': True}
        state = 'ok' if left > 7 else 'warn' if left > 0 else 'grace' if left > -3 else 'locked'
        return {**base_out, 'state': state if required else 'off', 'until': last.isoformat(), 'daysLeft': left,
                'graceLeft': max(0, left + 3) if left <= 0 else None, 'edition': edition, 'full': True,
                'serial': terms.get('serial')}

    def activate_af(self, code, who='', manual=True):
        keys = self.trusted_af_keys()
        if not keys:
            raise ValueError('forged')
        r = self._af_check(code)
        if not r or not r.full_access:
            reason = (r.reason if r else 'invalid') or 'invalid'
            if reason in ('expired',):
                raise ValueError('expired')
            if reason == 'other_device':
                raise ValueError('otherPc')
            raise ValueError('forged' if reason in ('bad_signature', 'unknown_key') else 'typo')
        grouped = afcodes.group(afcodes.normalize(code))
        terms = r.terms
        with self.lock:
            t = self.now()
            behind = self._seen(t)
            if behind and t + self._clock_slack() < datetime.fromisoformat(behind[:19]):
                raise ValueError('clock')
            if getattr(self, '_tick_runtime', lambda _t: False)(t):
                raise ValueError('clock')
            self.data.update(code=grouped, serial=terms.get('serial'), codeKind='af', afEdition=terms.get('edition'))
            hist = self.data.setdefault('history', [])
            hist.append({'at': t.isoformat(timespec='seconds'), 'by': who, 'until': terms.get('last_day'),
                         'serial': terms.get('serial'), 'kind': 'af'})
            self.data['history'] = hist[-50:]
            if manual and self.a:
                self.a.kv('licence_manual_at', iso())
            self._save()
        return {'until': terms.get('last_day'), 'serial': terms.get('serial')}

    def _clock_slack(self):
        import license as license_mod
        return license_mod.CLOCK_SLACK

    def hub_body(self, kind, ref='', nonce='preview', shop=None):
        shop_text = str(shop if shop is not None else (self.shop_name() or '')).strip()[:60]
        return {'product': PRODUCT_ID, 'kind': kind, 'device': self.af_device(), 'machine': self.af_machine_tag(),
                'nonce': nonce, 'shop': shop_text, 'ref': str(ref or '')[:60], 'version': VERSION}

    def hub_preview(self, kind, ref=''):
        if kind not in KINDS:
            kind = 'trial'
        return {'kind': kind, 'sends': self.hub_body(kind, ref), 'available': self.hub_enabled, 'fields': list(SENT_FIELDS)}

    def _hub_state(self, value=None, clear=False):
        if not self.a:
            return None
        if clear:
            self.a.kv('licence_request', delete=True)
            return None
        if value is not None:
            self.a.kv('licence_request', json.dumps(value))
            return value
        raw = self.a.kv('licence_request')
        try:
            return json.loads(raw) if raw else None
        except ValueError:
            return None

    def hub_public(self):
        st = self._hub_state() or {}
        base = {'available': self.hub_enabled, 'fields': list(SENT_FIELDS)}
        if not st:
            return {**base, 'status': 'none'}
        out = {**base, **{k: st.get(k) for k in ('status', 'kind', 'reason', 'created_at', 'tries', 'next_try', 'error', 'serial', 'stage')}}
        manual = self.a.kv('licence_manual_at') if self.a else None
        if manual and st.get('created_at') and manual > st['created_at']:
            out.update(status='closed', reason='manual', error='')
        if out.get('status') != 'waiting' or out.get('error'):
            out['stage'] = ''
        return out

    @staticmethod
    def _hub_call(method, url, body=None, token=None):
        req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json', 'User-Agent': f'Hessa/{VERSION}',
                                              **({'Authorization': 'Bearer ' + token} if token else {})})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read().decode('utf-8') or '{}')
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode('utf-8') or '{}')
            except ValueError:
                return e.code, {}
        except (urllib.error.URLError, OSError, ValueError, TimeoutError) as e:
            raise ConnectionError(e.__class__.__name__) from None

    def _hub_soon(self, st, seconds):
        st['next_try'] = iso(utcnow() + timedelta(seconds=seconds))

    def _hub_failed(self, st, error):
        st['tries'] = st.get('tries', 0) + 1
        st.update(status='failed' if st.get('id') is None else 'waiting', error=error)
        self._hub_soon(st, BACKOFF[min(st['tries'] - 1, len(BACKOFF) - 1)])

    def hub_begin(self, kind, ref='', by='', shop=None):
        if kind not in KINDS:
            raise ValueError('bad kind')
        if not self.hub_enabled:
            raise LookupError('trial_off')
        if kind != 'trial':
            raise LookupError('paid_in_studio')
        with _hub_lock:
            st = self._hub_state()
            if st and st.get('status') in ACTIVE + ('issued',):
                return self.hub_public()
            self._hub_state({'status': 'sending', 'kind': kind, 'nonce': str(uuid.uuid4()), 'ref': str(ref or '').strip()[:60],
                             'shop': str(shop or (self.shop_name() or '')).strip()[:60], 'id': None,
                             'poll_token': None, 'created_at': iso(), 'by': by, 'tries': 0, 'error': '', 'reason': ''})
        return self.hub_public()

    def hub_clear(self):
        with _hub_lock:
            st = self._hub_state()
            if st and st.get('status') in ('refused', 'failed', 'activated', 'closed'):
                self._hub_state(clear=True)
        return self.hub_public()

    def hub_step(self, force=False):
        with _hub_lock:
            st = self._hub_state()
            if not st or st.get('status') not in ACTIVE + ('issued',):
                return self.hub_public()
            now = utcnow()
            due = parse(st.get('next_try'))
            if not force and due and now < due:
                return self.hub_public()
            url = self.hub_url()
            if not url:
                st.update(status='failed', error='relay_off')
                self._hub_state(st)
                return self.hub_public()
            st['stage'] = ''
            try:
                if not st.get('id'):
                    code, d = self._hub_call('POST', url + '/licence/request',
                                             self.hub_body(st['kind'], st.get('ref', ''), st['nonce'], shop=st.get('shop')))
                    if code in (429, 503):
                        self._hub_failed(st, 'busy')
                    elif code == 400:
                        st.update(status='failed', error='refused_input:' + str(d.get('field', '')))
                    else:
                        st.update(id=d.get('id'), poll_token=d.get('poll_token'), status='waiting', error='', tries=0,
                                  reason=d.get('reason', ''))
                        if d.get('status') == 'refused':
                            st.update(status='refused', reason=d.get('reason', 'refused'))
                        self._hub_soon(st, 5)
                else:
                    code, d = self._hub_call('GET', url + '/licence/status?id=' + str(st['id']), token=st['poll_token'])
                    if code == 401:
                        st.update(status='failed', error='token', id=None, poll_token=None, nonce=str(uuid.uuid4()))
                    elif code != 200:
                        self._hub_failed(st, f'http_{code}')
                    elif d.get('status') == 'issued' and d.get('code'):
                        self._hub_apply_code(st, url, d.get('code'))
                    elif d.get('status') == 'refused':
                        st.update(status='refused', reason=d.get('reason') or 'refused', error='')
                    elif d.get('status') == 'expired':
                        st.update(status='closed', reason='expired', error='')
                    elif d.get('status') == 'delivered':
                        st.update(status='activated', error='')
                    else:
                        age = (now - (parse(st['created_at']) or now)).total_seconds()
                        st.update(status='waiting', error='', stage='approved' if d.get('stage') == 'approved' else '')
                        self._hub_soon(st, next(wait for limit, wait in POLL if age < limit))
            except ConnectionError as e:
                self._hub_failed(st, 'offline:' + str(e))
            self._hub_state(st)
            return self.hub_public()

    def _hub_apply_code(self, st, url, code):
        try:
            self.activate_af(code, who='hub', manual=False)
        except ValueError as e:
            st.update(status='failed', error='code:' + str(e), reason=str(e))
            self._hub_soon(st, 900)
            return
        try:
            self._hub_call('POST', url + '/licence/ack', {'id': st['id']}, token=st.get('poll_token'))
        except ConnectionError:
            pass
        st.update(status='activated', error='', poll_token=None)

    def hub_loop(self, every=20):
        while not self.stop:
            try:
                st = self._hub_state()
                if st and st.get('status') in ACTIVE + ('issued',):
                    self.hub_step()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(every)

    def hub_start(self):
        if self.a and self.hub_enabled:
            threading.Thread(target=self.hub_loop, daemon=True, name='license-hub').start()

    def hub_admin_status(self):
        """Extra fields for administrators only."""
        return {'device': self.af_device(), 'machine': self.af_machine_tag(), 'request': self.hub_public(),
                'hub': self.hub_enabled, 'afKeys': bool(self.trusted_af_keys())}
