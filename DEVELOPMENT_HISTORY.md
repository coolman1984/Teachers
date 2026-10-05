# Development History and Lessons Learned

Newest first. Every change adds an entry: what changed, why, mistakes, lessons.

## Review findings on the trial, day-off and reference features (2026-10-05)

**Why:** an automated review (Codex) of the merged PR raised four findings; each was checked against the code and was right.
**What:** (1) "Day off" cancelled a held session where everyone was absent (it only counted present students) - a session
that was held or has any attendance row is now kept, so its absentees stay in follow-up. (2) The door's one-click "Enrol
in this group" skipped the late-join choice - it now uses the same default (next month after day 20, monthly groups).
(3) Two PCs offline could each record a free trial in a different session, and both stayed free after syncing - both visits
are kept (nothing is lost) but only the EARLIEST trial (date, then id, identical on every PC) is free when charging.
(4) The "this reference was already used" confirmation stayed on for the whole dialog - it is now cleared when the reference
or the method changes, so it confirms only the value that was shown.
**Mistakes:** my own new browser scenario opened the cash shift, which broke an older scenario that expected to open it
(test-order coupling, found by the full run; both now accept an already-open shift).
**Evidence:** each fix has a test that fails on the code before it (day-off API, two-node offline trial, Chromium duplicate
reference, frontend default); Python gate 169 OK in 216 s (3 skips); frontend 19; browser test_e2e_center 13 OK; lint clean.
The PR was merged while this was being finished, so these fixes go in as a follow-up change.

## Free trial, moving credit, family payments, repeated references (2026-10-05)

**Why:** the owner agreed on the defaults and asked for the remaining edge cases of the market study.
**What:** a free trial session at the door (one per group, `attendance.trial`, never charged and not counted as revenue
visits); prepaid credit moves to another group of the same teacher as two linked non-cash receipts (`method transfer`,
cannot be used for payments or reversed, the drawer is untouched), offered right after a transfer; a family payment
saved as one commit with consecutive receipt numbers (`pay/many`, all-or-nothing); a transfer reference already on a live
receipt is flagged once and saved only when confirmed (a reversed receipt frees its reference). `pay()` was split into a
builder and a commit step so the family payment reuses every existing check.
**Mistakes:** a numbering helper has no "next number" argument, so the second number is derived from the first inside
the same lock; an interrupted edit left half the trial UI unapplied (re-checked the tree before continuing).
**Limits:** the sibling payment screen is not built yet (server and tests only); no temporary Ramadan timetable or extra
make-up session yet. Browser coverage for trial and credit screens is by API tests, not a Chrome scenario.
**CI repair:** the workflow ran `node --test --test-isolation=none`, a flag Node 22 rejects, so the `test` job failed in 7 seconds on
every run before any test started; the flag is dropped (the frontend tests pass without it) and `test_ci` follows.
**Flaky test fixed:** `test_door_and_owner_pc_offline_together` assumed the owner PC is always PC "A". PCs are ordered by
`enrolled_at` (one-second resolution) then random id, so two PCs enrolled in the same second - a fast CI runner - swap
letters. With tied timestamps the old assertion failed 5 of 8 runs on untouched `main` code; the product ordering is
consistent on every PC (no duplicate codes), so the test now checks that each PC's codes come from the range of its own
receipt letter (8 of 8 under the same conditions).
**Evidence:** Python gate 167 OK in 206 s (3 skips); performance card 46 ms, dashboard 151 ms, state 496 ms; frontend 18;
browser test_e2e_center 12 OK; pyflakes clean.

## Field edge cases: money that survives a real school year (2026-10-05)

**Why:** the owner asked to re-check the Egyptian market and prepare the app for the deep edge cases of a real centre.
The market re-check (school calendar 2026/2027, the mid-year break, InstaPay fees, holidays) and a read of the fee code
found that the money rules broke on things every centre does in its first term. Catalogue: `docs/01-research-report.md` §6.
**Bugs found (each now has a regression test that failed before the fix):**
- A teacher raising a group's price rewrote every old debt at the new price. Prices are now dated: the server keeps
  `feeHistory` (a page cannot forge it), the group form asks "the new price applies from" (1st of next month for
  monthly groups), and each visit or month is priced on its own day.
- A student who left a group with a debt vanished from the debts list, the dashboard total and the door.
- A student who left and came back to the same group had visits and receipts counted twice (a false credit for
  monthly groups). Money is now one account per student + group (`domain.account`); old enrolments say `carried`.
