"""Hessa - the centre's daily operations. Each operation that changes data is ONE store commit (saved completely or
not at all, one line in the history), checked against the user's permissions and teachers (scopes).

Reads (door card, balances, early warning, settlements, profitability, reports) are computed from the rows with SQL
aggregates, so they stay fast with years of attendance and are identical on every PC."""
import json
import copy
import math
import time
from functools import wraps
import uuid
from datetime import date, datetime, timedelta

import domain as D
from store import ENTITIES, BadRequest


class Problem(BadRequest):
    """An error the page shows in the user's language: key = i18n key, vars = values for the text."""

    def __init__(self, key, english, **vars_):
        super().__init__(english)
        self.key, self.vars = key, vars_


def new_id(prefix):
    return prefix + uuid.uuid4().hex[:14]


def _now():
    return datetime.now().isoformat(timespec='seconds')


def _today():
    return date.today()


# ---------------------------------------------------------------- context: who works, on which PC, with which rules
class Ctx:
    """Everything an operation needs about the caller."""

    def __init__(self, store, journal, node_id, user, ip, user_id, scopes, perms, guard=None):
        self.store, self.journal, self.node_id = store, journal, node_id
        self.user, self.ip, self.user_id, self.scopes, self.perms, self.guard = user, ip, user_id, scopes, set(perms or ()), guard

    def can(self, *perms):
        return bool(self.perms.intersection(perms))

    def need(self, *perms):
        if not self.can(*perms):
            raise Problem('err.perm', 'You do not have permission for this.')

    def teacher_ok(self, teacher_id):
        return self.scopes is None or teacher_id in self.scopes

    def need_teacher(self, teacher_id):
        if not self.teacher_ok(teacher_id):
            raise Problem('err.scope', 'This belongs to a teacher you do not work with.')

    def commit(self, label, ops):
        return self.store.commit(self.user, self.ip, label, ops, guard=self.guard, user_id=self.user_id)

    def pc_index(self):
        with self.journal.lock:
            ids = [r[0] for r in self.journal.conn.execute('SELECT id FROM nodes ORDER BY enrolled_at, id')]
        return ids.index(self.node_id) if self.node_id in ids else 0

    def letter(self):
        return D.pc_letter(self.pc_index())


def settings(store):
    with store.lock:
        rows = {r[0]: r[1] for r in store.conn.execute('SELECT id, value FROM settings WHERE deleted=0')}
    out = dict(D.DEFAULTS)
    try:
        out.update(json.loads(rows.get('smp-centre') or '{}'))
    except (TypeError, ValueError, AttributeError):
        pass
    for k, v in rows.items():
        try:
            out[k] = json.loads(v)
        except (TypeError, ValueError):
            out[k] = v
    return out


def _next_no(store, table, prefix, letter, year):
    pat = f'{prefix}{year % 100:02d}-{letter}-'
    r = store.conn.execute(f'SELECT no FROM {table} WHERE no LIKE ? ORDER BY length(no) DESC, no DESC LIMIT 1', (pat + '%',)).fetchone()
    p = D.parse_doc_no(r[0]) if r else None
    return D.doc_no(prefix, year, letter, (p[3] if p else 0) + 1)


def atomic_operation(fn):
    """Check balances and write together so concurrent requests cannot spend the same money twice."""
    @wraps(fn)
    def run(ctx, *args, **kwargs):
        with ctx.store.lock:
            return fn(ctx, *args, **kwargs)
    return run


# ---------------------------------------------------------------- cleaning generic saves (lists edited in the pages)
def normalize_ops(store, ops, pc_index=0):
    """Clean names and mobiles on the server, give new students a code, check grades, timetables and the limits of
    school support groups. Refuses duplicates of things that must be unique (a student code, a teacher)."""
    if not isinstance(ops, list):
        return ops
    reserved_codes = set()
    for op in ops:
        if not isinstance(op, dict) or op.get('op') != 'put' or not isinstance(op.get('row'), dict):
            continue
        e, row = op.get('e'), op['row']
        if e in ('students', 'teachers', 'subjects', 'rooms', 'groups', 'materials') and row.get('name') is not None:
            row['name'] = D.norm_text(row['name'])
            if not row['name']:
                raise Problem('err.name', 'Write the name.')
        if e == 'settings' and op.get('id') in D.DEFAULTS and isinstance(D.DEFAULTS[op['id']], (int, float)):
            try:
                number = float(row.get('value'))
            except (TypeError, ValueError):
                raise Problem('err.setting', 'Check the setting value.')
            upper = 100 if op['id'] in ('schoolTreasuryPct', 'schoolTeacherPct', 'riskCall', 'riskHigh') else 100000
            if not math.isfinite(number) or number < 0 or number > upper or op['id'] == 'schoolMaxStudents' and (number < 1 or number != int(number)):
                raise Problem('err.setting', 'Check the setting value.')
            row['value'] = number
        if e == 'teachers':
            for key in ('rentMonth', 'rentSession', 'rentStudent', 'centerPct'):
                if row.get(key) not in (None, ''):
                    try:
                        value = float(row[key])
                    except (TypeError, ValueError):
                        raise Problem('err.amount', 'Write a valid amount.')
                    if not math.isfinite(value) or value < 0 or key == 'centerPct' and value > 100:
                        raise Problem('err.amount', 'Write a valid amount.')
        if e in ('students', 'teachers'):
            row['nameKey'] = D.key_text(row.get('name'))
            for f in ('mobile', 'parentMobile', 'parentMobile2'):
                if row.get(f):
                    row[f] = D.norm_mobile_eg(row[f])[0]
        if e == 'students':
            g = D.check_grade(row.get('gradeCode'), row.get('system'), row.get('track'))
            if g:
                raise Problem(g, 'Check the grade, system and track of the student.')
            with store.lock:
                if not row.get('code'):
                    cur = store.conn.execute('SELECT code FROM students WHERE id=?', (op.get('id'),)).fetchone()
                    row['code'] = cur[0] if cur and cur[0] else D.next_code([r[0] for r in store.conn.execute('SELECT code FROM students')] + list(reserved_codes), pc_index)
                row['code'] = D.digits(row['code']) or row['code']
                other = store.conn.execute('SELECT name FROM students WHERE code=? AND deleted=0 AND id<>?', (row['code'], op.get('id'))).fetchone()
            if str(row['code']) in reserved_codes:
                raise Problem('err.codeTaken', 'Another student in this batch already has this code.', name=row.get('name', ''))
            reserved_codes.add(str(row['code']))
            if other:
                raise Problem('err.codeTaken', 'Another student already has this code.', name=other[0])
            if row.get('discountPct') not in (None, ''):
                row['discountPct'] = max(0.0, min(100.0, float(row['discountPct'])))
        if e == 'teachers':
            with store.lock:
                other = store.conn.execute('SELECT id FROM teachers WHERE name_key=? AND deleted=0 AND id<>?', (row['nameKey'], op.get('id'))).fetchone()
            if other:
                raise Problem('err.teacherTaken', 'There is already a teacher with this name.')
        if e == 'groups':
            row['slots'] = D.clean_slots(row.get('slots'))
            if row.get('gradeCode') and not D.valid_grade(row['gradeCode']):
                raise Problem('err.grade', 'Choose the grade.')
            if row.get('feeType') and row['feeType'] not in D.FEE_TYPES:
                raise Problem('err.feeType', 'Choose how the group pays.')
            if row.get('kind') == 'school':
                cfg = settings(store)
                if float(row.get('fee') or 0) > float(cfg['schoolMaxFee']):
                    raise Problem('err.schoolFee', 'School support groups may not charge more than the maximum per session.', max=cfg['schoolMaxFee'])
                if int(row.get('capacity') or 0) > int(cfg['schoolMaxStudents']):
                    raise Problem('err.schoolSize', 'School support groups may not have more students than the maximum.', max=cfg['schoolMaxStudents'])
                row['feeType'] = 'session'
    return ops


def timetable_problems(store, ops):
    """The clashes a save would create (for a warning before saving): the groups after the change."""
    groups = {g['id']: g for g in store.rows('groups')}
    for op in ops or []:
        if isinstance(op, dict) and op.get('e') == 'groups':
            if op.get('op') == 'del':
                groups.pop(op.get('id'), None)
            elif isinstance(op.get('row'), dict):
                groups[op['id']] = {**op['row'], 'id': op['id']}
    rooms = {r['id']: r for r in store.rows('rooms')}
    changed = {op.get('id') for op in ops or [] if isinstance(op, dict) and op.get('e') == 'groups'}
    return [c for c in D.clashes(list(groups.values()), rooms) if c['a'] in changed or c['b'] in changed]


# ---------------------------------------------------------------- today's sessions (from the timetable)
def sessions_on(store, d, scopes=None):
    """Every session of day d: the saved ones plus the ones the timetable plans but nobody opened yet (virtual).
    A virtual session gets the same id on every PC, so it becomes real (merged) the moment attendance is taken."""
    day = d.isoformat()
    saved = {s['id']: s for s in store.rows('sessions', 'date=?', (day,), scopes)}
    out = dict(saved)
    for g in store.rows('groups', 'active=1 OR active IS NULL', (), scopes):
        for sl in D.slots_on(g, d):
            sid = D.session_id(g['id'], d, sl['start'])
            if sid not in out:
                out[sid] = {'id': sid, 'groupId': g['id'], 'teacherId': g.get('teacherId'), 'date': day, 'start': sl['start'], 'end': sl['end'],
                            'roomId': sl['roomId'] or g.get('roomId') or '', 'status': 'planned', 'kind': 'regular', 'virtual': True}
    with store.lock:
        counts = {r[0]: (r[1], r[2]) for r in store.conn.execute(
            "SELECT session_id, SUM(status IN ('present','late')), COUNT(*) FROM attendance WHERE deleted=0 AND date=? GROUP BY session_id", (day,))}
    enrolled = _enrolled_counts(store, day)
    for s in out.values():
        s['present'] = int((counts.get(s['id']) or (0, 0))[0] or 0)
        s['enrolled'] = enrolled.get(s['groupId'], 0)
    return sorted(out.values(), key=lambda s: (s.get('start') or '', s.get('groupId') or ''))


def _enrolled_counts(store, day):
    with store.lock:
        return {r[0]: r[1] for r in store.conn.execute(
            "SELECT group_id, COUNT(*) FROM enrollments WHERE deleted=0 AND (status IS NULL OR status='active') "
            "AND (from_date IS NULL OR from_date='' OR from_date<=?) AND (to_date IS NULL OR to_date='' OR to_date>=?) GROUP BY group_id", (day, day))}


def _session_row(sess):
    return {k: sess.get(k) for k in ('groupId', 'teacherId', 'date', 'start', 'end', 'roomId', 'kind', 'topic', 'note')} | {'status': 'held'}


def _find_session(store, sid, d=None):
    s = store.row('sessions', sid)
    if s:
        return s
    # a virtual session: se-<group>-<yyyy-mm-dd>-<hhmm>
    try:
        dd = date.fromisoformat(sid[3:][-15:-5])
    except (ValueError, IndexError):
        return None
    for s in sessions_on(store, dd):
        if s['id'] == sid:
            return s
    return None


def active_enrollments(store, student_id, d):
    day = d.isoformat()
    return store.rows('enrollments', "student_id=? AND (status IS NULL OR status='active') AND (from_date IS NULL OR from_date='' OR from_date<=?) "
                                     "AND (to_date IS NULL OR to_date='' OR to_date>=?)", (student_id, day, day))


