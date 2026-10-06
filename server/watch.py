"""The owner's watch: what in the centre's own records looks like a mistake or a trick, so an owner who is not there can
trust the desk (owner's request, 2026-10-06).

Nothing here is a new record of what people did - every fact already exists, append-only and signed: receipts and their
reversals, cash shifts and their counted drawer, attendance, and the change log (journal audit), the security log and
the clicks (journal activity). The watch reads them for one period and lists the patterns that cost centres money:

  void         a receipt was reversed (who, how long after, by the same person who took it, after its drawer was closed)
  skim         reversed and taken again smaller, for the same student and group, the same day (the classic skim)
  short / over a drawer closed with less (or more: money taken without a receipt) than it should hold
  repeatShort  the same person closed short more than once
  openShift    a drawer left open for more than a day's work
  freeRide     students who keep attending while they owe several sessions and paid nothing for a month
  discount     a discount or an exemption was given or changed (by someone who is not an administrator: high)
  fee          a group price or a student's special price was changed
  deleted      records were moved to the Recycle Bin (the person saw them disappear; the owner sees everything)
  pastAtt      attendance of an earlier day was changed (it changes what per-session students owe)
  afterHours   changes saved outside the centre's working hours
  denied       someone tried what they are not allowed to do; wrong passwords; a locked account
  bigExpense   a large expense, and every reversed expense
  trials       one student took free trial sessions in several groups
  admin        people, permissions, settings and backups were changed (for the record)

Each alert has a level (critical, high, warn, info), the person, the time, the numbers, and the page that shows it.
An administrator marks an alert as reviewed (with a note); that review is itself a signed, logged change.
"""
import json
from collections import defaultdict
from datetime import date, datetime, timedelta

import center
import domain as D

LEVELS = ('critical', 'high', 'warn', 'info')
RULES = ('void', 'skim', 'short', 'over', 'repeatShort', 'openShift', 'freeRide', 'discount', 'fee', 'deleted', 'pastAtt',
         'afterHours', 'denied', 'bigExpense', 'trials', 'admin')
REVIEWS = 'watchReviewed'           # settings row: {alert key: {by, at, note}} - written only by /api/c/watch/review
DELETE_HIGH = {'students', 'enrollments', 'groups', 'teachers', 'marks', 'exams'}
BUSINESS = {'students', 'enrollments', 'groups', 'teachers', 'rooms', 'subjects', 'materials', 'exams', 'questions', 'marks',
            'followups', 'sessions', 'attendance', 'payments', 'expenses', 'shifts', 'settlements'}


