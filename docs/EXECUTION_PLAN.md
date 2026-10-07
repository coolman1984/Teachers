<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Execution Plan — Hessa (حِصّة), the tutoring-centre system

> **Who this is for:** any coding agent (Claude Sonnet, ChatGPT/Codex, or another) that continues this project.
> Read this whole file before you touch anything. It says exactly what exists, what to build, in which order, with
> which names, and how to prove it works. If something here conflicts with the owner's newest message, the owner
> wins — then update this file in the same commit.
>
> Companion files: `CLAUDE.md` / `AGENTS.md` (rules), `TASKS.md` (where to continue — tick boxes),
> `DEVELOPMENT_HISTORY.md` (what happened, mistakes, lessons), `docs/01-research-report.md` (market research),
> `docs/02-product-spec.md` (the approved product), this file (the how).

---

## Part A — The product in 12 lines

Hessa is an offline-first web application for Egyptian private-tutoring centres (سناتر) and independent teachers,
for primary, preparatory, secondary (Thanaweya Amma + the new Egyptian Baccalaureate with its 4 tracks) and Al-Azhar.
It runs on the centre's own PC (Python standard library server + browser UI), works with **no internet**, and syncs
between several PCs of the same centre (door laptop, owner PC, teacher laptop) over the local network. Parents get a
read-only link on their phone through an internet "mailbox" (Cloudflare Worker), so the office never opens to the internet.

Core: students, groups and timetable without room clashes, the **door** (attendance by card code/QR/name in < 3 clicks),
fees (per session / per month / package / money in advance), receipts that can never be deleted (only reversed),
cash shifts with a daily count, handouts (ملازم) with stock, exams and marks with ranking, parent link.
Differentiators (approved by the owner): drawer control, teacher↔centre settlement with any rent model, profitability
per group, early-warning list of students about to drop out, messages that survive WhatsApp bans (wa.me one-by-one +
SMS + parent link + monthly report), school-support-groups mode (decree 149/2024: ≤25 students, ≤100 EGP, 15% treasury),
bubble-sheet marking by phone camera, AI exam generator (teacher reviews), teacher marketing page, video watermark.

**Languages:** UI in **English and Formal Arabic (العربية الفصحى)** — owner's explicit decision (2026-10-04).
**Themes:** light and dark (plus the 3 extra themes the engine has). User guides: simple Egyptian Arabic (original brief).

---

## Part B — How to work (be the same engineer every session)

### B1. The loop for every session
1. `git status`, `git log --oneline | head`, read `TASKS.md` → take the **first task that is not `[x]`**.
2. Read the task's section in Part E of this file and every file it names. Read before you write.
3. Write a 3–6 line plan (in your reply). If something is undecided, use the default written here and say so.
4. Implement the smallest complete slice: **code + tests + i18n (both languages) + docs** together.
5. Run the checks of Part G. Nothing is pushed red.
6. Re-read your own diff adversarially: RTL? dark theme? XL font? 360 px phone? offline? two PCs? empty database?
   a user limited to one teacher? Fix before pushing.
7. Tick `TASKS.md`, add a `DEVELOPMENT_HISTORY.md` entry (newest first: what, why, mistakes, lessons).
8. Commit (English, imperative, body says why), push to the session branch. **Never push to `main`, never force-push.**
9. Report to the owner (B2).

### B2. How to talk to the owner
- Simple **Egyptian Arabic**, conclusion first: **الخلاصة** → **اللي اتعمل** (short list) → **محتاج منك** (decisions,
  each with the default in brackets) → **الخطوة الجاية**. The owner is not technical: no code, at most 1–3 file names.
- Say plainly what failed or was skipped and why. Never claim a test passed that you did not run.

### B3. Decision rules
| Situation | Do |
|---|---|
| Two designs, one simpler | the simpler one, unless it breaks a rule here |
| Library temptation | **server: Python standard library only.** Browser: plain JS (ES5-style IIFEs like the existing files), no framework, no npm runtime packages. Dev-only tools (Playwright, pyflakes, node:test) are fine |
| Any visible text | an i18n key in **both** `js/i18n/en.js` and `js/i18n/ar.js` — never a literal word in a view |
| Colour | CSS tokens only (`css/tokens.css`); green/amber/red mean ok/warn/bad only |
| Layout direction | logical CSS only (`margin-inline-start`, `inset-inline-end`, `text-align:start`) — never left/right |
| Money | never stored as a running balance; computed from receipts + attendance. Receipts/expenses are **append-only** |
| Something may lose data | stop; design it as a new record / soft delete / reversal |
| Record ids | random (`new_id(prefix)`), except the deterministic ids listed in C4 (they make two PCs merge) |
| A rule would block the door | never block the door: record, then colour/flag |

### B4. Quality bar ("done")
Works in both languages (RTL checked), both main themes (daylight + night), font size XL, on a 360 px wide phone;
has empty, loading (skeleton) and error states; every write is permission-checked **on the server**, audited, and
reversible; unit test for logic, browser test for each new screen flow, regression test for each bug fixed.

---

## Part C — Architecture and current implementation (updated 2026-10-05)

### C1. Origin
The repository is a fork of the owner's **Trip Orders** engine (`coolman1984/Yousef-Transportation`, commit
`9f5ef29`), which itself forks **BAMS** (`coolman1984/Mr.Ayman-HR`). Clone them read-only for reference:
```
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/coolman1984/yousef-transportation /home/user/coolman1984/yousef-transportation
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/coolman1984/mr.ayman-hr /home/user/coolman1984/mr.ayman-hr
```
**Copy patterns from Yousef-Transportation**: its `js/views/trips.js`, `board.js`, `excel.js`, `reports.js`,
`mailbox.js`, `print.js` and `docs/DESIGN.md` are the reference for how a page, a side panel, a print sheet, the
mailbox settings and charts are written. Same look, same code style.

Renamed: product `Hessa`, JS namespace `window.HS` (was `TO`), env `HS_HOME`/`HS_CONFIG`, cookie `hs_sid`,
prefs key `hs.prefs`, DB `data/center.db`, hash domains `HS-*`, headers `X-HS-*`, web port **8095**, sync port **8463**,
installer `installer/hessa.iss` (new AppId), entry `server/hs_main.py`.

### C2. Server files (Python 3.11, stdlib only)
| File | State | Notes |
|---|---|---|
| `journal.py`, `replica.py`, `sync.py`, `node.py`, `ed25519.py`, `tlscert.py`, `backup.py`, `system.py`, `nodectl.py` | **engine, untouched** — do not change unless a test proves a bug | signed append-only history, multi-PC sync, backups |
| `auth.py` | engine + **new `PERMISSIONS` and `BUILTIN_PROFILES`** | scopes = **teacher ids** (was trip categories) |
| `store.py` | engine + **new `ENTITIES`**, `TEACHER_SCOPED`, `LEDGERS`, `WINDOWED`, counters/resolvers, `state(scopes, since_days)`, `rows()`, `row()`, `delta(since)` | see C3 |
| `domain.py` | **new**, pure rules | text/mobile, doc numbers, student codes, grades, timetable clashes, fees, risk, settlement, signals |
| `center.py` | **new**, operations + reads | door, roll call, enrol/transfer, shifts, receipts, expenses, risk list, student file, exams, settlements, profitability, dashboard, reports, Excel import |
| `app.py` | engine routes + **new `/api/c/*`**, `/api/delta`, `/api/import/preview` | trip routes removed |
| `gateway_client.py` | **parent cards** (push only; `check()` reads the mailbox status) | `card_for(store, student_id)`: one child, published marks only, the next 7 days |
| `formats.py`, `xlsx_read.py`, `xlsx_write.py`, `xlsx.py`, `docx_read.py`, `docx_write.py`, `com_office.py` | engine readers/writers | used by the student import |