# ---------------------------------------------------------------- money facts per enrolment (bulk, SQL)
def _visits(store, student_id=None, group_id=None):
    sql = "SELECT student_id, group_id, COUNT(*) FROM attendance WHERE deleted=0 AND status IN ('present','late')"
    args = []
    if student_id:
        sql += ' AND student_id=?'
        args.append(student_id)
    if group_id:
        sql += ' AND group_id=?'
        args.append(group_id)
    with store.lock:
        return {(r[0], r[1]): r[2] for r in store.conn.execute(sql + ' GROUP BY student_id, group_id', args)}


def _paid(store, student_id=None, group_id=None):
    sql = "SELECT student_id, group_id, SUM(amount) FROM payments WHERE deleted=0 AND kind='fee'"
    args = []
    if student_id:
        sql += ' AND student_id=?'
        args.append(student_id)
    if group_id:
        sql += ' AND group_id=?'
        args.append(group_id)
    with store.lock:
        return {(r[0], r[1]): float(r[2] or 0) for r in store.conn.execute(sql + ' GROUP BY student_id, group_id', args)}


def balances(store, enrollments, today=None, groups=None, students=None):
    """{enrollment id: balance info} for the given enrolments."""
    today = today or _today()
    groups = groups if groups is not None else {g['id']: g for g in store.rows('groups')}
    sids = {e['studentId'] for e in enrollments}
    if students is None:
        students = {s['id']: s for s in store.rows('students')} if len(sids) > 30 else {i: store.row('students', i) for i in sids}
    one = len(sids) == 1
    visits = _visits(store, next(iter(sids)) if one else None)
    paid = _paid(store, next(iter(sids)) if one else None)
    out = {}
    for e in enrollments:
        g = groups.get(e.get('groupId'))
        if not g:
            continue
        k = (e['studentId'], e['groupId'])
        out[e['id']] = D.balance_info(g, e, students.get(e['studentId']) or {}, visits.get(k, 0), paid.get(k, 0.0), today)
    return out


def wallet(store, student_id):
    with store.lock:
        rows = [{'kind': r[0], 'method': r[1], 'amount': r[2]} for r in store.conn.execute(
            "SELECT kind, method, amount FROM payments WHERE deleted=0 AND student_id=? AND (kind='wallet_topup' OR method='wallet')", (student_id,))]
    return D.wallet_balance(rows)


# ---------------------------------------------------------------- the door
def find_students(store, q, scopes=None, limit=12):
    """By card code (exact), by mobile digits (student or parent) or by part of the name."""
    q = D.norm_text(q)
    if not q:
        return []
    digits = D.digits(q)
    out = []
    if digits and len(digits) <= 6:
        out = store.rows('students', 'code=?', (digits,), scopes)
    if not out and digits and len(digits) >= 4:
        like = '%' + digits[-9:] + '%' if len(digits) > 9 else '%' + digits + '%'
        out = store.rows('students', 'mobile LIKE ? OR parent_mobile LIKE ? OR parent_mobile2 LIKE ?', (like, like, like), scopes)
    if not out:
        key = D.key_text(q)
        if key:
            parts = key.split(' ')
            where = ' AND '.join(['name_key LIKE ?'] * len(parts))
            out = store.rows('students', where, tuple('%' + p + '%' for p in parts), scopes)
            if not out:
                out = store.rows('students', "REPLACE(name_key, ' ', '') LIKE ?", ('%' + key.replace(' ', '') + '%',), scopes)
            out.sort(key=lambda s: (not (s.get('nameKey') or '').startswith(key), len(s.get('name') or '')))
    return out[:limit]


def door_card(store, student_id, now=None, scopes=None):
    """What the front desk sees after recognising a student: who, which session now, money, warnings."""
    now = now or datetime.now()
    d = now.date()
    st = store.row('students', student_id)
    if not st:
        raise Problem('err.noStudent', 'Student not found.')
    if scopes is not None and not store._filter('students', [st], *store._visible(scopes)):
        raise Problem('err.scope', 'This student is not in your groups.')
    cfg = settings(store)
    ens = [e for e in active_enrollments(store, student_id, d) if scopes is None or e.get('teacherId') in scopes]
    groups = {g['id']: g for g in store.rows('groups', scopes=scopes)}
    bals = balances(store, ens, d, groups, {student_id: st})
    todays = [s for s in sessions_on(store, d, scopes)]
    mins = now.hour * 60 + now.minute
    mine = {e['groupId'] for e in ens}
    att = {a['sessionId']: a for a in store.rows('attendance', 'student_id=? AND date=?', (student_id, d.isoformat()), scopes)}
    candidates = []
    for s in todays:
        if s.get('status') == 'cancelled':
            continue
        g = groups.get(s['groupId']) or {}
        own = s['groupId'] in mine
        same_subject = any((groups.get(gid) or {}).get('subjectId') == g.get('subjectId') and g.get('subjectId') for gid in mine)
        if not own and not same_subject and not (g.get('gradeCode') == st.get('gradeCode')):
            continue
        candidates.append({'session': s, 'own': own, 'makeup': not own and same_subject, 'now': D.door_window(s, mins, cfg['doorEarlyMinutes'], cfg['doorLateMinutes']),
                           'done': s['id'] in att, 'status': (att.get(s['id']) or {}).get('status')})
    candidates.sort(key=lambda c: (not c['own'], not c['now'], abs((D.hm(c['session']['start']) or 0) - mins)))
    best = next((c for c in candidates if c['own'] and c['now'] and not c['done']), None)
    if best is None:
        best = next((c for c in candidates if c['own'] and c['now']), None)
    r = risk_for_student(store, student_id, d, scopes)
    return {'student': st, 'enrollments': [{**e, 'money': bals.get(e['id'])} for e in ens], 'wallet': wallet(store, student_id) if scopes is None else 0,
            'candidates': candidates[:8], 'suggested': best['session']['id'] if best else None, 'risk': r,
            'today': [a for a in att.values()]}


@atomic_operation
def checkin(ctx, student_id, session_id, status=None, via='code', now=None):
    """Records the student in the session (creating the session record when it is the first one), idempotent:
    a second scan of the same student in the same session changes nothing."""
    ctx.need('attendance.mark')
    now = now or datetime.now()
    st = ctx.store.row('students', student_id)
    if not st:
        raise Problem('err.noStudent', 'Student not found.')
    sess = _find_session(ctx.store, session_id)
    if not sess:
        raise Problem('err.noSession', 'This session does not exist.')
    if sess.get('status') == 'cancelled':
        raise Problem('err.cancelled', 'This session was cancelled.')
    group = ctx.store.row('groups', sess['groupId'])
    if not group:
        raise Problem('err.noGroup', 'The group of this session does not exist any more.')
    ctx.need_teacher(group.get('teacherId'))
    day = date.fromisoformat(sess['date'])
    if day != now.date() and not ctx.can('attendance.edit'):
        raise Problem('err.pastDay', 'Changing attendance of another day needs the permission to edit attendance.')
    ens = active_enrollments(ctx.store, student_id, day)
    home = next((e for e in ens if e['groupId'] == group['id']), None)
    makeup = False
    if not home:
        groups = {g['id']: g for g in ctx.store.rows('groups')}
        home = next((e for e in ens if (groups.get(e['groupId']) or {}).get('subjectId') == group.get('subjectId')
                     and (groups.get(e['groupId']) or {}).get('teacherId') == group.get('teacherId')), None) or \
            next((e for e in ens if (groups.get(e['groupId']) or {}).get('subjectId') == group.get('subjectId')), None)
        if not home:
            raise Problem('err.notEnrolled', 'The student is not enrolled in this group. Enrol first.')
        makeup = True
    ctx.need_teacher(home.get('teacherId'))
    existing = ctx.store.row('attendance', D.attendance_id(sess['id'], student_id))
    if existing and status is None:
        return {'id': existing['id'], 'status': existing['status'], 'already': True, 'makeup': bool(existing.get('makeup'))}
    cfg = settings(ctx.store)
    mins = now.hour * 60 + now.minute
    if status not in D.ATT_STATUSES:
        status = 'late' if day == now.date() and D.is_late(sess, mins, cfg['lateMinutes']) else 'present'
    aid = D.attendance_id(sess['id'], student_id)
    cur = ctx.store.row('attendance', aid)
    if cur and cur.get('status') == status:
        return {'id': aid, 'status': status, 'already': True, 'makeup': makeup}
    ops = []
    if sess.get('virtual') or not ctx.store.row('sessions', sess['id']):
        ops.append({'e': 'sessions', 'id': sess['id'], 'op': 'put', 'row': _session_row(sess)})
    elif sess.get('status') == 'planned':
        ops.append({'e': 'sessions', 'id': sess['id'], 'op': 'put', 'ver': sess['ver'], 'row': {**_strip(sess), 'status': 'held'}})
    row = {'sessionId': sess['id'], 'studentId': student_id, 'groupId': home['groupId'], 'teacherId': (ctx.store.row('groups', home['groupId']) or {}).get('teacherId'),
           'date': sess['date'], 'status': status, 'at': (cur or {}).get('at') or now.strftime('%H:%M'), 'via': via, 'makeup': makeup, 'by': ctx.user}
    ops.append({'e': 'attendance', 'id': aid, 'op': 'put', 'ver': cur['ver'] if cur else None, 'row': row})
    ctx.commit(f'Attendance: {st.get("name")} ({status})', ops)
    return {'id': aid, 'status': status, 'already': False, 'makeup': makeup}


def _strip(row):
    return {k: v for k, v in row.items() if k not in ('id', 'ver', 'virtual', 'present', 'enrolled')}


@atomic_operation
def mark_many(ctx, session_id, marks):
    """The teacher's or assistant's roll call: {studentId: status} for one session in ONE save."""
    ctx.need('attendance.mark')
    sess = _find_session(ctx.store, session_id)
    if not sess:
        raise Problem('err.noSession', 'This session does not exist.')
    if sess.get('status') == 'cancelled':
        raise Problem('err.cancelled', 'This session was cancelled.')
    ctx.need_teacher(sess.get('teacherId'))
    eligible = {r['student']['id'] for r in roster(ctx.store, session_id, ctx.scopes)['rows'] if r.get('student')}
    if set(marks) - eligible:
        raise Problem('err.notEnrolled', 'The student is not enrolled in this group. Enrol first.')
    if sess['date'] != date.today().isoformat() and not ctx.can('attendance.edit'):
        raise Problem('err.pastDay', 'Changing attendance of another day needs the permission to edit attendance.')
    ops = []
    if sess.get('virtual') or not ctx.store.row('sessions', sess['id']):
        ops.append({'e': 'sessions', 'id': sess['id'], 'op': 'put', 'row': _session_row(sess)})
    now = datetime.now().strftime('%H:%M')
    for sid, status in (marks or {}).items():
        if status not in D.ATT_STATUSES:
            continue
        aid = D.attendance_id(sess['id'], sid)
        cur = ctx.store.row('attendance', aid)
        if cur and cur.get('status') == status:
            continue
        if not cur and status == 'absent':
            # absence is the default (computed); only an explicit change from present needs a record
            continue
        row = {**(_strip(cur) if cur else {'sessionId': sess['id'], 'studentId': sid, 'groupId': sess['groupId'], 'teacherId': sess.get('teacherId'),
                                           'date': sess['date'], 'at': now, 'via': 'roll', 'makeup': False}), 'status': status, 'by': ctx.user}
        ops.append({'e': 'attendance', 'id': aid, 'op': 'put', 'ver': cur['ver'] if cur else None, 'row': row})
    if not ops:
        return {'changes': 0}
    res = ctx.commit(f'Roll call {sess["date"]} {sess.get("start", "")}', ops)
    return {'changes': res['changes']}


