<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

## Current work queue — first sale

Use LAUNCH_SCOPE.md gates L1–L6 before the historical unchecked backlog. Record verified evidence, not assumptions. Later-release work below stays available; do not tick it complete merely because it is deferred.

- [x] FS1 Basic first-version menu: the extra pages (exams, follow-up, settlements, devices) are off until Settings → Centre → "Pages in the menu" turns them on (`test_center_api` 22b, `test_e2e_center` zzz)
- [x] FS2 Publish v1.1.0: merged by PR #11, tagged `v1.1.0` at `6b5bf2d`, built by Actions run `37423171664`, downloaded and SHA-256 verified `Hessa-Setup-1.1.0.exe` (L1 distribution evidence; field acceptance remains FS3)
- [x] FS1a Form readability: spaced list/settings fields, complete switch rows, grouped rules with English/Formal Arabic explanations, and linked accessible help (`tests/test_frontend.js` regression; publishing checks recorded in DEVELOPMENT_HISTORY.md)
- [x] FS1b Restore-test partition: isolate both incoming endpoints and assert unseen work stays isolated through restore; three fresh T30 runs and all 35 multi-PC tests passed (source validation; real-PC recovery remains FS3)
- [x] FS4 Owner's request 2026-10-06: trial sign-in admin / 123 (local, brand-new PC only, bar until changed; `test_center_safety.TrialLoginTest`), own app window (`server/appwindow.py`, Settings → Appearance; `test_unit.AppWindowTest`), Hessa's own program icon (the .ico was still Trip Orders'), Change my password in the account panel
- [x] FS5 Step-by-step guides (31) with a docked coach that opens the page and outlines each button, 44 Egyptian-centre situations, EN + Formal Arabic (`js/views/guides.js`; `test_frontend` completeness test, `test_e2e_center` coach run)
- [x] FS6 Hidden bugs found in review: family payment never reachable for real students (family now = same parent mobile, `test_center_api` 37); NaN/negative/text numbers in fees, discounts, special fees, drawer count and marks (38); cash expense reversal without a drawer, invalid expense dates (39); new-person form showed the wrong profile; sample names repeated every 60 students
  - [ ] Check the app window and the new icon on the centre's Windows PC (needs Windows + Edge)
- [x] FS7 Owner's control (2026-10-06): the Watch page (`server/watch.py`, `js/views/watch.js`) - 16 rules (reversal, reversed-and-taken-smaller, drawer short/over/repeated, drawer left open, attending without paying, discounts, prices, deletions, earlier attendance changed, after-hours work, refused attempts and wrong passwords, large/reversed expenses, many trials, admin changes), levels, people ranking, reviewed-with-a-note by administrators only (signed, logged), thresholds in Settings → Rules (admin-only), overview card; every click, page, save and failed save recorded (Activity → Clicks & screens, admin only, typed values never); sign-in with the eye, Caps Lock warning, remembered user, "last sign-in / wrong passwords since"; a discount needs its reason, a reversal needs a real reason, e-wallet payments ask for the transfer number, the pay dialog says what is left (`tests/test_center_watch.py`)
- [x] FS8 Monthly subscription (2026-10-07): per-PC activation codes signed with the seller's Ed25519 key (`server/license.py`, `tools/seller.py`, `docs/LICENSING.md`), 7-day trial, 7-day bottom bar, 3-day grace, then read/backup/export only; clock moved back and copied folders detected; the administrator's forgotten password recovered with a one-time seller code (`tests/test_license.py`)
- [x] FS9 Version 1.2.0 (2026-10-07): release notes, `v1.2.0` tag builds the installer
- [x] FS10 Hessa online + the owner's phone (2026-10-07): one seller-run gateway for every centre, joined with the subscription code (Ed25519 checked in the Worker, one code = one centre, centres kept apart, publishing stops after the grace days); the owner's live phone page `/o/` (installable, offline copy, read only, no phone numbers) fed by `server/owner.py`; installed program ignores `HS_MACHINE_ID`/`HS_AI_URL` (`tests/test_owner_online.py`, `gateway/test/service.test.js`, `docs/HESSA_ONLINE.md`)
- [x] FS11 WhatsApp to parents (2026-10-07): the short report (`server/parent_report.py`, `{summary}` in the report/monthly messages) and automatic absence/receipt/weekly-or-monthly report through the seller's official WhatsApp number (`server/wa_auto.py`, gateway `/office/whatsapp` with approved templates, consent only, once per key, follow-up history; `tests/test_wa_auto.py`)
- [x] FS12 Version 1.3.0 with release notes
- [x] FS13 Full review before sale (2026-10-07): three independent reviews (money core, security, the experience in a real browser) - 6 money, 6 security and 15 experience findings fixed with regression tests (`test_money_review`, `ServerWordsTest`, `TrialLoginTest.test_d/e`, `HostNameTest`, `test_wa_auto.test_a2`, gateway WhatsApp cap); version 1.4.0
- [x] FS14 Link to the seller's Control Center (owner's request 2026-10-08, Apps-Factory ADR-0002): Help → "Contact the seller" - self-check for everyone, help request with the exact preview and phones/e-mails/national ids/secrets removed, support window opened only by an administrator (30-120 min, named scopes, code to read on the phone, end at any time), safe repairs only from a short list and only while the window is open, a fixed-field heartbeat; off until an administrator sets it up on the centre PC itself; install code in `support.json` on this PC only (`server/vendorlink.py`, `tests/test_support.py`)
  - [ ] Field check: a real Control Center over HTTPS and a real centre PC
