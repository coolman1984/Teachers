"""SQLite storage for Hessa (the tutoring-centre system).

Design rules (data must never be lost):
  * Every change arrives as one "commit" and is applied in ONE transaction -
    either all of it is saved or none of it.
  * Rows are never physically deleted. A delete only marks the row
    (deleted=1 + who/when/which transaction) so it can be restored.
  * Every row carries a version number. A change based on an old version is
    rejected (someone else changed it first) instead of silently overwriting.
  * Every change becomes one signed changeset in the change journal
    (journal.py, data/journal.db) and is appended to a monthly JSON-lines file in
    data/logs. Both are never touched by a restore.
  * The rows are a deterministic fold of the journal (replica.py), so every PC that
    has received the same changes shows exactly the same data.
"""
import hashlib
import json
import os

import sqlite3
import threading
from datetime import datetime, timedelta

import replica
from journal import canonical

T, I, R, B, J = 'text', 'int', 'real', 'bool', 'json'

# entity -> (table, sheet title, [(js key, column, kind, Excel header)])
ENTITIES = {
    'settings': ('settings', 'Settings', [('value', 'value', J, 'Value')]),
    'subjects': ('subjects', 'Subjects', [
        ('name', 'name', T, 'Subject'), ('nameEn', 'name_en', T, 'Subject (English)'), ('color', 'color', T, 'Colour'),
        ('order', 'sort_order', I, 'Order'), ('active', 'active', B, 'Active')]),
    'rooms': ('rooms', 'Rooms', [
        ('name', 'name', T, 'Room'), ('capacity', 'capacity', I, 'Capacity'), ('costPerHour', 'cost_per_hour', R, 'Cost per Hour'),
        ('active', 'active', B, 'Active'), ('notes', 'notes', T, 'Notes')]),
    'teachers': ('teachers', 'Teachers', [
        ('name', 'name', T, 'Teacher'), ('nameKey', 'name_key', T, 'Name Key'), ('mobile', 'mobile', T, 'Mobile'),
        ('subjectIds', 'subject_ids', J, 'Subjects'), ('gradeCodes', 'grade_codes', J, 'Grades'),
        ('settleModel', 'settle_model', T, 'Settlement Model'), ('rentMonth', 'rent_month', R, 'Center Rent per Month'),
        ('rentSession', 'rent_session', R, 'Center Rent per Session'), ('rentStudent', 'rent_student', R, 'Center Rent per Student Visit'),
        ('centerPct', 'center_pct', R, 'Center Share %'), ('color', 'color', T, 'Colour'), ('bio', 'bio', T, 'About'),
        ('slug', 'slug', T, 'Page Name'), ('active', 'active', B, 'Active'), ('notes', 'notes', T, 'Notes')]),
    'students': ('students', 'Students', [
        ('code', 'code', T, 'Code'), ('name', 'name', T, 'Student'), ('nameKey', 'name_key', T, 'Name Key'),
        ('gradeCode', 'grade_code', T, 'Grade'), ('system', 'system', T, 'System'), ('track', 'track', T, 'Track'),
        ('school', 'school', T, 'School'), ('gender', 'gender', T, 'Gender'), ('mobile', 'mobile', T, 'Student Mobile'),
        ('parentName', 'parent_name', T, 'Parent'), ('parentMobile', 'parent_mobile', T, 'Parent Mobile'),
        ('parentMobile2', 'parent_mobile2', T, 'Second Mobile'), ('familyKey', 'family_key', T, 'Family'),
        ('discountPct', 'discount_pct', R, 'Discount %'), ('discountReason', 'discount_reason', T, 'Discount Reason'),
        ('exempt', 'exempt', B, 'Exempt'), ('consent', 'consent', B, 'Parent Consent'), ('consentAt', 'consent_at', T, 'Consent Date'),
        ('joinedAt', 'joined_at', T, 'Joined'), ('active', 'active', B, 'Active'), ('notes', 'notes', T, 'Notes'),
        ('portalHash', 'portal_hash', T, 'Portal Link Hash'), ('portalNonce', 'portal_nonce', T, 'Portal Link Nonce'),
        ('importKey', 'import_key', T, 'Import Key')]),
    'groups': ('class_groups', 'Groups', [
        ('name', 'name', T, 'Group'), ('teacherId', 'teacher_id', T, 'Teacher'), ('subjectId', 'subject_id', T, 'Subject'),
        ('gradeCode', 'grade_code', T, 'Grade'), ('system', 'system', T, 'System'), ('track', 'track', T, 'Track'),
        ('roomId', 'room_id', T, 'Room'), ('slots', 'slots', J, 'Weekly Times'), ('capacity', 'capacity', I, 'Capacity'),
        ('feeType', 'fee_type', T, 'Fee Type'), ('fee', 'fee', R, 'Fee'), ('packageSessions', 'package_sessions', I, 'Sessions per Package'),
        ('feeHistory', 'fee_history', J, 'Earlier Prices'), ('tempSlots', 'temp_slots', J, 'Temporary Times'),
        ('startDate', 'start_date', T, 'Start'), ('endDate', 'end_date', T, 'End'), ('kind', 'kind', T, 'Kind'),
        ('color', 'color', T, 'Colour'), ('active', 'active', B, 'Active'), ('notes', 'notes', T, 'Notes')]),
    'enrollments': ('enrollments', 'Enrollments', [
        ('studentId', 'student_id', T, 'Student'), ('groupId', 'group_id', T, 'Group'), ('teacherId', 'teacher_id', T, 'Teacher'),
        ('from', 'from_date', T, 'From'), ('to', 'to_date', T, 'To'), ('status', 'status', T, 'Status'), ('fee', 'fee', R, 'Special Fee'),
        ('note', 'note', T, 'Note'), ('billFrom', 'bill_from', T, 'Billing From')]),
    'sessions': ('sessions', 'Sessions', [
        ('groupId', 'group_id', T, 'Group'), ('teacherId', 'teacher_id', T, 'Teacher'), ('date', 'date', T, 'Date'),
        ('start', 'start_time', T, 'Start'), ('end', 'end_time', T, 'End'), ('roomId', 'room_id', T, 'Room'),
        ('status', 'status', T, 'Status'), ('kind', 'kind', T, 'Kind'), ('topic', 'topic', T, 'Topic'), ('note', 'note', T, 'Note')]),
    'attendance': ('attendance', 'Attendance', [
        ('sessionId', 'session_id', T, 'Session'), ('studentId', 'student_id', T, 'Student'), ('groupId', 'group_id', T, 'Group'),
        ('teacherId', 'teacher_id', T, 'Teacher'), ('date', 'date', T, 'Date'), ('status', 'status', T, 'Status'),
        ('at', 'at', T, 'Time'), ('via', 'via', T, 'Recorded By'), ('makeup', 'makeup', B, 'Make-up'), ('by', 'by_user', T, 'User'),
        ('trial', 'trial', B, 'Free Trial')]),
    'payments': ('payments', 'Payments', [
        ('no', 'no', T, 'Receipt No'), ('date', 'date', T, 'Date'), ('at', 'at', T, 'Time'), ('studentId', 'student_id', T, 'Student'),
        ('teacherId', 'teacher_id', T, 'Teacher'), ('groupId', 'group_id', T, 'Group'), ('kind', 'kind', T, 'Kind'),
        ('period', 'period', T, 'Month'), ('sessions', 'sessions', I, 'Sessions'), ('materialId', 'material_id', T, 'Handout'),
        ('qty', 'qty', I, 'Quantity'), ('amount', 'amount', R, 'Amount'), ('method', 'method', T, 'Method'), ('ref', 'ref', T, 'Reference'),
        ('shiftId', 'shift_id', T, 'Cash Shift'), ('voidOf', 'void_of', T, 'Reverses'), ('note', 'note', T, 'Note'), ('by', 'by_user', T, 'User'),
        ('batch', 'batch', T, 'Paid Together')]),
    'shifts': ('shifts', 'Cash Shifts', [
        ('no', 'no', T, 'Shift No'), ('user', 'user_name', T, 'User'), ('userId', 'user_id', T, 'User ID'), ('node', 'node', T, 'PC'),
        ('openedAt', 'opened_at', T, 'Opened'), ('openingCash', 'opening_cash', R, 'Opening Cash'), ('closedAt', 'closed_at', T, 'Closed'),
        ('expectedCash', 'expected_cash', R, 'Expected Cash'), ('countedCash', 'counted_cash', R, 'Counted Cash'), ('diff', 'diff', R, 'Difference'),
        ('diffReason', 'diff_reason', T, 'Reason'), ('status', 'status', T, 'Status')]),
    'expenses': ('expenses', 'Expenses', [
        ('no', 'no', T, 'Voucher No'), ('date', 'date', T, 'Date'), ('at', 'at', T, 'Time'), ('amount', 'amount', R, 'Amount'),
        ('category', 'category', T, 'Category'), ('teacherId', 'teacher_id', T, 'Teacher'), ('groupId', 'group_id', T, 'Group'),
        ('method', 'method', T, 'Method'), ('shiftId', 'shift_id', T, 'Cash Shift'), ('voidOf', 'void_of', T, 'Reverses'),
        ('note', 'note', T, 'Note'), ('by', 'by_user', T, 'User')]),
    'materials': ('materials', 'Handouts', [
        ('name', 'name', T, 'Handout'), ('teacherId', 'teacher_id', T, 'Teacher'), ('gradeCode', 'grade_code', T, 'Grade'),
        ('price', 'price', R, 'Price'), ('cost', 'cost', R, 'Printing Cost'), ('stock', 'stock', I, 'In Stock'), ('active', 'active', B, 'Active')]),
    'exams': ('exams', 'Exams', [
        ('title', 'title', T, 'Exam'), ('teacherId', 'teacher_id', T, 'Teacher'), ('groupIds', 'group_ids', J, 'Groups'),
        ('date', 'date', T, 'Date'), ('kind', 'kind', T, 'Kind'), ('maxScore', 'max_score', R, 'Full Mark'), ('questions', 'questions', I, 'Questions'),
        ('choices', 'choices', I, 'Choices'), ('answerKey', 'answer_key', J, 'Answer Key'), ('published', 'published', B, 'Shown to Parents'),
        ('paper', 'paper', J, 'Questions on the Paper')]),
    'questions': ('questions', 'Question Bank', [
        ('teacherId', 'teacher_id', T, 'Teacher'), ('subjectId', 'subject_id', T, 'Subject'), ('gradeCode', 'grade_code', T, 'Grade'),
        ('topic', 'topic', T, 'Lesson'), ('text', 'text', T, 'Question'), ('choices', 'choices', J, 'Choices'), ('answer', 'answer', T, 'Answer'),
        ('explanation', 'explanation', T, 'Explanation'), ('source', 'source', T, 'Source'), ('active', 'active', B, 'Active')]),
    'marks': ('marks', 'Marks', [
        ('examId', 'exam_id', T, 'Exam'), ('studentId', 'student_id', T, 'Student'), ('teacherId', 'teacher_id', T, 'Teacher'),
        ('score', 'score', R, 'Score'), ('absent', 'absent', B, 'Absent'), ('via', 'via', T, 'Entered By'), ('answers', 'answers', J, 'Answers'),
        ('note', 'note', T, 'Note')]),
    'followups': ('followups', 'Follow-ups', [
        ('studentId', 'student_id', T, 'Student'), ('teacherId', 'teacher_id', T, 'Teacher'), ('date', 'date', T, 'Date'),
        ('type', 'type', T, 'Type'), ('reason', 'reason', T, 'Reason'), ('outcome', 'outcome', T, 'Outcome'), ('by', 'by_user', T, 'User')]),
    'settlements': ('settlements', 'Teacher Settlements', [
        ('teacherId', 'teacher_id', T, 'Teacher'), ('period', 'period', T, 'Month'), ('revenue', 'revenue', R, 'Collected'),
        ('centerShare', 'center_share', R, 'Center Share'), ('teacherShare', 'teacher_share', R, 'Teacher Share'),
        ('deductions', 'deductions', R, 'Deductions'), ('paid', 'paid', R, 'Paid to Teacher'), ('status', 'status', T, 'Status'),
        ('detail', 'detail', J, 'Detail'), ('by', 'by_user', T, 'User'), ('at', 'at', T, 'Time')]),
}
# rows that belong to one teacher (the scope used to limit a user to some teachers)
TEACHER_SCOPED = {'groups', 'enrollments', 'sessions', 'attendance', 'payments', 'expenses', 'materials', 'exams', 'marks', 'followups',
                  'settlements', 'questions'}