def roster(store, session_id, scopes=None):
    """The list of a session: enrolled students with their mark (absent when nothing was recorded) + make-up guests."""
    sess = _find_session(store, session_id)
    if not sess:
        raise Problem('err.noSession', 'This session does not exist.')
    if scopes is not None and sess.get('teacherId') not in scopes:
        raise Problem('err.scope', 'This belongs to a teacher you do not work with.')
    day = sess['date']
    ens = store.rows('enrollments', "group_id=? AND (status IS NULL OR status='active') AND (from_date IS NULL OR from_date='' OR from_date<=?) "
                                    "AND (to_date IS NULL OR to_date='' OR to_date>=?)", (sess['groupId'], day, day))
    att = {a['studentId']: a for a in store.rows('attendance', 'session_id=?', (session_id,))}
    ids = {e['studentId'] for e in ens} | set(att)
    students = {i: store.row('students', i) for i in ids}
    group = store.row('groups', sess['groupId']) or {}
    bals = balances(store, ens, date.fromisoformat(day), {group.get('id'): group}, students)
    rows = []
    for e in ens:
        a = att.get(e['studentId'])
        rows.append({'student': students.get(e['studentId']), 'status': (a or {}).get('status') or 'absent', 'at': (a or {}).get('at'),
                     'money': bals.get(e['id']), 'enrollmentId': e['id']})
    for sid, a in att.items():
        if sid not in {e['studentId'] for e in ens}:
            rows.append({'student': students.get(sid), 'status': a.get('status'), 'at': a.get('at'), 'guest': True})
    rows = [r for r in rows if r['student']]
    rows.sort(key=lambda r: D.key_text(r['student'].get('name')))
    return {'session': sess, 'group': group, 'rows': rows}


def set_session_status(ctx, session_id, status, topic=None):
    ctx.need('attendance.mark')
    if status not in ('held', 'cancelled', 'planned'):
        raise BadRequest('Unknown status')
    sess = _find_session(ctx.store, session_id)
    if not sess:
        raise Problem('err.noSession', 'This session does not exist.')
    ctx.need_teacher(sess.get('teacherId'))
    cur = ctx.store.row('sessions', sess['id'])
    row = {**_strip(sess), 'status': status}
    if topic is not None:
        row['topic'] = D.norm_text(topic)[:200]
    ctx.commit(f'Session {sess["date"]} {sess.get("start")}: {status}', [{'e': 'sessions', 'id': sess['id'], 'op': 'put', 'ver': cur['ver'] if cur else None, 'row': row}])
    return {'ok': True}


# ---------------------------------------------------------------- enrolment, transfer
@atomic_operation
def enroll(ctx, student_id, group_id, start=None, fee=None):
    ctx.need('students.manage', 'students.transfer')
    st, g = ctx.store.row('students', student_id), ctx.store.row('groups', group_id)
    if not st or not g:
        raise Problem('err.notFound', 'Student or group not found.')
    ctx.need_teacher(g.get('teacherId'))
    day = start or date.today().isoformat()
    if any(e['groupId'] == group_id for e in active_enrollments(ctx.store, student_id, date.fromisoformat(day))):
        raise Problem('err.alreadyEnrolled', 'The student is already in this group.')
    _check_capacity(ctx, g, day)
    row = {'studentId': student_id, 'groupId': group_id, 'teacherId': g.get('teacherId'), 'from': day, 'status': 'active'}
    if fee not in (None, ''):
        ctx.need('students.discount')
        row['fee'] = float(fee)
    eid = new_id('en')
    ctx.commit(f'Enrol {st["name"]} in {g["name"]}', [{'e': 'enrollments', 'id': eid, 'op': 'put', 'row': row}])
    return {'id': eid}


def _check_capacity(ctx, g, day):
    n = _enrolled_counts(ctx.store, day).get(g['id'], 0)
    cap = int(g.get('capacity') or 0)
    if g.get('kind') == 'school':
        cap = min(cap or 10**6, int(settings(ctx.store)['schoolMaxStudents']))
    if cap and n >= cap:
        raise Problem('err.groupFull', 'The group is full.', n=n, cap=cap)


@atomic_operation
def transfer(ctx, enrollment_id, to_group_id, day=None, reason=''):
    """Moves a student to another group from a day: the old enrolment ends the day before, a new one starts.
    Money already paid to the old group stays there (the balances show it); both changes are ONE save."""
    ctx.need('students.transfer')
    e = ctx.store.row('enrollments', enrollment_id)
    g = ctx.store.row('groups', to_group_id)
    if not e or not g:
        raise Problem('err.notFound', 'Enrolment or group not found.')
    ctx.need_teacher(e.get('teacherId'))
    ctx.need_teacher(g.get('teacherId'))
    if e['groupId'] == to_group_id:
        raise Problem('err.sameGroup', 'Choose another group.')
    day = day or date.today().isoformat()
    _check_capacity(ctx, g, day)
    prev = (date.fromisoformat(day) - timedelta(days=1)).isoformat()
    st = ctx.store.row('students', e['studentId']) or {}
    old = ctx.store.row('groups', e['groupId']) or {}
    ops = [{'e': 'enrollments', 'id': e['id'], 'op': 'put', 'ver': e['ver'],
            'row': {**_strip(e), 'to': prev, 'status': 'moved', 'note': D.norm_text(reason)[:200] or e.get('note')}},
           {'e': 'enrollments', 'id': new_id('en'), 'op': 'put',
            'row': {'studentId': e['studentId'], 'groupId': g['id'], 'teacherId': g.get('teacherId'), 'from': day, 'status': 'active',
                    **({'fee': e['fee']} if e.get('fee') is not None and old.get('teacherId') == g.get('teacherId') else {})}}]
    ctx.commit(f'Move {st.get("name")} from {old.get("name")} to {g["name"]}', ops)
    return {'ok': True}


@atomic_operation
def end_enrollment(ctx, enrollment_id, day=None, reason=''):
    ctx.need('students.transfer')
    e = ctx.store.row('enrollments', enrollment_id)
    if not e:
        raise Problem('err.notFound', 'Enrolment not found.')
    ctx.need_teacher(e.get('teacherId'))
    day = day or date.today().isoformat()
    st = ctx.store.row('students', e['studentId']) or {}
    ctx.commit(f'{st.get("name")} left the group', [{'e': 'enrollments', 'id': e['id'], 'op': 'put', 'ver': e['ver'],
                                                    'row': {**_strip(e), 'to': day, 'status': 'left', 'note': D.norm_text(reason)[:200]}}])
    return {'ok': True}


# ---------------------------------------------------------------- cash shifts
def my_shift(store, user_id, node_id):
    rows = store.rows('shifts', "user_id=? AND node=? AND status='open'", (user_id, node_id))
    return rows[-1] if rows else None


@atomic_operation
def open_shift(ctx, opening):
    ctx.need('money.collect', 'expenses.add')
    if my_shift(ctx.store, ctx.user_id, ctx.node_id):
        raise Problem('err.shiftOpen', 'You already have an open cash shift on this PC.')
    try:
        opening = round(float(opening or 0), 2)
    except (TypeError, ValueError):
        raise Problem('err.amount', 'Write the amount.')
    if not math.isfinite(opening) or opening < 0:
        raise Problem('err.amount', 'Write the amount.')
    with ctx.store.lock:
        no = _next_no(ctx.store, 'shifts', 'S', ctx.letter(), date.today().year)
        sid = new_id('sh')
        ctx.commit(f'Cash shift {no} opened', [{'e': 'shifts', 'id': sid, 'op': 'put', 'row': {
            'no': no, 'user': ctx.user, 'userId': ctx.user_id, 'node': ctx.node_id, 'openedAt': _now(), 'openingCash': opening, 'status': 'open'}}])
    return {'id': sid, 'no': no}


def shift_summary(store, shift_id):
    sh = store.row('shifts', shift_id)
    if not sh:
        raise Problem('err.notFound', 'Cash shift not found.')
    pays = store.rows('payments', 'shift_id=?', (shift_id,))
    exps = store.rows('expenses', 'shift_id=?', (shift_id,))
    expected = D.shift_expected(sh.get('openingCash'), pays, exps)
    return {'shift': sh, 'expected': expected, 'byMethod': D.by_method(pays), 'receipts': len([p for p in pays if not p.get('voidOf')]),
            'voids': len([p for p in pays if p.get('voidOf')]), 'expenses': round(sum(e.get('amount') or 0 for e in exps), 2),
            'cashIn': round(sum(p.get('amount') or 0 for p in pays if (p.get('method') or 'cash') == 'cash'), 2),
            'cashOut': round(sum(e.get('amount') or 0 for e in exps if (e.get('method') or 'cash') == 'cash'), 2),
            'payments': pays[-300:], 'expenseRows': exps[-100:]}


@atomic_operation
def close_shift(ctx, shift_id, counted, reason=''):
    """Closing = counting the drawer. The difference is saved with its reason and never hidden."""
    sh = ctx.store.row('shifts', shift_id)
    if not sh:
        raise Problem('err.notFound', 'Cash shift not found.')
    if sh.get('userId') != ctx.user_id:
        ctx.need('shifts.manage')
    else:
        ctx.need('shifts.close', 'shifts.manage')
    if sh.get('status') != 'open':
        raise Problem('err.shiftClosed', 'This cash shift is already closed.')
    try:
        counted = round(float(counted), 2)
    except (TypeError, ValueError):
        raise Problem('err.amount', 'Write the amount counted in the drawer.')
    summ = shift_summary(ctx.store, shift_id)
    diff = round(counted - summ['expected'], 2)
    reason = D.norm_text(reason)[:300]
    if diff and len(reason) < 3:
        raise Problem('err.diffReason', 'The drawer does not match. Write the reason of the difference.', diff=diff)
    ctx.commit(f'Cash shift {sh["no"]} closed (difference {diff})', [{'e': 'shifts', 'id': shift_id, 'op': 'put', 'ver': sh['ver'], 'row': {
        **_strip(sh), 'closedAt': _now(), 'expectedCash': summ['expected'], 'countedCash': counted, 'diff': diff, 'diffReason': reason, 'status': 'closed'}}])
    return {'expected': summ['expected'], 'counted': counted, 'diff': diff}


