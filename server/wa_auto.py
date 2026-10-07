"""Hessa - automatic WhatsApp to parents through the seller's Hessa online service (owner's request, 2026-10-07).

The administrator switches on what goes out by itself: an absence message after the class ends, a receipt message after
each payment, and the short report (server/parent_report.py) every week or at the end of the month. The service sends with
the seller's official WhatsApp Business number and templates approved by Meta (docs/HESSA_ONLINE.md) - never an unofficial
sender that gets numbers banned. Only parents who agreed (the student's "Parent consent") receive anything.

Only the administrator PC sends (one sender per centre); every message has a key, so neither this PC nor the service sends
it twice, and each one that went out is written in the student's follow-up history like a message sent by hand.
"""
import json
import os
import threading
from datetime import date, datetime, timedelta

import center
import domain as D
import parent_report

SETTING = 'waAuto'
DEFAULTS = {'absence': False, 'receipt': False, 'report': 'off', 'day': 5, 'hour': 19, 'since': '', 'before': []}   # day 5 = Thursday
REPORTS = ('off', 'weekly', 'monthly')
WHO = 'Hessa online (automatic)'


def config(store):
    row = store.row('settings', SETTING)
    v = (row or {}).get('value')
    out = dict(DEFAULTS)
    if isinstance(v, dict):
        out.update({k: v[k] for k in DEFAULTS if k in v})
    return out


def save(ctx, d):
    """Administrators only (checked by the caller). Switching something on starts from now: nothing older is sent."""
    cur = config(ctx.store)
    new = {'absence': bool(d.get('absence')), 'receipt': bool(d.get('receipt')),
           'report': d.get('report') if d.get('report') in REPORTS else 'off',
           'day': min(6, max(0, int(d.get('day') if d.get('day') is not None else cur['day']))),
           'hour': min(23, max(0, int(d.get('hour') if d.get('hour') is not None else cur['hour'])))}
    was_on = cur['absence'] or cur['receipt'] or cur['report'] != 'off'
    is_on = new['absence'] or new['receipt'] or new['report'] != 'off'
    keep = was_on and is_on and cur['since']
    new['since'] = cur['since'] if keep else (datetime.now().isoformat(timespec='minutes') if is_on else '')
    # receipts taken before it was switched on are never sent (a receipt keeps only the minute, so the ids are remembered)
    new['before'] = cur['before'] if keep else ([p['id'] for p in ctx.store.rows('payments', 'date=?', (date.today().isoformat(),))] if is_on else [])
    row = ctx.store.row('settings', SETTING)
    ctx.commit('Automatic WhatsApp settings', [{'e': 'settings', 'id': SETTING, 'op': 'put', 'ver': (row or {}).get('ver'), 'row': {'value': new}}])
    return new


def _consented(st):
    return st and st.get('consent') and st.get('active') is not False and D.wa_number(st.get('parentMobile'))


def due(store, now=None, link_fn=None):
    """The messages that should go out now: [{key, studentId, kind, to, template, lang, params}] (already-sent keys are
    filtered by the caller). link_fn(student) gives the parent link ('' when there is none)."""
    now = now or datetime.now()
    today = now.date()
    cfg = config(store)
    if not (cfg['absence'] or cfg['receipt'] or cfg['report'] != 'off'):
        return []
    since = cfg['since'] or now.isoformat(timespec='minutes')
    before = set(cfg.get('before') or [])
    centre = str(center.settings(store).get('systemName') or 'Hessa')
    names = {g['id']: g.get('name') or '' for g in store.rows('groups')}
    out = []

    def add(key, st, kind, template, params):
        out.append({'key': key, 'studentId': st['id'], 'name': st.get('name') or '', 'kind': kind, 'to': D.wa_number(st.get('parentMobile')),
                    'template': template, 'lang': 'ar', 'params': [str(p) for p in params]})

    if cfg['absence'] and today.isoformat() >= since[:10]:
        ends = {s['id']: s.get('end') or '' for s in center.sessions_on(store, today)}
        for a in center.absentees(store, today)['rows']:
            if a.get('told') or ends.get(a['sessionId'], '99:99') > now.strftime('%H:%M'):
                continue                                         # told by hand already, or the class has not ended yet
            st = store.row('students', a['studentId'])
            if _consented(st):
                add(f'abs:{st["id"]}:{today.isoformat()}', st, 'absence', 'hessa_absence',
                    [centre, st['name'], f'{today.day}/{today.month}', names.get(a['groupId'], ''), (link_fn(st) if link_fn else '') or '—'])
    if cfg['receipt']:
        pays = store.rows('payments', 'date=?', (today.isoformat(),))
        voided = {p.get('voidOf') for p in pays if p.get('voidOf')}
        for p in pays:
            if p.get('voidOf') or p['id'] in voided or (p.get('amount') or 0) <= 0 or p['id'] in before or f'{p.get("date")}T{p.get("at") or "00:00"}' < since:
                continue
            st = store.row('students', p.get('studentId'))
            if _consented(st):
                money = parent_report.facts(store, st['id'], 'ar', today, now)['money']
                add(f'pay:{p["id"]}', st, 'payment', 'hessa_receipt', [centre, parent_report._num(p.get('amount')), st['name'], p.get('no') or '—', money])
    rep = cfg['report']
    period = None
    if rep == 'weekly' and D.weekday(today) == cfg['day'] and now.hour >= cfg['hour']:
        y, w, _ = today.isocalendar()
        period = f'{y}-W{w:02d}'
    elif rep == 'monthly' and (today + timedelta(days=1)).month != today.month and now.hour >= cfg['hour']:
        period = today.strftime('%Y-%m')
    if period:
        active = {e['studentId'] for e in store.rows('enrollments') if (e.get('status') or 'active') == 'active' and (not e.get('to') or e['to'] >= today.isoformat())}
        for st in store.rows('students'):
            if st['id'] in active and _consented(st):
                x = parent_report.facts(store, st['id'], 'ar', today, now)
                add(f'rep:{st["id"]}:{period}', st, 'report', 'hessa_report', [x['centre'], x['student'], x['period'], x['attendance'], x['mark'], x['money'], x['next']])
    return out