Verified (2026-10-05): every centre module is executed by tests through real HTTP, several PCs and Chromium - see Part G and
`TASKS.md`. The old note "nothing in center.py is tested" is history.

### C3. Data model (`server/store.py` → `ENTITIES`)
Every row also has engine columns: `id, ver, created_at/by, updated_at/by, deleted, deleted_at/by/txn`.
| Entity (js key) | Table | Fields (js) | Scope |
|---|---|---|---|
| `settings` | settings | value (JSON) — ids used: see C5 | — |
| `subjects` | subjects | name, nameEn, color, order, active | shared |
| `rooms` | rooms | name, capacity, costPerHour, active, notes | shared |
| `teachers` | teachers | name, nameKey, mobile, subjectIds[], gradeCodes[], settleModel, rentMonth, rentSession, rentStudent, centerPct, color, bio, slug, active, notes | its own id |
| `students` | students | code, name, nameKey, gradeCode, system, track, school, gender, mobile, parentName, parentMobile, parentMobile2, familyKey, discountPct, discountReason, exempt, consent, consentAt, joinedAt, active, notes, portalHash, portalNonce, importKey | visible if enrolled with an allowed teacher |
| `groups` | class_groups | name, teacherId, subjectId, gradeCode, system, track, roomId, slots[{day 0=Sat..6=Fri, start 'HH:MM', end, roomId}], capacity, feeType(session/month/package), fee, packageSessions, **feeHistory[{to, fee, type}] (server-written)**, **tempSlots{from, to, slots[]}** (one temporary timetable, e.g. Ramadan; replaces `slots` between the two days), startDate, endDate, kind(center/school/online/home), color, active, notes | teacherId |
| `enrollments` | enrollments | studentId, groupId, teacherId, from, to, status(active/moved/left), fee (special fee), note, **billFrom** (first billed day of a month group) | teacherId |
| `sessions` | sessions | groupId, teacherId, date, start, end, roomId, status(planned/held/cancelled), kind, topic, note | teacherId |
| `attendance` | attendance | sessionId, studentId, groupId (**the student's home group**), teacherId, date, status(present/late/absent/excused), at, via, makeup, by | teacherId |
| `payments` | payments | no, date, at, studentId, teacherId, groupId, kind(fee/material/wallet_topup/refund/other), period, sessions, materialId, qty, amount, method(cash/vodafone/instapay/fawry/card/wallet/bank), ref, shiftId, voidOf, note, by | teacherId (wallet = none) |
| `shifts` | shifts | no, user, userId, node, openedAt, openingCash, closedAt, expectedCash, countedCash, diff, diffReason, status(open/closed) | — |
| `expenses` | expenses | no, date, at, amount, category, teacherId, groupId, method, shiftId, voidOf, note, by | teacherId |
| `materials` | materials | name, teacherId, gradeCode, price, cost, **stock (counter)**, active | teacherId |
| `exams` | exams | title, teacherId, groupIds[], date, kind, maxScore, questions, choices, answerKey[], published, paper[] (copies of bank questions: qid, text, choices, answer, explanation) | teacherId |
| `questions` | questions | teacherId, subjectId, gradeCode, topic, text, choices[2-5], answer (A-E), explanation, source (manual/ai), active | teacherId |
| `marks` | marks | examId, studentId, teacherId, score, absent, via, answers[], note | teacherId |
| `followups` | followups | studentId, teacherId, date, type, reason, outcome, by | teacherId |
| `settlements` | settlements | teacherId, period(YYYY-MM), revenue, centerShare, teacherShare, deductions, paid, status, detail{}, by, at | teacherId |

Merge rules: `materials.stock` is a **counter** (two PCs selling at once both count); `shifts.status` rank open<closed;
`sessions.status` rank planned<cancelled<held. Everything else: last writer wins, surfaced in Devices & Sync.
Derived fields **follow** their source (`store.RESOLVERS` `follow:<field>`): `nameKey`→`name`, `consentAt`→`consent`, `portalHash`→`portalNonce`,
`feeHistory`→`fee`, `sessions.note`→`status`. They take the winner of their source and are never shown as a conflict of their own
(`replica.flags(followers=)`); resolving a name conflict recomputes `nameKey` (`/api/conflicts/resolve`).

### C4. Deterministic ids (two PCs doing the same thing must produce the same id)
- session: `se-<groupId>-<YYYY-MM-DD>-<HHMM>` (`domain.session_id`) — a planned ("virtual") session becomes real at the first check-in
- attendance: `at-<sessionId without "se-">-<studentId>` (`domain.attendance_id`)
- mark: `mk-<examId>-<studentId>`; settlement: `st-<teacherId>-<YYYY-MM>`
- numbers carry the PC letter: receipts `R26-A-000123`, expenses `E26-A-000012`, shifts `S26-A-0007` (`domain.doc_no`)
- student codes: number ranges per PC (`domain.CODE_RANGES`: PC A 10000–49999, B 50000–69999, …)

Sample business records use `smp-` ids, including deterministic sessions, attendance, marks and settlements.
The regular deterministic ids above are unchanged. Sample accounts use normal signed account ids plus an explicit
sample-account notes marker; sample removal disables those accounts and archives prefixed business rows.

### C5. Settings ids (`settings` entity) and defaults (`domain.DEFAULTS`)
`systemName` (centre name), `logoText`, `currency` (EGP), `lateMinutes` 15, `doorEarlyMinutes` 90, `doorLateMinutes` 30,
`schoolTreasuryPct` 15, `schoolTeacherPct` 80, `schoolMaxFee` 100, `schoolMaxStudents` 25, `riskCall` 35, `riskHigh` 60,
plus to add: `receiptFooter`, `waTemplates` {absence, payment, report, exam, welcome} (both languages), `academicYear`
(e.g. `2026-2027`, start `2026-07-01`), `weekStart` (Saturday).

### C6. API that exists (all JSON; every route checks permissions on the server)
Engine: `/api/auth/*`, `/api/state[?all=1]`, `/api/version`, `/api/commit`, `/api/users*`, `/api/profiles/*`,
`/api/backups*`, `/api/trash*`, `/api/audit`, `/api/activity`, `/api/security`, `/api/devices*`, `/api/conflicts*`,
`/api/export.xlsx`, `/api/xlsx`, `/api/upload`, `/api/gateway*`, `/files/*`.
Added with the admin work (2026-10-05): `/api/join/{discover,probe,status,cancel}` + `/api/join` (first-start screens, this PC only),
`/api/devices/adding-open|adding-close` (the 15-minute window), `/api/data-safety` + `/api/data-safety/check` (`backups.manage|restore`),
`/api/audit?entity=&id=` (history of one record), `GET /api/c/status` (what this user may act on: backup, sync, gateway).

New (center) — GET `/api/c/<action>`:
| action | params | permission (any) | returns |
|---|---|---|---|
| `today` | date? | door.use, groups.view, attendance.mark | `{date, sessions:[{id, groupId, start, end, roomId, status, virtual?, present, enrolled}]}` |
| `find` | q | door.use, students.view | students (contacts hidden without contacts.view) |
| `card` | id | door.use, students.view | `{student, enrollments[{…, money, left?}] (active + groups left with money still open), wallet, candidates[{session, own, makeup, now, done, status}], suggested, risk, today, shift}` |
| `roster` | session | door.use, groups.view, attendance.mark | `{session, group, rows[{student, status, at, money, enrollmentId, guest?}]}` |
| `student` | id | students.view | student file (enrollments+money+held, attendance, payments, marks+rank, followups, wallet, risk, family) |
| `risk` | – | followup.view | list `{studentId, student, groupId, teacherId, score, why[], followed, balance, last[], level}` |
| `shift` | id? | (own) / shifts.manage | shift summary `{shift, expected, byMethod, receipts, voids, expenses, cashIn, cashOut, payments, expenseRows}` |
| `shifts` | from? | shifts.manage, money.view | shift rows |
| `money` | from, to | money.view | `{payments, expenses}` |
| `settlements` | ym | settlements.view | one settlement per teacher |
| `reports` | ym | reports.view | month numbers + profitability |
| `dashboard` | – | overview.view | KPIs (money hidden without money.view/reports.view) |
| `exam` | id | exams.view, marks.enter | `{exam, rows[{student, mark, rank, groupId}], stats}` |
| `clashes` | – | groups.view | timetable clashes |
| `balances` | – | money.view, money.collect, followup.view | `{students:{id: balance}, lastPaid:{id: date}, left:[studentId], enrollments:{id:{balance, feeType, unit, due, sessionsLeft?, left?}}}` (computed; includes groups left with money still open) |
| `absent` | – | followup.view, attendance.mark, messages.send | today's absentees in held sessions `{date, rows[{studentId, name, code, groupId, sessionId, start, told}]}` – absence is never stored |
| `advice` | – | overview.view | ranked advisor items `[{id, level bad/warn/info/ok, page, icon, vars}]`; texts `adv.<id>.t/.b/.go` |

POST `/api/c/<action>` (JSON body): `checkin {studentId, sessionId, status?, via?}`, `roll {sessionId, marks:{studentId:status}}`,
`session {sessionId, status, topic?}`, `session/add {groupId, date, start, end, topic?}` (extra session, kind `extra`, refused on teacher/room clash), `dayoff {date, reason}`, `pay/many {items[{studentId, groupId, amount}], method, ref?}` (family payment, one commit), `credit/move {studentId, from, to, amount?}` (cancels every session of a day without attendance), `enroll {studentId, groupId, from?, fee?, billFrom?}`, `transfer {enrollmentId, groupId, from?, reason?}`,
`leave {enrollmentId, to?, reason?}`, `shift/open {opening}`, `shift/close {shiftId, counted, reason?}`,
`pay {studentId?, groupId?, kind, amount, method, ref?, period?, sessions?, materialId?, qty?, note?}`, `void {id, reason}`,
`expense {category, amount, method, teacherId?, groupId?, note?, date?}`, `expense/void {id, reason}`,
`followup {studentId, type, reason?, outcome?, teacherId?}`, `marks {examId, items[{studentId, score?, absent?, answers?, via?}]}`,
`settlement/approve {teacherId, ym}`, `import {rows[], enrol?}`, `timetable/check {ops[]}`.
Plus `POST /api/import/preview?name=&grade=&group=` (raw file body) and `GET /api/delta?since=<version>`.

Errors: HTTP 400 `{error, key, vars}` from `center.Problem` → the page shows `HS.t(key, vars)`; 403 `{error}`; 409 conflict.

### C7. Implementation status and invariants
1. P1.1: startup assets exist in the prescribed order; the centre pages and shared data wrapper are implemented and browser tested.
2. P1.2 implemented: centre pages, permission-aware palette, shortcuts, tour and onboarding.
3. Lists, settings and the command-centre overview are implemented; account scopes refer to teachers.
4. P1.5/P1.6 implemented: centre dictionaries and updated design tests pass.
5. P1.4: two-second delta polling with fallback and deferred repaint; `test_acceptance` checks propagation in under three seconds without a full-state request.
6. Done 2026-10-05: `tests/test_e2e_browser.py` tests centre flows (E07).
7. Done 2026-10-05: `gateway/public/*` is the parent page, read only (P7).
8. P2.6: scoped risk/dashboard caches are bounded and invalidated by store version; sample tests check response-size and latency budgets.
9. Fixed 2026-10-05 (A03): `js/quick.js` exists.
10. Lock order: `center.pay()` holds `store.lock` then `ctx.letter()` takes `journal.lock` (same order as `store._save`). Keep this order everywhere; never take `store.lock` while holding `journal.lock`.
11. Done 2026-10-05: `README.md`, `.claude/skills/hessa/SKILL.md`, `docs/DESIGN.md`, `docs/OPERATIONS.md`, guides per role (P10).

---

## Part D — Design system (same as Yousef-Transportation — the owner asked "exactly like this design")

- Keep `css/tokens.css` and `css/base.css` **unchanged in structure**: tokens, 5 themes (`daylight`, `night`, `asphalt`,
  `highway`, `contrast`), `data-font`, `data-size` (s/m/l/xl), `data-density`, `data-motion`. Only rename theme
  *labels* in i18n (e.g. Daylight / Night / Graphite / Garden / High contrast — "النهار / الليل / الجرافيت / الحديقة / التباين العالي").
- Same shell: sidebar groups, top bar (search Ctrl K, language, theme, shortcuts), stackable side panels (Esc closes),
  command palette, `G`+letter shortcuts, toasts, dialogs, skeletons, welcome slides, guided tour, count-up KPIs.
- Brand mark: replace the `route` icon in the sidebar/login with a new `cap` (graduation cap) or `book` icon in `core.js` `IC`.
- Numbers always Western digits (`HS.fmt.num`), money `1,250 ج.م` / `EGP 1,250`, dates `dd/mm/yyyy`, times 24 h.
- Inside RTL text wrap codes, receipt numbers, phone numbers in `<bdi dir="ltr">`.
- Door screen is the one bold place: very large search input, big buttons (≥ 48 px), sounds optional (beep ok / buzz warn).

### D1. Formal Arabic glossary (use these words everywhere; English in brackets)
الطالب (student) · ولي الأمر (parent) · المعلم (teacher) · المجموعة (group) · الحصة (session) · القاعة (room) ·
المادة (subject) · الصف الدراسي (grade) · النظام (system: الثانوية العامة / البكالوريا المصرية / الأزهري / عام / لغات) ·
المسار (track: الطب وعلوم الحياة / الهندسة وعلوم الحاسب / الأعمال / الآداب والفنون) · الاستقبال (front desk / door) ·
تسجيل الحضور (check-in) · حاضر / متأخر / غائب / غياب بعذر · الحصة التعويضية (make-up) · القيد (enrolment) ·
النقل إلى مجموعة أخرى (transfer) · الرسوم (fees) · بالحصة / شهريًا / باقة (fee types) · الإيصال (receipt) ·
قيد عكسي / إلغاء الإيصال (reversal) · الخزنة / الوردية النقدية (cash shift) · رصيد افتتاحي (opening cash) ·
الجرد الفعلي (counted cash) · العجز / الزيادة (shortage / overage) · المصروفات (expenses) · المذكرات والملازم (handouts) ·
المخزون (stock) · الرصيد المقدم (money in advance / wallet) · الخصم (discount) · الإعفاء (exemption) ·
الامتحان (exam): اختبار الحصة / الأسبوعي / الشهري / الشامل / تجريبي · الدرجة (mark) · الدرجة النهائية (full mark) ·
الترتيب (rank) · الأوائل (top students) · المتابعة (follow-up) · الإنذار المبكر (early warning) · مكالمة (call) ·
التسوية (settlement) · حصة السنتر (centre share) · حصة المعلم (teacher share) · المستحق (due) · المسدد (paid) ·
الربحية (profitability) · نسبة الإشغال (fill rate) · نسبة الحضور (attendance rate) · مجموعات التقوية بالمدرسة (school support groups) ·
الخزانة العامة (treasury) · رابط ولي الأمر (parent link) · النسخ الاحتياطي (backup) · سلة المحذوفات (recycle bin) · الصلاحيات (permissions).
Grades: الصف الأول الابتدائي … السادس الابتدائي (P1–P6), الأول … الثالث الإعدادي (M1–M3), الأول … الثالث الثانوي (S1–S3).

---

## Part E — Phases and tasks (IDs match `TASKS.md`)

### Phase P1 — Make the fork run again (the shell, no trip traces)
**P1.1 index.html.** Script list exactly: `lib/qrcode.min.js, js/core.js, js/i18n.js, js/i18n/en.js, js/i18n/ar.js, js/prefs.js,
js/shell.js, js/data.js, js/ui.js, js/views/join.js, js/views/auth.js, js/views/overview.js, js/views/door.js, js/views/students.js,
js/views/groups.js, js/views/money.js, js/views/exams.js, js/views/qbank.js, js/views/followup.js, js/views/settlements.js, js/views/reports.js,
js/views/lists.js, js/views/importx.js, js/views/print.js, js/omr.js, js/views/audit.js, js/views/activity.js, js/views/watch.js, js/views/license.js, js/views/access.js, js/views/datatab.js, js/views/devices.js,
js/views/mailbox.js, js/views/soon.js, js/views/settings.js, js/views/help.js, js/views/guides.js, js/app.js`. `<title>Hessa</title>`,
noscript text "Hessa needs JavaScript. يحتاج نظام حصة إلى تفعيل جافاسكريبت." New favicon (amber square + cap).
Create each new view file as a minimal `HS.views.<id> = HS.withData({render, mount})` first (skeleton), then fill it in its task.

**P1.2 shell.js `PAGES`** (id, icon, group, perm, key):
```
overview  home     ops     overview.view      o
door      board    ops     door.use           d
students  users    ops     students.view      s   (Settings moves to key ',')
groups    layers   ops     groups.view        g   (palette: "G then G")
money     sheet    money   money.view         m
exams     doc      learn   exams.view         e
followup  bell     learn   followup.view      f
settlements chart  money   settlements.view   t
reports   chart    insight reports.view       r
activity  activity control logs.view          a
settings  settings control null               ,  (use key 'c' for "configure")
help      help     control null               h
```
GROUPS = `ops, learn, money, insight, control` (i18n `nav.g.*`). Replace `HS.newTrip` with `HS.quickAdd()` (palette
actions: new student, new group, take payment, open door). Shortcut `N` = new student (if students.manage), `/` palette,
`F2` focus the door search when on the door page. Tour steps: nav, search, tools, kpis, account (keep). Slides: 6 slides
(`slide.1..6.t/.b`): what Hessa does · the door in 3 clicks · money that never disappears · the parent link · early warning · works without internet.
`HS.paletteRecords(q)`: search students (by code/name/mobile from `HS.data` state) and groups → open their panel.

**P1.3 Remove trip code from shared files.** `ui.js`: delete `plate`, `trust`, trip `status`; add `money(n)` (formatted
amount with currency, red when negative), `grade(code, system, track)` (label), `att(status)` (badge: present ok, late
warn, absent bad, excused info), `pct(x)`, `bdi(text)`. `data.js`: `catName`/`placeName`/`trust` → `teacherName(id)`,
`groupName(id)`, `subjectName(id)` (Arabic `name`, English `nameEn || name`).

**P1.4 Fast refresh with `/api/delta`.** In `data.js` `startPolling`: every 2 s call `/api/version`; when it changed,
call `/api/delta?since=<D.version>`; if `{full:true}` → `D.load()`; else merge `rows` (replace by id) and remove `gone`
ids, `reindex()`, emit `'data'`, and re-render only when no panel/dialog is open (else set `D.dirty`). Keep `D.load()`
for start-up. Test: two browser contexts — a check-in in one appears in the other within 3 s without a full reload
(spy on `/api/state` calls).

**P1.5 i18n reset.** Rewrite `js/i18n/en.js` and `ar.js`: keep every engine key used by `auth.js`, `access.js`,
`activity.js`, `datatab.js`, `settings.js` (appearance), `help.js`, shell, palette, tour, slides; delete every trip key;
add the keys of every page as you build it. Arabic = **Formal Arabic** (Part D1 glossary). Key families:
`nav.*`, `page.<id>.d`, `f.*` (field labels), `perm.*` and `permgroup.*` (every permission in `auth.PERMISSIONS` —
`test_design` checks it), `err.*` (every `Problem` key in `center.py`/`domain.py` — add a test that greps `Problem('err.`
and `return 'err.` and checks both dictionaries), `risk.*`, `grade.P1..S3`, `system.*`, `track.*`, `fee.*`, `kind.*`,
`pay.kind.*`, `pay.method.*`, `exp.cat.*`, `att.*`, `exam.kind.*`, `signal.*`, `day.0..6` (0 = Saturday).

**P1.6 tests/test_design.py.** Update `JS_FILES` to the new list; keep all checks (key parity, used keys exist, no literal
words in templates, logical CSS only, no hard-coded colours, fonts exist, permissions translated). Add the `err.*` check.

Exit P1: `python3 server/app.py` opens a working shell in ar+daylight and en+night with all pages as skeletons;
`test_unit test_convergence test_design` green.

### Phase P2 — Server hardening of the centre domain (before building screens on it)
**P2.1 `tests/test_center_domain.py`** (pure, table-driven, no server): `norm_mobile_eg` (01…, +20…, 0020…, Arabic
digits, invalid), `key_text` Arabic unification, `doc_no`/`parse_doc_no`, `next_code` ranges + exhaustion,
`check_grade` (bac S1 has no track, track validity), `clean_slots`, `weekday` (Saturday = 0), `clashes` (room,
teacher, capacity, non-overlapping periods ignored), `unit_fee` (discount, exempt, special fee), `charges` for the 3 fee
types (month crossing years, package price per session), `balance_info` (`sessionsLeft`), `wallet_balance`,
`shift_expected` (only cash counts), `risk` (each reason alone + combined, cap 100, followed-recently −10),
`center_share` (each model + mixed), `school_split`, `group_signal`.

**P2.2 `tests/test_center_api.py`** — through real HTTP like `tests/harness.py` (`Server` class) with one admin:
create subjects/rooms/teachers/groups/students via `/api/commit`; then scenarios:
1. **Door peak:** 200 check-ins in a loop; assert < 60 s total on CI, all idempotent (second scan = `already`), late
   status after `lateMinutes`, one session row per group created (virtual → real), attendance ids deterministic.
2. **Make-up:** student of group A checks into group B of the same subject → attendance `groupId` = A, `makeup` true; not
   enrolled in the subject → `err.notEnrolled`.
3. **Money:** pay without shift → `err.noShift`; open shift; pay cash 100 + vodafone 50; void the cash one → reversal row
   −100 with `voidOf`, second void → `err.voided`; generic `/api/commit` editing/deleting a payment → 403; shift close with
   wrong count and no reason → `err.diffReason`; with reason → diff saved; expected = opening + cash in − cash out.
4. **Fees:** session group: 3 visits × 50 − paid 100 = −50; month group 2 months; package 400/8 → after 3 visits, 5 left.
5. **Wallet:** top-up 300 cash, pay fee 120 by wallet, wallet 180; paying 500 by wallet → `err.walletLow`.
6. **Transfer:** old enrolment ends the day before (`status moved`), new active; capacity full → `err.groupFull`;
   school group > 25 or fee > 100 → `err.schoolSize` / `err.schoolFee`.
7. **Scopes:** a teacher-scoped user sees only his groups/students/payments in `/api/state`, `/api/c/*`; cannot check
   in a student into another teacher's session (`err.scope`); contacts hidden without `contacts.view`.
8. **Settlement:** teacher with `centerPct 20` + `rentSession 50`: revenue 1000, 4 sessions → centre 400; payout expense
   (category `teacher_payout`) lowers `remaining`; approve twice → one row `st-<id>-<ym>`.
9. **Handouts:** stock 10, sell 3 on "two PCs" (two commits based on the same version) → stock 4 after merge via
   `tests/cluster.py` (counter) — use `test_convergence` style.
10. **Import:** CSV with Arabic headers (`الاسم, الصف, رقم ولي الأمر, المجموعة`), Arabic digits, `اولى ثانوى` →
    preview rows, grade `S1`, mobile normalised, group matched; commit creates students + enrolments in ONE changeset;
    re-import → all `match`, nothing new.
11. **Delta:** version v → check-in → `/api/delta?since=v` returns exactly the attendance (+session) rows.
Fix every bug found in `center.py` with a regression test. Record findings in `DEVELOPMENT_HISTORY.md`.

**P2.3 Two-PC test** (`tests/test_multinode.py` style, add `CenterTwoPcTest`): PC A and B offline (proxy cut), the same
student checks in on both in the same session → after reconnect one attendance row; both PCs issue receipts → numbers
`R26-A-…` and `R26-B-…`, both kept; student codes from different ranges.

**P2.4 Messages helper (server).** `domain.message(kind, lang, vars)` is NOT needed — templates live in settings and are
filled in the browser. Add only `GET /api/c/wa?studentId=&kind=` that returns `{to: wa_number(parentMobile), text}` built
from `settings.waTemplates[kind][lang]` with vars `{student, group, date, amount, balance, center, link}` — requires
`messages.send` + `contacts.view`. Log each send as a `followups` row (`type whatsapp`, reason = kind) **on POST**
`/api/c/followup` from the page after opening wa.me (never on GET).

**P2.5 Parent link.** `POST /api/c/portal {studentId, replace?}` (permission `messages.send`): new nonce, `portalHash =
token_hash(link_token(linkSecret, studentId, nonce))`, save on the student, return `{url, waUrl}`; `GATE.kick()`.
Error `err.noGateway` when the mailbox is not configured. Revoke = `replace` with a new nonce.

**P2.6 Performance.** Cache `risk_list` and `dashboard` per `(store.version(), scopes)` for 30 s in `center.py`.
Add indexes if a query plan scans (`EXPLAIN QUERY PLAN`): `attendance(student_id, group_id)`, `payments(student_id, group_id)`,
`sessions(group_id, date)`. Target with the sample data (P4): `/api/c/card` < 150 ms, `/api/c/dashboard` < 400 ms,
`/api/state` < 1.5 s and < 6 MB.

### Phase P3 — Lists and settings pages
**P3.1 `lists.js` configs** (same pattern as Yousef `LISTS`): `subjects` (name, nameEn, color, order, active),
`rooms` (name, capacity, costPerHour, notes, active), `teachers` (name, mobile, subjects multi-select, grades
multi-select, settlement terms block: model select → shows the relevant fields rentMonth/rentSession/rentStudent/centerPct
with a live example "if he collects 10,000 EGP in 20 sessions with 300 visits, the centre gets …", color, bio, active),
`materials` (name, teacher, grade, price, cost, stock, active). Multi-selects: add `type:'multi'` to `U.field`.
**P3.2 Settings tabs:** `appearance` (keep), `centre` (systemName, logoText, receiptFooter, currency, academicYear),
`rules` (lateMinutes, doorEarly/Late, school mode numbers, risk thresholds), `lists` (subjects, rooms — tabs),
`messages` (WhatsApp templates per kind, both languages, with variables help and a live preview), `gateway` (parent links
— port Yousef `mailbox.js` and rename texts), `access` (users; "Teachers" instead of categories: the scope picker lists
teachers), `data` (keep). Each tab saves `settings` rows through `/api/commit` (`settings.edit`).

### Phase P4 — Sample data (`server/sample.py` + `tools/make_sample.py`)
Deterministic generator (`random.Random(2026)`), loaded on first start when the admin chooses "Try with a sample centre"
(Overview card → `POST /api/first-run` → if `loadSample` the page calls `POST /api/c/sample` which builds ops and commits
with `force` + label "Sample centre", every row id prefixed `smp-` so **"Delete all sample data"** (Settings → Data) can
delete exactly them in one changeset). Content (Egypt-realistic, fake names):
- Centre "سنتر النور التعليمي — مدينة نصر" / "Al-Nour Learning Centre"; 4 rooms (A 40 seats, B 30, C 25, Lab 20).
- Subjects: لغة عربية، رياضيات، علوم، لغة إنجليزية، فيزياء، كيمياء، أحياء، تاريخ، جغرافيا، فلسفة ومنطق.
- 8 teachers with different terms: 2 × `centerPct 20–30`, 2 × `rentSession 150–300`, 2 × `rentStudent 10–15`, 1 ×
  `rentMonth 3000`, 1 mixed (rentMonth 1500 + 10%); one primary teacher with a `home` group.
- 24 groups across P4–P6, M1–M3, S1 (bac), S2 (bac med/eng), S3 (thanaweya science/math/literary), evening slots 15:00–22:00
  Sat–Thu (realistic after the 2026 school-attendance rule), 3 fee types, 2 school-support groups (`kind school`, fee 60,
  cap 25), one deliberate full group, one half-empty group (so "merge" shows).
- 420 students: Egyptian first names × father names × family names (lists of ~60 each, both genders), parent mobiles
  `010/011/012/015` + 8 digits, 30 sibling families (`familyKey`, discount 10–25%), 6 orphans exempt, schools from a list.
- 1–3 enrolments per secondary student, 1–2 for primary.
- Attendance for the last 8 weeks: sessions from slots; 88% present, 7% late, 5% absent; 25 students with a fading
  pattern (absences growing, marks dropping) so the early-warning list shows ~15–30 students.
- Payments: session groups pay on ~80% of visits, month groups on the 1st–10th, packages bought every 8 sessions; methods
  70% cash, 18% Vodafone Cash, 9% InstaPay, 3% Fawry; 12 students with debts; 4 voided receipts with reasons.
- Shifts: one per working day per front-desk user (2 users), closed with 3 small differences (with reasons), today's open.
- Expenses: rent, electricity, salaries, printing, teacher payouts at month end.
- Handouts: 10 with stock; sales.
- Exams: weekly per secondary group (8 weeks), monthly per group; marks normal(68%, 15%) clipped; ranks.
- Follow-ups for 10 risky students. Settlements of last month approved for 6 teachers.
- Users: `owner` (Centre manager), `desk1`, `desk2` (Front desk), `t.ahmed` (Teacher, scope = his teacher id),
  `asst.mona` (Assistant). Passwords printed in the console and in `docs/GUIDE_ADMIN.md` sample section (`Hessa-2026!`),
  `must_change` on.
Test `tests/test_sample.py`: build twice → identical ops (determinism); load into a fresh server; `/api/c/dashboard`
numbers non-zero; risk list 10–40; profitability has every signal at least once; delete-all-sample leaves 0 rows.

### Phase P5 — The core screens (each: view file + i18n + browser test)
**P5.1 Door (`js/views/door.js`, route `#/door`)** — the most important screen.
Layout: left (start) column 60%: big search input (autofocus, `F2`), placeholder "Card code, name or mobile"; results
list (≤ 8) as big rows with code, name, grade, group chips. Keyboard: typing a full code (5 digits) + Enter = instant
check-in of the suggested session (a USB barcode/QR scanner types the code + Enter — this is the main input). Arrow keys
move, Enter picks. A camera button opens QR scanning **only when `window.isSecureContext`** (localhost or HTTPS) using
`BarcodeDetector` when available; otherwise hidden (the file-input fallback is not worth it at the door).
After pick → **student card** (right/end column 40%, also the result area on phones): photo-less avatar with initials,
name, code, grade/system/track badges, risk badge (if ≥ riskCall with reasons), today's candidate sessions as buttons
(own first; make-up marked), the suggested one pre-selected. One click "تسجيل الحضور / Check in" (or auto when the code
came from the scanner and there is exactly one `own && now` session — setting `autoCheckin`, default on).
Then money strip per enrolment: fee type, unit, balance (green credit / red debt), "Pay now" button prefilled with
`due` (or unit for per-session groups) → payment dialog (amount, method segmented control cash/vodafone/instapay/fawry/
wallet, ref for e-wallets, period for month groups) → `POST /api/c/pay` → print receipt option (58/80 mm thermal sheet
via `print.js`) and toast. No open shift → the dialog first asks the opening cash (`/api/c/shift/open`).
Also on the card: sell handout (quick list), top-up wallet, "message parent" (wa.me), open student file (panel).
Right side bottom: **today's sessions** strip (time, group, room, present/enrolled counter that ticks live) — click
opens the roster panel (P5.4). Sounds: short ok beep / warn buzz (WebAudio, setting `doorSounds`).
Offline note: the door works against the local server; if `/api/version` fails show a red "connection to the centre PC
lost" bar and disable writes (do not queue in the browser — the PC itself is the offline store).
Browser test: scan 3 codes by typing + Enter, second scan says "already checked in", pay with shift opening, receipt sheet opens.

**P5.2 Students (`students.js`, `#/students`)** — toolbar: search, grade filter, group filter, teacher filter (hidden for
scoped users), "debts only", "at risk only", count, buttons New student / Import (→ `#/students/import`) / Print cards.
Table: code, name, grade, groups (chips), parent mobile (if allowed), balance (sum over enrolments), last attendance, risk dot.
Row click → **student panel** (side drawer, tabs): Profile (form: name, gender, grade/system/track with dependent
selects, school, mobiles, parent name, familyKey "same family as…" picker, discount % + reason + exempt (only with
`students.discount`), consent checkbox + date (required for under-15 before saving — show the reason), notes, active);
Groups (enrolments with money, Enrol button → group picker filtered by grade/subject showing seats left and timetable,
Transfer, Leave); Attendance (calendar-like list, status badges, rate); Money (receipts with reversal for `money.void`,
wallet, Pay); Marks (exam, score/max, %, rank of N, sparkline); Follow-up (log + new call result); Parent link (create /
copy / WhatsApp / revoke). New student = same form; after save, offer "Enrol now" and "Print card".
**Cards print** (`print.js` `#/print/cards?ids=`): A4 sheet of 10 cards (85×54 mm) with centre name, student name, code,
grade, QR (`lib/qrcode.min.js`) of the code; and `#/print/receipt?id=` (thermal 80 mm) and `#/print/receipt-a5`.

**P5.3 Groups & timetable (`groups.js`, `#/groups`)** — tabs: Groups (table: name, teacher, subject, grade, slots summary,
room, enrolled/capacity bar, fee, kind badge, signal), Timetable (week grid Sat–Fri × 14:00–22:30 in 30-min rows, per room
columns toggle; group blocks coloured by teacher; clashes outlined red; drag-free — click a block opens the group),
Teachers (list from P3.1), Rooms. Group form (panel): name (suggest `<subject> <grade> <teacher> <day> <time>`), teacher,
subject, grade/system/track, kind (center/school/online/home — school shows the decree limits), room, slots editor (rows:
day select, start, end, room), capacity, fee type + fee (+ sessions per package), start/end dates, color, active.
Before saving call `/api/c/timetable/check`; if clashes → dialog listing them with "Save anyway" only for the
`teacher` clash (a teacher cannot be in two rooms → block) — **room and teacher clashes block, capacity warns**.
Group panel tabs: Students (roster with balances, bulk enrol from a pasted list of codes), Sessions (last 20 + upcoming),
Money (this month: collected, centre share, teacher net), Exams.

**P5.4 Roll call / session panel** (opened from door, groups, overview): header (group, date, time, room, status
held/cancelled, topic input); list of enrolled students with 4-state toggle (present/late/absent/excused) — default from
recorded attendance, absent if none; "All present" button; Save → `/api/c/roll`; "Cancel session" (confirm + reason) →
`/api/c/session`; "Message absentees" → sequential wa.me sender (P6.2).

**P5.5 Money (`money.js`, `#/money`)** — tabs: Today (my shift card: opening, cash in, cash out, expected, by method, receipts
list with reverse; buttons Pay, Expense, Hand over cash (expense `handover`), **Close shift** → count dialog with a
banknote helper (200/100/50/20/10/5/1 × count) → expected vs counted → reason if different → close → printable shift
report); Receipts (date range, method, teacher, user filters, totals by method, export Excel via `/api/xlsx`);
Expenses (list + add); Shifts (all shifts for `shifts.manage`: user, PC, opened/closed, expected, counted, diff badge,
reason; close someone else's open shift); Handouts (stock list, sell, restock = materials edit with `materials.manage`).

**P5.6 Exams (`exams.js`, `#/exams`)** — list (title, date, kind, groups, sat/of, average, pass rate); New exam (title,
kind, date, groups multi, full mark, questions + choices + answer key editor for bubble sheets, published toggle);
exam panel: marks grid (student, score input, absent toggle, Enter moves down, paste a column from Excel), ranking with
ties, stats, "Top 10 image" (P9.3), "Send results" (wa.me sequence), print results sheet, print bubble sheets (P9.1).

**P5.7 Overview (`overview.js`)** — greeting; KPI tiles: checked in today, sessions today (live count), collected today
(if money.view), at risk, debts total; "Now" strip: sessions running now with present/enrolled; getting-started list for
an empty centre (centre name → rooms → teachers → groups → import students → open the door) with "Try a sample centre";
attendance 28-day sparkline + money 28-day bars (inline SVG like Yousef reports.js); tips; system status (backup, sync,
parent links). Teacher-scoped user sees only his numbers.

### Phase P6 — Differentiators, part 1
**P6.1 Follow-up (`followup.js`, `#/followup`)** — "Call today" list from `/api/c/risk`: score bar, reasons as chips
(`risk.*` texts), last 6 marks of attendance as dots, balance, teacher, followed badge; actions: Call (tel: link) → result
dialog → `/api/c/followup`; WhatsApp (template `absence`/`payment`); open student. Filters: teacher, group, level.
Second tab "Debts": students with negative balance, sum, oldest debt, reminder sequence.
**P6.2 Sequential WhatsApp sender** (shared component `HS.waQueue(items)`): shows "3 of 17 — Ahmed Ali", buttons Open
WhatsApp (opens `https://wa.me/<to>?text=<encoded>` in a new tab), Mark sent (logs follow-up), Skip, Copy text, SMS
(`sms:<number>?body=`). Never sends automatically (no bans). Monthly report text per student: attendance rate, marks,
rank, balance, parent link.
**P6.3 Settlements (`settlements.js`, `#/settlements`)** — month picker; one card per teacher: collected, sessions,
visits, centre share (with the formula shown in words), school part, handouts, deductions, teacher net, paid, remaining;
buttons Approve (frozen record, shows "approved by X at Y"; recompute shows differences if data changed later), Pay out
(expense `teacher_payout` via `/api/c/expense`), Print statement (A4, both signatures). Teacher-scoped users see only
their own card (read-only).
**P6.4 Reports (`reports.js`, `#/reports`)** — month picker; sections: income by method/kind/teacher (bars), expenses by
category, net; attendance per day (line); new enrolments vs left; **profitability table** per group with signal badges
(`signal.full/merge/watch/loss/ok`) and a short text of what to do; shift differences; reversals; export everything to
Excel (`/api/xlsx`, sheets per section, headers in the user's language); presentation mode (slides from the data, like
Yousef `reports.js`).
**P6.5 School support groups mode** — already in rules; add a report "School groups statement" per school group and month:
students, sessions, collected, treasury 15%, teacher share, school share — printable for the school administration.

### Phase P7 — Parent link (gateway)
**P7.1 Worker:** keep `gateway/src/worker.js` routes `/t/:token`, `/api/card/:token`, office routes (HMAC). The card body
is the JSON from `gateway_client.card_for`. Disable driver-only routes (`/api/bind`, `/api/event`, `/api/photo`) by
returning 404 (keep code for later). Update `gateway/test/gateway.test.js` accordingly.
**P7.2 Parent page** (`gateway/public/index.html`, `app/app.js`, `app/style.css`, `app/i18n.js`): Arabic (Formal) default + English
toggle, light/dark by `prefers-color-scheme`, < 120 KB first load, works on old Android. Sections: child header (name,
code, grade, centre); per group: teacher, subject, timetable, money status (paid/owes/sessions left); last 30 attendance
as a calendar strip; marks list with rank "3rd of 42" and a small trend; payments; "last updated" time; no buttons that
change anything. Service worker caches the last card for offline viewing.
**P7.3 Office:** student panel "Parent link" tab (P5.2) + Settings → Parent links tab (port Yousef `mailbox.js`).
`docs/GATEWAY_SETUP.md` in Arabic (from Yousef, adapted). Tests: `tests/test_gateway_parent.py` with `gateway/dev/server.js`
(node) — push card, open `/api/card/<token>`, revoke → 404/410.

### Phase P8 — Tests and the daily scenarios (from the owner's brief)
`tests/test_e2e_center.py` (Playwright, Chromium at `/opt/pw-browsers/chromium` or `HS_CHROMIUM`), each in ar and en:
1. **Peak day at the door:** sample centre, desk1 logs in, opens shift (500), scans 30 codes in < 90 s, 2 pay, 1 make-up, 1 not enrolled → enrol → check in.
2. **Closing the drawer:** count with a 20 EGP shortage → reason required → shift report printed.
3. **Transfer:** move a student to a full group (error) then to another group; balances stay with the old group.
4. **Weekly exam:** create exam, paste 30 marks, ranking ties correct, send results queue shows 30 messages.
5. **Parent asks about his son:** search by parent mobile at the door → card → student panel → marks & attendance → parent link copied.
6. **Internet off:** nothing changes for the office (the server is local) — assert no request leaves `localhost` during
   tests 1–5 (Playwright route log); gateway down → Settings shows the mailbox waiting, door unaffected.
7. **Teacher login:** t.ahmed sees only his groups/students/settlement; money page hidden.
8. **Two PCs:** `test_multinode` scenario of P2.3 also through the UI if time allows.
Plus `ShellTest` (keep from Yousef, adapted), `SlidesTest` (both directions), design tests.

### Phase P9 — Differentiators, part 2
**P9.1 Bubble sheets.** Print (`#/print/bubbles?exam=`): A4, 4 black corner squares (15 mm), student code as 5 bubble
columns 0–9, questions in columns of 25 with choices A–D (or أ–د), exam title, QR of `examId`. Read
(`js/omr.js`, browser only): photo via `<input type=file accept=image/* capture=environment>` (works on HTTP LAN) or
camera when secure; downscale to 1600 px; grayscale; adaptive threshold; find the 4 corner squares (largest dark
square contours in each quadrant); perspective-warp to the template grid (homography from 4 points); sample each bubble
area (mean darkness); pick the darkest above a threshold, flag 0 or 2+ marks; read the code bubbles → student; grade with
`center.grade_answers` logic (port to JS) → show a review screen (student, answers, flags, score) → Save → `/api/c/marks`
with `answers` and `via 'omr'`. Test with generated sheets (render the print page, rasterise with Playwright screenshot,
add rotation/blur noise) → ≥ 98% bubbles correct.
**P9.2 AI exam generator (optional, needs the owner's API key) - built (review G04): `server/ai.py`, Settings -> AI questions, Question bank -> Generate with AI; the model id was checked against the current model list before use.** Settings → AI: API key stored in `gateway.json`-like
local file `ai.json` (never in the shared DB, never logged). `POST /api/c/ai/questions {subject, grade, system, track,
topic, count, type}` calls the Claude Messages API (`https://api.anthropic.com/v1/messages`, model `claude-sonnet-5-5`,
`urllib.request`, timeout 60 s) with a prompt that requires the Egyptian curriculum and JSON output
`[{q, choices[4], answer, explanation}]`; validate JSON; the teacher edits/accepts each question; accepted ones go to a new
`questions` entity (add: subjectId, gradeCode, topic, text, choices[], answer, explanation, source 'ai'|'manual', teacherId)
and can be added to an exam (prints the paper + answer key). Without a key the page explains how to enable it. Offline →
clear error. Read the `claude-api` skill before writing this.
**P9.3 Teacher marketing.** "Top students" image (canvas 1080×1350, centre colours, teacher name, exam, top 10 with marks)
→ download PNG; certificate A4 (print) per student; teacher page in the parent gateway (`/p/<slug>`: bio, subjects,
groups with free seats, WhatsApp booking link) pushed as a public card (no student data).
**P9.4 Video protection (backlog, only if the owner asks):** watermark overlay with student name + code moving every
20 s on a gateway video page; device limit 2 per student. Needs video hosting decision — ask the owner first.

### Phase P10 — Docs and delivery
- `README.md` (what it is, how to run, how to test), `CLAUDE.md` + `AGENTS.md` (rules — already written), `.claude/skills/hessa/SKILL.md`
  (short working memory, like Yousef's skill), `docs/DESIGN.md` (copy Yousef's, change names/glossary), `docs/RELEASE_NOTES.md`.
- Guides in simple **Egyptian Arabic**, one page each with screenshots: `docs/GUIDE_OWNER.md` (setup, teachers' terms,
  settlements, reports, users), `docs/GUIDE_DESK.md` (door, payments, closing the drawer), `docs/GUIDE_TEACHER.md`
  (groups, roll call, exams, follow-up), `docs/GUIDE_ASSISTANT.md` (roll call, marks, bubble sheets, calls),
  `docs/GUIDE_PARENT.md` (what the link shows), `docs/OPERATIONS.md` (for future sessions: architecture, commands, ports,
  data folders, backups, how to add a field, how to add a page).
- Help page (`help.js`): 15+ Q&A in both languages per role; tour steps per page.
- Installer: `tools/build_windows.py`, `installer/hessa.iss`, `.github/workflows/build.yml` — update names, test list
  (`test_unit test_convergence test_design test_center_domain test_center_api test_sample test_xlsx test_formats
  test_multinode test_e2e_center` + gateway node tests). Windows build is verified only by CI.
- Version `server/version.py` → `0.1.0`, PRODUCT `Hessa`, LICENSE_NOTE "Licensed to the centre that installed it…".

---

## Part F — Exact conventions for code

- **A page:** `js/views/<id>.js`, an IIFE, `var HS = window.HS, U = HS.ui;`, `HS.views.<id> = HS.withData({ render(ctx) → html string, mount(root, ctx) })`.
  Escape every value with `HS.esc`. Events by delegation on `root`. Route query in `ctx.route.q`. Navigate with `HS.go('students?grade=S3')`.
- **A side panel:** `HS.panel.open({title, body, footer, mount(el)})`. **A dialog:** `HS.dialog({title, body, footer})`,
  confirm with `U.confirm({title, body, danger, ok, reason})` (reason ≥ 3 chars).
- **Saving a list record:** `HS.data.commit(label, [{e, id, op:'put', ver, row}])`; label in English (it goes to the history).
- **Calling an operation:** `U.run(HS.post('/api/c/pay', body), 'pay.done', btn).then(...)`; errors: `U.errorText(e)` must
  prefer `HS.t(e.data.key, e.data.vars)` when `e.data.key` exists — implement this in `ui.js` (P1.3).
- **Server operation:** in `center.py`, signature `def op(ctx, …)`, first line `ctx.need(perm)`, scope check
  `ctx.need_teacher(teacher_id)`, errors `raise Problem('err.<name>', 'English text', **vars)`, one `ctx.commit(label, ops)`.
  Add the route in `app.py` `center_get`/`center_post`. Generic `/api/commit` permissions live in `app.required()`.
- **New field:** add to `store.ENTITIES` (js, column, kind, Excel header) → the table gets the column automatically
  (ALTER TABLE in `_migrate`) → after the first release raise `journal.SCHEMA` and `sync.SCHEMA_VERSION`.
- **New permission:** `auth.PERMISSIONS` + profiles + `perm.<id>` in both dictionaries (test enforces).
- Python style: like the existing files (4 spaces, 150-char lines, docstrings that say *why*). Run `python3 -m pyflakes server/*.py`.

---

## Part G — Checks before every push
```
cd /home/user/Teachers
node --test tests/test_frontend.js                                                # startup asset/order regression
python3 -m pyflakes server/*.py tools/*.py tests/*.py
python3 tools/build_windows.py --check                                            # every file the installer ships
cd tests
python3 -m unittest test_unit test_convergence test_design test_ci test_center_domain test_center_api test_center_review test_center_remote test_qbank test_ai test_xlsx test_integration   # always (~2 min)
python3 -m unittest test_sample test_multinode test_gateway_parent test_recovery                                  # before a PR (~5 min)
HS_CHROMIUM=/opt/pw-browsers/chromium python3 -m unittest test_e2e_center test_e2e_browser test_acceptance        # when screens changed
cd ../gateway && node --test --no-warnings test/gateway.test.js                                                   # when gateway changed
grep -rn "trip\|Trip\|vehicle\|driver" js server --include=*.js --include=*.py | grep -v "^server/\(sync\|journal\|replica\)"   # only "strip"
```
Run the app: `cd server && python3 app.py` → http://localhost:8095 (first start on the PC itself creates the admin).
Never run `playwright install`; never edit `server/` or `js/` while multi-PC or browser tests run; kill test servers by PID.

## Part H — Pitfalls (inherited + new; add every new one)
- Record ids random, never count+1; numbers carry the PC letter; the deterministic ids of C4 are the only exception.
- GET must never change state (WhatsApp link previews fetch links). Sessions become real only on a POST check-in.
- `<meta name="referrer" content="no-referrer">` breaks the Origin check of POSTs (BAMS lesson).
- The browser camera (`getUserMedia`, `BarcodeDetector`) needs a secure context: works on `localhost`, NOT on
  `http://192.168.x.x`. Use the file input (`capture=environment`) for bubble sheets on phones over the LAN.
- Arabic digits in any input: normalise on the server (`domain.digits`, `norm_mobile_eg`).
- Egypt week starts Saturday: `domain.weekday()` (0 = Saturday). JS `Date.getDay()` is 0 = Sunday → convert `(d + 1) % 7`.
- Money: never `float` sums for display without rounding to 2 decimals; never a stored running balance.
- Money is **one account per student + group** (`domain.account`): several enrolments of the same pair (left and came back)
  share visits, months and receipts; the balance sits on the latest enrolment, earlier ones say `carried`. Never compute a
  balance from one enrolment alone, and never drop ended enrolments with money still open from debt lists (`center.open_accounts`).
- Prices are dated: a group's fee change keeps the old price in `feeHistory` from the day before `feeFrom` (sent on the
  generic-commit op, default today). Only the server writes `feeHistory`. Each visit/month is priced on its own day.
- A temporary timetable is expanded by `domain.expand_temp` for clash checks (regular before, temporary during, regular after, same group id) and
  read by `domain.slots_on`; never read `group.slots` directly to know what meets on a day.
- Free trial rows (`attendance.trial`) are free only if they are the earliest trial of that student in that group (`FREE_TRIAL_ONLY_FIRST`).
- Inside RTL, `inset-inline-start: 50%` + `translateX(-50%)` pushes the element off screen — centre with `inset-inline` + grid.
- A scoped teacher user must never receive other teachers' rows — filter on the server (`store._filter`), not in the page.
- Parent numbers: never in the parent card, never in logs, only with `contacts.view`.
- The state is windowed (75 days) — pages that need older data must use the `/api/c/*` reads.
- Lock order: `store.lock` → `journal.lock`, never the reverse.
- RTL: never `left/right`; mirror arrows; numbers/codes LTR inside Arabic text.
- This repository is public: never commit real student names, phone numbers, the owner's files or secrets.
- Every `HS.x()`, `U.x()` or `D.x()` a page calls must exist: the Activity log called `HS.pageHead` and crashed on open for months
  (`test_design.HelperCallsTest` now checks it). Every page needs a browser test that opens it.
- Anything that shows history values (`before/after/changes`) goes through `store.mask_audit_row`: phone fields are hidden without
  `contacts.view`, parent-link secrets for everybody; a typed phone number never searches those columns for such users.
- Spreadsheets are written with `U.csv` + `U.download` (BOM for Excel, a leading `= + - @` is neutralised so a typed name never runs as a formula).
- Grid/flex children need `min-width: 0` (`.stack > *`): one wide table otherwise stretches the whole page on a phone.
- A PC can join only while the owner has opened the adding window (`/api/devices/adding-open`); tests must open it before `/api/join`.
- `upgrade.py` runs before the databases are opened and writes `program.json`; a new `SCHEMA` needs an entry in its migrations, and
  the list of files it copies is `DB_FILES`. Data from a newer schema is refused, never touched.
- The page CSP forbids `eval`: Playwright `wait_for_function("...")` with a string fails - poll from Python (`wait_until`).
- Undo of a change is a normal permission-checked save of the earlier values (`HS.audit.undo`), limited to plain fields; money,
  fee history, timetables and codes keep their own screens and rules.

## Part I — Owner decisions log
| Date | Question | Answer |
|---|---|---|
| 2026-10-04 | Approve research + product spec (docs/01, 02) | **Approved ("i agree all")** |
| 2026-10-04 | Design | **Exactly like Yousef-Transportation**; learn from Mr.Ayman-HR and opening-nerp-tcode (methods: rules file, history with lessons, playbook, evidence before "done") |
| 2026-10-04 | Themes / languages | **Light and dark; English and Formal Arabic** |
| 2026-10-04 | Who continues | Plan written for other agents (Sonnet 5.5, ChatGPT) to complete |
| 2026-10-04 | GitHub integration | Owner explicitly authorized push, merge and main synchronization for this iteration; preserve remote work and local private files |
| 2026-10-05 | Usability | **All main control in the dashboard**, a guide and an advisor; web app usable on Android and iOS phones (home-screen manifest, tab bar); design and richness of Yousef-Transportation + Mr.Ayman-HR |
| 2026-10-05 | Learn from Mr.Ayman-HR: admin system, never-deleted database, connection abilities, advanced features; add what Hessa lacks | Ported and extended (TASKS A1–A13). Not ported: BAMS office mode (a browser on the centre PC's address does the same); join stays closed until the owner opens it |
| open | Product name «حِصّة / Hessa» | default: keep |
| open | Price model in the app (licence check) | default: not in v1 |
| open | AI key, video hosting | default: features hidden until configured |
| 2026-10-05 | Remote work (owner: run on the client PC, work from phone or another PC over the internet) | Outbound tunnel (Tailscale recommended, Cloudflare Tunnel alternative), no own relay; remote work off until switched on at the centre, only `remote.use`; a laptop with its own copy covers the PC being off (`docs/REMOTE_ACCESS.md`) |
| 2026-10-05 | Version | 1.1.0 (continues after the engine's 1.0.2, never lowered) |
| open | Discount/exemption changes: from today, or retroactive? | default: retroactive (as before); recommended: from today |
| open | Forgive the debt of a student who left for good | default: no — the debt stays visible, marked “left” |
| open | Monthly groups during the mid-year break (23 Jan – 4 Feb 2027) | default: full months are charged |
| open | Joining a month group late: from which day is “next month” the default | default: day 21 |

### P2 implementation evidence (2026-10-04)
Domain/API regression modules cover centre operations through real local HTTP. `test_center_multinode` checks signed offline merging,
`test_center_network` exercises real process/proxy partitions, and `test_sample` checks response benchmarks. Money and attendance must
use dedicated /api/c operations, never generic commits. Hardware/account acceptance still follows TASKS.md.