# ---------------------------------------------------------------- receipts
@atomic_operation
def pay(ctx, d):
    """Takes money: a group fee, a handout, money in advance (wallet) or other. Needs this user's open cash shift
    on this PC (also for e-wallet payments, so every receipt belongs to one person's day). Returns the receipt."""
    ctx.need('money.collect')
    kind = d.get('kind') or 'fee'
    if kind not in D.PAY_KINDS or kind == 'refund':
        raise BadRequest('Unknown payment kind')
    method = d.get('method') or 'cash'
    if method not in D.PAY_METHODS:
        raise BadRequest('Unknown payment method')
    try:
        amount = round(float(d.get('amount')), 2)
    except (TypeError, ValueError):
        raise Problem('err.amount', 'Write the amount.')
    if not math.isfinite(amount) or amount <= 0:
        raise Problem('err.amount', 'Write the amount.')
    shift = my_shift(ctx.store, ctx.user_id, ctx.node_id)
    if not shift:
        raise Problem('err.noShift', 'Open your cash shift first.')
    st = ctx.store.row('students', d.get('studentId')) if d.get('studentId') else None
    if d.get('studentId') and not st:
        raise Problem('err.noStudent', 'Student not found.')
    row = {'date': date.today().isoformat(), 'at': datetime.now().strftime('%H:%M'), 'studentId': d.get('studentId') or '', 'kind': kind,
           'amount': amount, 'method': method, 'ref': D.norm_text(d.get('ref'))[:60], 'shiftId': shift['id'], 'note': D.norm_text(d.get('note'))[:200],
           'by': ctx.user}
    ops = []
    label = ''
    if kind == 'fee':
        g = ctx.store.row('groups', d.get('groupId'))
        if not g or not st:
            raise Problem('err.chooseGroup', 'Choose the student and the group.')
        ctx.need_teacher(g.get('teacherId'))
        row.update({'groupId': g['id'], 'teacherId': g.get('teacherId'), 'period': str(d.get('period') or '')[:7],
                    'sessions': int(d.get('sessions') or 0) or None})
        label = f'Payment {amount:g} from {st["name"]} for {g["name"]}'
    elif kind == 'material':
        m = ctx.store.row('materials', d.get('materialId'))
        if not m:
            raise Problem('err.notFound', 'Handout not found.')
        if m.get('teacherId'):
            ctx.need_teacher(m['teacherId'])
        qty = max(1, int(d.get('qty') or 1))
        row.update({'materialId': m['id'], 'qty': qty, 'teacherId': m.get('teacherId') or ''})
        ops.append({'e': 'materials', 'id': m['id'], 'op': 'put', 'ver': m['ver'], 'row': {**_strip(m), 'stock': (m.get('stock') or 0) - qty}})
        label = f'Handout {m["name"]} x{qty}' + (f' to {st["name"]}' if st else '')
    elif kind == 'wallet_topup':
        if not st:
            raise Problem('err.noStudent', 'Student not found.')
        if method == 'wallet':
            raise BadRequest('A wallet is topped up with money')
        label = f'Money in advance {amount:g} from {st["name"]}'
    else:
        label = f'Receipt {amount:g}' + (f' from {st["name"]}' if st else '')
    if method == 'wallet':
        if not st:
            raise Problem('err.noStudent', 'Student not found.')
        if wallet(ctx.store, st['id']) + 0.001 < amount:
            raise Problem('err.walletLow', 'There is not enough money in advance.', have=wallet(ctx.store, st['id']))
    with ctx.store.lock:  # numbering and saving under one lock: two clicks never get the same number
        row['no'] = _next_no(ctx.store, 'payments', 'R', ctx.letter(), date.today().year)
        pid = new_id('pa')
        ops.insert(0, {'e': 'payments', 'id': pid, 'op': 'put', 'row': row})
        ctx.commit(f'{label} ({row["no"]})', ops)
    return {'id': pid, **row}


@atomic_operation
def void_payment(ctx, payment_id, reason):
    """A receipt is never changed or deleted: a reversing receipt with the opposite amount is added."""
    ctx.need('money.void')
    reason = D.norm_text(reason)
    if len(reason) < 3:
        raise Problem('err.reason', 'Write the reason.')
    p = ctx.store.row('payments', payment_id)
    if not p:
        raise Problem('err.notFound', 'Receipt not found.')
    if p.get('voidOf'):
        raise Problem('err.voidVoid', 'A reversal cannot be reversed again.')
    if p.get('teacherId'):
        ctx.need_teacher(p['teacherId'])
    if ctx.store.rows('payments', 'void_of=?', (payment_id,)):
        raise Problem('err.voided', 'This receipt is already reversed.')
    shift = my_shift(ctx.store, ctx.user_id, ctx.node_id)
    if (p.get('method') or 'cash') == 'cash' and not shift:
        raise Problem('err.noShift', 'Open your cash shift first (the money leaves your drawer).')
    row = {**_strip(p), 'amount': -float(p.get('amount') or 0), 'voidOf': p['id'], 'note': reason[:200], 'by': ctx.user,
           'date': date.today().isoformat(), 'at': datetime.now().strftime('%H:%M'), 'shiftId': shift['id'] if shift else ''}
    ops = []
    if p.get('kind') == 'material' and p.get('materialId'):
        m = ctx.store.row('materials', p['materialId'])
        if m:
            ops.append({'e': 'materials', 'id': m['id'], 'op': 'put', 'ver': m['ver'], 'row': {**_strip(m), 'stock': (m.get('stock') or 0) + (p.get('qty') or 1)}})
    with ctx.store.lock:
        row['no'] = _next_no(ctx.store, 'payments', 'R', ctx.letter(), date.today().year)
        vid = new_id('pa')
        ops.insert(0, {'e': 'payments', 'id': vid, 'op': 'put', 'row': row})
        ctx.commit(f'Reversed receipt {p.get("no")}: {reason[:80]}', ops)
    return {'id': vid, 'no': row['no']}


@atomic_operation
def add_expense(ctx, d):
    ctx.need('expenses.add')
    cat = d.get('category') or 'other'
    if cat not in D.EXPENSE_CATS:
        raise BadRequest('Unknown expense category')
    if cat == 'teacher_payout':
        ctx.need('settlements.manage')
    method = d.get('method') or 'cash'
    if method not in D.PAY_METHODS or method == 'wallet':
        raise BadRequest('Unknown payment method')
    try:
        amount = round(float(d.get('amount')), 2)
    except (TypeError, ValueError):
        raise Problem('err.amount', 'Write the amount.')
    if not math.isfinite(amount) or amount <= 0:
        raise Problem('err.amount', 'Write the amount.')
    shift = my_shift(ctx.store, ctx.user_id, ctx.node_id)
    if method == 'cash' and not shift:
        raise Problem('err.noShift', 'Open your cash shift first (the money leaves your drawer).')
    if d.get('teacherId'):
        ctx.need_teacher(d['teacherId'])
    note = D.norm_text(d.get('note'))[:200]
    row = {'date': str(d.get('date') or date.today().isoformat())[:10], 'at': datetime.now().strftime('%H:%M'), 'amount': amount, 'category': cat,
           'teacherId': d.get('teacherId') or '', 'groupId': d.get('groupId') or '', 'method': method, 'shiftId': shift['id'] if shift else '',
           'note': note, 'by': ctx.user}
    with ctx.store.lock:
        row['no'] = _next_no(ctx.store, 'expenses', 'E', ctx.letter(), date.today().year)
        eid = new_id('ex')
        ctx.commit(f'Expense {cat} {amount:g} ({row["no"]})', [{'e': 'expenses', 'id': eid, 'op': 'put', 'row': row}])
    return {'id': eid, **row}


@atomic_operation
def void_expense(ctx, expense_id, reason):
    ctx.need('money.void')
    reason = D.norm_text(reason)
    if len(reason) < 3:
        raise Problem('err.reason', 'Write the reason.')
    x = ctx.store.row('expenses', expense_id)
    if not x or x.get('voidOf') or ctx.store.rows('expenses', 'void_of=?', (expense_id,)):
        raise Problem('err.voided', 'This cannot be reversed.')
    shift = my_shift(ctx.store, ctx.user_id, ctx.node_id)
    row = {**_strip(x), 'amount': -float(x.get('amount') or 0), 'voidOf': x['id'], 'note': reason[:200], 'by': ctx.user,
           'date': date.today().isoformat(), 'at': datetime.now().strftime('%H:%M'), 'shiftId': shift['id'] if shift and x.get('method') == 'cash' else ''}
    with ctx.store.lock:
        row['no'] = _next_no(ctx.store, 'expenses', 'E', ctx.letter(), date.today().year)
        ctx.commit(f'Reversed expense {x.get("no")}', [{'e': 'expenses', 'id': new_id('ex'), 'op': 'put', 'row': row}])
    return {'ok': True}


# ---------------------------------------------------------------- early warning
def _risk_inputs(store, student_ids=None, since_days=90):
    """For every active enrolment: the last sessions' marks and the exam percentages (bulk)."""
    today = _today()
    since = (today - timedelta(days=since_days)).isoformat()
    day = today.isoformat()
    ens = store.rows('enrollments', "(status IS NULL OR status='active') AND (to_date IS NULL OR to_date='' OR to_date>=?)", (day,))
    if student_ids is not None:
        ens = [e for e in ens if e['studentId'] in student_ids]
    with store.lock:
        sess = {}
        for r in store.conn.execute("SELECT id, group_id, date FROM sessions WHERE deleted=0 AND status='held' AND date>=? AND date<=? ORDER BY date, start_time",
                                    (since, day)):
            sess.setdefault(r[1], []).append((r[0], r[2]))
        att = {}
        for r in store.conn.execute('SELECT session_id, student_id, status FROM attendance WHERE deleted=0 AND date>=?', (since,)):
            att[(r[0], r[1])] = r[2]
        marks = {}
        for r in store.conn.execute('SELECT m.student_id, e.teacher_id, m.score, e.max_score, m.absent FROM marks m JOIN exams e ON e.id=m.exam_id '
                                    'WHERE m.deleted=0 AND e.deleted=0 AND e.date>=? ORDER BY e.date', (since,)):
            if r[4] or not r[3]:
                continue
            marks.setdefault((r[0], r[1]), []).append(100.0 * (r[2] or 0) / r[3])
        recent = {r[0] for r in store.conn.execute('SELECT student_id FROM followups WHERE deleted=0 AND date>=?', ((today - timedelta(days=14)).isoformat(),))}
    return ens, sess, att, marks, recent


def cached_read(fn):
    """Versioned, bounded per-store cache; callers receive independent mutable results."""
    @wraps(fn)
    def read(store, *args, **kwargs):
        with store.lock:
            version = store.version()
            key = (fn.__name__, repr(args), repr(sorted(kwargs.items())))
            cache = getattr(store, '_centre_cache', {})
            entry = cache.get(key)
            if entry and entry[0] == version and time.monotonic() - entry[1] < 30:
                return copy.deepcopy(entry[2])
            result = fn(store, *args, **kwargs)
            if len(cache) >= 128:
                cache.clear()
            cache[key] = (version, time.monotonic(), copy.deepcopy(result))
            store._centre_cache = cache
            return result
    return read


@cached_read
def risk_list(store, scopes=None, limit=500):
    """Students who may drop out, highest score first, with reasons - the "call today" list."""
    ens, sess, att, marks, recent = _risk_inputs(store)
    if scopes is not None:
        ens = [e for e in ens if e.get('teacherId') in scopes]
    groups = {g['id']: g for g in store.rows('groups')}
    students = {s['id']: s for s in store.rows('students')}
    bals = balances(store, ens, None, groups, students)
    cfg = settings(store)
    out = []
    for e in ens:
        g = groups.get(e['groupId'])
        if not g:
            continue
        frm = e.get('from') or ''
        statuses = [att.get((sid, e['studentId']), 'absent') for sid, d in sess.get(g['id'], []) if d >= frm]
        b = bals.get(e['id']) or {}
        score, why = D.risk(statuses, marks.get((e['studentId'], g.get('teacherId')), []), b.get('balance', 0), b.get('unit', 0),
                            e['studentId'] in recent)
        if score >= cfg['riskCall']:
            out.append({'studentId': e['studentId'], 'student': students.get(e['studentId']), 'groupId': g['id'], 'teacherId': g.get('teacherId'),
                        'score': score, 'why': why, 'followed': e['studentId'] in recent, 'balance': b.get('balance', 0),
                        'last': statuses[-6:], 'level': 'high' if score >= cfg['riskHigh'] else 'medium'})
    out.sort(key=lambda r: -r['score'])
    return out[:limit]