- [x] FS15 Owner 2026-10-08: no slideshow on the first sign-in (still in Help), daylight theme and the system font by default (`test_frontend` defaults test, `test_e2e_browser.test_no_slides_first_time_but_available_from_help`)
  - [x] Help texts in polished Egyptian Arabic (761 texts: guides, situations, questions, support, tour) and "Solve a problem" with "Take me there" + "Guide me" on 42 of 48 problems (`test_frontend` guide-map and heavy-words test)
  - [ ] A non-developer reads the Arabic help once before the release (Apps-Factory HELP-04)
- [x] FS16 Owner 2026-10-08: dashboard quick-access rail at the side (the left in Arabic): Register (new student, new group, teachers, import), Today's work (front desk, roll call, take payment, expense, cash shift), Follow-up and reports (calls, debts, marks, reports, backups - extra pages only when switched on), and "Needs attention now" counts linked to their pages (`tests/test_dashboard_rail.py`)
- [ ] FS10 field check: the seller's real Cloudflare service, `HESSA_SERVICE_URL` secret, an owner's Android phone on 4G
- [ ] FS11 field check: Meta Business verification, the three templates approved, `WA_TOKEN`/`WA_PHONE_ID` on the service, a real parent phone
  - [ ] Make the GitHub repository private before selling widely (the source runs without the check)
  - [x] Seller's WhatsApp for the renewal/recovery buttons: put into the build from the GitHub secret HESSA_VENDOR_WHATSAPP (`server/_vendor.py`, never committed - public repository)
  - [ ] The owner adds the secret HESSA_VENDOR_WHATSAPP in GitHub (Settings → Secrets and variables → Actions), keeps hessa-seller.key offline
- [ ] FS3 Install it on the centre PC, run the acceptance journey with real data, then back up and restore on a second PC (L2–L4)

# Tasks – where to continue

Tick `[x]` only when code + tests + both languages + docs are done. Details of every ID: `docs/EXECUTION_PLAN.md` Part E.
Add sub-tasks you discover under the task that caused them. Never delete a line; strike it through with a reason.

## Phase 0 – Research, plan, fork
- [x] P0.1 Field research → `docs/01-research-report.md`
- [x] P0.2 Product spec (approved by the owner 2026-10-04) → `docs/02-product-spec.md`
- [x] P0.3 Fork the Yousef-Transportation engine (9f5ef29), rename to Hessa (HS, ports 8095/8463, own AppId)
- [x] P0.4 Data model (`store.ENTITIES`), permissions/profiles (`auth.py`), rules (`domain.py`), operations (`center.py`), API (`app.py`), parent-card client (`gateway_client.py`) – tested by the centre, role, gateway and network suites
- [x] P0.5 Execution plan for the next agents → `docs/EXECUTION_PLAN.md`

