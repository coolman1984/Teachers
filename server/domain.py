"""Hessa - business rules that need no database: names and mobiles, document numbers, grades, timetable clashes,
fees and balances, the early-warning score, teacher settlements and group profitability. Pure functions, easy to test.

Everything money-related is *computed* from the attendance and the receipts (never stored as a running balance), so
two PCs that worked offline at the same time always agree once they have exchanged their changes."""
import re
import unicodedata
from datetime import date, datetime, timedelta

_TATWEEL = 'ـ'
_ZERO_WIDTH = dict.fromkeys(map(ord, '​‌‍‎‏‪‫‬⁦⁧⁨⁩﻿'))
_AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
_AR_UNIFY = str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي'})
_DIACRITICS = re.compile('[ً-ٰٟ]')

# ---------------------------------------------------------------- vocabularies (labels live in js/i18n)
STAGES = {'P': 6, 'M': 3, 'S': 3}          # primary 1-6, preparatory (middle) 1-3, secondary 1-3
GRADES = [f'{s}{n}' for s, k in STAGES.items() for n in range(1, k + 1)]
SYSTEMS = {
    'P': ('general', 'azhar', 'language'),
    'M': ('general', 'azhar', 'language'),
    'S': ('thanaweya', 'bac', 'azhar'),       # Thanaweya Amma (current cohorts), Egyptian Baccalaureate, Al-Azhar
}
TRACKS = {
    'bac': ('', 'med', 'eng', 'biz', 'arts'),             # the four Baccalaureate tracks (2nd and 3rd secondary)
    'thanaweya': ('', 'science', 'math', 'literary'),
    'azhar': ('', 'scientific', 'literary'),
}
FEE_TYPES = ('session', 'month', 'package')
GROUP_KINDS = ('center', 'school', 'online', 'home')
PAY_METHODS = ('cash', 'vodafone', 'instapay', 'fawry', 'card', 'wallet', 'bank')
FEE_KINDS = ('fee',)                          # payments that pay a group fee (session, month or package)
PAY_KINDS = ('fee', 'material', 'wallet_topup', 'refund', 'other')
EXPENSE_CATS = ('rent', 'salary', 'utilities', 'printing', 'supplies', 'marketing', 'maintenance', 'teacher_payout', 'handover', 'other')
ATT_PRESENT = ('present', 'late')
ATT_STATUSES = ('present', 'late', 'absent', 'excused')
EXAM_KINDS = ('quiz', 'weekly', 'monthly', 'comprehensive', 'mock')
SETTLE_MODELS = ('percent', 'rent_session', 'rent_student', 'rent_month', 'mixed')
# student code ranges per PC (by the order the PCs joined), so PCs working offline never hand out the same code
CODE_RANGES = [(10000, 49999), (50000, 69999), (70000, 79999), (80000, 89999), (90000, 99999)]

DEFAULTS = {
    'lateMinutes': 15,             # arriving later than this after the start = late
    'doorEarlyMinutes': 90,        # the door recognises a session this long before it starts
    'doorLateMinutes': 30,         # ... and until this long after it ends
    'schoolTreasuryPct': 15,       # school support groups: share of the Ministry of Finance (decree 149/2024)
    'schoolTeacherPct': 80,        # ... and the teacher's share of the rest
    'schoolMaxFee': 100,           # ... maximum fee per session
    'schoolMaxStudents': 25,       # ... maximum students per group
    'riskCall': 35,                # early warning: "call today" from this score
    'riskHigh': 60,
    'currency': 'EGP',
}


# ---------------------------------------------------------------- text
def norm_text(s):
    """Whitespace, tatweel, zero-width characters and width forms cleaned; digits stay as they are."""
    if s is None:
        return ''
    s = unicodedata.normalize('NFKC', str(s)).translate(_ZERO_WIDTH).replace(_TATWEEL, '')
    return re.sub(r'\s+', ' ', s).strip()