def risk_for_student(store, student_id, d=None, scopes=None):
    ens, sess, att, marks, recent = _risk_inputs(store, {student_id})
    groups = {g['id']: g for g in store.rows('groups', scopes=scopes)}
    ens = [e for e in ens if scopes is None or e.get('teacherId') in scopes]
    st = store.row('students', student_id) or {}
    bals = balances(store, ens, d, groups, {student_id: st})
    worst = {'score': 0, 'why': []}
    for e in ens:
        g = groups.get(e['groupId'])
        if not g:
            continue
        statuses = [att.get((sid, student_id), 'absent') for sid, dd in sess.get(g['id'], []) if dd >= (e.get('from') or '')]
        b = bals.get(e['id']) or {}
        score, why = D.risk(statuses, marks.get((student_id, g.get('teacherId')), []), b.get('balance', 0), b.get('unit', 0), student_id in recent)
        if score > worst['score']:
            worst = {'score': score, 'why': why, 'groupId': g['id']}
    return worst


def log_followup(ctx, d):
    ctx.need('followup.log')
    st = ctx.store.row('students', d.get('studentId'))
    if not st:
        raise Problem('err.noStudent', 'Student not found.')
    t = d.get('type') or 'call'
    if t not in ('call', 'whatsapp', 'sms', 'meeting', 'note'):
        raise BadRequest('Unknown follow-up type')
    teacher = d.get('teacherId') or ''
    if teacher:
        ctx.need_teacher(teacher)
    fid = new_id('fu')
    ctx.commit(f'Follow-up {t}: {st["name"]}', [{'e': 'followups', 'id': fid, 'op': 'put', 'row': {
        'studentId': st['id'], 'teacherId': teacher, 'date': date.today().isoformat(), 'type': t, 'reason': str(d.get('reason') or '')[:40],
        'outcome': D.norm_text(d.get('outcome'))[:400], 'by': ctx.user}}])
    return {'id': fid}


# ---------------------------------------------------------------- the student file
def student_file(store, student_id, scopes=None):
    st = store.row('students', student_id)
    if not st:
        raise Problem('err.noStudent', 'Student not found.')
    allowed, visible = store._visible(scopes)
    if allowed is not None and student_id not in visible:
        raise Problem('err.scope', 'This student is not in your groups.')
    ens = store.rows('enrollments', 'student_id=?', (student_id,), scopes)
    groups = {g['id']: g for g in store.rows('groups')}
    bals = balances(store, ens, None, groups, {student_id: st})
    att = store.rows('attendance', 'student_id=?', (student_id,), scopes)
    pays = store.rows('payments', 'student_id=?', (student_id,), scopes)
    with store.lock:
        marks = [dict(zip(('examId', 'title', 'date', 'kind', 'maxScore', 'teacherId', 'score', 'absent'), r)) for r in store.conn.execute(
            'SELECT e.id, e.title, e.date, e.kind, e.max_score, e.teacher_id, m.score, m.absent FROM marks m JOIN exams e ON e.id=m.exam_id '
            'WHERE m.deleted=0 AND e.deleted=0 AND m.student_id=? ORDER BY e.date', (student_id,))]
    if allowed is not None:
        marks = [m for m in marks if m['teacherId'] in allowed]
    for m in marks:
        m['rank'], m['of'] = exam_rank(store, m['examId'], student_id)
    fus = store.rows('followups', 'student_id=?', (student_id,))
    family = store.rows('students', 'family_key=? AND id<>?', (st['familyKey'], student_id)) if st.get('familyKey') else []
    held = {}
    with store.lock:
        for e in ens:
            held[e['id']] = store.conn.execute("SELECT COUNT(*) FROM sessions WHERE deleted=0 AND status='held' AND group_id=? AND date>=? AND (? = '' OR date<=?)",
                                               (e['groupId'], e.get('from') or '', e.get('to') or '', e.get('to') or '')).fetchone()[0]
    return {'student': st, 'enrollments': [{**e, 'money': bals.get(e['id']), 'held': held.get(e['id'], 0)} for e in ens],
            'attendance': sorted(att, key=lambda a: a.get('date') or '', reverse=True), 'payments': sorted(pays, key=lambda p: (p.get('date') or '', p.get('no') or ''), reverse=True),
            'marks': marks, 'followups': sorted(fus, key=lambda f: f.get('date') or '', reverse=True), 'wallet': wallet(store, student_id),
            'risk': risk_for_student(store, student_id, scopes=scopes), 'family': [{'id': f['id'], 'name': f['name'], 'code': f.get('code')} for f in family]}


def exam_rank(store, exam_id, student_id=None):
    """Competition rank (1, 2, 2, 4) among the students who sat the exam."""
    with store.lock:
        rows = store.conn.execute('SELECT student_id, score FROM marks WHERE deleted=0 AND exam_id=? AND (absent IS NULL OR absent=0) AND score IS NOT NULL '
                                  'ORDER BY score DESC', (exam_id,)).fetchall()
    ranks, last, pos = {}, None, 0
    for i, (sid, sc) in enumerate(rows, 1):
        if sc != last:
            pos, last = i, sc
        ranks[sid] = pos
    if student_id is None:
        return ranks
    return ranks.get(student_id), len(rows)


def exam_results(store, exam_id, scopes=None):
    ex = store.row('exams', exam_id)
    if not ex:
        raise Problem('err.notFound', 'Exam not found.')
    if scopes is not None and ex.get('teacherId') not in scopes:
        raise Problem('err.scope', 'This belongs to a teacher you do not work with.')
    day = ex.get('date') or date.today().isoformat()
    gids = ex.get('groupIds') or []
    ens = [e for gid in gids for e in store.rows('enrollments', "group_id=? AND (from_date IS NULL OR from_date='' OR from_date<=?) AND (to_date IS NULL OR to_date='' OR to_date>=?)",
                                                   (gid, day, day))]
    marks = {m['studentId']: m for m in store.rows('marks', 'exam_id=?', (exam_id,))}
    ids = {e['studentId'] for e in ens} | set(marks)
    students = {i: store.row('students', i) for i in ids}
    ranks = exam_rank(store, exam_id)
    rows = []
    for sid in ids:
        s = students.get(sid)
        if not s:
            continue
        m = marks.get(sid) or {}
        rows.append({'student': s, 'mark': m or None, 'rank': ranks.get(sid), 'groupId': next((e['groupId'] for e in ens if e['studentId'] == sid), '')})
    rows.sort(key=lambda r: (r['rank'] is None, r['rank'] or 0, D.key_text(r['student']['name'])))
    sat = [r['mark']['score'] for r in rows if r['mark'] and not r['mark'].get('absent') and r['mark'].get('score') is not None]
    mx = float(ex.get('maxScore') or 0) or 1
    stats = {'sat': len(sat), 'of': len(rows), 'avg': round(sum(sat) / len(sat), 2) if sat else None, 'max': max(sat) if sat else None,
             'min': min(sat) if sat else None, 'passRate': round(100 * sum(1 for x in sat if x >= mx / 2) / len(sat)) if sat else None}
    return {'exam': ex, 'rows': rows, 'stats': stats}


@atomic_operation
def save_marks(ctx, exam_id, items):
    """items: [{studentId, score|None, absent, answers, via}] -> ONE save. Ids are fixed per exam and student, so the same
    sheet entered on two PCs merges instead of counting twice."""
    ctx.need('marks.enter')
    ex = ctx.store.row('exams', exam_id)
    if not ex:
        raise Problem('err.notFound', 'Exam not found.')
    ctx.need_teacher(ex.get('teacherId'))
    mx = float(ex.get('maxScore') or 0)
    ops = []
    for it in items or []:
        sid = it.get('studentId')
        if not sid or not ctx.store.row('students', sid):
            continue
        absent = bool(it.get('absent'))
        score = None
        if not absent and it.get('score') not in (None, ''):
            try:
                score = round(float(it['score']), 2)
            except (TypeError, ValueError):
                raise Problem('err.score', 'A mark is not a number.')
            if score < 0 or (mx and score > mx):
                raise Problem('err.scoreRange', 'A mark is higher than the full mark.', max=mx)
        if score is None and not absent:
            continue
        mid = D.mark_id(exam_id, sid)
        cur = ctx.store.row('marks', mid)
        row = {'examId': exam_id, 'studentId': sid, 'teacherId': ex.get('teacherId'), 'score': score, 'absent': absent,
               'via': it.get('via') or 'manual', 'answers': it.get('answers') if isinstance(it.get('answers'), list) else (cur or {}).get('answers')}
        if cur and all(cur.get(k) == row.get(k) for k in ('score', 'absent')):
            continue
        ops.append({'e': 'marks', 'id': mid, 'op': 'put', 'ver': cur['ver'] if cur else None, 'row': row})
    if not ops:
        return {'changes': 0}
    res = ctx.commit(f'Marks: {ex.get("title")} ({len(ops)})', ops)
    return {'changes': res['changes']}


def grade_answers(answer_key, answers, max_score):
    """Bubble sheet: score = correct answers x (full mark / questions)."""
    key = [str(a or '').upper() for a in answer_key or []]
    got = [str(a or '').upper() for a in answers or []]
    if not key:
        return None, 0
    right = sum(1 for i, k in enumerate(key) if k and i < len(got) and got[i] == k)
    return round(right * float(max_score or len(key)) / len(key), 2), right


# ---------------------------------------------------------------- settlements and profitability (one month)
def _month_facts(store, ym):
    first, last = D.month_bounds(ym)
    a, b = first.isoformat(), last.isoformat()
    with store.lock:
        rev = {r[0]: float(r[1] or 0) for r in store.conn.execute(
            "SELECT group_id, SUM(amount) FROM payments WHERE deleted=0 AND kind='fee' AND date>=? AND date<=? GROUP BY group_id", (a, b))}
        mat = {}
        for r in store.conn.execute("SELECT p.teacher_id, SUM(p.amount), SUM(COALESCE(p.qty,1) * COALESCE(m.cost,0) * (CASE WHEN p.amount<0 THEN -1 ELSE 1 END)) "
                                    "FROM payments p LEFT JOIN materials m ON m.id=p.material_id WHERE p.deleted=0 AND p.kind='material' AND p.date>=? AND p.date<=? "
                                    "GROUP BY p.teacher_id", (a, b)):
            mat[r[0] or ''] = (float(r[1] or 0), float(r[2] or 0))
        held = {r[0]: (r[1], float(r[2] or 0)) for r in store.conn.execute(
            "SELECT group_id, COUNT(*), SUM((CAST(substr(end_time,1,2) AS INTEGER)*60+CAST(substr(end_time,4,2) AS INTEGER)) - "
            "(CAST(substr(start_time,1,2) AS INTEGER)*60+CAST(substr(start_time,4,2) AS INTEGER))) FROM sessions "
            "WHERE deleted=0 AND status='held' AND date>=? AND date<=? GROUP BY group_id", (a, b))}
        visits = {r[0]: r[1] for r in store.conn.execute(
            "SELECT group_id, COUNT(*) FROM attendance WHERE deleted=0 AND status IN ('present','late') AND date>=? AND date<=? GROUP BY group_id", (a, b))}
        exp = {}
        for r in store.conn.execute("SELECT teacher_id, category, SUM(amount) FROM expenses WHERE deleted=0 AND teacher_id<>'' AND teacher_id IS NOT NULL "
                                    "AND date>=? AND date<=? GROUP BY teacher_id, category", (a, b)):
            exp.setdefault(r[0], {})[r[1]] = float(r[2] or 0)
        roomhours = {}
        for r in store.conn.execute("SELECT group_id, room_id FROM sessions WHERE deleted=0 AND status='held' AND date>=? AND date<=?", (a, b)):
            roomhours.setdefault(r[0], set()).add(r[1])
    return {'rev': rev, 'mat': mat, 'held': held, 'visits': visits, 'exp': exp, 'first': first, 'last': last}


