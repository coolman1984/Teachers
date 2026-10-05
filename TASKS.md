# Tasks – where to continue

Tick `[x]` only when code + tests + both languages + docs are done. Details of every ID: `docs/EXECUTION_PLAN.md` Part E.
Add sub-tasks you discover under the task that caused them. Never delete a line; strike it through with a reason.

## Phase 0 – Research, plan, fork
- [x] P0.1 Field research → `docs/01-research-report.md`
- [x] P0.2 Product spec (approved by the owner 2026-10-04) → `docs/02-product-spec.md`
- [x] P0.3 Fork the Yousef-Transportation engine (9f5ef29), rename to Hessa (HS, ports 8095/8463, own AppId)
- [x] P0.4 Data model (`store.ENTITIES`), permissions/profiles (`auth.py`), rules (`domain.py`), operations (`center.py`), API (`app.py`), parent-card client (`gateway_client.py`) – written, NOT tested
- [x] P0.5 Execution plan for the next agents → `docs/EXECUTION_PLAN.md`

## Phase P1 – Make the fork run again
- [x] P1.1 index.html script list + skeleton view files
  - [x] Startup-order regression, both-language placeholders, failed-load retry
  - [ ] Chrome visual verification after P1.2 makes centre navigation reachable; full P1 checks still pending
- [x] P1.2 shell.js pages, palette, shortcuts, tour, slides
- [x] P1.3 ui.js / data.js helpers (money, grade, att badges; error keys)
- [x] P1.4 Fast refresh with /api/delta
  - [ ] Two-context Chrome timing check (<3 s, no /api/state request) after browser transport is available
- [x] P1.5 i18n EN + Formal Arabic reset
- [x] P1.6 test_design.py updated and green

## Phase P2 – Server hardening
- [x] P2.1 tests/test_center_domain.py
- [x] P2.2 tests/test_center_api.py (11 scenarios) + fixes
- [x] P2.3 Two-PC test for the centre
  - [x] Partitioned two-node journal/store test: attendance, receipts, code ranges, additive stock
  - [x] Real server/proxy partition scenario (test_center_network: 23.767 seconds)
- [x] P2.4 WhatsApp text endpoint
- [x] P2.5 Parent link endpoint
- [x] P2.6 Performance caches + indexes
  - [x] Versioned 30-second scoped caches, isolated results, composite centre indexes
  - [x] Sample-centre response-size and latency measurements: card 71 ms, dashboard 158 ms, state 461 ms / 4,239,183 bytes

## Phase P3 – Lists and settings
- [x] P3.1 Subjects, rooms, teachers (terms), handouts lists
- [x] P3.2 Settings tabs (centre, rules, lists, messages, gateway, access by teachers, data)

  - [ ] Chrome visual and keyboard checks for P3 forms (browser transport pending)

## Phase P4 – Sample centre
- [x] P4 server/sample.py + tools/make_sample.py + tests/test_sample.py + "delete all sample data"
  - [x] Deterministic centre, sample-account disable/reload, real-record preservation, scopes, history signatures
  - [x] Load sample centre into the local owner app while preserving admin login
  - [ ] Chrome visual checks for sample controls and import preview (desktop launch works; browser inspection transport unavailable)

## Phase P5 – Core screens
- [ ] P5.1 Door
  - [x] Search by code/scanner/name/mobile, student card, suggested session, auto check-in on scan, repeat-scan warning
  - [x] Fees per enrolment, pay dialog (opens the cash shift first), e-wallet reference, 80 mm receipt print
  - [x] Today's sessions strip + roll-call panel (P5.4 basics); live refresh without redrawing the door
  - [x] Browser tests `tests/test_e2e_center.py` (door flow, roll call, phone tab bar) – 3 OK with local Chrome
  - [ ] Handout sale, wallet top-up and sounds setting on the card; camera scan verified on HTTPS
