# Development History and Lessons Learned

Newest first. Every change adds an entry: what changed, why, mistakes, lessons.

## GitHub synchronization lint prerequisite (2026-10-05)

**Why:** the owner requested publishing the committed work and synchronizing GitHub main.
**What:** remove an unused browser-test import so the mandatory Python lint gate can pass.
**Lessons:** verify an isolated committed snapshot when another session is editing the workspace;
publish only the reviewed commits and preserve uncommitted work and private local files.
**Evidence:** frontend 18 passed; gateway 15 passed; Python lint passed. Browser discovery
skipped 16 tests because the configured Chromium path was unavailable. The engine, centre,
sample and two-PC gate passed: 153 tests in 408.687 seconds, with two existing skips,
against the isolated committed snapshot.

## The front desk works (2026-10-05)

**What:** `door.js` – big search (code, scanner, name, mobile), student card with risk, today's candidate sessions,
one-click or automatic check-in on scan, fees per enrolment, pay dialog that opens the cash shift first, receipt print
(80 mm, `HS.printReceipt`), today's sessions strip and a roll-call panel (`HS.openRoster`). Pages can declare
`selfRefresh` so another PC's write no longer redraws the door while someone is typing.
**Mistakes:** the attendance buttons used the class `present`, already the full-screen presentation overlay – an
invisible layer covered the page (found by the browser test). A repeated scan only beeped; it now also says so.
**Evidence:** test_e2e_center 3 OK (Chrome), frontend/startup green, test_center_api + test_design 41 OK.

## Command centre, advisor and phone shell (2026-10-05)

**Why:** the owner found the app hard to use: nine of the twelve pages were placeholders and the overview was two plain
tables. He asked for "all main control in the main dashboard", a clear guide and advisor system, and a web app that
works on Android and iOS phones, with the look and richness of Yousef-Transportation and Mr.Ayman-HR.
**What:** the overview became a command centre (greeting, six live figures, quick actions, sessions now and next,
28-day SVG charts, a getting-started checklist, tips). A server advisor (`center.advice`, `GET /api/c/advice`) ranks
what needs a person today – clashes, stale or missing cash shifts, forgotten roll calls, students at risk, debts, full and
thin groups, low handouts, unapproved settlements, missing parent numbers, setup steps – each with the page that fixes it.
It reads only, respects permissions (money advice needs a money permission) and teacher scopes. Phones get a bottom tab
bar, a "connection lost" pill, a home-screen manifest with generated icons (`tools/make_app_icons.py`, stdlib PNG) and an
"Open on phone" dialog with a QR of the centre address. The merge left pending by the previous session was concluded.
**Mistakes:** HS.t already escapes the values it fills in; wrapping it in HS.esc showed "&amp;" (caught by the new
frontend test). The first open-shift rule looked at any open shift in the centre; shifts belong to one user on one PC.
Arabic names inside English advice lost their order until wrapped in `<bdi>`. A dashboard timer kept node tests alive.
**Evidence:** Python gate 144 tests (test_23 added), design 17, frontend 19 – all green. Visual check with Playwright +
Chrome: Arabic/daylight and English/night, desktop 1440 px and phone 390 px, no console errors.
**Lessons:** never escape the output of HS.t; per-user state (shifts) must be checked per user; full-page screenshots
can freeze entry animations – check live DOM state before calling a layout broken.

## Combine remote work and prepare main synchronization (2026-10-04)

**Why:** the owner explicitly requested push, merge and synchronization with GitHub main.
GitHub had only the session branch, with an independently written remote server/test commit.
**What:** preserve both histories in a merge. Keep the stronger local atomic/scoped money/contact protections;
include remote Arabic spacing search and month validation improvements, formats cleanups and ApiError.key.
Preserve all three remote test modules under distinct names. Adapt their import scenario to require correction
of invalid phones and mismatched grades before saving; rejection remains atomic. Both import help translations
now explain grade matching. Remove unused imports/variables reported by the newly available development linter.

The inherited CI selectors referenced deleted trip/driver modules. Replace them with current engine, centre,
sample, Excel and local/remote two-PC suites plus frontend/gateway checks and lint. Regression tests verify
selected module existence and tag-only installer publication. Installer building remains manual/tag-triggered
until delivery is complete; ordinary main merges do not publish an unfinished product release.