class Sender:
    """Runs inside the gateway round (server/gateway_client.py) on the administrator PC: works out what is due, sends it
    in batches of 40, remembers each key on this PC (wa-sent.json) and writes the follow-up."""

    def __init__(self, store, data_dir, ctx_fn, link_fn=None, is_sender=lambda: True):
        self.store, self.ctx_fn, self.link_fn, self.is_sender = store, ctx_fn, link_fn, is_sender
        self.path = os.path.join(data_dir, 'wa-sent.json')
        self.lock = threading.Lock()
        try:
            with open(self.path, encoding='utf-8') as f:
                self.state = json.load(f)
        except (OSError, ValueError):
            self.state = {}
        self.state.setdefault('keys', {})
        self.state.setdefault('log', [])
        self._ver, self._at = None, 0
        self.last_error = None

    def _save(self):
        keys = self.state['keys']
        if len(keys) > 6000:          # keep the newest; old keys belong to days long gone
            self.state['keys'] = dict(sorted(keys.items(), key=lambda kv: kv[1].get('at') or '')[-5000:])
        self.state['log'] = self.state['log'][-200:]
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.state, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    def run(self, client, force=False):
        import time
        if not self.is_sender():
            return 0
        ver = self.store.version()
        if not force and ver == self._ver and time.time() - self._at < 300:
            return 0                  # nothing changed: look again in five minutes (a class may have ended meanwhile)
        self._ver, self._at = ver, time.time()
        with self.lock:
            keys = self.state['keys']
            todo = [m for m in due(self.store, link_fn=self.link_fn)
                    if keys.get(m['key'], {}).get('status') not in ('sent', 'refused') and keys.get(m['key'], {}).get('tries', 0) < 3]
            if not todo:
                return 0
            n = 0
            for i in range(0, len(todo), 40):
                batch = todo[i:i + 40]
                res = client.call('PUT', '/office/whatsapp', {'messages': [{k: m[k] for k in ('key', 'to', 'template', 'lang', 'params')} for m in batch]})
                by_key = {r.get('key'): r for r in res.get('results') or []}
                for m in batch:
                    r = by_key.get(m['key']) or {'status': 'failed'}
                    k = keys.setdefault(m['key'], {'tries': 0})
                    k.update(status=r.get('status'), at=datetime.now().isoformat(timespec='seconds'), tries=k.get('tries', 0) + 1)
                    self.state['log'].append({'at': k['at'], 'kind': m['kind'], 'name': m['name'], 'status': r.get('status'), 'error': r.get('error', '')})
                    if r.get('status') == 'sent' and not r.get('again'):
                        n += 1
                        try:
                            self.ctx_fn().commit(f'Follow-up whatsapp: {m["name"]}', [{'e': 'followups', 'id': center.new_id('fu'), 'op': 'put', 'row': {
                                'studentId': m['studentId'], 'teacherId': '', 'date': date.today().isoformat(), 'type': 'whatsapp', 'reason': m['kind'],
                                'outcome': 'Sent automatically by Hessa online', 'by': WHO}}])
                        except Exception:     # the message went; a failed history line must not send it again
                            pass
                self._save()
            return n

    def status(self):
        return {'log': list(reversed(self.state['log'][-30:])), 'lastError': self.last_error}
