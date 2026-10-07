"""Hessa - the owner's phone: a live picture of the centre, sent to the gateway when something changes.

The owner opens it anywhere (gateway page /o/) with a key the centre PC gave that phone once (a QR code). It shows today's
money, the drawers, who is in class now, the watch alerts and a running list of what the staff did - read only, nothing on
the phone can change the centre's data. Texts are written here in both languages from the program's own dictionaries
(js/i18n), so the phone page stays small. Never sent: phone numbers, passwords, secrets, notes about families.
"""
import hashlib
import json
import os
import re
import secrets as pysecrets
from datetime import date, datetime, timedelta

import center

DEVICES = 'ownerPhones'          # settings row: {"phones": [{id, tokenHash, label, at, by}]} - hashes only, never a key
MAX_PHONES = 10
_WORDS = {}
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PAIR = re.compile(r"^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',?\s*$", re.M)


def words(lang):
    """The program's dictionary (js/i18n/<lang>.js) as a Python dict - read once."""
    if lang not in _WORDS:
        try:
            with open(os.path.join(_ROOT, 'js', 'i18n', lang + '.js'), encoding='utf-8') as f:
                text = f.read()
        except OSError:
            text = ''
        _WORDS[lang] = {k: v.replace("\\'", "'").replace('\\n', '\n').replace('\\\\', '\\') for k, v in _PAIR.findall(text)}
    return _WORDS[lang]


def tr(lang, key, **vars_):
    w = words(lang)
    s = w.get(key) or words('en').get(key) or key
    s = re.sub(r'\[\[([^\]]+)\]\]', lambda m: w.get(m.group(1), m.group(1)), s)
    return re.sub(r'\{(\w+)\}', lambda m: str(vars_.get(m.group(1), m.group(0))), s)


def both(key, **vars_):
    return {'ar': tr('ar', key, **vars_), 'en': tr('en', key, **vars_)}


def _money(v):
    v = round(float(v or 0), 2)
    return int(v) if v == int(v) else v


# ---------------------------------------------------------------- the phones allowed to read it (managed on the PC)
def phones(store):
    row = store.row('settings', DEVICES)
    v = (row or {}).get('value')
    return list((v or {}).get('phones') or []) if isinstance(v, dict) else []


def add_phone(ctx, label):
    """A new key for one phone. The key is shown once (QR code); only its hash is kept and sent to the gateway."""
    label = center.D.norm_text(label)[:60]
    if not label:
        raise center.Problem('own.err.label', 'Write a name for this phone, for example "My phone".')
    cur = phones(ctx.store)
    if len(cur) >= MAX_PHONES:
        raise center.Problem('own.err.many', 'At most {n} phones. Remove one first.', n=MAX_PHONES)
    key = 'Ow_' + pysecrets.token_urlsafe(24)
    item = {'id': pysecrets.token_hex(6), 'tokenHash': hashlib.sha256(key.encode()).hexdigest(), 'label': label,
            'at': datetime.now().isoformat(timespec='seconds'), 'by': ctx.user}
    row = ctx.store.row('settings', DEVICES)
    ctx.commit(f'Owner phone added: {label}', [{'e': 'settings', 'id': DEVICES, 'op': 'put', 'ver': (row or {}).get('ver'), 'row': {'value': {'phones': cur + [item]}}}])
    return key, item


def remove_phone(ctx, phone_id):
    cur = phones(ctx.store)
    keep = [p for p in cur if p.get('id') != phone_id]
    if len(keep) == len(cur):
        raise center.Problem('err.notFound', 'Not found.')
    gone = next(p for p in cur if p.get('id') == phone_id)
    row = ctx.store.row('settings', DEVICES)
    ctx.commit(f'Owner phone removed: {gone.get("label")}', [{'e': 'settings', 'id': DEVICES, 'op': 'put', 'ver': (row or {}).get('ver'), 'row': {'value': {'phones': keep}}}])
    return {'ok': True}