def settlement(store, teacher_id, ym, facts=None):
    """The month of one teacher: what was collected, the centre's share by the agreed terms, handouts, deductions,
    what was already paid out and what is still due."""
    if not D.valid_month(ym):
        raise Problem('err.month', 'Choose the month.')
    t = store.row('teachers', teacher_id)
    if not t:
        raise Problem('err.notFound', 'Teacher not found.')
    f = facts or _month_facts(store, ym)
    cfg = settings(store)
    groups = [g for g in store.rows('groups', 'teacher_id=?', (teacher_id,))]
    center_groups = [g for g in groups if g.get('kind') != 'school']
    school_groups = [g for g in groups if g.get('kind') == 'school']
    rev = round(sum(f['rev'].get(g['id'], 0) for g in center_groups), 2)
    sessions = sum((f['held'].get(g['id']) or (0, 0))[0] for g in center_groups)
    visits = sum(f['visits'].get(g['id'], 0) for g in center_groups)
    share = D.center_share(t, rev, sessions, visits)
    school_rev = round(sum(f['rev'].get(g['id'], 0) for g in school_groups), 2)
    school = D.school_split(school_rev, float(cfg['schoolTreasuryPct']), float(cfg['schoolTeacherPct']))
    mat_rev, mat_cost = f['mat'].get(teacher_id, (0.0, 0.0))
    exps = f['exp'].get(teacher_id, {})
    paid = round(exps.get('teacher_payout', 0), 2)
    deductions = round(sum(v for k, v in exps.items() if k != 'teacher_payout') + mat_cost, 2)
    teacher_share = round(rev - share + school['teacher'] + mat_rev, 2)
    net = round(teacher_share - deductions, 2)
    per_group = []
    for g in groups:
        n, mins = f['held'].get(g['id']) or (0, 0)
        per_group.append({'groupId': g['id'], 'name': g.get('name'), 'kind': g.get('kind') or 'center', 'revenue': round(f['rev'].get(g['id'], 0), 2),
                          'sessions': n, 'visits': f['visits'].get(g['id'], 0)})
    saved = store.row('settlements', D.settlement_id(teacher_id, ym))
    return {'teacherId': teacher_id, 'teacher': t.get('name'), 'period': ym, 'revenue': rev, 'sessions': sessions, 'visits': visits, 'centerShare': share,
            'schoolRevenue': school_rev, 'school': school, 'materials': round(mat_rev, 2), 'materialsCost': round(mat_cost, 2), 'deductions': deductions,
            'teacherShare': teacher_share, 'net': net, 'paid': paid, 'remaining': round(net - paid, 2), 'groups': per_group,
            'terms': {k: t.get(k) for k in ('settleModel', 'rentMonth', 'rentSession', 'rentStudent', 'centerPct')},
            'saved': saved}


def settlements(store, ym, scopes=None):
    if not D.valid_month(ym):
        raise Problem('err.month', 'Choose the month.')
    f = _month_facts(store, ym)
    out = []
    for t in store.rows('teachers', '', (), scopes):
        out.append(settlement(store, t['id'], ym, f))
    return out


@atomic_operation
def approve_settlement(ctx, teacher_id, ym):
    """Freezes the month's numbers (a fixed record per teacher and month, so approving on two PCs merges)."""
    ctx.need('settlements.manage')
    ctx.need_teacher(teacher_id)
    s = settlement(ctx.store, teacher_id, ym)
    sid = D.settlement_id(teacher_id, ym)
    cur = ctx.store.row('settlements', sid)
    row = {'teacherId': teacher_id, 'period': ym, 'revenue': s['revenue'], 'centerShare': s['centerShare'], 'teacherShare': s['teacherShare'],
           'deductions': s['deductions'], 'paid': s['paid'], 'status': 'approved', 'by': ctx.user, 'at': _now(),
           'detail': {k: s[k] for k in ('sessions', 'visits', 'schoolRevenue', 'school', 'materials', 'materialsCost', 'net', 'remaining', 'terms', 'groups')}}
    ctx.commit(f'Settlement {s["teacher"]} {ym} approved', [{'e': 'settlements', 'id': sid, 'op': 'put', 'ver': cur['ver'] if cur else None, 'row': row}])
    return s


def profitability(store, ym, scopes=None):
    """Every group of the month: collected, centre share, room cost, the centre's profit, fill rate and attendance,
    and one advice (open another group / merge / watch / loses money)."""
    if not D.valid_month(ym):
        raise Problem('err.month', 'Choose the month.')
    f = _month_facts(store, ym)
    teachers = {t['id']: t for t in store.rows('teachers')}
    rooms = {r['id']: r for r in store.rows('rooms')}
    day = min(f['last'], _today()).isoformat()
    enrolled = _enrolled_counts(store, day)
    groups = store.rows('groups', '', (), scopes)
    # monthly rent of a teacher is spread over his groups by their sessions
    sess_by_teacher = {}
    for g in groups:
        sess_by_teacher[g.get('teacherId')] = sess_by_teacher.get(g.get('teacherId'), 0) + (f['held'].get(g['id']) or (0, 0))[0]
    out = []
    for g in groups:
        t = teachers.get(g.get('teacherId')) or {}
        n, mins = f['held'].get(g['id']) or (0, 0)
        rev = round(f['rev'].get(g['id'], 0), 2)
        visits = f['visits'].get(g['id'], 0)
        if g.get('kind') == 'school':
            cfg = settings(store)
            sp = D.school_split(rev, float(cfg['schoolTreasuryPct']), float(cfg['schoolTeacherPct']))
            share, teacher_net = sp['school'], sp['teacher']
        else:
            rent_month = float(t.get('rentMonth') or 0) * (n / sess_by_teacher[g.get('teacherId')] if sess_by_teacher.get(g.get('teacherId')) else 0)
            share = round(rent_month + float(t.get('rentSession') or 0) * n + float(t.get('rentStudent') or 0) * visits + float(t.get('centerPct') or 0) / 100 * rev, 2)
            teacher_net = round(rev - share, 2)
        room = rooms.get(g.get('roomId')) or {}
        room_cost = round(float(room.get('costPerHour') or 0) * (mins or 0) / 60, 2)
        cap = int(g.get('capacity') or 0)
        en = enrolled.get(g['id'], 0)
        util = round(en / cap, 3) if cap else None
        rate = round(visits / (n * en), 3) if n and en else None
        profit = round(share - room_cost, 2)
        out.append({'groupId': g['id'], 'name': g.get('name'), 'teacherId': g.get('teacherId'), 'subjectId': g.get('subjectId'), 'kind': g.get('kind') or 'center',
                    'revenue': rev, 'sessions': n, 'hours': round((mins or 0) / 60, 1), 'visits': visits, 'enrolled': en, 'capacity': cap,
                    'utilisation': util, 'attendanceRate': rate, 'centerShare': share, 'teacherNet': teacher_net, 'roomCost': room_cost,
                    'centerProfit': profit, 'perStudent': round(rev / en, 2) if en else None,
                    'signal': D.group_signal(util, rate, profit if (share or room_cost) else None)})
    out.sort(key=lambda r: -r['revenue'])
    return out


# ---------------------------------------------------------------- the overview numbers
@cached_read
def dashboard(store, scopes=None, d=None):
    d = d or _today()
    day = d.isoformat()
    sess = sessions_on(store, d, scopes)
    allowed, visible = store._visible(scopes)
    tf = '' if allowed is None else ' AND teacher_id IN (' + ','.join('?' * len(allowed)) + ')'
    ta = tuple(allowed or ())
    first = d.replace(day=1).isoformat()
    with store.lock:
        c = store.conn
        checked = c.execute("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE deleted=0 AND status IN ('present','late') AND date=?" + tf, (day, *ta)).fetchone()[0]
        today_money = {r[0] or 'cash': float(r[1] or 0) for r in c.execute(
            "SELECT method, SUM(amount) FROM payments WHERE deleted=0 AND date=?" + tf + " GROUP BY method", (day, *ta))}
        month_money = float(c.execute("SELECT SUM(amount) FROM payments WHERE deleted=0 AND kind<>'wallet_topup' AND date>=? AND date<=?" + tf, (first, day, *ta)).fetchone()[0] or 0)
        month_exp = float(c.execute("SELECT SUM(amount) FROM expenses WHERE deleted=0 AND date>=? AND date<=?" + tf, (first, day, *ta)).fetchone()[0] or 0)
        open_shifts = c.execute("SELECT COUNT(*) FROM shifts WHERE deleted=0 AND status='open'").fetchone()[0]
        n_groups = c.execute('SELECT COUNT(*) FROM class_groups WHERE deleted=0 AND (active IS NULL OR active=1)' + tf, ta).fetchone()[0]
        trend = [dict(zip(('date', 'visits'), r)) for r in c.execute(
            "SELECT date, COUNT(*) FROM attendance WHERE deleted=0 AND status IN ('present','late') AND date>=? AND date<=?" + tf + ' GROUP BY date ORDER BY date',
            ((d - timedelta(days=27)).isoformat(), day, *ta))]
        mtrend = [dict(zip(('date', 'amount'), r)) for r in c.execute(
            "SELECT date, SUM(amount) FROM payments WHERE deleted=0 AND kind<>'wallet_topup' AND date>=? AND date<=?" + tf + ' GROUP BY date ORDER BY date',
            ((d - timedelta(days=27)).isoformat(), day, *ta))]
    if allowed is None:
        n_students = len(store.rows('students', 'active=1 OR active IS NULL'))
    else:
        n_students = len(visible)
    ens = store.rows('enrollments', "(status IS NULL OR status='active') AND (to_date IS NULL OR to_date='' OR to_date>=?)", (day,), scopes)
    bals = balances(store, ens, d)
    owed = round(sum(-b['balance'] for b in bals.values() if b['balance'] < 0), 2)
    debtors = len({e['studentId'] for e in ens if (bals.get(e['id']) or {}).get('balance', 0) < 0})
    return {'date': day, 'sessions': sess, 'checkedIn': checked, 'todayMoney': today_money, 'todayTotal': round(sum(today_money.values()), 2),
            'monthMoney': round(month_money, 2), 'monthExpenses': round(month_exp, 2), 'openShifts': open_shifts, 'groups': n_groups,
            'students': n_students, 'owed': owed, 'debtors': debtors, 'trend': trend, 'moneyTrend': mtrend,
            'risk': len(risk_list(store, scopes, limit=2000))}