- [ ] P5.2 Students + student panel + cards/receipt printing
  - [x] List filters (grade, group, teacher, debt, risk, no parent number) with computed balances (`/api/c/balances`)
  - [x] Student file tabs; grade-system-track form; enrol/move/end with seats; follow-up log; ID cards with QR (10 per A4)
  - [x] Editable CSV/Excel import preview and atomic selected save: scoped matching, deduplication, consent, capacity
  - [ ] Owner's actual real-data file test (source/path not yet supplied)
- [x] P5.3 Groups & timetable
  - [x] List, week timetable in teacher colours with clashes outlined, phone day view, today tab, teachers/rooms/subjects
  - [x] Group form with weekly times; server clash check blocks room/teacher clashes, warns on small room; bulk enrol by codes; paper attendance sheet
- [x] P5.4 Roll call panel (HS.openRoster: 4 states, all present, live count; from door, groups and overview)
- [x] P5.5 Money (shift, receipts, expenses, shifts, handouts)
  - [x] Banknote counter close with reason and printed report; reversals; CSV export; desk profile reaches its own shift
- [x] P5.6 Exams & marks (Enter moves down, A = absent, paste a column, live ranking with ties, stats, print, results queue)
- [x] P5.7 Overview
  - [x] Live scoped dashboard numbers and sample-centre controls
  - [x] Command centre: greeting, count-up figures, quick actions, sessions now/next, 28-day SVG trends, getting-started checklist
  - [x] Advisor: `GET /api/c/advice` ranked, permission- and scope-aware advice with a page for each (test_23 + design family test)
  - [x] Phones: bottom tab bar, connection-lost pill, home-screen manifest + icons, "Open on phone" QR dialog
  - [x] System status card "Is everything safe?" (backup age, second copy, sharing, record check, parent links) from `/api/c/status`, only what the user may act on

## Field edge cases (Egypt market re-check 2026-10-05, catalogue in `docs/01-research-report.md` §6)
- [x] E1 Price rise mid-year is not retroactive (server-written `feeHistory`, "applies from" in the group form, earlier prices shown)
- [x] E2 One money account per student + group: leaving keeps the debt visible (debts list, student file, door card); coming back continues it
- [x] E3 Mid-month move between monthly groups charges the month once (`billFrom`); late joiners choose this month / next month
- [x] E4 Door: enrol a walk-in from the card; cash change helper; typo guard before a receipt that can only be reversed
- [x] E5 Day off: cancel every session of a day in one step (holiday, power cut, exams); attended sessions kept
- [x] E6 Advisor: monthly students who stopped coming but are still charged
- [x] E7 RTL toasts were half off the phone screen (regression test in test_design)
- [x] E8 Owner decisions (2026-10-05, "agree on the defaults"): discount changes stay retroactive, no debt forgiveness, full months during the mid-year break, "next month" default from day 21
- [x] E9 Move prepaid credit on transfer (`/api/c/credit/move`, same teacher only, two linked non-cash rows); family payment in one commit (`/api/c/pay/many`, server done, no screen yet); repeated transfer-reference warning at the door
  - [x] Sibling payment screen (door card lists the family, one dialog, one commit, one printed sheet)
- [x] E10a Free trial session at the door (once per group, never charged)
- [x] E10b Temporary (Ramadan) timetable (`tempSlots`, clash-checked, sessions follow it); extra session (`session/add`, clash-refused); school name in door search results