# ---------------------------------------------------------------- the picture
def snapshot(store, watch_fn=None, online=(), centre_name='', pc_name='', now=None):
    """Everything the owner's phone shows. watch_fn(frm, to) gives the watch alerts; online = names signed in now."""
    now = now or datetime.now()
    d = now.date()
    day = d.isoformat()
    names = {s['id']: s.get('name') or '' for s in store.rows('students')}
    groups = {g['id']: g for g in store.rows('groups')}
    teachers = {t['id']: t.get('name') or '' for t in store.rows('teachers')}
    gname = lambda gid: (groups.get(gid) or {}).get('name') or ''  # noqa: E731
    dash = center.dashboard(store, None, d)

    pays = store.rows('payments', 'date=?', (day,))
    exps = store.rows('expenses', 'date=?', (day,))
    voided = {p.get('voidOf') for p in pays if p.get('voidOf')}
    # receipts minus their reversals: the money taken today (a fee paid from credit or moved between groups is not new money)
    income = sum(p.get('amount') or 0 for p in pays if (p.get('method') or 'cash') not in ('wallet', 'transfer'))
    spent = sum(e.get('amount') or 0 for e in exps)

    feed = []
    for p in pays:
        if p.get('voidOf'):
            orig = store.row('payments', p['voidOf']) or {}
            feed.append({'at': p.get('at') or '', 'kind': 'void', 'by': p.get('by') or '', 'amount': _money(-(p.get('amount') or 0)),
                         **both('own.f.void', no=orig.get('no') or '', name=names.get(p.get('studentId'), ''), amount=_money(abs(p.get('amount') or 0)))})
        else:
            v = {'no': p.get('no') or '', 'name': names.get(p.get('studentId'), ''), 'amount': _money(p.get('amount'))}
            feed.append({'at': p.get('at') or '', 'kind': 'pay', 'by': p.get('by') or '', 'amount': _money(p.get('amount')), 'voided': p['id'] in voided,
                         **{lang: tr(lang, 'own.f.pay', method=tr(lang, 'pay.method.' + (p.get('method') or 'cash')), **v) for lang in ('ar', 'en')}})
    for e in exps:
        feed.append({'at': e.get('at') or '', 'kind': 'expense', 'by': e.get('by') or '', 'amount': _money(-(e.get('amount') or 0)),
                     **both('own.f.expense', amount=_money(abs(e.get('amount') or 0)), what=e.get('note') or e.get('category') or '')})
    shifts = store.rows('shifts')
    drawers = []
    for sh in shifts:
        opened, closed = str(sh.get('openedAt') or ''), str(sh.get('closedAt') or '')
        if opened.startswith(day):
            feed.append({'at': opened[11:16], 'kind': 'shift', 'by': sh.get('user') or '', **both('own.f.open', no=sh.get('no') or '', amount=_money(sh.get('openingCash')))})
        if closed.startswith(day):
            feed.append({'at': closed[11:16], 'kind': 'shift', 'by': sh.get('user') or '', 'diff': _money(sh.get('diff')),
                         **both('own.f.close', no=sh.get('no') or '', diff=_money(sh.get('diff')))})
        if sh.get('status') == 'open':
            cash = _money(center.shift_summary(store, sh['id'])['expected'])
            drawers.append({'no': sh.get('no'), 'who': sh.get('user') or '', 'since': opened[:16].replace('T', ' '), 'cash': cash})
    att = store.rows('attendance', 'date=?', (day,))
    for a in sorted(att, key=lambda a: a.get('at') or '')[-40:]:
        if a.get('status') in ('present', 'late'):
            feed.append({'at': (a.get('at') or '')[-8:-3] if len(a.get('at') or '') > 5 else (a.get('at') or ''), 'kind': 'in', 'by': a.get('by') or '',
                         **both('own.f.in', name=names.get(a.get('studentId'), ''), group=gname(a.get('groupId')))})
    feed.sort(key=lambda x: x.get('at') or '', reverse=True)

    hhmm = now.strftime('%H:%M')
    now_in, later = [], []
    for s in dash['sessions']:
        if s.get('status') == 'cancelled':
            continue
        item = {'group': gname(s.get('groupId')), 'teacher': teachers.get(s.get('teacherId'), ''), 'start': s.get('start'), 'end': s.get('end'),
                'present': s.get('present', 0), 'enrolled': s.get('enrolled', 0)}
        if (s.get('start') or '') <= hhmm <= (s.get('end') or ''):
            now_in.append(item)
        elif (s.get('start') or '') > hhmm:
            later.append(item)

    alerts, counts = [], {}
    if watch_fn:
        try:
            w = watch_fn((d - timedelta(days=7)).isoformat(), day)
            counts = w.get('summary') or {}
            for a in w.get('alerts') or []:
                if a.get('review'):
                    continue
                v = {k: (_money(x) if isinstance(x, (int, float)) else x) for k, x in (a.get('vars') or {}).items()}
                alerts.append({'level': a.get('level'), 'ts': a.get('ts'), 'user': a.get('user') or '', **both('wa.r.' + a.get('rule', ''), **v)})
                if len(alerts) >= 25:
                    break
        except Exception:
            alerts = []

    bal = center.student_balances(store, None, d)
    owing = sorted(((names.get(sid, ''), -v) for sid, v in (bal.get('students') or {}).items() if v < -0.009), key=lambda x: -x[1])[:10]

    return {'centre': centre_name, 'pc': pc_name, 'at': now.isoformat(timespec='seconds'), 'date': day,
            'today': {'income': _money(income), 'expenses': _money(spent), 'net': _money(income - spent), 'byMethod': {k: _money(v) for k, v in dash['todayMoney'].items()},
                      'receipts': len([p for p in pays if not p.get('voidOf')]), 'voids': len([p for p in pays if p.get('voidOf')]),
                      'checkedIn': dash['checkedIn'], 'sessions': len([s for s in dash['sessions'] if s.get('status') != 'cancelled'])},
            'month': {'income': _money(dash['monthMoney']), 'expenses': _money(dash['monthExpenses']), 'owed': _money(dash['owed']), 'debtors': dash['debtors'],
                      'students': dash['students']},
            'drawers': drawers, 'now': now_in, 'later': later[:8], 'alerts': alerts, 'alertCounts': counts,
            'feed': feed[:80], 'owing': [{'name': n, 'amount': _money(a)} for n, a in owing], 'online': sorted(set(online))[:20]}


def signature(state):
    """What changed (the time stamps left out): the PC sends again only when this changes, or every minute."""
    return hashlib.sha1(json.dumps({k: v for k, v in state.items() if k != 'at'}, sort_keys=True, default=str).encode()).hexdigest()


def today_iso():
    return date.today().isoformat()