# money records are never changed or deleted: a mistake is corrected by a new reversing record (voidOf)
LEDGERS = {'payments', 'expenses'}
# rows the browser gets only for the recent past (the rest is read through the reports and the student file)
WINDOWED = {'attendance': 'date', 'sessions': 'date', 'payments': 'date', 'expenses': 'date', 'followups': 'date'}
WINDOW_DAYS = 75

# Merge rules for changes made at the same time on two PCs (see DISTRIBUTED_SYNC_ARCHITECTURE.md, conflict matrix).
COUNTERS = {'materials': {'stock'}}  # handouts sold on two PCs at the same time: both sales count
PHONE_FIELDS = {'mobile', 'parentMobile', 'parentMobile2'}      # only for people with "contacts.view", also inside the history
LOG_HIDDEN = {'portalHash', 'portalNonce'}                      # parent-link secrets are never shown to anybody


def mask_audit_row(r, hide):
    """The history keeps the real values (nothing is ever lost); what a screen shows is cut down to what that user may see."""
    for k in ('changes', 'before', 'after'):
        raw = r.get(k)
        if not raw:
            continue
        try:
            d = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(d, dict) or not (set(d) & hide):
            continue
        for f in set(d) & hide:
            d[f] = ['•••', '•••'] if k == 'changes' else '•••'
        r[k] = canonical(d)