def _f(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _who(name):
    """'Full Name (username)' -> username; the sample writes the bare username."""
    s = str(name or '')
    return s[s.rfind('(') + 1:-1] if s.endswith(')') and '(' in s else s


def _alert(rule, level, ts, user, key, page, **vars_):
    return {'rule': rule, 'level': level, 'ts': str(ts or '')[:19], 'user': user or '', 'key': f'{rule}:{key}', 'page': page,
            'vars': {k: (round(v, 2) if isinstance(v, float) else v) for k, v in vars_.items()}}


def _json(s):
    try:
        return json.loads(s) if s else {}
    except (TypeError, ValueError):
        return {}


def run(store, journal, frm, to, admins=(), now=None):
    """All alerts of the period [frm, to] (ISO days), newest first, with a summary per level and per person."""
    now = now or datetime.now()
    cfg = center.settings(store)
    hour_from, hour_to = int(_f(cfg.get('watchFrom', 8))), int(_f(cfg.get('watchTo', 23)))
    big = _f(cfg.get('watchBig', 1000)) or 1000
    owed_units = _f(cfg.get('watchOwedUnits', 2)) or 2
    admins = {_who(a) for a in admins} | set(admins)
    is_admin = lambda name: name in admins or _who(name) in admins  # noqa: E731
    out = []
    names = {s['id']: s.get('name') or '' for s in store.rows('students')}
    groups = {g['id']: g for g in store.rows('groups')}
    gname = lambda gid: (groups.get(gid) or {}).get('name') or ''  # noqa: E731

    # ---------------- receipts, reversals and the skim pattern
    pays = store.rows('payments', 'date>=? AND date<=?', (frm, to))
    originals = {p['id']: p for p in pays}
    for p in pays:
        if not p.get('voidOf'):
            continue
        o = originals.get(p['voidOf']) or store.row('payments', p['voidOf']) or {}
        amount = abs(_f(p.get('amount')))
        same = bool(o) and _who(o.get('by')) == _who(p.get('by'))
        days = (D.as_date(p.get('date')) - D.as_date(o.get('date'))).days if o.get('date') and p.get('date') else 0
        sh = store.row('shifts', o.get('shiftId')) if o.get('shiftId') else None
        after_close = bool(sh and sh.get('status') == 'closed' and str(sh.get('closedAt') or '') < f'{p.get("date")}T{p.get("at") or "00:00"}')
        level = 'high' if (same or days > 0 or after_close or amount >= big) else 'warn'
        page = 'money?tab=receipts'
        out.append(_alert('void', level, f'{p.get("date")}T{p.get("at") or "00:00"}', p.get('by'), p['id'], page,
                          no=o.get('no') or '', amount=amount, name=names.get(p.get('studentId'), ''), group=gname(p.get('groupId')),
                          reason=p.get('note') or '', original=o.get('by') or '', same=same, days=days, closed=after_close))
        # the same student and group paid again the same day, smaller, by the same person: the difference stayed somewhere
        if o.get('kind') == 'fee':
            again = [q for q in pays if not q.get('voidOf') and q['id'] != o.get('id') and q.get('studentId') == o.get('studentId')
                     and q.get('groupId') == o.get('groupId') and q.get('date') == p.get('date') and _f(q.get('amount')) < _f(o.get('amount'))
                     and _who(q.get('by')) == _who(p.get('by'))]
            for q in again:
                out.append(_alert('skim', 'critical', f'{q.get("date")}T{q.get("at") or "00:00"}', q.get('by'), p['id'] + q['id'], page,
                                  no=o.get('no') or '', no2=q.get('no') or '', amount=_f(o.get('amount')), amount2=_f(q.get('amount')),
                                  diff=_f(o.get('amount')) - _f(q.get('amount')), name=names.get(q.get('studentId'), ''), group=gname(q.get('groupId'))))

    # ---------------- cash drawers
    shorts = defaultdict(list)
    for sh in store.rows('shifts'):
        closed = str(sh.get('closedAt') or '')[:10]
        if sh.get('status') == 'closed' and frm <= closed <= to and _f(sh.get('diff')):
            diff = _f(sh.get('diff'))
            if diff < 0:
                shorts[_who(sh.get('user'))].append(sh)
            out.append(_alert('short' if diff < 0 else 'over', ('critical' if abs(diff) >= big / 10 else 'high') if diff < 0 else 'warn',
                              sh.get('closedAt'), sh.get('user'), sh['id'], 'money?tab=shifts', no=sh.get('no') or '', diff=abs(diff),
                              expected=_f(sh.get('expectedCash')), counted=_f(sh.get('countedCash')), reason=sh.get('diffReason') or ''))
        opened = D.as_date(str(sh.get('openedAt') or '')[:10])
        if sh.get('status') == 'open' and sh.get('openedAt'):
            try:
                hours = (now - datetime.fromisoformat(str(sh['openedAt'])[:19])).total_seconds() / 3600
            except ValueError:
                hours = 0
            if hours > 16 and opened and opened.isoformat() <= to:
                out.append(_alert('openShift', 'warn', sh.get('openedAt'), sh.get('user'), sh['id'], 'money?tab=shifts', no=sh.get('no') or '', hours=int(hours)))
    for user, rows in shorts.items():
        if len(rows) > 1:
            total = sum(abs(_f(r.get('diff'))) for r in rows)
            out.append(_alert('repeatShort', 'critical', max(str(r.get('closedAt')) for r in rows), rows[0].get('user'), user + ':' + frm,
                              'money?tab=shifts', n=len(rows), total=total))

    # ---------------- students who keep coming and do not pay (revenue that walks through the door)
    att = store.rows('attendance', "date>=? AND date<=? AND status IN ('present','late')", (frm, to))
    seen = defaultdict(lambda: {'n': 0, 'by': defaultdict(int), 'last': ''})
    trials = defaultdict(set)
    for a in att:
        if a.get('trial'):
            trials[a['studentId']].add(a.get('groupId'))
            continue
        k = (a['studentId'], a['groupId'])
        seen[k]['n'] += 1
        seen[k]['by'][a.get('by') or ''] += 1
        seen[k]['last'] = max(seen[k]['last'], a.get('date') or '')
    if seen:
        sids = {k[0] for k in seen}
        ens = [e for e in store.rows('enrollments') if (e['studentId'], e['groupId']) in seen and e['studentId'] in sids]
        bal = center.balances(store, ens, D.as_date(to) or date.today(), groups) if ens else {}
        month_ago = ((D.as_date(to) or date.today()) - timedelta(days=30)).isoformat()
        recent = {(p.get('studentId'), p.get('groupId')) for p in store.rows('payments', 'date>=? AND amount>0', (month_ago,))}
        for e in ens:
            info = bal.get(e['id'])
            k = (e['studentId'], e['groupId'])
            if not info or info.get('carried') or not info.get('unit') or k in recent:
                continue
            if info['balance'] <= -owed_units * info['unit']:
                by = max(seen[k]['by'].items(), key=lambda x: x[1])[0] if seen[k]['by'] else ''
                out.append(_alert('freeRide', 'high', seen[k]['last'] + 'T00:00', by, f'{k[0]}:{k[1]}:{to[:7]}', 'students?only=debt',
                                  name=names.get(k[0], ''), group=gname(k[1]), owed=-info['balance'], visits=seen[k]['n'], unit=info['unit']))
    for sid, gs in trials.items():
        if len(gs) >= 3:
            out.append(_alert('trials', 'warn', to + 'T00:00', '', f'{sid}:{to[:7]}', 'students', name=names.get(sid, ''), n=len(gs)))

    # ---------------- expenses
    for x in store.rows('expenses', 'date>=? AND date<=?', (frm, to)):
        amount = abs(_f(x.get('amount')))
        if x.get('voidOf'):
            out.append(_alert('bigExpense', 'warn', f'{x.get("date")}T{x.get("at") or "00:00"}', x.get('by'), x['id'], 'money?tab=expenses',
                              no=x.get('no') or '', amount=amount, category=x.get('category') or '', note=x.get('note') or '', reversed=True))
        elif amount >= big:
            out.append(_alert('bigExpense', 'warn' if is_admin(x.get('by')) else 'high', f'{x.get("date")}T{x.get("at") or "00:00"}', x.get('by'), x['id'],
                              'money?tab=expenses', no=x.get('no') or '', amount=amount, category=x.get('category') or '', note=x.get('note') or '', reversed=False))

    # ---------------- the change log: discounts, prices, deletions, earlier attendance, working hours
    with journal.lock:
        audit = [dict(r) for r in journal.conn.execute(
            "SELECT ts, txn, user, user_id, label, entity, entity_id, op, changes, after FROM audit WHERE kind='data' AND ts>=? AND ts<=? ORDER BY ts",
            (frm, to + 'T23:59:59'))]
        security = [dict(r) for r in journal.conn.execute(
            "SELECT ts, user, event, target, detail FROM security WHERE ts>=? AND ts<=? ORDER BY ts", (frm, to + 'T23:59:59'))]
        denied = [dict(r) for r in journal.conn.execute(
            "SELECT ts, user, action, detail FROM activity WHERE type='denied' AND ts>=? AND ts<=?", (frm, to + 'T23:59:59'))]
    deletes = defaultdict(lambda: {'n': 0, 'ents': set(), 'row': None})
    past = defaultdict(lambda: {'n': 0, 'row': None, 'days': set()})
    late = defaultdict(lambda: {'n': 0, 'first': '', 'last': ''})
    for a in audit:
        ent, op, ch = a['entity'], a['op'], _json(a['changes'])
        who = a['user']
        hour = int(a['ts'][11:13]) if len(a['ts']) >= 13 and a['ts'][11:13].isdigit() else 12
        if ent in BUSINESS and not (hour_from <= hour < hour_to):
            k = (who, a['ts'][:10])
            late[k]['n'] += 1
            late[k]['first'] = late[k]['first'] or a['ts']
            late[k]['last'] = a['ts']
        if ent == 'students' and op == 'update' and ({'discountPct', 'exempt'} & set(ch)):
            parts = {f: ch[f] for f in ('discountPct', 'exempt') if f in ch}
            out.append(_alert('discount', 'info' if is_admin(who) else 'high', a['ts'], who, a['txn'] + a['entity_id'], 'students',
                              name=names.get(a['entity_id'], a['entity_id']), pct=str((parts.get('discountPct') or ['', ''])[1] or 0),
                              before=str((parts.get('discountPct') or ['', ''])[0] or 0), exempt=bool((parts.get('exempt') or [False, False])[1])))
        if ent == 'students' and op == 'insert' and not is_admin(who):     # a new student who starts with a discount
            after = _json(a['after'])
            if _f(after.get('discountPct')) or after.get('exempt'):
                out.append(_alert('discount', 'warn', a['ts'], who, a['txn'] + a['entity_id'], 'students',
                                  name=after.get('name') or '', pct=str(after.get('discountPct') or 0), before='0', exempt=bool(after.get('exempt'))))
        if ent == 'groups' and op == 'update' and 'fee' in ch:
            out.append(_alert('fee', 'info' if is_admin(who) else 'high', a['ts'], who, a['txn'] + a['entity_id'], 'groups?tab=list',
                              group=gname(a['entity_id']), before=str(ch['fee'][0]), after=str(ch['fee'][1]), special=False, name=''))
        if ent == 'enrollments' and (op == 'insert' and _json(a['after']).get('fee') not in (None, '') or op == 'update' and 'fee' in ch):
            row = _json(a['after']) if op == 'insert' else (store.row('enrollments', a['entity_id']) or {})
            out.append(_alert('fee', 'info' if is_admin(who) else 'high', a['ts'], who, a['txn'] + a['entity_id'], 'students',
                              group=gname(row.get('groupId')), name=names.get(row.get('studentId'), ''), before='',
                              after=str(row.get('fee') if op == 'insert' else ch['fee'][1]), special=True))
        if op == 'delete' and ent in BUSINESS:
            d = deletes[a['txn']]
            d['n'] += 1
            d['ents'].add(ent)
            d['row'] = d['row'] or a
        if ent == 'attendance' and op in ('update', 'delete'):
            row = store.row('attendance', a['entity_id']) or {}
            day = row.get('date') or ''
            if day and day < a['ts'][:10]:
                k = (a['txn'])
                past[k]['n'] += 1
                past[k]['row'] = past[k]['row'] or a
                past[k]['days'].add(day)
        if ent == 'settings' and a['entity_id'] not in (REVIEWS, 'smp-centre') and (op != 'update' or ch):
            out.append(_alert('admin', 'info', a['ts'], who, a['txn'] + a['entity_id'], 'settings?tab=rules', what='setting', target=a['entity_id']))
    for txn, d in deletes.items():
        a = d['row']
        level = ('high' if d['ents'] & DELETE_HIGH else 'warn') if not is_admin(a['user']) else 'info'
        out.append(_alert('deleted', level, a['ts'], a['user'], txn, 'settings?tab=data', n=d['n'], what=a['label'] or '', entities=sorted(d['ents'])))
    for txn, d in past.items():
        a = d['row']
        out.append(_alert('pastAtt', 'info' if is_admin(a['user']) else 'high', a['ts'], a['user'], txn, 'activity', n=d['n'],
                          days=', '.join(sorted(d['days'])[:5]), what=a['label'] or ''))
    for (who, day), d in late.items():
        out.append(_alert('afterHours', 'info' if is_admin(who) else 'warn', d['first'], who, who + ':' + day, 'activity', n=d['n'],
                          first=d['first'][11:16], last=d['last'][11:16], start=f'{hour_from:02d}:00', end=f'{hour_to:02d}:00'))

    # ---------------- refused attempts and the security log
    tries = defaultdict(int)
    for r in denied:
        tries[(r['user'], r['ts'][:10])] += 1
    for (who, day), n in tries.items():
        out.append(_alert('denied', 'high' if n >= 3 else 'warn', day + 'T00:00', who, f'act:{who}:{day}', 'activity', n=n, kind='denied'))
    wrong = defaultdict(list)
    for r in security:
        ev = r['event']
        if ev == 'login-failed':
            wrong[(r['target'] or r['user'], r['ts'][:10])].append(r)
        elif ev == 'account-locked':
            out.append(_alert('denied', 'high', r['ts'], r['target'] or r['user'], f'lock:{r["ts"]}:{r["target"]}', 'activity', n=1, kind='locked'))
        elif ev in ('user-created', 'user-changed', 'user-disabled', 'user-deleted', 'profile-saved', 'profile-deleted', 'password-reset',
                    'backup-restored', 'remote-switch', 'gateway-secret'):
            out.append(_alert('admin', 'high' if ev == 'backup-restored' else 'info', r['ts'], r['user'], f'sec:{r["ts"]}:{ev}:{r["target"]}',
                              'activity', what=ev, target=r['target'] or ''))
    for (target, day), rows in wrong.items():
        if len(rows) >= 3:
            out.append(_alert('denied', 'warn', rows[-1]['ts'], target, f'pw:{target}:{day}', 'activity', n=len(rows), kind='password'))

    # ---------------- reviews, order and the summary
    reviews = cfg.get(REVIEWS) if isinstance(cfg.get(REVIEWS), dict) else {}
    for a in out:
        if a['key'] in reviews:
            a['review'] = reviews[a['key']]
    rank = {lv: i for i, lv in enumerate(LEVELS)}
    out.sort(key=lambda a: a['ts'], reverse=True)                                  # newest first ...
    out.sort(key=lambda a: (bool(a.get('review')), rank[a['level']]))              # ... inside each level, open before reviewed
    summary = {lv: sum(1 for a in out if a['level'] == lv and not a.get('review')) for lv in LEVELS}
    people = defaultdict(lambda: {lv: 0 for lv in LEVELS})
    for a in out:
        if a['user'] and not a.get('review'):
            people[a['user']][a['level']] += 1
    ranked = sorted(({'user': u, **c} for u, c in people.items()), key=lambda p: tuple(-p[lv] for lv in LEVELS))
    return {'from': frm, 'to': to, 'alerts': out, 'summary': summary, 'people': ranked[:12], 'reviewed': sum(1 for a in out if a.get('review')),
            'rules': {'hours': [hour_from, hour_to], 'big': big, 'owedUnits': owed_units}}


def review(ctx, keys, note):
    """Mark alerts as reviewed (administrators only - checked by the caller). Kept in the shared settings, so it is signed,
    logged with the reviewer's name and the same on every PC."""
    keys = [str(k)[:200] for k in (keys or []) if k][:500]
    if not keys:
        raise center.Problem('err.watchNone', 'Choose the alerts you reviewed.')
    note = D.norm_text(note)[:300]
    row = ctx.store.row('settings', REVIEWS)
    cur = dict((row or {}).get('value') or {}) if isinstance((row or {}).get('value'), dict) else {}
    at = datetime.now().isoformat(timespec='seconds')
    for k in keys:
        cur[k] = {'by': ctx.user, 'at': at, 'note': note}
    if len(cur) > 5000:      # keep the newest reviews; old periods are long settled
        cur = dict(sorted(cur.items(), key=lambda kv: kv[1].get('at') or '')[-5000:])
    ctx.commit(f'Watch: {len(keys)} alert(s) reviewed', [{'e': 'settings', 'id': REVIEWS, 'op': 'put', 'ver': (row or {}).get('ver'), 'row': {'value': cur}}])
    return {'ok': True, 'n': len(keys)}