@cached_read
def student_balances(store, scopes=None, d=None):
    """The money position of every active enrolment the caller may see, summed per student, for the students list and
    the debts list. Computed from attendance and receipts on every data version (never a stored running balance)."""
    d = d or _today()
    day = d.isoformat()
    ens = store.rows('enrollments', "(status IS NULL OR status='active') AND (to_date IS NULL OR to_date='' OR to_date>=?)", (day,), scopes)
    bals = balances(store, ens, d)
    per, oldest = {}, {}
    for e in ens:
        b = bals.get(e['id'])
        if not b:
            continue
        per[e['studentId']] = round(per.get(e['studentId'], 0) + b['balance'], 2)
    with store.lock:   # the last payment date tells how long a debt has been waiting
        for sid, last in store.conn.execute("SELECT student_id, MAX(date) FROM payments WHERE deleted=0 AND kind='fee' GROUP BY student_id"):
            oldest[sid] = last
    return {'students': per, 'lastPaid': {k: v for k, v in oldest.items() if k in per},
            'enrollments': {k: {f: v[f] for f in ('balance', 'feeType', 'unit', 'due') if f in v} | ({'sessionsLeft': v['sessionsLeft']} if 'sessionsLeft' in v else {})
                            for k, v in bals.items()}}


ADVICE_ORDER = {'bad': 0, 'warn': 1, 'info': 2, 'ok': 3}