- A mid-month move between two monthly groups charged that month twice; the new enrolment now bills from next month.
- In Arabic (the default language) every toast sat half off a phone screen: `inset-inline-start: 50%` flips side in
  RTL while `translateX(-50%)` does not.
**Added for the door and the desk:** enrol a walk-in from the student's card; first month "this / next" when joining a
monthly group late (default next from day 21); cash received → change to give back; a typo guard for amounts over
three times the fee (receipts can only be reversed); "Day off…" cancels a whole day's sessions (holiday, power cut,
exams) while keeping attended ones; the advisor flags monthly students who stopped coming but are still charged; four
new help questions.
**Mistakes:** an `@cached_read` decorator slid onto a new helper during an edit (500 on `/api/c/balances`, caught by
the test); one test expectation had wrong arithmetic (fixed the test, not the code); a new test class first inherited
every parent test (split into a fixture class).
**Lessons:** derive money per student + group, never per enrolment; any value a balance depends on (price, discount)
must be dated or it rewrites history; check every centred fixed element in RTL on a phone.
**Open (owner decisions, defaults in EXECUTION_PLAN Part I):** discount/exemption changes are still retroactive;
no debt forgiveness yet; monthly groups during the mid-year break are charged full months.
**Evidence:** Python gate (CI module list incl. sample, two-PC and network) 164 tests OK in 195 s (3 existing skips);
sample performance card 71 ms, dashboard 169 ms, state 338 ms / 4.24 MB; the five new API regressions (test_25–29) and
the RTL toast check each fail on the previous code; frontend 18 OK; pyflakes clean; browser `test_e2e_center` 12 OK
with Chromium, including the new walk-in → enrol → check-in → typo guard → change → day off → dated price scenario;
screenshots checked in Arabic/night at 390 px and English/daylight at 1360 px, no console errors. `test_e2e_browser`:
the 7 shell tests pass; its 6 trip-era tests error identically on the code before this change (not in CI, P8).

## Every core screen built and the daily journey tested end to end (2026-10-05)

**Why:** the owner asked for the whole app, easy for non-technical staff, impressive through simplicity and smart
problem solving, with the core journey tested and nothing outside the project's scope.
**What:** Students (filters, computed balances, the student file, enrol/move/end with seats, follow-up log, QR ID
cards), Groups (list, week timetable with server clashes, today, teachers/rooms/subjects, weekly-times form with a clash
check before saving, bulk enrol by codes, paper attendance sheet), Money (my shift, other income, expenses, banknote
counter close with printed report, receipts and expenses by period with CSV, all shifts, handouts), Follow-up (risk
cards, debts, one-by-one WhatsApp sender), Exams (Enter-down marks sheet, paste a column, ties, stats, results), Teacher
settlements (formula in words, approve, payout, statement), Reports (month figures, charts, profitability decisions,
presentation) and a Help centre with "help for this page". New reads: `/api/c/balances`, `/api/c/absent`.
**Smart fixes found by building and testing:** absence is never stored, so a stored-record absentee list was always
empty – absentees are now computed from held sessions, the advisor offers "N absent today – message parents", and a
parent is never messaged twice the same day. The Front desk profile could take money but could not open the Money page to
close its own drawer – each Money tab now follows the permission its data needs. Persian yeh/kaf from some keyboards
did not match Arabic names – unified in the browser and the server.
**Mistakes:** `HS.dialog` returned the shared overlay so dialog listeners leaked into later dialogs; record colours are
theme token names, not CSS colours; follow-up reason/outcome were swapped against the server's 40/400 limits; a
duplicate i18n key (`shift.opened`); the settlement payout prefill raced a timer; the attendance buttons reused the
`present` class of the presentation overlay. Each was caught by a test written for the screen.
**Evidence:** Python gate 152 tests OK (2 skips) in 257 s incl. sample performance (card 46 ms, dashboard 160 ms,
state 453 ms / 4.2 MB); frontend 19 OK; browser `test_e2e_center` 11 OK with local Chrome, including the journey of a
day as the Front desk profile (advisor → open shift → scan → pay → absentee message → close with no difference). One
earlier run timed out once at the login screen and passed on the re-run; not reproduced. Pyflakes clean.
**Lessons:** write the browser scenario together with the screen – it found most of the defects above; test with the
built-in profiles, not only the administrator; derive "absent" the way the server defines it.

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