**Evidence:** combined Python gate: 151 tests in 252.963 seconds, OK (two existing skips). Frontend: 17 passed.
Gateway: 15 passed after running outside the sandbox to permit its bundle-build subprocess.
Pyflakes now runs from an ignored local development dependency and passes across server/tools/tests.
Final post-lint targeted verification is recorded below when complete.
GitHub access verified using existing credentials held in memory; no token stored in source or output.
The configured proxy timed out on API TLS; a direct per-command API connection worked without system proxy changes.

**Limits:** browser visual/acceptance and real owner-data checks remain pending, as already recorded in TASKS.md.
Legacy trip browser/file-format/multinode scenarios still need domain migration; they are not represented as
centre acceptance evidence. No claim that P5–P10 or the final installer is complete. The owner's untracked file,
local admin account, sample data and other runtime files are excluded from GitHub.

**Lessons:** fetch before publishing: remote work may have diverged even when the local tree is clean.
Resolve overlapping security fixes by their behavior, preserve independent regressions, and validate them together.
An explicit owner request authorizes main integration for this operation despite the default no-main-push rule.

## Fictional centre and safe real-student import (2026-10-04)

**Why:** the owner requested sample data to test daily logic and an import path for real records.
**What:** deterministic sample centre with 420 students, 24 groups, eight teachers, four rooms,
eight weeks of attendance/fees/exams, cash differences, reversals, school-group settlements and all profitability signals.
Sample business ids have an `smp-` prefix, including deterministic attendance/marks/settlements; regular ids are unchanged.
The timetable allocates room/teacher slots without clashes. Sample codes skip existing and archived codes.
Sample settings preserve explicit centre settings. Overview and Settings → Data load/archive only sample records;
sample accounts use normal signed creation, mandatory password changes, and disable/re-enable on removal/reload.
Account authority is required before either lifecycle operation touches business records.
Added editable/selectable spreadsheet preview, atomic save, contact permissions, scoped matching, phone/grade/group/capacity
validation, preserved consent, batch deduplication and re-import idempotence. Existing matched profiles remain unchanged.
Both languages, sample/admin guides, CSV template headers and a local-only CLI are included.

**Evidence:** broad gate: 107 Python tests in 308.380 seconds, OK (two existing skips), including real process/proxy
two-PC partition checks. Frontend: 17 tests passed, including preview without writes, cancelled confirmations,
HTML escaping, permission controls and dashboard retry. Sample benchmark: card 71 ms, dashboard 158 ms,
startup 461 ms / 4,239,183 bytes; 26 warning students and all five profitability signals.
AST syntax check: 45 Python files parsed; pyflakes remains unavailable. Final authority-guard/lifecycle/design check:
21 tests in 112.521 seconds, OK; under concurrent local loading, benchmarks remained within limits (85/257/785 ms).
Local owner app loaded 420 sample students, 384 sessions, 7,792 attendance rows, 3,218 receipts, 168 exams and 3,101 marks;
administrator login verified; all 18 signed-history entries verified with no problems. Runtime data is ignored by git.

**Limits:** no actual owner spreadsheet has been supplied, so no claim of testing real owner data.
Chrome visual/keyboard/mobile checks remain pending because browser inspection transport is unavailable;
Node flow tests are not browser evidence. Overview is an incremental dashboard, with the rest of P5.7 still unticked.
P5–P10 remain incomplete. No push or complete-app readiness claim.

**Lessons:** generated ledger rows need the sample prefix for safe removal; manual receipts must use normal reversals.
Sample accounts should be disabled, not deleted, because deleted usernames are permanently reserved by the engine.
Account updates require the complete current public record and version; re-enabling needs an explicit password reset.
Import preview must enforce the same teacher/contact boundaries as a save, and duplicate rows must share reserved ids/codes.
Initial targeted verification caught two untranslated new server errors; both dictionaries were corrected and rerun.
Repository review found that NASCA converted a generated `.csv` template to an encrypted binary on this machine;
the template is provided as plain-text headers in the guide instead. The generated binary was excluded and removed.

---

## Centre lists and settings forms; real two-PC centre test (2026-10-04)