RESOLVERS = {
    'shifts': {'status': 'rank:open,closed'},
    'sessions': {'status': 'rank:planned,cancelled,held', 'note': 'follow:status'},  # if students attended, the session was held
    # a derived or paired field always travels with the field it belongs to: two PCs renaming the same student at the same time
    # must not leave the search key of one name beside the name of the other, and the owner is asked about the name only
    'students': {'nameKey': 'follow:name', 'consentAt': 'follow:consent', 'portalHash': 'follow:portalNonce'},
    'teachers': {'nameKey': 'follow:name'},
    'groups': {'feeHistory': 'follow:fee'},
}
SPECS = {e: {'table': t, 'fields': [(js, col, kind) for js, col, kind, _ in f], 'counters': COUNTERS.get(e, set()),
             'resolvers': RESOLVERS.get(e, {})} for e, (t, _, f) in ENTITIES.items()}
# manifest of uploaded files (photos, documents, logo): path -> SHA-256 and size, replicated so every PC can
# fetch and verify the files it is missing
FILES = ('attachments', [('sha256', 'sha256', T), ('size', 'size_bytes', I), ('type', 'mime', T)])
SPECS['files'] = {'table': FILES[0], 'fields': FILES[1], 'counters': set(), 'resolvers': {}}
REPLICATED = set(SPECS)


class Conflict(Exception):
    pass


class BadRequest(Exception):
    pass


def now():
    return datetime.now().isoformat(timespec='seconds')


def _coerce(kind, v):
    if v is None or v == '' and kind in (I, R):
        return None
    if kind == I:
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None
    if kind == R:
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    if kind == B:
        return 1 if v else 0
    if kind == J:
        return json.dumps(v, ensure_ascii=False, sort_keys=True)
    return str(v)


def _out(kind, v):
    if v is None:
        return None
    if kind == B:
        return bool(v)
    if kind == J:
        return json.loads(v)
    if kind == R and float(v).is_integer():
        return int(v)
    return v