## Phase P1 – Make the fork run again
- [x] P1.1 index.html script list + skeleton view files
  - [x] Startup-order regression, both-language placeholders, failed-load retry
  - [x] Every page (21 routes) on a 360 px phone, Arabic and English, night theme, extra-large font: no error, nothing wider than the screen (`test_acceptance.test_a`, review E04) - it found the overview, follow-up, settlements, reports, devices and settings pages pushed sideways (fixed minimum column widths); every auto grid now uses `minmax(min(X, 100%), 1fr)`
- [x] P1.2 shell.js pages, palette, shortcuts, tour, slides
- [x] P1.3 ui.js / data.js helpers (money, grade, att badges; error keys)
- [x] P1.4 Fast refresh with /api/delta
  - [x] Two-screen timing check: a check-in reaches the other door screen in under 3 s with no /api/state request (`test_acceptance.test_b`, review E03)
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

  - [x] Visual check of P3 forms through the page sweep above (keyboard: Enter/Escape flows covered by ShellTest)

## Phase P4 – Sample centre
- [x] P4 server/sample.py + tools/make_sample.py + tests/test_sample.py + "delete all sample data"
  - [x] Deterministic centre, sample-account disable/reload, real-record preservation, scopes, history signatures
  - [x] Load sample centre into the local owner app while preserving admin login
  - [x] Sample centre built and removed without touching a real record; import preview through the browser (`test_acceptance.test_d`, `CentreAdminTest.test_c`, review E05)