**What:** subjects, rooms, teacher terms and handout list editors use audited optimistic saves and soft deletion.
Shared multi-select fields retain arrays and check required selections. Teacher terms show conditional fields and a live settlement
example; switching models clears unused terms. Settings now edits centre details, rules, all six message templates in EN/Arabic,
with an escaped live preview. Appearance, user access and data tools remain available. Parent gateway settings saves the URL,
generates keys, tests connectivity and explicitly reveals the private setup code only to an authorised unscoped user.
Status responses expose no secrets; secrets stay in the local gateway file. Rule numbers and teacher terms reject invalid values.
Users without contact permission do not get a phone editor; omitted hidden contact fields survive generic saves, and attempts to
change them are rejected. No user password or account data was added to source control.
**Verification:** Node frontend 14 passed; centre/domain/design/in-process two-node checks 57 passed in 32.591 seconds.
The new real HTTP/TLS two-server proxy test passed in 23.767 seconds: both PCs scanned and took payments offline, then converged
with one attendance row, both unique receipts, distinct student codes, stock 4 and valid complete signed histories.
**Mistakes and lessons:** Windows Popen cannot send SIGINT. The harness now terminates and waits on Windows; restarted servers
retain committed journal/WAL data. The network test registers cleanup even when setup fails. Multi-select rendering must be paired
with array reading. Shared password policy is unchanged; the owner's requested local account was provisioned separately.
**Final gates:** 100 Python tests in 204.187 seconds: OK (2 existing skips); Node frontend 14 passed; Python AST checked 42 files; git diff --check passed. Pyflakes is not installed.
**Limits:** Chrome visual/keyboard checks remain pending. The full product still requires P4–P10 and no readiness claim is made.

## Centre server hardening and daily-operation regressions (2026-10-04)

**Why:** P2 operations had no domain-specific HTTP evidence, and screens must rely on correct scoped money and attendance.
**What:** table-driven domain tests and real HTTP scenarios for peak scanning, make-up sessions, all fee models, cash shifts,
reversals, wallet, transfers, scopes, settlement, handouts, Arabic CSV import, deltas, messaging and parent-link replacement.
Generic commits reject money/attendance/shift/settlement writes even for administrators. Batch student codes reserve each assigned
code under the same lock as commit. State and delta redact contacts; door candidates, balances and warnings obey teacher scopes.
Scoped enrollment deltas request a full refresh when student visibility changes. Scanner repeats keep the original status even
when the student scans again after the late threshold. Roll calls reject unenrolled students and cancelled sessions.
Money operations validate finite amounts and hold the store lock across balance checks and writes; concurrent wallet spends cannot
overdraft. Handout payments check teacher scope. Transfers end the old enrollment the previous day. Package counts avoid price
rounding loss, inactive groups do not generate capacity warnings, and alphabetic phone input is invalid.
Added permission-checked WhatsApp text and parent-token APIs, versioned bounded caches and composite attendance/payment/session indexes.
Windows rebuild now closes its SQLite reader before renaming the database; the existing disaster-recovery regression proves the fix.
**Evidence so far:** 54 targeted domain/API/design/two-node tests pass (32.869 seconds) before the final scanner/visibility additions.
The Windows tools checks also passed. Final combined run: 97 tests in 179.421 seconds, OK (2 existing skips); Node frontend: 11 passed. No push or production-ready claim.
**Limits:** real network partition scenario, sample performance benchmarks and Chrome verification remain pending; parent worker/page
migration and persistent revocation of previously published cards remain P7 work.
**Lessons:** API fixtures must send structured settings values and current record versions. Atomic numbering alone is insufficient:
wallet checks must be inside the transaction lock. Windows SQLite context managers commit/rollback but do not close connections.

## Centre shell, translations and incremental refresh (2026-10-04)

**Why:** P1.2–P1.6 still used the previous domain and reloaded all data on every remote write.
**What:** centre navigation and permission-aware quick actions; student/group palette records; N, comma, G and F2 shortcuts;
graduation-cap branding and centre onboarding; shared money, grade, attendance and translated-error helpers.
Startup loads only state; subsequent two-second polls merge delta rows and removals, with full-state fallback when requested.
Open editors defer repaint until the last panel/dialog closes; requests started before logout cannot restore the old session's data.
Reset EN/Formal Arabic dictionaries, translate all centre permissions/errors/vocabularies, and convert access scopes to teachers.
Replaced inherited overview/list content with explicit centre scaffolds until their scheduled tasks; settings retains appearance,
access and data tabs, with safe pending content for the remaining tabs. Appearance swatches use CSS tokens.
**Verified:** node --test --test-isolation=none tests/test_frontend.js: 11 passed.
python -m unittest discover -s tests -p test_design.py: 15 passed.
Design checks now cover the declared startup files, unique dictionary keys, centre vocabularies and server error translations.
**Limits:** Chrome screenshots and the two-context refresh timing scenario remain unticked. Server hardening and functional
screens follow in P2–P7. No claim that the complete app is ready; no push until all required checks pass.
**Lessons:** use the actual permission money.collect, not an invented permission name. Contact searches need permission
even when a page already holds a record. Logout must invalidate asynchronous reads, and closing a panel must flush deferred updates.

