# Development History and Lessons Learned

Newest first. Every change adds an entry: what changed, why, mistakes, lessons.

---

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