class Store:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.path = os.path.join(data_dir, 'center.db')
        self.log_dir = os.path.join(data_dir, 'logs')
        os.makedirs(self.log_dir, exist_ok=True)
        self.lock = threading.RLock()
        self.journal = None
        self.folder = None
        self.conn = self._open()
        self._fp = (None, None)
        self._changes = []  # [(data version, {(entity, id)})] - what each recent version changed

    def attach(self, journal):
        """Connects the change journal. From now on every save goes through it."""
        self.journal = journal
        self.folder = replica.BusinessFolder(self.conn, SPECS, journal.deps_of, _coerce)

    # ------------------------------------------------------------ setup
    def _open(self):
        conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=FULL')
        conn.execute('PRAGMA busy_timeout=10000')
        ok = conn.execute('PRAGMA quick_check').fetchone()[0]
        if ok != 'ok':
            raise RuntimeError(f'Database file is damaged ({ok}). Restore the latest file from the backups folder.')
        self._migrate(conn)
        return conn

    def reopen(self):
        with self.lock:
            self.conn.close()
            self.conn = self._open()
            if self.journal:
                self.folder = replica.BusinessFolder(self.conn, SPECS, self.journal.deps_of, _coerce)

    def _migrate(self, conn):
        meta = 'id TEXT PRIMARY KEY, ver INTEGER NOT NULL DEFAULT 1, created_at TEXT, created_by TEXT, updated_at TEXT, updated_by TEXT, ' \
               'deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, deleted_by TEXT, deleted_txn TEXT'
        for table, _, fields in [*ENTITIES.values(), (FILES[0], '', [(a, b, c, '') for a, b, c in FILES[1]])]:
            conn.execute(f'CREATE TABLE IF NOT EXISTS {table} ({meta})')
            have = {r[1] for r in conn.execute(f'PRAGMA table_info({table})')}
            for _, col, kind, _ in fields:
                if col not in have:
                    sql_type = {I: 'INTEGER', R: 'REAL', B: 'INTEGER'}.get(kind, 'TEXT')
                    conn.execute(f'ALTER TABLE {table} ADD COLUMN {col} {sql_type}')
            for _, col, _, _ in fields:
                if col in ('student_id', 'group_id', 'teacher_id', 'session_id', 'exam_id', 'shift_id', 'date', 'code', 'name_key',
                           'import_key', 'portal_hash', 'period', 'no', 'void_of'):
                    conn.execute(f'CREATE INDEX IF NOT EXISTS ix_{table}_{col} ON {table}({col})')
        for table, columns in (('attendance', 'student_id, group_id'), ('payments', 'student_id, group_id'), ('sessions', 'group_id, date')):
            conn.execute(f'CREATE INDEX IF NOT EXISTS ix_{table}_centre ON {table}({columns})')
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, ts TEXT, user TEXT, ip TEXT, label TEXT, changes INTEGER);
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, txn TEXT, user TEXT, ip TEXT, label TEXT,
                entity TEXT, entity_id TEXT, scope_id TEXT, op TEXT, changes TEXT, before TEXT, after TEXT);
            CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts);
            CREATE INDEX IF NOT EXISTS ix_audit_scope ON audit_log(scope_id);
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, user TEXT, ip TEXT, type TEXT, action TEXT,
                target TEXT, page TEXT, detail TEXT);
            CREATE INDEX IF NOT EXISTS ix_activity_ts ON activity_log(ts);
            INSERT OR IGNORE INTO meta VALUES ('data_version', '0');
        ''')
        replica.install(conn)

    # ------------------------------------------------------------ helpers
    def version(self):
        with self.lock:
            return int(self.conn.execute("SELECT value FROM meta WHERE key='data_version'").fetchone()[0])

    @staticmethod
    def _row_js(entity, r):
        _, _, fields = ENTITIES[entity]
        d = {'id': r['id']}
        for js, col, kind, _ in fields:
            v = _out(kind, r[col])
            if v is not None:
                d[js] = v
        d['ver'] = r['ver']
        return d

    def _audit_file(self, entries):
        if not entries:
            return
        path = os.path.join(self.log_dir, f'audit-{datetime.now():%Y-%m}.jsonl')
        with open(path, 'a', encoding='utf-8') as f:
            for e in entries:
                f.write(json.dumps(e, ensure_ascii=False) + '\n')
            f.flush()
            os.fsync(f.fileno())

    def _scope_of(self, entity, row):
        """The scope of a row = the id of the teacher it belongs to (used to limit a person to some teachers)."""
        if entity == 'teachers':
            return row.get('id')
        if entity in TEACHER_SCOPED:
            return row.get('teacherId') or None
        return None

    # ------------------------------------------------------------ read
    def _visible(self, scopes):
        """(allowed teacher ids, student ids those teachers teach) for a limited user; (None, None) = sees everything."""
        if scopes is None:
            return None, None
        allowed = set(scopes)
        marks = ','.join('?' * len(allowed)) or "''"
        with self.lock:      # the shared connection: an unlocked read could get another thread's rows
            students = {r[0] for r in self.conn.execute(
                f'SELECT DISTINCT student_id FROM enrollments WHERE deleted=0 AND teacher_id IN ({marks})', tuple(allowed))}
        return allowed, students

    def _filter(self, entity, rows, allowed, students):
        if allowed is None:
            return rows
        if entity == 'teachers':
            return [r for r in rows if r['id'] in allowed]
        if entity == 'students':
            return [r for r in rows if r['id'] in students]
        if entity in TEACHER_SCOPED:
            # money and follow-ups without a teacher (wallet, rent) are the centre's own business
            return [r for r in rows if r.get('teacherId') in allowed]
        return rows

    def state(self, scopes=None, since_days=WINDOW_DAYS):
        """Everything the page needs, one list per entity. scopes: only rows of these teacher ids (None = all).
        Day-to-day records (attendance, sessions, money) are sent for the last since_days days only (None = all);
        the history of a student or a teacher is read through the reports and the student file."""
        with self.lock:
            rows = {}
            cutoff = (datetime.now() - timedelta(days=since_days)).date().isoformat() if since_days else None
            allowed, students = self._visible(scopes)
            for e, (table, _, _) in ENTITIES.items():
                sql, args = f'SELECT * FROM {table} WHERE deleted=0', ()
                if cutoff and e in WINDOWED:
                    sql += f' AND ({WINDOWED[e]} >= ? OR {WINDOWED[e]} IS NULL)'
                    args = (cutoff,)
                rows[e] = self._filter(e, [self._row_js(e, r) for r in self.conn.execute(sql + ' ORDER BY rowid', args)], allowed, students)
            settings = {r['id']: r.get('value') for r in rows.pop('settings')}
            sample_settings = settings.get('smp-centre')
            if isinstance(sample_settings, dict):
                settings = {**sample_settings, **settings}
            initialized = self.conn.execute("SELECT 1 FROM meta WHERE key='initialized'").fetchone() is not None
            settings_ver = {r[0]: r[1] for r in self.conn.execute('SELECT id, ver FROM settings WHERE deleted=0')}
            return {'settings': settings, 'settingsVer': settings_ver, **rows, 'initialized': initialized, 'windowFrom': cutoff,
                    'version': int(self.conn.execute("SELECT value FROM meta WHERE key='data_version'").fetchone()[0])}

    def rows(self, entity, where='', args=(), scopes=None):
        """Rows of one entity (not deleted) as the pages see them, with an optional SQL condition."""
        table = ENTITIES[entity][0]
        with self.lock:
            allowed, students = self._visible(scopes)
            out = [self._row_js(entity, r) for r in self.conn.execute(
                f'SELECT * FROM {table} WHERE deleted=0' + (f' AND ({where})' if where else '') + ' ORDER BY rowid', args)]
            return self._filter(entity, out, allowed, students)

    def row(self, entity, rid):
        table = ENTITIES[entity][0]
        with self.lock:
            r = self.conn.execute(f'SELECT * FROM {table} WHERE id=? AND deleted=0', (rid,)).fetchone()
            return self._row_js(entity, r) if r else None

    # ------------------------------------------------------------ small changes since a version (fast refresh)
    def _touched(self, envs):
        keys = set()
        for env in envs:
            for op in env.get('ops') or []:
                if isinstance(op, dict) and op.get('e') in ENTITIES:
                    keys.add((op['e'], op.get('id')))
        self._changes.append((self.version_nolock(), keys))
        del self._changes[:-400]

    def version_nolock(self):
        return int(self.conn.execute("SELECT value FROM meta WHERE key='data_version'").fetchone()[0])

    def delta(self, since, scopes=None):
        """The rows changed after version `since`, or None when the page must reload everything (too old, restart)."""
        with self.lock:
            cur = self.version_nolock()
            if since == cur:
                return {'version': cur, 'rows': {}, 'gone': {}}
            known = [v for v, _ in self._changes]
            if since > cur or not known or since < known[0] - 1 or any(v not in known for v in range(since + 1, cur + 1)):
                return None
            keys = set()
            for v, k in self._changes:
                if v > since:
                    keys |= k
            if len(keys) > 3000 or any(e == 'settings' or scopes is not None and e == 'enrollments' for e, _ in keys):
                return None
            allowed, students = self._visible(scopes)
            rows, gone = {}, {}
            for e, rid in keys:
                table = ENTITIES[e][0]
                r = self.conn.execute(f'SELECT * FROM {table} WHERE id=?', (rid,)).fetchone()
                js = self._row_js(e, r) if r and not r['deleted'] else None
                if js and self._filter(e, [js], allowed, students):
                    rows.setdefault(e, []).append(js)
                else:
                    gone.setdefault(e, []).append(rid)
            return {'version': cur, 'rows': rows, 'gone': gone}

    # ------------------------------------------------------------ write
    def commit(self, user, ip, label, ops, force=False, guard=None, user_id='', kind='data'):
        """guard(changes, force) is called with the changes before they are saved; raising an exception cancels all of them.
        The accepted changes become one changeset: folded into the tables, appended to the journal, then committed."""
        if not isinstance(ops, list) or not ops:
            raise BadRequest('Nothing to save')
        if self.journal is None:
            raise RuntimeError('The change journal is not ready')
        with self.lock:
            c = self.conn
            c.execute('BEGIN IMMEDIATE')
            try:
                audit, rops = [], []
                for op in ops:
                    a, r = self._plan(c, op, force)
                    if a:
                        audit.append(a)
                    if r:
                        rops.append(r)
                if guard:
                    guard(audit, force)
            except Exception:
                c.execute('ROLLBACK')
                raise
            if not rops:
                c.execute('ROLLBACK')
                return {'txn': None, 'version': self.version(), 'changes': 0}
            rec = self._save(rops, user, ip, label, user_id, kind)
            version = self.version()
        env = rec['env']
        self._audit_file([{'ts': env['ts'], 'txn': env['id'], 'node': env['node'], 'user': user, 'ip': ip, 'label': label,
                           **{k: a[k] for k in ('entity', 'id', 'op', 'changes')}} for a in audit])
        return {'txn': env['id'], 'version': version, 'changes': len(audit)}

    def _save(self, rops, user, ip, label, user_id='', kind='data', begin=False):
        """Turns journal ops into one changeset: fold into the tables, append to the journal, commit.
        Called with the store lock held and (unless begin) a transaction already open."""
        c = self.conn
        if begin:
            c.execute('BEGIN IMMEDIATE')
        rec, appended = None, False
        try:
            with self.journal.lock:
                # deps = what is FOLDED here (the state the change was planned on), not what the journal has received
                rec = self.journal.build(kind, rops, actor=user, actor_id=user_id, ip=ip, label=label, deps=replica.markers(c))
                before = len(self.folder.problems)
                self.folder.fold(rec['env'], 'ok')
                if len(self.folder.problems) != before:
                    raise BadRequest('This change could not be saved: ' + self.folder.problems[-1])
                self._bump(c)
                self._touched([rec['env']])
                self.journal.append_local(rec)
                appended = True
            c.execute('COMMIT')
        except Exception:
            try:
                c.execute('ROLLBACK')
            except sqlite3.OperationalError:
                pass
            if not appended:
                raise
            try:
                self.fold_pending()  # the change is safely in the journal - apply it again from there
            except Exception as e:  # noqa: BLE001 - it is saved; it will be applied at the next start at the latest
                self.journal.alert('fold', f'A saved change could not be shown yet ({e}); it is applied again automatically.', '', 'warning')
        self.journal._notify([rec])
        return rec

    def record_file(self, path, sha256, size, mime, user, ip, user_id=''):
        """Adds an uploaded file to the replicated manifest so the other PCs fetch and verify it."""
        with self.lock:
            if self.file_info(path):
                return
            self._save([{'e': 'files', 'id': path, 'op': 'insert', 'x': False, 'noaudit': True,
                         's': {'sha256': sha256, 'size': size, 'type': mime}}], user, ip, 'Uploaded file', user_id, begin=True)

    def _bump(self, c):
        c.execute("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='data_version'")

    def _plan(self, c, op, force):
        """Checks one change against the current row and turns it into (audit entry, journal op)."""
        entity, rid, kind = op.get('e'), op.get('id'), op.get('op')
        if entity not in ENTITIES or not isinstance(rid, str) or not rid or len(rid) > 120:
            raise BadRequest(f'Invalid change: {entity}/{rid}')
        table, title, fields = ENTITIES[entity]
        counters = COUNTERS.get(entity, set())
        names = [js for js, _, _, _ in fields]
        cur = c.execute(f'SELECT * FROM {table} WHERE id=?', (rid,)).fetchone()
        before = self._row_js(entity, cur) if cur and not cur['deleted'] else None
        r0 = before or op.get("row") or {}
        what = f'{title[:-1] if title.endswith("s") else title} "{r0.get("name") or r0.get("no") or r0.get("title") or rid}"'

        if before and not force and op.get('ver') != cur['ver']:
            raise Conflict(f'{what} was changed by {cur["updated_by"] or "another user"} at {cur["updated_at"]}. '
                           'The screen has been refreshed - please repeat your change.')
        if cur and cur['deleted'] and not force and op.get('ver') is not None:
            raise Conflict(f'{what} was deleted by {cur["deleted_by"] or "another user"} at {cur["deleted_at"]}. '
                           'It can be restored from Settings > Recycle Bin.')

        if kind == 'del':
            if not before:
                if op.get('resolve') and cur:  # confirm a delete again (conflict: edited on another PC while deleted)
                    b = self._row_js(entity, cur)
                    b.pop('ver', None)
                    return None, {'e': entity, 'id': rid, 'op': 'delete', 'x': True, 'a': self._scope_of(entity, b), 'b': b, 'noaudit': True}
                return None, None
            before.pop('ver', None)
            area = self._scope_of(entity, before)
            return ({'entity': entity, 'id': rid, 'op': 'delete', 'scope': area, 'changes': {}, 'before': before, 'after': None},
                    {'e': entity, 'id': rid, 'op': 'delete', 'x': True, 'a': area, 'b': before})

        if kind != 'put' or not isinstance(op.get('row'), dict):
            raise BadRequest(f'Invalid change: {entity}/{rid}')
        row = op['row']
        value = row.get('value')
        for v in (row.get('src'), value, value.get('src') if isinstance(value, dict) else None):   # a setting (the logo) can hold one too
            if isinstance(v, str) and v.startswith('/files/') and ('..' in v or '\\' in v or ':' in v):
                raise BadRequest('Invalid file reference')  # file references must stay inside the uploads folder
        for f in ('amount', 'fee', 'price', 'cost', 'openingCash', 'countedCash'):
            x = _coerce(R, row.get(f))
            if x is not None and not -10_000_000 <= x <= 10_000_000:
                raise BadRequest('The amount is too large')
        vals = {col: _coerce(kind_, row.get(js)) for js, col, kind_, _ in fields}
        after = {'id': rid, **{js: _out(k, vals[col]) for js, col, k, _ in fields if vals[col] is not None}}
        area = self._scope_of(entity, after)
        if before:
            b = {k: v for k, v in before.items() if k != 'ver'}
            changes = {k: [b.get(k), after.get(k)] for k in set(b) | set(after) if b.get(k) != after.get(k)}
            touch = [f for f in (op.get('resolve') or []) if f in names and f not in counters]
            if not changes and not touch:
                return None, None
            s = {k: after.get(k) for k in list(changes) + touch if k in names and k not in counters}
            for f, rule in RESOLVERS.get(entity, {}).items():  # a follower always travels with its leader
                if rule.startswith('follow:') and rule[7:] in s and f not in s:
                    s[f] = after.get(f)
            n = {k: (after.get(k) or 0) - (b.get(k) or 0) for k in changes if k in counters}
            rop = {'e': entity, 'id': rid, 'op': 'update', 's': s, 'a': area, 'c': changes}
            if c.execute("SELECT 1 FROM sync_field WHERE tbl=? AND rid=? AND fld='_del' AND val LIKE '[1,%' LIMIT 1", (table, rid)).fetchone():
                rop['x'] = False  # visible only because a restore's delete lost against another PC: editing it keeps it for good
            if n:
                rop['n'] = n
            if not changes:
                rop['noaudit'] = True
                return None, rop
            return {'entity': entity, 'id': rid, 'op': 'update', 'scope': area, 'scope_before': self._scope_of(entity, b), 'changes': changes,
                    'before': b, 'after': after}, rop
        if cur:  # previously deleted row that is being re-created
            old = self._row_js(entity, cur)
            s = {js: after.get(js) for js in names if js not in counters}
            n = {k: (after.get(k) or 0) - (old.get(k) or 0) for k in counters}
        else:
            s = {js: v for js, v in after.items() if js != 'id' and js not in counters}
            n = {k: after.get(k) or 0 for k in counters}
        rop = {'e': entity, 'id': rid, 'op': 'insert', 's': s, 'x': False, 'a': area, 'r': after}
        n = {k: v for k, v in n.items() if v}
        if n:
            rop['n'] = n
        return {'entity': entity, 'id': rid, 'op': 'insert', 'scope': area, 'scope_before': self._scope_of(entity, old) if cur else area,
                'changes': {}, 'before': None, 'after': after}, rop

    def fold_pending(self, limit=2000):
        """Applies every journal changeset not yet in the tables (after a crash, or received from another PC).
        Returns the number of changesets folded."""
        total = 0
        while True:
            with self.lock:
                items = self.journal.iter_after(replica.markers(self.conn), limit)
                if not items:
                    return total
                c = self.conn
                c.execute('BEGIN IMMEDIATE')
                try:
                    changed = False
                    for env, status in items:
                        changed |= self.folder.fold(env, status)
                    if changed:
                        self._bump(c)
                        self._touched([env for env, _ in items])
                    c.execute('COMMIT')
                except Exception:
                    c.execute('ROLLBACK')
                    raise
                total += len(items)

    def fold_upgrade(self):
        """First fold after the upgrade, in ONE transaction: the bootstrap changesets re-create every row with the
        same values; quantities are counters, so they are first set to 0 and then re-added from the journal."""
        with self.lock:
            c = self.conn
            c.execute('BEGIN IMMEDIATE')
            try:
                for e, spec in SPECS.items():
                    for js, col, _ in spec['fields']:
                        if js in spec['counters']:
                            c.execute(f'UPDATE {spec["table"]} SET {col}=0')
                for env, status in self.journal.iter_after(replica.markers(c)):
                    self.folder.fold(env, status)
                self._bump(c)
                c.execute('COMMIT')
            except Exception:
                c.execute('ROLLBACK')
                raise

    def restore_from(self, path, user, ip, label, user_id='', kind='restore'):
        """Brings the data back to the state of a backup file WITHOUT rolling back history: the differences
        become one 'restore' changeset. It is weak: real changes made at the same time on other PCs win over it."""
        src = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        src.row_factory = sqlite3.Row
        ops = []
        try:
            tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            with self.lock:
                for e, (table, _, fields) in ENTITIES.items():
                    backup = {}
                    if table in tables:
                        cols = {r[1] for r in src.execute(f'PRAGMA table_info({table})')}
                        for r in src.execute(f'SELECT * FROM {table}'):
                            if not ('deleted' in cols and r['deleted']):
                                d = {'id': r['id']}
                                for js, col, ftype, _ in fields:
                                    v = _out(ftype, r[col]) if col in cols else None
                                    if v is not None:
                                        d[js] = v
                                backup[r['id']] = d
                    current = {r['id'] for r in self.conn.execute(f'SELECT id FROM {table} WHERE deleted=0')}
                    for rid in sorted(set(backup) | current):
                        if rid in backup:
                            ops.append({'e': e, 'id': rid, 'op': 'put', 'row': backup[rid]})
                        else:
                            ops.append({'e': e, 'id': rid, 'op': 'del'})
        finally:
            src.close()
        if not ops:
            return {'txn': None, 'changes': 0, 'version': self.version()}
        return self.commit(user, ip, label, ops, force=True, user_id=user_id, kind=kind)

    def mark_initialized(self):
        with self.lock:
            self.conn.execute("INSERT OR IGNORE INTO meta VALUES ('initialized', ?)", (now(),))

    def claim_first_run(self):
        """True for exactly one caller, only on a brand-new database: that caller loads the sample data.
        Later (e.g. after the user deletes all sample data) it is always False. A PC that joined another
        administrator PC is marked initialized when it joins, so it never loads sample data."""
        with self.lock:
            c = self.conn
            c.execute('BEGIN IMMEDIATE')
            try:
                done = c.execute("SELECT value FROM meta WHERE key='initialized'").fetchone()
                has_data = c.execute('SELECT COUNT(*) FROM students').fetchone()[0] > 0
                if not done:
                    c.execute("INSERT INTO meta VALUES ('initialized', ?)", (now(),))
                c.execute('COMMIT')
            except Exception:
                c.execute('ROLLBACK')
                raise
            return not done and not has_data

    # ------------------------------------------------------------ recycle bin
    def trash(self):
        with self.lock:
            groups = {}
            for e, (table, title, _) in ENTITIES.items():
                for r in self.conn.execute(f'SELECT * FROM {table} WHERE deleted=1 AND deleted_txn IS NOT NULL ORDER BY rowid'):
                    g = groups.setdefault(r['deleted_txn'], {'txn': r['deleted_txn'], 'ts': r['deleted_at'], 'user': r['deleted_by'], 'items': {}, 'names': []})
                    g['items'][title] = g['items'].get(title, 0) + 1
                    if e in ('students', 'teachers', 'groups', 'rooms', 'subjects', 'materials', 'exams', 'questions'):
                        js = self._row_js(e, r)
                        g['names'].append(js.get('name') or js.get('title') or (js.get('text') or '')[:60] or r['id'])
            for g in groups.values():
                g['label'] = self._txn_label(g['txn'])
                g['names'] = g['names'][:6]
            return sorted(groups.values(), key=lambda g: g['ts'] or '', reverse=True)

    def restore_txn(self, user, ip, txn):
        ops = []
        with self.lock:
            for e, (table, _, _) in ENTITIES.items():
                for r in self.conn.execute(f'SELECT * FROM {table} WHERE deleted=1 AND deleted_txn=?', (txn,)):
                    row = self._row_js(e, r)
                    ops.append({'e': e, 'id': r['id'], 'op': 'put', 'row': row})
            t = [self._txn_label(txn)]
        if not ops:
            raise BadRequest('Nothing to restore')
        return self.commit(user, ip, 'Restore deleted: ' + (t[0] or txn), ops, force=True)

    def _txn_label(self, txn):
        with self.lock:
            t = self.conn.execute('SELECT label FROM transactions WHERE id=?', (txn,)).fetchone()  # saved before the upgrade
        if t:
            return t[0]
        d = self.journal.describe(txn=txn) if self.journal else None
        return d['label'] if d else ''

    # ------------------------------------------------------------ logs (kept in the journal: never restored, all PCs)
    def log_activity(self, user, ip, events):
        self.journal.log_activity(user, ip, events[:500])

    def query_log(self, kind, q='', user='', typ='', scope='', frm='', to='', limit=200, offset=0, scopes=None, node='', admin=True, contacts=True, entity='', rid=''):
        if kind == 'activity':
            self.journal.flush_activity()
        res = self.journal.query('audit' if kind == 'audit' else 'activity', q, user, typ, scope, frm, to, node, limit, offset, scopes,
                                 business_only=not admin, phones_hidden=not contacts, entity=entity, rid=rid)
        if kind == 'audit':
            for r in res['rows']:
                mask_audit_row(r, LOG_HIDDEN | (set() if contacts else PHONE_FIELDS))
        return res

    # ------------------------------------------------------------ conflicts and convergence
    def conflicts(self):
        """Everything two PCs did at the same time that a person should look at. Identical on every PC."""
        titles = {spec['table']: (e, ENTITIES[e][1] if e in ENTITIES else 'Files') for e, spec in SPECS.items()}
        out = []
        with self.lock:
            flags = self.conn.execute('SELECT * FROM sync_flags ORDER BY tbl, rid, kind').fetchall()
            for f in flags:
                entity, title = titles.get(f['tbl'], (f['tbl'], f['tbl']))
                r = self.conn.execute(f'SELECT * FROM {f["tbl"]} WHERE id=?', (f['rid'],)).fetchone()
                row = self._row_js(entity, r) if r else {'id': f['rid']}
                detail = json.loads(f['detail'])
                item = {'entity': entity, 'title': title, 'id': f['rid'], 'kind': f['kind'], 'deleted': bool(r and r['deleted']),
                        'name': row.get('no') or row.get('name') or row.get('title') or f['rid'],
                        'scope': self._scope_of(entity, row) if r else None, 'row': row, 'detail': detail}
                out.append(item)
        return out

    def fingerprint(self):
        """SHA-256 over the complete business data (without local counters). Equal on PCs that agree."""
        with self.lock:
            v = self.version()
            if self._fp[0] == v:
                return self._fp[1]
            h = hashlib.sha256()
            for e in sorted(SPECS):
                table = SPECS[e]['table']
                for r in self.conn.execute(f'SELECT * FROM {table} ORDER BY id'):
                    d = dict(r)
                    d.pop('ver', None)
                    h.update(canonical([table, d]).encode('utf-8'))
            for r in self.conn.execute('SELECT * FROM sync_flags ORDER BY tbl, rid, kind'):
                h.update(canonical(['flag', *r]).encode('utf-8'))
            self._fp = (v, h.hexdigest())
            return self._fp[1]

    # ------------------------------------------------------------ attachments
    def file_info(self, path):
        with self.lock:
            r = self.conn.execute('SELECT sha256, size_bytes FROM attachments WHERE id=?', (path,)).fetchone()
        return {'sha256': r[0], 'size': r[1]} if r else None

    def referenced_files(self):
        """Every uploaded file the current data (and the recycle bin) refers to."""
        out = set()
        with self.lock:
            for sql in ('SELECT id FROM attachments', "SELECT value FROM settings WHERE id='logoImage'"):
                for (v,) in self.conn.execute(sql):
                    if isinstance(v, str):
                        v = v.strip('"')
                        if v.startswith('/files/'):
                            out.add(v)
        return out

    # ------------------------------------------------------------ export
    def export_sheets(self, admin=False):
        """Complete export of every table (all fields, ids, who/when) - the safety copy for the office.
        The monthly workbook in the customers' layout is made by excel_io.py."""
        with self.lock:
            c = self.conn
            cats = {r['id']: r['name'] for r in c.execute('SELECT id, name FROM teachers')}
            sheets, deleted = [], []
            for e, (table, title, fields) in ENTITIES.items():
                head = ['ID'] + [label for _, _, _, label in fields] + ['Created', 'Created By', 'Last Changed', 'Changed By']
                rows = []
                for r in c.execute(f'SELECT * FROM {table} ORDER BY rowid'):
                    if r['deleted']:
                        deleted.append([title, r['id'], str(self._row_js(e, r))[:500], r['deleted_at'], r['deleted_by']])
                        continue
                    out = [r['id']]
                    for js, col, kind, _ in fields:
                        v = _out(kind, r[col])
                        if js == 'teacherId':
                            v = cats.get(v, v)
                        elif kind == J:
                            v = json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v
                        out.append(v)
                    out += [r['created_at'], r['created_by'], r['updated_at'], r['updated_by']]
                    rows.append(out)
                sheets.append((title, head, rows))
            sheets.append(('Deleted Records', ['Table', 'ID', 'Record', 'Deleted At', 'Deleted By'], deleted))
        j = self.journal
        j.flush_activity()
        with j.lock:
            names = {r['id']: r['name'] for r in j.conn.execute('SELECT id, name FROM nodes')}
            sheets.append(('Data Changes Log', ['#', 'Time', 'User', 'PC', 'IP', 'Action', 'Table', 'Record ID', 'Category', 'Operation', 'Changes'],
                           [[r['id'], r['ts'], r['user'], names.get(r['node'], r['node']), r['ip'], r['label'], r['entity'], r['entity_id'],
                             cats.get(r['scope_id'], r['scope_id']), r['op'], r['changes'] if r['op'] == 'update' else (r['after'] or r['before'])]
                            for r in j.conn.execute("SELECT * FROM audit WHERE entity NOT IN ('users', 'nodes', 'userCommands', 'profiles') "
                                                    "ORDER BY ts, id")]))
            if admin:  # what each person clicked is for administrators only (like on the screen)
                sheets.append(('User Activity Log', ['#', 'Time', 'User', 'PC', 'IP', 'Type', 'Action', 'Target', 'Page', 'Detail'],
                               [[r['id'], r['ts'], r['user'], names.get(r['node'], r['node']), r['ip'], r['type'], r['action'], r['target'], r['page'],
                                 r['detail']] for r in j.conn.execute('SELECT * FROM activity ORDER BY ts, id')]))
        return sheets

    def counts(self):
        with self.lock:
            return {title: self.conn.execute(f'SELECT COUNT(*) FROM {table} WHERE deleted=0').fetchone()[0]
                    for table, title, _ in ENTITIES.values()}