## Startup assets and centre page scaffolds (2026-10-04)

**Why:** P1.1 loaded deleted trip view files, and the prescribed script order would load centre views before their data wrapper existed.
**What:** replaced the body script list with the exact P1.1 order; retained the pre-paint boot script; added eleven translated,
read-only centre page scaffolds; changed the favicon to a graduation cap and corrected the bilingual noscript notice.
Moved `HS.withData` from the list editor to shared UI, with accessible loading status and a retry state on load failure.
**Tests:** `node --test --test-isolation=none tests/test_startup.js`: 3 passed. Executes the actual startup order,
checks both dictionaries and placeholder rendering, and exercises failed loading followed by retry.
`git diff --check`: passed.
**Required checks:** `python -m unittest test_unit test_convergence test_design test_center_domain test_center_api test_xlsx`
outside the sandbox: 56 tests, 2 failures, 4 errors, 2 skipped (112.940 s). Failures: the Windows rebuild command cannot
rename an open database (WinError 32), and centre permissions are not yet translated (P1.5).
Errors: two design checks still read deleted trip views (P1.6), and the P2 centre test modules do not exist yet.
Browser command: 14 tests, 1 error (missing `test_e2e_center`), 13 skipped (configured Chromium path unavailable).
Pyflakes unavailable in this Python installation. Old-domain scan: 432 matches in 22 files, to be removed in remaining P1 tasks.
No gateway changes, so its tests were not required. Sample tests do not exist yet; no PR was prepared.
**Limits:** this repairs startup assets, not the complete shell. Navigation, palette, overview, settings and dictionaries still
need their planned conversion. No Chrome visual verification or claim that P1 is complete. Nothing pushed while checks are red.
**Mistakes and lessons:** ordinary Node test isolation cannot spawn in this sandbox; use `--test-isolation=none`.
Python temporary directories remained inaccessible even under the workspace; re-running the existing suite outside the sandbox
removed those permission errors. Shared page helpers must be defined before the earliest page in the declared script order.
The owner's current-session instruction is to respond in English.

## Execution plan for the next agents (2026-10-04)

**Why:** the owner asked for a complete, exact plan so other agents (Sonnet 5.5, ChatGPT) can finish the build.
**What:** `docs/EXECUTION_PLAN.md` (state, data model, API, design + Formal Arabic glossary, phases P1–P10 with exact files,
tests and acceptance), `TASKS.md`, `CLAUDE.md`, `AGENTS.md`.
**Verified at this point:** `import app` starts and creates the 17 tables; engine tests `test_unit test_convergence test_xlsx`
pass (42, 3 skipped). `test_design` fails as expected (it still lists the deleted trip views; fixed in P1.6).
**Not verified:** nothing in `center.py` / `domain.py` has run under a test yet.

## Fork and centre domain (2026-10-04)

**What:** copied the engine of `coolman1984/Yousef-Transportation` (commit 9f5ef29); renamed (HS namespace, ports 8095/8463,
`center.db`, `HS-*` hash domains, new installer AppId); removed the trip domain; wrote the centre data model, permissions
and profiles, `domain.py` (pure rules), `center.py` (operations and reads), the `/api/c/*` routes, `/api/delta`, and a
parent-card gateway client.
**Decisions:** money computed, never stored as a balance; receipts/expenses append-only with reversals; deterministic ids
for sessions/attendance/marks/settlements so two offline PCs merge; PC letter in document numbers; student code ranges per PC;
attendance `groupId` = the student's home group (make-ups are charged to the home group); state windowed to 75 days + delta refresh.
**Mistake:** the owner stopped the session before the screens; the work was committed as WIP so nothing is lost.
**Lesson:** for a domain with many writes per minute (the door), the Trip Orders "reload the whole state on every change"
pattern does not scale – the delta endpoint is required before the door screen is built.