def key_text(s):
    """The comparison key of a name: case, Arabic spelling variants (أ/ا, ى/ي, ة/ه), digits and punctuation ignored."""
    s = norm_text(s).translate(_AR_DIGITS).translate(_AR_UNIFY)
    s = _DIACRITICS.sub('', s).casefold()
    s = re.sub(r'[^\w\s\-]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def digits(s):
    return re.sub(r'\D', '', norm_text(s).translate(_AR_DIGITS))


def norm_mobile_eg(s):
    """(display, ok). Egyptian mobiles 01xxxxxxxxx / 201xxxxxxxxx / +201xxxxxxxxx are stored as 01xxxxxxxxx
    (what people type and read); anything else is kept as typed and marked not ok."""
    d = digits(s)
    if d.startswith('00'):
        d = d[2:]
    if d.startswith('201') and len(d) == 12:
        d = d[1:]
    if d.startswith('01') and len(d) == 11 and d[2] in '0125':
        return d, True
    return norm_text(s), not norm_text(s)   # text that is not a mobile number is a mistake; an empty field is not


def wa_number(mobile):
    """The number for a wa.me link (country code, no plus): 01xxxxxxxxx -> 201xxxxxxxxx."""
    d, ok = norm_mobile_eg(mobile)
    return '2' + d if ok and d else ''


# ---------------------------------------------------------------- numbers of documents
def pc_letter(index):
    """0 -> A (the administrator PC), 1 -> B ... 25 -> Z, then AA, AB."""
    s, n = '', index
    while True:
        s = chr(65 + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            return s


def doc_no(prefix, year, letter, counter):
    """Receipts R26-A-000123, expenses E26-A-000012, cash shifts S26-A-0007. The PC letter keeps numbers unique
    although several PCs number at the same time without talking to each other."""
    width = 4 if prefix == 'S' else 6
    return f'{prefix}{year % 100:02d}-{letter}-{counter:0{width}d}'


def parse_doc_no(no):
    m = re.fullmatch(r'([A-Z])(\d{2})-([A-Z]+)-(\d{4,})', str(no or ''))
    return (m.group(1), int(m.group(2)), m.group(3), int(m.group(4))) if m else None


def next_code(existing, pc_index):
    """Next free student code in this PC's range (codes are short numbers printed on the card and typed at the door)."""
    lo, hi = CODE_RANGES[pc_index] if pc_index < len(CODE_RANGES) else (100000 + pc_index * 10000, 100000 + pc_index * 10000 + 9999)
    used = [int(c) for c in existing if str(c).isdigit() and lo <= int(c) <= hi]
    nxt = max(used) + 1 if used else lo
    if nxt > hi:
        raise ValueError('No free student codes left for this PC')
    return str(nxt)


# ---------------------------------------------------------------- grades and timetable
def valid_grade(code):
    return code in GRADES


def stage_of(code):
    return (code or ' ')[0]


def check_grade(code, system, track):
    """Returns a problem key or '' when the combination is valid."""
    if not valid_grade(code):
        return 'err.grade'
    st = stage_of(code)
    if system and system not in SYSTEMS[st]:
        return 'err.system'
    if track:
        if system not in TRACKS or track not in TRACKS[system]:
            return 'err.track'
        if system == 'bac' and code == 'S1':
            return 'err.track.bac1'   # the first secondary year of the Baccalaureate is common to everybody
    return ''


def hm(s):
    """'17:30' -> minutes since midnight; None when invalid."""
    m = re.fullmatch(r'(\d{1,2}):(\d{2})', str(s or '').strip().translate(_AR_DIGITS))
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h * 60 + mi if h < 24 and mi < 60 else None


def fmt_hm(minutes):
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


def clean_slots(slots):
    """[{day: 0-6 (0 = Saturday), start: 'HH:MM', end: 'HH:MM', roomId}] - invalid entries dropped, sorted."""
    out = []
    for s in slots or []:
        if not isinstance(s, dict):
            continue
        try:
            day = int(s.get('day'))
        except (TypeError, ValueError):
            continue
        a, b = hm(s.get('start')), hm(s.get('end'))
        if 0 <= day <= 6 and a is not None and b is not None and b > a:
            out.append({'day': day, 'start': fmt_hm(a), 'end': fmt_hm(b), 'roomId': str(s.get('roomId') or '')})
    return sorted(out, key=lambda x: (x['day'], x['start']))


def weekday(d):
    """Egyptian week: 0 = Saturday ... 6 = Friday."""
    return (d.weekday() + 2) % 7


def as_date(s):
    if isinstance(s, date):
        return s
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def active_on(row, d, start='startDate', end='endDate'):
    d = d.isoformat() if isinstance(d, date) else str(d)
    return (not row.get(start) or row[start] <= d) and (not row.get(end) or row[end] >= d)


def clashes(groups, rooms=None):
    """Timetable problems among active groups: the same room or the same teacher twice at the same time.
    Returns [{kind: 'room'|'teacher'|'capacity', a, b, day, start, end}] (a, b = group ids)."""
    rooms = rooms or {}
    out, items = [], []
    for g in groups:
        if g.get('active') is False:
            continue
        for s in clean_slots(g.get('slots')):
            items.append((g, s))
    for i in range(len(items)):
        g1, s1 = items[i]
        for j in range(i + 1, len(items)):
            g2, s2 = items[j]
            if g1['id'] == g2['id'] or s1['day'] != s2['day']:
                continue
            if not (hm(s1['start']) < hm(s2['end']) and hm(s2['start']) < hm(s1['end'])):
                continue
            if not _periods_overlap(g1, g2):
                continue
            r1, r2 = s1['roomId'] or g1.get('roomId'), s2['roomId'] or g2.get('roomId')
            base = {'a': g1['id'], 'b': g2['id'], 'day': s1['day'], 'start': max(s1['start'], s2['start']), 'end': min(s1['end'], s2['end'])}
            if r1 and r1 == r2:
                out.append({**base, 'kind': 'room', 'roomId': r1})
            if g1.get('teacherId') and g1.get('teacherId') == g2.get('teacherId'):
                out.append({**base, 'kind': 'teacher', 'teacherId': g1['teacherId']})
    for g in groups:
        for s in clean_slots(g.get('slots')):
            room = rooms.get(s['roomId'] or g.get('roomId'))
            if room and room.get('capacity') and g.get('capacity') and g['capacity'] > room['capacity']:
                out.append({'kind': 'capacity', 'a': g['id'], 'b': '', 'day': s['day'], 'start': s['start'], 'end': s['end'],
                            'roomId': room['id']})
                break
    return out


def _periods_overlap(g1, g2):
    a1, b1 = g1.get('startDate') or '0000', g1.get('endDate') or '9999'
    a2, b2 = g2.get('startDate') or '0000', g2.get('endDate') or '9999'
    return a1 <= b2 and a2 <= b1


def slots_on(group, d):
    """The group's slots on day d (a date)."""
    if group.get('active') is False or not active_on(group, d):
        return []
    wd = weekday(d)
    return [s for s in clean_slots(group.get('slots')) if s['day'] == wd]


def session_id(group_id, d, start):
    """The same session gets the same id on every PC (so two PCs that open the same session merge, never duplicate)."""
    return f'se-{group_id}-{d.isoformat() if isinstance(d, date) else d}-{str(start).replace(":", "")}'


def attendance_id(sess_id, student_id):
    return f'at-{sess_id[3:]}-{student_id}'


def door_window(sess, now_min, early, late):
    a, b = hm(sess.get('start')), hm(sess.get('end'))
    return a is not None and b is not None and a - early <= now_min <= b + late


def is_late(sess, at_min, late_minutes):
    a = hm(sess.get('start'))
    return a is not None and at_min > a + late_minutes


# ---------------------------------------------------------------- fees and balances
def unit_fee(group, enrollment=None, student=None):
    """The fee of one unit (one session, one month or one package) for this student, after the discount."""
    if student and student.get('exempt'):
        return 0.0
    fee = (enrollment or {}).get('fee')
    if fee in (None, ''):
        fee = group.get('fee') or 0
    pct = float((student or {}).get('discountPct') or 0)
    return round(float(fee) * max(0.0, 100 - min(pct, 100)) / 100, 2)


def months_between(a, b):
    """Number of calendar months touched from date a to date b inclusive (0 when b < a)."""
    if not a or not b or b < a:
        return 0
    return (b.year - a.year) * 12 + b.month - a.month + 1


def charges(group, enrollment, student, visits, today):
    """What the student owes the group so far: (amount, units).
    session: one fee per attended session; month: one fee per month enrolled; package: the package price spread over
    its sessions, charged per attended session (so a paid package is simply money in advance)."""
    unit = unit_fee(group, enrollment, student)
    ft = group.get('feeType') or 'session'
    if ft == 'month':
        start = as_date(enrollment.get('from')) or as_date(group.get('startDate')) or today
        end = min(today, as_date(enrollment.get('to')) or today)
        n = months_between(start, end)
        return round(unit * n, 2), n
    if ft == 'package':
        per = int(group.get('packageSessions') or 0) or 1
        return round(unit / per * visits, 2), visits
    return round(unit * visits, 2), visits


def balance_info(group, enrollment, student, visits, paid, today):
    """Everything the door and the student file show about one enrolment's money."""
    owed, units = charges(group, enrollment, student, visits, today)
    bal = round(paid - owed, 2)
    unit = unit_fee(group, enrollment, student)
    ft = group.get('feeType') or 'session'
    info = {'feeType': ft, 'unit': unit, 'owed': owed, 'paid': round(paid, 2), 'balance': bal, 'units': units}
    if ft == 'package':
        per = int(group.get('packageSessions') or 0) or 1
        info['sessionPrice'] = round(unit / per, 2) if unit else 0
        info['sessionsLeft'] = int(bal // info['sessionPrice']) if info['sessionPrice'] and bal > 0 else 0
    # the suggestion at the door: what to pay now so the student is clear
    if bal < 0:
        info['due'] = -bal
    elif ft == 'session' and unit:
        info['due'] = 0.0
    else:
        info['due'] = 0.0
    return info


def wallet_balance(payments):
    """Money paid in advance that is not tied to a group yet (topped up minus spent with method 'wallet')."""
    top = sum(p.get('amount') or 0 for p in payments if p.get('kind') == 'wallet_topup')
    spent = sum(p.get('amount') or 0 for p in payments if p.get('method') == 'wallet')
    return round(top - spent, 2)


def shift_expected(opening, payments, expenses):
    """Cash that must be in the drawer: opening + cash taken - cash paid out (refunds are negative receipts)."""
    cash_in = sum(p.get('amount') or 0 for p in payments if (p.get('method') or 'cash') == 'cash')
    cash_out = sum(e.get('amount') or 0 for e in expenses if (e.get('method') or 'cash') == 'cash')
    return round((opening or 0) + cash_in - cash_out, 2)


def by_method(payments):
    out = {}
    for p in payments:
        m = p.get('method') or 'cash'
        out[m] = round(out.get(m, 0) + (p.get('amount') or 0), 2)
    return out


# ---------------------------------------------------------------- early warning
def risk(att_statuses, scores, balance, unit, followed_recently=False):
    """Score 0-100 that a student is about to drop out, with the reasons (i18n keys).
    att_statuses: the student's last sessions in the group, oldest first ('present'/'late'/'absent'/'excused').
    scores: exam percentages, oldest first. balance: money balance of the enrolment (negative = owes)."""
    score, why = 0, []
    run = 0
    for s in reversed(att_statuses):
        if s == 'absent':
            run += 1
        elif s == 'excused':
            continue
        else:
            break
    if run >= 3:
        score += 50
        why.append('risk.absent3')
    elif run == 2:
        score += 30
        why.append('risk.absent2')
    recent = [s for s in att_statuses[-8:] if s != 'excused']
    if len(recent) >= 4:
        rate = sum(1 for s in recent if s in ATT_PRESENT) / len(recent)
        if rate < 0.6:
            score += 20
            why.append('risk.lowAttendance')
    if len(scores) >= 3:
        before = sum(scores[:-2]) / len(scores[:-2])
        last = sum(scores[-2:]) / 2
        if before - last >= 15:
            score += 25
            why.append('risk.marksDrop')
    if scores and scores[-1] < 50:
        score += 15
        why.append('risk.lowMark')
    if unit and balance <= -1.5 * unit:
        score += 20
        why.append('risk.unpaid')
    late = sum(1 for s in att_statuses[-6:] if s == 'late')
    if late >= 3:
        score += 10
        why.append('risk.oftenLate')
    if followed_recently and score:
        score = max(0, score - 10)
    return min(100, score), why


# ---------------------------------------------------------------- settlements and profitability
def center_share(teacher, revenue, sessions, visits):
    """The centre's share of a teacher's collected fees in one month. One formula covers every Egyptian arrangement:
    a fixed monthly rent, rent per session, rent per student visit, a percentage, or any mix of them."""
    t = teacher or {}
    share = float(t.get('rentMonth') or 0) + float(t.get('rentSession') or 0) * sessions + float(t.get('rentStudent') or 0) * visits
    share += float(t.get('centerPct') or 0) / 100 * revenue
    return round(share, 2)


def school_split(revenue, treasury_pct, teacher_pct):
    """Support groups inside a school: the treasury takes its share first, the teacher a share of the rest."""
    treasury = round(revenue * treasury_pct / 100, 2)
    teacher = round((revenue - treasury) * teacher_pct / 100, 2)
    return {'treasury': treasury, 'teacher': teacher, 'school': round(revenue - treasury - teacher, 2)}


def group_signal(utilisation, attendance_rate, center_profit):
    """The one advice shown next to a group: open another one, keep, watch, merge, or it loses money."""
    if center_profit is not None and center_profit < 0:
        return 'loss'
    if utilisation is not None and utilisation >= 0.95:
        return 'full'
    if utilisation is not None and utilisation < 0.4:
        return 'merge'
    if attendance_rate is not None and attendance_rate < 0.6:
        return 'watch'
    return 'ok'


def month_bounds(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    first = date(y, m, 1)
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return first, nxt - timedelta(days=1)


def valid_month(ym):
    return bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', str(ym or '')))


def now_local():
    return datetime.now()
