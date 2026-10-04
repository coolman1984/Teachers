# Development History and Lessons Learned

Newest first. Every change adds an entry: what changed, why, mistakes, lessons.

---

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