## Admin and data safety (learned from Mr.Ayman-HR, 2026-10-05)
- [x] A1 Devices & Sync page and the light in the top bar (PCs, to decide, warnings, record check, administrator key, backup administrator PC)
- [x] A2 First start: join the centre PC (find or type the address, live check, first copy, "same PC or a new one?" for a copied folder)
- [x] A3 Adding window: the owner opens 15 minutes for ONE new PC (stricter than BAMS, whose door stays open)
- [x] A4 Update safety (`server/upgrade.py`): verified snapshot before an update, refusal of data from a newer program, startup problem note; fixed `_archive_copy` that left `center.db` behind
- [x] A5 Activity log: Changes and Logins & security tabs, filters, spreadsheet export, readable before → after (the old page crashed: `HS.pageHead` never existed)
- [x] A6 History hides parents' numbers without `contacts.view` and never shows parent-link secrets (the old log leaked numbers)
- [x] A7 Settings → Data: second backup folder, "Check my data now", the five promises, update history
- [x] A8 Overview "Is everything safe?" card and admin advisor items (no/old/failed backup, one disk only, sharing problems, decisions waiting, key not saved, check failed)
- [x] A9 History of one record and "Undo this change" (student file, links from the Activity log); undo is a new change
- [x] A10 Merge: `follow:` rules (derived fields are never a conflict of their own); resolving a name conflict recomputes the search key
- [x] A11 Spreadsheet formula protection and one download helper (`U.csv`, `U.download`); phone overflow of wide tables fixed (`.stack > *`)
- [x] A12 Help topics "Several PCs and sharing" and the new safety answers (EN + Formal Arabic); administrator guide
- [x] A13 Decision: BAMS "office mode" (thin PC) is **not** ported - a browser on the centre PC's address already is that; the Add-a-PC dialog explains the choice
- [ ] A14 History button in the group panel and Settings lists (API `GET /api/audit?entity=&id=` is ready)
- [ ] A15 The detail sentences of the Logins & security list come from the server in English (the event names are translated)

## Phase P6 – Differentiators 1
- [x] P6.1 Follow-up / early warning + debts (`/api/c/absent` computes absentees; advisor offers to tell parents)
- [x] P6.2 Sequential WhatsApp/SMS sender (HS.waQueue, never bulk, every send logged, not twice the same day) + per-kind default texts
- [x] P6.3 Teacher settlements (formula in words, approve / changed-after-approval, prefilled payout, printed statement)
- [ ] P6.4 Reports + profitability + presentation
  - [x] Month figures, daily charts, breakdowns, profitability with one decision per group, drawer differences, 4-slide presentation, print
  - [ ] Excel export of the report (sheets per section)
- [ ] P6.5 School support groups statement

## Phase P7 – Parent link
- [ ] P7.1 Worker routes
- [ ] P7.2 Parent page
- [ ] P7.3 Office side + GATEWAY_SETUP.md + tests

## Phase P8 – Daily scenario tests (browser)
- [ ] P8 test_e2e_center.py (8 scenarios, ar + en)
  - [x] 11 browser scenarios incl. the core journey as the Front desk profile (advisor -> shift -> scan -> pay -> absentee message -> close)
  - [ ] Teacher-scoped login scenario and two-PC UI scenario
  - [ ] Migrate legacy `tests/test_e2e_browser.py` trip/import/reports/slides scenarios (6 errors since the fork, same before and after 2026-10-05; shell tests pass)
  - [ ] Migrate legacy `tests/test_multinode.py` (still writes trip entities; 24 errors + 1 failure since the fork, excluded from CI) to centre entities

## Phase P9 – Differentiators 2
- [ ] P9.1 Bubble sheets print + phone reading
- [ ] P9.2 AI question generator (optional key)
- [ ] P9.3 Top students image, certificates, teacher page
- [ ] P9.4 Video protection (ask the owner first)

## Phase P10 – Docs and delivery
- [ ] P10 README, skill, DESIGN.md, guides (Egyptian Arabic), OPERATIONS.md, help, installer, CI, version 0.1.0
  - [x] Help centre: 11 topics, 46 questions in both languages, Arabic-tolerant search, "?" opens the current page's topic
  - [x] Repair inherited CI selectors for current centre tests; frontend/gateway/lint checks; tag-only installer publication
  - [ ] Final centre browser acceptance and installer/release verification remain pending