## Phase P5 – Core screens
- [ ] P5.1 Door
  - [x] Search by code/scanner/name/mobile, student card, suggested session, auto check-in on scan, repeat-scan warning
  - [x] Fees per enrolment, pay dialog (opens the cash shift first), e-wallet reference, 80 mm receipt print
  - [x] Today's sessions strip + roll-call panel (P5.4 basics); live refresh without redrawing the door
  - [x] Browser tests `tests/test_e2e_center.py` (door flow, roll call, phone tab bar) – 3 OK with local Chrome
  - [x] Handout sale (teacher's handouts first, never beyond stock - `err.noStock`) and money in advance from the card; sounds setting obeyed (A04)
  - [ ] Camera scan verified on HTTPS (B03: the camera button appears in a secure context, which the remote address now gives - to try on a phone)
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

## Defects from the completion review (2026-10-05, review of `370c770`)
- [x] A01 The parent link the program hands out is the page the gateway serves (`/t/<token>`, was `/app/#<token>` whose fragment never reaches the server); the message text carries the same link
- [x] A02 A replaced link or a removed student is revoked on the gateway; the list of hashes the gateway may hold is kept on this PC (`gateway-cards.json`, hashes only) so the revoke survives an internet outage and a restart
- [x] A03 Staff personal-link page: `js/quick.js` now exists (a real browser signs in by itself; a preview or scanner never does; another signed-in person is asked first), Arabic-first page, broken characters fixed
- [x] A04 Door sound / automatic check-in are centre settings (Settings → Rules) and the door obeys them on every PC
- [x] A05 Opening WhatsApp/SMS is not "sent": the person confirms, only then a follow-up is logged and counted; a failed save shows and can be retried (door and student file use the same sender)
- [x] A06 `docs/GATEWAY_SETUP.md` (Egyptian Arabic) and `docs/RELEASE_NOTES.md` written; `build_windows.py --check` fails in seconds on any missing shipped file and runs on every push
- [x] B04 Receipt paper per PC (80 mm, 58 mm, A5) + automatic printing switch + test print in Settings → Appearance; the page is measured so a roll stops after the text (`size: 80mm auto` was invalid CSS and printed on A4). PDF width checked in Chromium for all three
  - [ ] Try the three sizes on the centre's real printers (needs the printers)
- [x] Door: a student the roll call marked absent who then arrives was told "already: absent" and stayed absent (found by the acceptance test) - now checked in as present/late with the arrival time; a second scan still changes nothing
- [x] E02 Every built-in profile tries by direct request what its screens never offer - all refused (`tests/test_center_roles.py`); found that the Assistant profile (door + attendance) received balances and payments in the student file and the door card although the spec says assistants see no money - the server now strips them (`money_filter`) and the door shows the groups only
- [x] E11 Door peak: 30 cards (find + card + check-in) in 1.2 s on a 420-student sample centre (plan: 90 s with people); real PCs of the centre still to measure
- [x] A07 Lost connection to the centre PC: a bar on every page, save buttons dimmed, writes refused in the browser (no hidden queue); a payment saved again after a lost answer returns the same receipt (one key per dialog, `pk<key>` ids)

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
- [x] A14 History button in the group panel and every Settings list editor (`logs.view`; review B07)
- [x] A15 Logins & security details read in the reader's language: every fixed server sentence has a pattern + dictionary text (old entries too; the stored log is never rewritten; `SecurityWordsTest` checks every sentence in the server code; review B08)

## Work from outside the centre (owner's request, review D01-D08 - 2026-10-05)
- [x] D01 Outbound secure tunnel instead of an open port: Tailscale (recommended: free, private, also carries laptop sync) or Cloudflare Tunnel (public address, needs a domain) - `docs/REMOTE_ACCESS.md`; no custom relay to build or host
- [x] D02 A tunnel request is never "the PC itself" (it came from 127.0.0.1 - it would have opened first start, joining and backup folders to the internet); refused until the administrator switches remote work on at the centre (Settings → Remote work, `config.json` of that PC); only people with the new `remote.use` permission sign in; taking the permission away ends the remote session at the next request; every sign-in and refusal logged with the real address
- [x] D03 The same screens over HTTPS (Secure cookie, HSTS, Origin checked against the forwarded host); a Tailscale device reaching the program straight (100.64.0.0/10) counts as outside too
- [x] D04 Writes from outside: one key per payment dialog (A07) - a retry after a lost answer returns the same receipt; success is shown only after the centre PC saved it
- [x] D05 A laptop at home with its own copy: the existing signed sync over the Tailscale network, joined through the 15-minute adding window (guide)
- [x] D06 Centre PC off: nobody works from outside, the open pages say so and save nothing (A07); a laptop with its own copy keeps working (documented choice; no hosted copy of the children's data)
- [x] D07 Conflicts: remote work goes to the same centre server (no second writer); laptop copies use the existing merge rules and money stays append-only
- [x] D08 Remote switch, last request from outside, allowed people on one page; tunnel secrets live in the tunnel program, never in Hessa's data
  - [ ] Try both tunnels with the owner's accounts and a phone on 4G (needs the owner's Tailscale/Cloudflare login)

## Phase P6 – Differentiators 1
- [x] P6.1 Follow-up / early warning + debts (`/api/c/absent` computes absentees; advisor offers to tell parents)
- [x] P6.2 Sequential WhatsApp/SMS sender (HS.waQueue, never bulk, every send logged, not twice the same day) + per-kind default texts
- [x] P6.3 Teacher settlements (formula in words, approve / changed-after-approval, prefilled payout, printed statement)
- [x] P6.4 Reports + profitability + presentation
  - [x] Month figures, daily charts, breakdowns, profitability with one decision per group, drawer differences, 4-slide presentation, print
  - [x] Excel export of the report: 8 sheets (summary, per teacher, per method, expenses, attendance per day, money per day, profitability, drawer differences) in the reader's language, same scoped numbers as the screen (review B05)
- [x] P6.5 School support groups statement (`GET /api/c/school`: students, visits, paid incl. reversals, sessions, treasury → teacher → school split, limit checks; screen + A4 print + Excel from the group panel; review B06)

## Phase P7 – Parent link
- [x] P7.1 Worker routes: parents read one card (`GET /api/card/<token>`, every other method 405, the old phone write routes and their tables removed); a replaced link keeps a "stopped" row 30 days (410) so the phone wipes its copy; office: cards, status, empty inbox/ack for compatibility (review C01)
- [x] P7.2 Parent page: Formal Arabic first + English, light/dark from the phone, 360 px, < 120 KB (test), money per group, next 7 days (temporary timetables included), published marks with rank, last 30 attendance days, payments; service worker keeps the last copy with its age and deletes it on 404/410 (review C02-C04)
- [x] P7.3 Office side: Settings → Parent links is a 4-step guided setup with live status (links here vs cards on the mailbox, last success, the reason of the last failure in the reader's language), copy office secret (logged), send now, setup code; student file "Parent link" tab (create + copy, create + WhatsApp, replace); exams "Shown to parents" switch (marks hidden until then); `tests/test_gateway_parent.py` drives the real Worker code + Chromium (review C05, C06)
  - [ ] Try a real Cloudflare account and an old Android phone at the centre

## Phase P8 – Daily scenario tests (browser)
- [ ] P8 test_e2e_center.py (8 scenarios, ar + en)
  - [x] 11 browser scenarios incl. the core journey as the Front desk profile (advisor -> shift -> scan -> pay -> absentee message -> close)
  - [x] Teacher-scoped login scenario (`CentreAdminTest.test_a`)
  - [ ] Two-PC scenario through two browsers (the engine side is covered by test_multinode/test_center_network)
  - [x] Legacy `tests/test_e2e_browser.py` trip scenarios replaced by `CentreAdminTest` (teacher account limited to one teacher incl. password change and API refusal, Recycle Bin restore of a room, student import with Arabic digits and re-import matching, slides both directions, month report + presentation) - 12/12 pass (review E07)
  - [x] `tests/test_multinode.py` migrated: the neutral record is a teacher (scoped by its own id like a trip was by category), attachments ride on settings rows; all 35 multi-PC scenarios pass and run in CI (review E08). Found on the way: a bad `/files/..` path inside a setting value was not refused (fixed in `store.py`)
  - [x] CI: a `browser` job runs the screen tests with the runner's Chrome (review E09)

## Phase P9 – Differentiators 2
- [x] P9.1 Bubble sheets print + phone reading (review G01, G02): answer key in the exam form (Latin or Arabic letters, live count), A4 sheets at true size named per student (code pre-filled) or blank, Arabic or Latin letters; `js/omr.js` reads photos in the browser (Otsu threshold, corner squares, homography, bubble darkness), flags empty/double rows and unknown codes, a person checks before saving; the server counts the score from the answers (never trusts the page). `tests/test_omr.py`: 960/960 bubbles right over 6 turned, perspective, blurred, noisy photos incl. light pen marks; the whole teacher journey in Chromium
  - [ ] Try printed sheets and real phone photos at the centre
- [x] P9.2a Question bank (review G03): `questions` entity per teacher (subject, grade, lesson, 2-5 choices, right answer, explanation, source), Exams -> Question bank (filters, search, edit, delete to the Recycle Bin); an exam takes copies of bank questions (order, remove), the count and the answer key follow the paper on the server; a later change in the bank shows "Changed in the bank" and is applied only when the teacher chooses (and confirms when marks exist - saved marks are not recounted); prints the question paper and the answer key with explanations. `tests/test_qbank.py` (server rules, teacher scope, assistant refused, whole journey in Chromium)
- [x] P9.2 AI question generator (optional key; review G04): Settings -> AI questions (administrator pastes the key; kept in `data/ai.json` on that PC only, shown as the last four letters, removable, logged without the key); Question bank -> Generate with AI (teacher, subject, grade, lesson, count up to 20, language, notes); `server/ai.py` calls the Claude Messages API with the standard library, structured JSON output and server-side fallback; only subject/grade/lesson/notes are sent; broken questions are dropped; the teacher adds, corrects or discards each one; one request at a time; every failure has its own message (no key, key refused, no credit, busy, declined, cut short, no internet). `tests/test_ai.py` against a local stand-in service (no real account)
  - [ ] Try with the owner's real key and a few real lessons (needs the owner's Anthropic account and credit)
- [x] P9.3 Top students image, certificates, teacher page
  - [x] Top students picture (1080 x 1350 PNG, centre colours, medals, first + father's name by default) and certificates for the first three (A4 print) - only from an exam shown to parents, never published by itself (review G05)
  - [x] Teacher public page `<gateway>/p/<page-name>` (review G06): the page name in the teacher's form (3-40 English letters, numbers, dashes; unique), bio, subjects, active groups with times, price and free seats, a WhatsApp booking button to the centre's booking number (Settings -> Centre). No student, parent or teacher phone; removing the name takes the page down. `test_gateway_parent.test_d_the_teacher_page` + gateway test
- [ ] P9.4 Video protection (ask the owner first)

## Phase P10 – Docs and delivery
- [ ] P10 README, skill, DESIGN.md, guides (Egyptian Arabic), OPERATIONS.md, help, installer, CI, version
  - [x] `README.md`, `docs/DESIGN.md`, `docs/OPERATIONS.md` (data folders, ports, tools, recovery drills mapped to the tests that prove them, how to add a field/page), `.claude/skills/hessa/SKILL.md` (review F05, F07, F09)
  - [x] Guides in Egyptian Arabic with pictures of the real screens (fictional sample centre, `tools/make_screens.py` re-takes them): owner, front desk, teacher, assistant, parent (review F06)
  - [x] Help: 15 topics, 76 questions in both languages - parent links, work from outside, printing, late arrival, handouts at the door, the offline bar, publishing marks, the teacher page, the question bank and AI questions (review F08, G06, G03, G04)
  - [x] Disaster drill as a test: the only PC died, a new PC restores the backup copied from the USB folder - records, receipt, attendance and the computed balance are back (`tests/test_recovery.py`, review E10)
  - [x] Installer: firewall only for private/domain networks (never public Wi-Fi), Arabic first with English, the finish page says what to do when phones cannot connect (review F03; `InstallerTest`)
  - [x] Version 1.1.0 in the program, the installer and RELEASE_NOTES (never lowered; review F04); release steps in BUILD_AND_RELEASE.md
  - [x] Plan, build docs and administrator guide brought up to date with the code (review F10)
  - [ ] Install on a clean Windows PC, update over an older version, try a real printer and phones (F01, F02 - needs Windows and the centre's devices)
  - [x] Help centre: 11 topics, 46 questions in both languages, Arabic-tolerant search, "?" opens the current page's topic
  - [x] Repair inherited CI selectors for current centre tests; frontend/gateway/lint checks; tag-only installer publication
  - [x] Centre browser acceptance: `test_acceptance` + `test_e2e_*` + `test_center_review` in a CI browser job
  - [ ] Installer/release verification on Windows (manual, see F01/F02 above)

## Branch integration review (2026-10-05)
- [x] Audit all four remote branches: both Claude heads are ancestors of main; the ccr head adds ten commits to main
- [x] Preserve the earlier workspace's uncommitted files; their parent-link repairs are already represented in published history
- [x] Permanent gateway revocations, deleted-student revocation without a local card cache, unchanged-card republish on URL change; fresh/old D1 schema migration tests
- [x] Payment retries compare the complete saved request; family retries cannot silently truncate or reorder the saved batch
- [x] Student siblings and follow-ups obey teacher scopes; roster money obeys financial permissions; link secrets are removed from screen responses
- [x] Assistant state/delta, sibling door cards and follow-up responses hide finances; financial tabs/request permissions agree
- [x] Settings feedback and device actions fit a 360 px screen in both languages with the largest font
- [x] Include integration regressions in CI; Windows releases also require the browser job to pass
- [x] Record branch inventory, acceptance criteria, fixes and verification evidence in docs/INTEGRATION.md and DEVELOPMENT_HISTORY.md

The integration pull request's GitHub status records whether the merge has completed; use a merge commit to preserve all branch ancestry.
