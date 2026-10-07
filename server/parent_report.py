"""Hessa - the short WhatsApp report a parent receives (owner's request, 2026-10-07: "no app for parents - a small, neat
report on WhatsApp"). A few lines with the facts a parent asks about: attendance this month, the absences, the latest
published mark, the money position and the next class. The same facts fill the WhatsApp templates the seller's service
sends automatically (server/wa_auto.py): there every line is one template value, because WhatsApp values cannot hold
new lines. Texts come from the program's dictionaries (js/i18n), so they read the same as the rest of the program.
"""
from datetime import date, datetime, timedelta

import center
import domain as D
from owner import tr

DASH = '—'


def _num(v):
    v = round(float(v or 0), 2)
    return str(int(v)) if v == int(v) else f'{v:.2f}'


def _short_date(d, lang):
    d = D.as_date(d)
    return f'{tr(lang, "day." + str(D.weekday(d)))} {d.day}/{d.month}' if d else ''


def facts(store, student_id, lang='ar', today=None, now=None, scopes=None, money=True):
    """Each line of the report as text in lang (a missing fact is DASH). Only this child, only published marks."""
    from gateway_client import _published
    today = today or date.today()
    now = now or datetime.now()
    f = center.student_file(store, student_id, scopes)   # a teacher sees only the groups of his own teachers
    st = f['student']
    first = today.replace(day=1).isoformat()
    month = [a for a in f['attendance'] if (a.get('date') or '') >= first and (a.get('date') or '') <= today.isoformat()]
    came = [a for a in month if a.get('status') in ('present', 'late')]
    # absence is never stored: the held sessions of the child's groups this month without a present/late mark
    groups = {e['groupId'] for e in f['enrollments'] if e.get('status') in (None, '', 'active')}
    names = {g['id']: g.get('name') or '' for g in store.rows('groups')}
    held = []
    with store.lock:
        for gid in groups:
            held += [dict(zip(('id', 'date', 'groupId'), r)) for r in store.conn.execute(
                "SELECT id, date, group_id FROM sessions WHERE deleted=0 AND status='held' AND group_id=? AND date>=? AND date<=?",
                (gid, first, today.isoformat()))]
    came_sessions = {a.get('sessionId') for a in came}
    excused = {a.get('sessionId') for a in month if a.get('status') == 'excused'}
    missed = sorted((s for s in held if s['id'] not in came_sessions and s['id'] not in excused), key=lambda s: s['date'])
    total = len(came) + len(missed)
    if total:
        att = tr(lang, 'pr.att', n=len(came), m=total)
        if missed:
            att += ' · ' + tr(lang, 'pr.missed', n=len(missed), days=', '.join(_short_date(s['date'], lang) for s in missed[-3:]))
    else:
        att = DASH
    marks = [m for m in f['marks'] if _published(store, m['examId'])]
    if marks:
        m = marks[-1]
        mark = tr(lang, 'pr.absentExam', title=m['title']) if m['absent'] else tr(lang, 'pr.mark', title=m['title'], score=_num(m['score']), max=_num(m['maxScore']))
        if m.get('rank') and m.get('of') and not m['absent']:
            mark += ' ' + tr(lang, 'pr.rank', r=m['rank'], of=m['of'])
    else:
        mark = DASH
    balance = round(sum((e.get('money') or {}).get('balance', 0) for e in f['enrollments']), 2)
    money = DASH if not money else tr(lang, 'pr.owes', a=_num(-balance)) if balance < -0.009 else tr(lang, 'pr.credit', a=_num(balance)) if balance > 0.009 else tr(lang, 'pr.settled')
    nxt = DASH
    mine = [g for g in store.rows('groups', scopes=scopes) if g['id'] in groups]
    for i in range(8):
        d = today + timedelta(days=i)
        slots = sorted(((sl['start'], g) for g in mine for sl in D.slots_on(g, d) if i or sl['start'] > now.strftime('%H:%M')), key=lambda x: x[0])
        if slots:
            start, g = slots[0]
            nxt = tr(lang, 'pr.next', day=tr(lang, 'pr.today') if i == 0 else tr(lang, 'pr.tomorrow') if i == 1 else _short_date(d, lang), at=start, group=g.get('name') or '')
            break
    cfg = center.settings(store)
    return {'centre': str(cfg.get('systemName') or 'Hessa'), 'student': st.get('name') or '', 'period': tr(lang, 'pr.month.' + str(today.month)) + ' ' + str(today.year),
            'attendance': att, 'mark': mark, 'money': money, 'next': nxt, 'balance': _num(balance), 'groups': ', '.join(names.get(g, '') for g in groups if names.get(g))}


def summary(store, student_id, lang='ar', link='', today=None, now=None, scopes=None, money=True):
    """The neat few lines for a manual WhatsApp message (the {summary} of the "report" message)."""
    x = facts(store, student_id, lang, today, now, scopes, money)
    lines = [f'📚 *{x["centre"]}*', tr(lang, 'pr.head', student=x['student'], period=x['period']), '',
             '✅ ' + tr(lang, 'pr.l.att') + ' ' + x['attendance'], '📝 ' + tr(lang, 'pr.l.mark') + ' ' + x['mark'],
             *(['💰 ' + tr(lang, 'pr.l.money') + ' ' + x['money']] if money else []), '⏰ ' + tr(lang, 'pr.l.next') + ' ' + x['next']]
    if link:
        lines += ['', '🔗 ' + tr(lang, 'pr.l.link') + ' ' + link]
    lines += ['', tr(lang, 'pr.thanks')]
    return '\n'.join(lines)