def advice(store, scopes=None, perms=(), d=None, now=None, user_id=None, node_id=None):
    """The advisor on the overview: the few things that need a person today, most urgent first, each with the page
    that fixes it. Only advice the user may act on or see is returned (money advice needs a money permission), and
    a teacher-scoped user only hears about his own groups. Pure reads: a GET must never change anything."""
    can = set(perms or ()).intersection
    d = d or _today()
    now = now or datetime.now()
    day = d.isoformat()
    out = []

    def add(id_, level, page, icon, **vars_):
        out.append({'id': id_, 'level': level, 'page': page, 'icon': icon, 'vars': vars_})

    groups = [g for g in store.rows('groups', 'active=1 OR active IS NULL', (), scopes)]
    # 1. setting up an empty centre, in the order the work is done
    if scopes is None:
        if can({'rooms.manage', 'settings.edit'}) and not store.rows('rooms'):
            add('setupRooms', 'info', 'settings?tab=lists', 'home')
        if can({'teachers.manage'}) and not store.rows('teachers'):
            add('setupTeachers', 'info', 'settings?tab=lists', 'users')
    if can({'groups.manage'}) and not groups:
        add('setupGroups', 'info', 'groups', 'layers')
    if can({'students.manage'}) and groups and not store.rows('students', '', (), scopes):
        add('setupStudents', 'info', 'students/import', 'upload')
    # 2. timetable clashes block real people in the same room
    if can({'groups.view'}) and groups:
        rooms = {r['id']: r for r in store.rows('rooms')}
        mine = {g['id'] for g in groups}
        cl = [c for c in D.clashes(store.rows('groups'), rooms) if c['kind'] in ('room', 'teacher') and (c['a'] in mine or c['b'] in mine)]
        if cl:
            add('clashes', 'bad', 'groups?tab=timetable', 'alert', n=len(cl))
    # 3. the drawer: shifts left open on an earlier day, and today's work without an open shift
    if can({'shifts.manage'}):
        stale = [s for s in store.rows('shifts', "status='open'") if (s.get('openedAt') or '')[:10] < day]
        if stale:
            add('staleShifts', 'bad', 'money?tab=shifts', 'lock', n=len(stale))
    sess = sessions_on(store, d, scopes) if groups else []
    # every desk user counts his own drawer on his own PC, so the advice is about the caller's shift
    if can({'money.collect'}) and sess and user_id and not my_shift(store, user_id, node_id):
        add('openShift', 'warn', 'money', 'sheet')
    # 4. sessions that started more than the late limit ago and nobody was checked in: the roll call was forgotten
    if can({'attendance.mark', 'door.use'}):
        cfg = settings(store)
        hm = now.strftime('%H:%M')
        if d == now.date():
            limit = (now - timedelta(minutes=int(cfg.get('lateMinutes') or 15))).strftime('%H:%M')
            empty = [s for s in sess if s.get('status') != 'cancelled' and (s.get('start') or '99') <= limit and hm <= (s.get('end') or '')
                     and not s.get('present') and s.get('enrolled')]
            if empty:
                add('noRollCall', 'warn', 'door', 'clock', n=len(empty))
    # 5. students about to leave
    if can({'followup.view'}):
        risky = risk_list(store, scopes, limit=2000)
        high = len({r['studentId'] for r in risky if r['level'] == 'high' and not r['followed']})
        if high:
            add('riskHigh', 'bad', 'followup', 'bell', n=high)
        elif risky:
            add('riskCall', 'warn', 'followup', 'bell', n=len({r['studentId'] for r in risky if not r['followed']}))
    # 6. money owed by students (computed from attendance and receipts, never stored)
    if can({'money.view', 'reports.view'}):
        ens = store.rows('enrollments', "(status IS NULL OR status='active') AND (to_date IS NULL OR to_date='' OR to_date>=?)", (day,), scopes)
        bals = balances(store, ens, d)
        debt = {}
        for e in ens:
            b = (bals.get(e['id']) or {}).get('balance', 0)
            if b < 0:
                debt[e['studentId']] = debt.get(e['studentId'], 0) - b
        if debt:
            add('debts', 'warn', 'followup?tab=debts', 'sheet', n=len(debt), amount=round(sum(debt.values()), 2))
    # 7. groups: full ones should open a twin, nearly empty ones should merge (only a few weeks after they started)
    if can({'groups.view'}) and groups:
        counts = _enrolled_counts(store, day)
        full = [g for g in groups if g.get('capacity') and counts.get(g['id'], 0) >= int(g['capacity'])]
        thin = [g for g in groups if g.get('capacity') and counts.get(g['id'], 0) < 0.4 * int(g['capacity'])
                and (g.get('startDate') or '0000') <= (d - timedelta(days=21)).isoformat()]
        if full:
            add('groupsFull', 'info', 'groups', 'layers', n=len(full), name=full[0].get('name') or '')
        if thin:
            add('groupsThin', 'warn', 'groups', 'layers', n=len(thin), name=thin[0].get('name') or '')
    # 8. handouts running out
    if can({'materials.manage', 'money.collect'}):
        low = [m for m in store.rows('materials', 'active=1 OR active IS NULL', (), scopes) if int(m.get('stock') or 0) <= 5]
        if low:
            add('stockLow', 'warn', 'money?tab=handouts', 'doc', n=len(low), name=low[0].get('name') or '')
    # 9. last month's settlements still not approved after the 5th
    if can({'settlements.manage'}) and d.day > 5:
        prev = (d.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
        teachers = store.rows('teachers', 'active=1 OR active IS NULL', (), scopes)
        done = {s['teacherId'] for s in store.rows('settlements', "period=? AND status='approved'", (prev,), scopes)}
        missing = [t for t in teachers if t['id'] not in done]
        if teachers and missing:
            add('settle', 'info', 'settlements?ym=' + prev, 'chart', n=len(missing), ym=prev)
    # 10. parents nobody can reach
    if can({'contacts.view'}) and can({'students.manage'}):
        n = len(store.rows('students', "(active=1 OR active IS NULL) AND (parent_mobile IS NULL OR parent_mobile='')", (), scopes))
        if n:
            add('noParentMobile', 'info', 'students?missing=parent', 'user', n=n)
    if not out:
        add('allGood', 'ok', 'door' if can({'door.use'}) else 'overview', 'check')
    out.sort(key=lambda a: ADVICE_ORDER[a['level']])
    return out


def reports(store, ym, scopes=None):
    """The month in numbers for the Reports page."""
    if not D.valid_month(ym):
        raise Problem('err.month', 'Choose the month.')
    first, last = D.month_bounds(ym)
    a, b = first.isoformat(), last.isoformat()
    allowed, _ = store._visible(scopes)
    tf = '' if allowed is None else ' AND teacher_id IN (' + ','.join('?' * len(allowed)) + ')'
    ta = tuple(allowed or ())
    with store.lock:
        c = store.conn
        by_teacher = {r[0] or '': float(r[1] or 0) for r in c.execute(
            "SELECT teacher_id, SUM(amount) FROM payments WHERE deleted=0 AND kind IN ('fee','material') AND date>=? AND date<=?" + tf + ' GROUP BY teacher_id', (a, b, *ta))}
        by_method = {r[0] or 'cash': float(r[1] or 0) for r in c.execute(
            "SELECT method, SUM(amount) FROM payments WHERE deleted=0 AND date>=? AND date<=?" + tf + ' GROUP BY method', (a, b, *ta))}
        by_kind = {r[0]: float(r[1] or 0) for r in c.execute(
            "SELECT kind, SUM(amount) FROM payments WHERE deleted=0 AND date>=? AND date<=?" + tf + ' GROUP BY kind', (a, b, *ta))}
        exp = {r[0]: float(r[1] or 0) for r in c.execute(
            "SELECT category, SUM(amount) FROM expenses WHERE deleted=0 AND date>=? AND date<=?" + tf + ' GROUP BY category', (a, b, *ta))}
        days = [dict(zip(('date', 'visits', 'students'), r)) for r in c.execute(
            "SELECT date, COUNT(*), COUNT(DISTINCT student_id) FROM attendance WHERE deleted=0 AND status IN ('present','late') AND date>=? AND date<=?" + tf +
            ' GROUP BY date ORDER BY date', (a, b, *ta))]
        money_days = [dict(zip(('date', 'amount'), r)) for r in c.execute(
            "SELECT date, SUM(amount) FROM payments WHERE deleted=0 AND kind<>'wallet_topup' AND date>=? AND date<=?" + tf + ' GROUP BY date ORDER BY date', (a, b, *ta))]
        diffs = [dict(r) for r in c.execute("SELECT no, user_name, closed_at, expected_cash, counted_cash, diff, diff_reason FROM shifts "
                                            "WHERE deleted=0 AND status='closed' AND diff<>0 AND substr(closed_at,1,10)>=? AND substr(closed_at,1,10)<=? ORDER BY closed_at",
                                            (a, b))] if allowed is None else []
        voids = c.execute("SELECT COUNT(*), SUM(amount) FROM payments WHERE deleted=0 AND void_of<>'' AND void_of IS NOT NULL AND date>=? AND date<=?" + tf,
                          (a, b, *ta)).fetchone()
        new_students = c.execute("SELECT COUNT(*) FROM enrollments WHERE deleted=0 AND from_date>=? AND from_date<=?" + tf, (a, b, *ta)).fetchone()[0]
        left = c.execute("SELECT COUNT(*) FROM enrollments WHERE deleted=0 AND status IN ('left') AND to_date>=? AND to_date<=?" + tf, (a, b, *ta)).fetchone()[0]
    income = round(sum(v for k, v in by_kind.items() if k != 'wallet_topup'), 2)
    expenses = round(sum(v for k, v in exp.items() if k not in ('teacher_payout', 'handover')), 2)
    return {'period': ym, 'byTeacher': by_teacher, 'byMethod': by_method, 'byKind': by_kind, 'expenses': exp, 'days': days, 'moneyDays': money_days,
            'income': income, 'expenseTotal': expenses, 'payouts': round(exp.get('teacher_payout', 0), 2), 'shiftDiffs': diffs,
            'voids': {'count': voids[0] or 0, 'amount': round(-(voids[1] or 0), 2)}, 'newEnrolments': new_students, 'left': left,
            'profitability': profitability(store, ym, scopes)}


# ---------------------------------------------------------------- import students from Excel / CSV
HEADERS = {
    'name': ('الاسم', 'اسم الطالب', 'الطالب', 'name', 'student', 'student name', 'full name'),
    'code': ('الكود', 'كود', 'رقم الطالب', 'code', 'id', 'student code', 'no', 'رقم'),
    'grade': ('الصف', 'السنة', 'الصف الدراسي', 'grade', 'class', 'year'),
    'mobile': ('موبايل الطالب', 'رقم الطالب الموبايل', 'تليفون الطالب', 'student mobile', 'mobile', 'phone', 'الموبايل', 'التليفون'),
    'parentMobile': ('موبايل ولي الامر', 'رقم ولي الامر', 'تليفون ولي الامر', 'ولي الامر موبايل', 'parent mobile', 'parent phone', 'guardian phone', 'رقم الاب', 'رقم الام'),
    'parentName': ('ولي الامر', 'اسم ولي الامر', 'parent', 'guardian', 'parent name'),
    'school': ('المدرسه', 'المدرسة', 'school'),
    'group': ('المجموعه', 'المجموعة', 'group', 'الميعاد', 'المعاد'),
    'notes': ('ملاحظات', 'notes', 'note'),
}
GRADE_WORDS = [
    (('اولي ابتدائي', 'الاول الابتدائي', 'first primary', 'grade 1', '1 ابتدائي'), 'P1'), (('تانيه ابتدائي', 'ثانيه ابتدائي', 'الثاني الابتدائي', 'second primary', '2 ابتدائي'), 'P2'),
    (('تالته ابتدائي', 'ثالثه ابتدائي', 'الثالث الابتدائي', 'third primary', '3 ابتدائي'), 'P3'), (('رابعه ابتدائي', 'الرابع الابتدائي', 'fourth primary', '4 ابتدائي'), 'P4'),
    (('خامسه ابتدائي', 'الخامس الابتدائي', 'fifth primary', '5 ابتدائي'), 'P5'), (('سادسه ابتدائي', 'السادس الابتدائي', 'sixth primary', '6 ابتدائي'), 'P6'),
    (('اولي اعدادي', 'الاول الاعدادي', 'first prep', '1 اعدادي'), 'M1'), (('تانيه اعدادي', 'ثانيه اعدادي', 'الثاني الاعدادي', 'second prep', '2 اعدادي'), 'M2'),
    (('تالته اعدادي', 'ثالثه اعدادي', 'الثالث الاعدادي', 'third prep', '3 اعدادي'), 'M3'),
    (('اولي ثانوي', 'الاول الثانوي', 'first secondary', '1 ثانوي'), 'S1'), (('تانيه ثانوي', 'ثانيه ثانوي', 'الثاني الثانوي', 'second secondary', '2 ثانوي'), 'S2'),
    (('تالته ثانوي', 'ثالثه ثانوي', 'الثالث الثانوي', 'third secondary', '3 ثانوي'), 'S3'),
]


def guess_grade(text, default=''):
    k = D.key_text(text)
    if not k:
        return default
    up = str(text).strip().upper()
    if D.valid_grade(up):
        return up
    for words, code in GRADE_WORDS:
        if any(D.key_text(w) in k for w in words):
            return code
    return default


def _header_map(values):
    out = {}
    keys = {f: [D.key_text(h) for h in hs] for f, hs in HEADERS.items()}
    for i, v in enumerate(values):
        k = D.key_text(v)
        if not k:
            continue
        for f, hs in keys.items():
            if f not in out and (k in hs or any(h and h == k for h in hs)):
                out[f] = i
                break
    if 'name' not in out:   # looser: a header that contains the word
        for i, v in enumerate(values):
            k = D.key_text(v)
            if k and ('اسم' in k or 'name' in k) and i not in out.values():
                out['name'] = i
                break
    return out


def import_preview(store, data, filename, default_grade='', default_group='', scopes=None):
    """Reads any spreadsheet (xlsx, xls, csv, ods...) and returns the rows it understood, matched against existing
    students (same name + same parent mobile = the same student) and the groups by name. Nothing is saved here."""
    import formats
    try:
        wb = formats.read_workbook(data, filename)
    except formats.FormatError as e:
        raise Problem('err.file', str(e))
    existing = {}
    for s in store.rows('students', scopes=scopes):
        existing.setdefault(s.get('nameKey'), []).append(s)
    groups = {D.key_text(g['name']): g for g in store.rows('groups', scopes=scopes)}
    rows = []
    for sh in wb.sheets:
        if sh.hidden:
            continue
        hdr_row, hmap = None, {}
        for r, vals in sh.rows(1, min(sh.max_row, 15)):
            m = _header_map(vals)
            if 'name' in m and len(m) >= 2:
                hdr_row, hmap = r, m
                break
        if hdr_row is None:
            continue
        for r, vals in sh.rows(hdr_row + 1):
            def cell(f):
                i = hmap.get(f)
                v = vals[i] if i is not None and i < len(vals) else None
                if isinstance(v, float) and v.is_integer():
                    v = int(v)
                return D.norm_text('' if v is None else v)
            name = cell('name')
            if not name or len(name) < 2:
                continue
            pm, ok_pm = D.norm_mobile_eg(cell('parentMobile')) if cell('parentMobile') else ('', True)
            sm, ok_sm = D.norm_mobile_eg(cell('mobile')) if cell('mobile') else ('', True)
            grade = guess_grade(cell('grade'), default_grade)
            item = {'sheet': sh.name, 'row': r, 'name': name, 'code': D.digits(cell('code')), 'gradeCode': grade, 'mobile': sm, 'parentMobile': pm,
                    'parentName': cell('parentName'), 'school': cell('school'), 'notes': cell('notes'), 'groupText': cell('group') or default_group,
                    'warnings': []}
            if not ok_pm:
                item['warnings'].append('imp.badMobile')
            if not grade:
                item['warnings'].append('imp.noGrade')
            same = [s for s in existing.get(D.key_text(name), []) if s.get('parentMobile', '') == pm]
            item['match'] = same[0]['id'] if same else ''
            g = groups.get(D.key_text(item['groupText'])) if item['groupText'] else None
            item['groupId'] = g['id'] if g else ''
            if item['groupText'] and not g:
                item['warnings'].append('imp.noGroup')
            rows.append(item)
    if not rows:
        raise Problem('err.noRows', 'No student names were found. The first rows must contain a column titled "Name" or "الاسم".')
    return {'filename': filename, 'rows': rows[:5000], 'new': sum(1 for r in rows if not r['match']), 'existing': sum(1 for r in rows if r['match'])}


@atomic_operation
def import_commit(ctx, rows, enrol=True):
    """Creates the new students (and their enrolments when a group was recognised) in ONE save."""
    ctx.need('students.manage')
    ctx.need('contacts.view')
    if not isinstance(rows, list) or not rows:
        raise Problem('err.noRows', 'Nothing to import.')
    ops = []
    pci = ctx.pc_index()
    with ctx.store.lock:
        codes = [r[0] for r in ctx.store.conn.execute('SELECT code FROM students')]
    today = date.today().isoformat()
    n = 0
    visible = {s['id']: s for s in ctx.store.rows('students', scopes=ctx.scopes)}
    identities = {(s.get('nameKey') or D.key_text(s['name']), s.get('parentMobile') or ''): s['id'] for s in visible.values()}
    enrolled = {(e['studentId'], e['groupId']) for e in ctx.store.rows('enrollments')
                if e.get('status') == 'active' and e.get('from', '') <= today and (not e.get('to') or e['to'] >= today)}
    for it in rows[:5000]:
        if not isinstance(it, dict) or not D.norm_text(it.get('name')):
            continue
        name = D.norm_text(it['name'])
        pm, valid_pm = D.norm_mobile_eg(it.get('parentMobile') or '')
        sm, valid_sm = D.norm_mobile_eg(it.get('mobile') or '')
        if (it.get('parentMobile') and not valid_pm) or (it.get('mobile') and not valid_sm):
            raise Problem('err.mobile', 'Check the mobile number.')
        grade = it.get('gradeCode')
        if not D.valid_grade(grade):
            raise Problem('err.grade', 'Choose a valid grade.')
        g = ctx.store.row('groups', it.get('groupId')) if enrol and it.get('groupId') else None
        if enrol and it.get('groupId') and not g:
            raise Problem('err.group', 'Choose an existing group.')
        if g:
            ctx.need_teacher(g.get('teacherId'))
            if g.get('gradeCode') != grade:
                raise Problem('err.grade', 'The student and group grades must match.')
        sid = it.get('match') or ''
        if sid and sid not in visible:
            raise Problem('err.scope', 'This student is not in your groups.')
        identity = (D.key_text(name), pm)
        if sid and identity != (visible[sid].get('nameKey') or D.key_text(visible[sid]['name']), visible[sid].get('parentMobile') or ''):
            raise Problem('err.importMatch', 'The matched student changed. Preview the file again.')
        sid = sid or identities.get(identity, '')
        if sid in visible and g and visible[sid].get('gradeCode') != g.get('gradeCode'):
            raise Problem('err.grade', 'The student and group grades must match.')
        if ctx.scopes is not None and not sid and not g:
            raise Problem('err.scope', 'Choose a group belonging to one of your teachers.')
        if not sid:
            sid = new_id('st')
            code = D.digits(it.get('code'))
            if not code or code in codes:
                code = D.next_code(codes, pci)
            codes.append(code)
            system = g.get('system') if g else ('thanaweya' if grade[0] == 'S' else 'general')
            system = system or ('thanaweya' if grade[0] == 'S' else 'general')
            ops.append({'e': 'students', 'id': sid, 'op': 'put', 'row': {
                'code': code, 'name': name, 'gradeCode': grade, 'system': system, 'track': g.get('track') if g else '', 'mobile': sm,
                'parentMobile': pm, 'parentName': it.get('parentName') or '', 'school': it.get('school') or '',
                'notes': it.get('notes') or '', 'joinedAt': today, 'active': True, 'consent': bool(it.get('consent')),
                'consentAt': today if it.get('consent') else ''}})
            identities[identity] = sid
            n += 1
        if g:
            if (sid, g['id']) not in enrolled:
                cap = int(g.get('capacity') or 0)
                if g.get('kind') == 'school':
                    cap = min(cap or 10**6, int(settings(ctx.store)['schoolMaxStudents']))
                count = sum(group_id == g['id'] for _, group_id in enrolled)
                if cap and count >= cap:
                    raise Problem('err.groupFull', 'The group is full.', n=count, cap=cap)
                ops.append({'e': 'enrollments', 'id': new_id('en'), 'op': 'put', 'row': {
                    'studentId': sid, 'groupId': g['id'], 'teacherId': g.get('teacherId'), 'from': today, 'status': 'active'}})
                enrolled.add((sid, g['id']))
    if not ops:
        return {'students': 0, 'changes': 0}
    normalize_ops(ctx.store, ops, pci)
    res = ctx.commit(f'Import students ({n})', ops)
    return {'students': n, 'changes': res['changes']}


def entity_names():
    return list(ENTITIES)
