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
- [ ] P5.2 Students + student panel + cards/receipt printing
  - [x] Editable CSV/Excel import preview and atomic selected save: scoped matching, deduplication, consent, capacity
  - [ ] Owner's actual real-data file test (source/path not yet supplied)
- [ ] P5.3 Groups & timetable
- [ ] P5.4 Roll call panel
- [ ] P5.5 Money (shift, receipts, expenses, shifts, handouts)
- [ ] P5.6 Exams & marks
- [ ] P5.7 Overview
  - [x] Live scoped dashboard numbers and sample-centre controls
  - [ ] Greeting, SVG trends, getting-started guidance, running-session actions and system status

## Phase P6 – Differentiators 1
- [ ] P6.1 Follow-up / early warning + debts
- [ ] P6.2 Sequential WhatsApp/SMS sender + monthly report text
- [ ] P6.3 Teacher settlements
- [ ] P6.4 Reports + profitability + presentation
- [ ] P6.5 School support groups statement

## Phase P7 – Parent link
- [ ] P7.1 Worker routes
- [ ] P7.2 Parent page
- [ ] P7.3 Office side + GATEWAY_SETUP.md + tests

## Phase P8 – Daily scenario tests (browser)
- [ ] P8 test_e2e_center.py (8 scenarios, ar + en)

## Phase P9 – Differentiators 2
- [ ] P9.1 Bubble sheets print + phone reading
- [ ] P9.2 AI question generator (optional key)
- [ ] P9.3 Top students image, certificates, teacher page
- [ ] P9.4 Video protection (ask the owner first)

## Phase P10 – Docs and delivery
- [ ] P10 README, skill, DESIGN.md, guides (Egyptian Arabic), OPERATIONS.md, help, installer, CI, version 0.1.0
