<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

## The dashboard's quick-access rail (2026-10-08)

**Why:** the owner wants every form one click from the dashboard, on the side (the left in Arabic), with information and alerts,
so nobody hunts through menus. **What:** the side column of the overview now starts with "Quick access": three groups of
shortcuts (Register, Today's work, Follow-up and reports), each shown only when the person may use it and, for the extra
pages, only when the page is switched on in the menu; above them "Needs attention now" shows the advisor items, students at
risk and students who owe money, each a link to its page. Phones keep the big buttons under the thumb. **Mistake:** an
apostrophe in "Today's" broke the English dictionary until it was escaped; `test_frontend` caught it at once. **Checks:**
`tests/test_dashboard_rail.py` (every shortcut opens its page without a script error, Arabic and English, the rail is on the
left in Arabic, extra pages hidden in the basic menu), `test_design`, `test_frontend`.

## The whole help in polished Egyptian Arabic; "Solve a problem" with "Guide me" (2026-10-08)

**Why:** the owner found the Formal Arabic of the guides heavy for centre staff and wants help that a 12-year-old understands, in
respectful, professional Egyptian Arabic, so nobody needs to call to learn the program (Apps-Factory ADR-0005, HELP-01..04).
**What:** 761 Arabic help texts rewritten (31 guides, 48 situations, the questions, the support section, the tour and slides,
the coach's words); screens stay Formal Arabic. "Situations and problems" is now "Solve a problem" and 42 of its 48 problems
carry a "Guide me" button next to "Take me there" (`SIT_GUIDE` in `js/views/guides.js`). A small tool refused any change of
`{placeholders}` or `[[button names]]` while rewriting. **Checks:** `test_frontend` (every link points to a real guide and
problem; no heavy formal words in help), `test_design`, browser suites. **Lesson:** help is read by the busiest person at the
front desk; one idea per sentence, the button's name, and what happens next.

## No slideshow on the first sign-in; daylight and the system font by default (2026-10-08)

**Why:** the owner finds the slides on the first sign-in in the way and chose the daylight theme and the system font as the
look of the program. **What:** `js/shell.js` no longer opens the slides by itself (Help still opens them); `js/prefs.js` and
`js/boot.js` default to `daylight` and `system`. People who already chose a theme or font keep their choice. **Checks:**
`test_frontend` (defaults), `test_e2e_browser` (first sign-in: no slides, daylight, system font; slides from Help still work),
`test_design`, `test_acceptance`, `test_e2e_center`. **Lesson:** a first-run show is a decision of the owner, not of the engine.

## The link to the seller's Control Center (2026-10-08)

**Why:** the owner wants every sold program to report to one Control Center (Apps-Factory `apps/control-center`), so a centre can
ask for help from inside Hessa and the seller can diagnose and repair remotely with the centre's permission instead of a visit.
**What:** `server/vendorlink.py` + Help → "Contact the seller": a self-check (backup age, free disk, subscription, sync, errors of
7 days) for everyone; a help request that shows the person exactly what leaves the PC and removes phone numbers (also in Arabic
digits), e-mails, national ids and secrets before sending; a support window that only an administrator opens, for 30/60/120
minutes with named scopes, ended at any time; repairs only from a short safe list (data check, backup, error list) and only
while the window is open, each written in the security log; a heartbeat every 6 hours with a fixed list of numbers. It stays off
until an administrator enters the address and install code on the centre PC itself; the code lives in `support.json` on that PC
(never in the shared data or logs, shown only as its last 4 letters). Standard library only. **Checks:** `tests/test_support.py`
(9 server tests against a stand-in Control Center + a Chromium test on a 360 px phone in Arabic and English) and the Part G
suites. **Not done:** a real Control Center over HTTPS on a real centre PC (TASKS FS14). **Lesson:** a support channel is only
trustworthy if the customer can see what leaves and can close the door; both are tested, not promised.

## A raised version merged into main publishes its installer (2026-10-07)

**Why:** pushing the `v1.2.0` tag from the cloud session was refused (403), and so was a manual workflow start; the
owner agreed to this change. **What:** a small `new-version` job reads `server/version.py`; on a push to main with no
release for that version, the Windows job builds and `gh release create` publishes it (it makes the tag). Same-version
merges publish nothing. **Lesson:** the release path must not depend on rights the working session lacks.

## Review of PR 20: an atomic WhatsApp cap, demo password after a broken load; version 1.4.1 (2026-10-07)

**What:** the automatic review (after the merge) found two real issues. Requests at the same moment all read the day's count
before any of them added to it, so together they passed `WA_DAILY_CAP`: each message now takes its place in one
`INSERT ... ON CONFLICT DO UPDATE ... WHERE n < cap RETURNING` before it is sent, and gives it back if it does not go out
(gateway test: twelve at once, five allowed - failed before). A sample load that stopped half way left the demo accounts
behind with the old password while the next load showed a new one: existing demo accounts now take the shown password
(`SamplePasswordTest`, failed before). **Lesson:** a limit that is read, then used, then written is no limit under load;
reserve first.

## Full review before sale; version 1.4.0 (2026-10-07)

**Why:** the owner asked for a complete, carefully reviewed program for sale. **How:** three independent reviews ran in
parallel and every finding was reproduced before it was fixed: the money/attendance core against a real server, security
against a real server and the gateway, and the experience in Chromium (28 pages x phone/desktop x Arabic/English x day/night,
plus the daily journeys by hand). **Money:** a spent credit refunded in cash; leaving/moving an ended enrolment charged months
again; moving into a group already joined; dates in other shapes stored raw; deleting a group erased its debts; today's money
counted credit twice. **Security:** the owner's phones and automatic WhatsApp were writable through the generic save by anyone
with the settings permission; the trial password worked from the LAN on member PCs; the WhatsApp report leaked another teacher's
group and money; the seller's WhatsApp had no cap and carried any link; DNS rebinding passed the "this PC" checks; the sample
password was public and shown to the front desk. **Experience:** English errors in the Arabic sign-in (all fixed server
sentences now go through `js/ui.js`), a paid-up monthly student offered a full month again, "already recorded" right after a
check-in, check-ins into a class hours away, no checks on new students (grade defaulted, duplicate names, wrong mobiles), a zero
balance labelled credit, the forced password change without its rules, tabs that only say "administrators only", raw expense
category keys, colloquial words, English sample data, sample times in the future, an unclear drawer difference.
**Mistake/lesson:** a server guard refusing cash expenses above the drawer blocked the month-end teacher payout from the safe -
the review asked for a warning, not a block; it is now a confirmation in the dialog. The browser suite caught it.
**Checks:** the full suite, the gateway tests and a scripted browser walk-through of each fixed screen.
**The intermittent 500 (open since 2026-10-06) found:** the browser tests now name the request behind a server error and the
harness prints the server's error log before deleting it. That showed `/api/c/status` failing with KeyError 'node' and
"bad parameter or other API misuse": `journal.meta()` (and `hash_at`, `deps_of`, `store._visible`, `_txn_label`) read the one
shared SQLite connection without the lock, so a read could receive another thread's row. Reproduced 3 of 3 times with six
parallel clients (`SharedConnectionTest`), 0 of 5 after taking the lock. Lesson: on a shared connection every read takes the
lock, not only writes; and a flaky test is a bug report - log enough to trace it instead of re-running it.

## WhatsApp to parents: the short report and automatic messages; version 1.3.0 (2026-10-07)

**Why:** the owner decided parents get no app: "a small, neat report on WhatsApp", sent automatically on WhatsApp.
**What:** `server/parent_report.py` writes the few lines (attendance this month with the missed classes, the latest published
mark and rank, the account, the next class, the link) from the dictionaries; the report/monthly messages now default to
`{summary}`. Automatic sending uses only the official WhatsApp Business API through the seller's service (an unofficial sender
gets numbers banned): the gateway sends approved templates (`hessa_report`, `hessa_absence`, `hessa_receipt`, values without new
lines), once per key per centre, counts per month and keeps only a hash of the number. `server/wa_auto.py` on the administrator
PC decides what is due (absence after the class ends, receipts from the moment it was switched on, weekly/monthly reports),
only for parents who gave consent, and writes each message in the follow-up history. Settings → Parent links has the card.
Version 1.3.0 so the merge publishes the installer. **Checks:** gateway tests (23), `test_wa_auto` (real gateway + a stand-in
for Meta's API + server), `test_owner_online`, `test_center_api`, `test_center_gateway`, `test_unit`, `test_ci`, frontend tests.
**Mistakes/lessons:** the first test expected the forced round to send, but the background round (kicked by saving the settings)
had already sent them - a test waits for the effect, not for the caller; a receipt keeps only the minute, so "since" compares
receipt ids taken at the moment it was switched on.
**Review fixes (PR 19):** with an owner's phone registered the PC ran a full round every 10 s (status + picture), about 17,000
writes a day per idle centre on a shared service whose free quota is 100,000: now the status is asked every five minutes, the
picture goes only when the data changed (checked locally every 10 s) plus a 3-minute heartbeat, and the Worker writes
`seen_at` at most every ten minutes (`test_an_idle_centre_writes_little_to_the_shared_service`). The self-hosted upgrade
guide now runs `migrate-v2.sql` (re-running `schema.sql` does not add columns to existing tables). Version raised to 1.3.0.

## Hessa online and the owner's live phone (2026-10-07)

**Why:** the owner researched the market (competitors sell a parent app and live owner control) and asked for one online
service in the seller's name, a live phone view for the centre owner, and short WhatsApp reports for parents instead of a parent app.
**What:** the gateway became multi-centre: `/office/join` takes the subscription code, verifies it with the seller's Ed25519 key in
the Worker (same format as `server/license.py`), one code joins one centre, every card/page is scoped by centre, and publishing
stops after the grace days (renewal via `/office/licence`). `server/owner.py` builds the owner's picture (today's money,
drawers, sessions now, watch alerts, a bilingual feed rendered from the program's own dictionaries, top debts, people signed
in); `GatewaySync.push_owner` sends it within seconds of a data change and every minute as a heartbeat. The phone page `/o/`
(installable, service worker, offline copy, key in a header and never in an address) reads it. Phones are added/removed by
administrators (hash only in the shared settings; security log). Also: the installed program ignores `HS_MACHINE_ID` and
`HS_AI_URL`. **Checks:** gateway node tests (22), `test_owner_online` (real gateway + server + Chromium), `test_unit`, `test_ci`,
`test_center_gateway`, `test_gateway_parent`, `test_center_review`, `test_license`, `test_center_watch`, frontend tests.
**Mistakes/lessons:** the page's CSP forbids inline styles, so bar widths are set from script; a JS comment pasted inside a
one-line function broke the page, caught by the browser test - always run the browser check after editing the phone page.
**Next:** the seller creates the Cloudflare service and the `HESSA_SERVICE_URL` secret; WhatsApp parent reports.

## Hessa 1.2.0 release (2026-10-07)

**What:** the owner asked for a new installer. Raised `VERSION` to 1.2.0 and described it in `docs/RELEASE_NOTES.md`
(subscription, sign-in, Watch, click history, recycle bin, app window, guides). Merged, then the `v1.2.0` tag runs the
Windows build. **Checks:** installer preflight, `test_unit`, `test_ci`. **Limits:** the WhatsApp button is empty unless the
`HESSA_VENDOR_WHATSAPP` secret was set before the build; the trial sign-in (admin/123) is still on by the owner's choice.

## The seller's WhatsApp number in the build, not in the repository (2026-10-07)

**What:** the owner gave the WhatsApp number for the renewal and password-recovery buttons. The repository is public and
CLAUDE.md forbids real phone numbers in it, so `tools/build_windows.py` writes `server/_vendor.py` from the GitHub secret
`HESSA_VENDOR_WHATSAPP` (01xxxxxxxxx becomes 201xxxxxxxxx for wa.me), compiles it in and deletes it; `.gitignore` keeps
it out. **Checks:** `test_unit` (number format, never committed), installer preflight. **Next:** the owner adds the secret.

## Monthly subscription with per-PC activation codes and password recovery (2026-10-07)

**Why/source:** the owner rents Hessa monthly and wants the .exe to stop being useful when copied or not paid for, with
reminders before the end and a way back for a forgotten password.
**What:** `server/license.py` - request code from the Windows MachineGuid (never from the environment in Hessa.exe),
activation codes = Ed25519-signed {PCs, until, issued, serial} in 160 readable characters with a check letter; one code
can name several PCs. 7-day trial (its start also taken from the oldest data), a bar at the bottom from 7 days before the
end, 3 grace days, then LOCKED: sign-in, reading, backups and exports still work, saving is refused with err.license.*
The highest time ever seen (license.json and the signed history) catches a clock moved back. A copied data folder shows
another request code. Older codes cannot replace newer ones. `tools/seller.py` (+ seller.bat menu in Arabic) issues
codes with the seller's private key, never in the repository, and keeps issued.csv. Forgotten administrator password:
one-time request on the centre PC -> seller reset code -> new password (staff: the administrator resets as before).
The check is always on in Hessa.exe and off in the source copy unless config `license_required` (tests).
**Checks:** `tests/test_license.py` (9: codes, typos, forged keys, other PC, older/ended codes, trial/warn/grace/lock,
clock moved back with license.json deleted, one-use reset code, the seller tool; the running server locked, backing up,
refusing another PC's code, activating; password recovery from the centre PC only). Frontend test for every state's words.
**Mistakes/lessons:** a bottom bar fixed to the window covered the account button in the menu - it lives in the page
column now. HS_MACHINE_ID (a test override) would have let a copy pretend to be a licensed PC; the licence reads the
MachineGuid itself in the compiled program. **Limits:** no offline licence can stop a skilled cracker from patching the
.exe; the public repository lets anyone run the source without the check - make it private before selling widely.

## The owner's control: Watch, every click, a careful sign-in, entries that explain themselves (2026-10-06)

**Why/source:** the owner wants centre owners to trust the desk while they are away - "nobody steals, cheats, deletes
or discounts by mistake or on purpose" - as the main selling point; keep the trial sign-in until the build is done.
**What:**
- `server/watch.py` reads the existing signed records for a period (receipts and reversals, drawers, attendance, the change
  log, the security log, refused requests) and lists 16 patterns with a level, the person, the numbers and the page. The
  skim (reversed and taken again smaller the same day by the same person) is critical; repeated short drawers too.
  `/api/watch` and `/api/watch/review` are for administrators of the whole centre; the review is a settings row
  (`watchReviewed`) that only that endpoint writes - `/api/commit` refuses it, and non-administrators cannot change the
  `watch*` thresholds, so nobody quietens an alert about himself. Defaults: working hours 8-23, large amount 1000, 2 units.
- `js/views/watch.js`: period, four level tiles (click to filter), people ranking, filters, each alert with "why it matters"
  and "the right way", open the record, mark reviewed with a note, export; an overview card for administrators.
- Clicks: the browser never sent anything to the existing `/api/log` (the activity table was empty). `HS.track` now sends
  every click (button words, tick boxes ended on/off), page, save and failed save, screen errors; the server stamps the real
  name. Activity log → "Clicks & screens" for administrators. Typed values are never recorded.
- Sign-in: show/hide password, Caps Lock warning, the last user name remembered, and after sign-in "your last sign-in was
  ... from ...; N wrong passwords since - not you? tell the administrator".
- Entries: a discount or exemption needs its reason (server); a reversal reason must say what was wrong; e-wallet payments
  ask for the transfer number once; the pay dialog says what remains owed or goes into credit.
- Sample: desk2 now skims once and closes short twice in the last 12 days, so the Watch shows real patterns.
- Guides: "Know what happened while you were away" and three situations (suspected theft, no receipt, shared password).
**Checks:** `tests/test_center_watch.py` (a desk user skims, closes short, is refused the Watch and the review and the
thresholds; a review keeps the note; discount without reason refused; welcome counts wrong passwords; clicks stored under
the real name, administrators only). **Lessons:** the click log existed on the server for months with nothing feeding it -
check the producer, not only the table. **Limits:** clicks are stored in the replicated journal (thousands a day per desk);
watch volume on a busy centre should be measured during the pilot.

## Trial sign-in, own app window, step-by-step guides and a hidden-bug review (2026-10-06)

**Why/source:** the owner asked (on `main`, base `4e43522`) for a fixed first version that anyone can use with no
help: sample data removable in one click, tick-box permissions like Mr.Ayman-HR, step-by-step guides in English and
Arabic with the Egyptian edge cases, a temporary developer login admin / 123, a full-screen program instead of a
browser tab, original icons everywhere, and a review for hidden bugs. Gate: L1/L2 source work (field gates unchanged).
**What:**
- Trial sign-in: on a brand-new PC (no accounts, not joined) "Try it now" / admin + 123 creates the administrator with
  that password (strength rules skipped only here). Local only, never through a tunnel; a yellow bar on every page and
  a hint on the sign-in screen until the password changes (flag file `trial-login.json`, never synced). `dev_login` is
  on by default for now and must be switched off before a real sale. Added "Change my password" to the account panel -
  people could not change their own password before unless forced. Password screen labels "Password (1)/(2)" fixed.
- Own window: `server/appwindow.py` opens Edge/Chrome in app mode with its own profile (separate taskbar window with
  Hessa's icon), maximized or full screen (Settings → Appearance, admin, on the PC itself); falls back to the browser.
  Full-screen button (F11) in the top bar.
- Icons: the Windows .ico (Hessa.exe, shortcut, installer) was still Trip Orders' "table and chairs"; one stdlib drawing
  (navy tile, amber cap with lit board) now makes the .ico, the phone icons and the favicon. Eight new line icons.
- Guides: `js/views/guides.js` - 31 guides in six areas, each step typed (open/click/type/choose/check/tip/careful)
  and naming the button with `[[dictionary.key]]` so it always matches the screen; "Guide me" docks a coach that opens the
  page, outlines the target and waits for the person to do it. 44 situations from Egyptian centres. "?" opens the
  guides of the current page. All text in en.js and ar.js (Formal Arabic).
- Permissions screen: a new person showed "Centre manager" over the Viewer ticks and was saved with the wrong profile
  name; ready-made profile names now show in the reader's language.
- Sample: names repeated every 60 students (7 pupils called the same); siblings had different fathers and numbers.
  Confirm buttons said "Done" instead of "Load sample centre" / "Delete all sample data".
**Hidden bugs fixed (each with a regression test):** nothing on the screens ever set a family, so "Pay for brothers and
sisters" never appeared for real students - students without a family key are now one family when they share the
parent mobile, found when read (a first version stored "tel:<number>" as the key and the LogPrivacyTest caught the number
in the change log of a reader without contacts.view - never derive a stored key from a hidden field);
NaN passed every "< 0" check and a new group could get a negative or text price, text in a discount or special fee gave a
server error, NaN/negative drawer counts and NaN marks were stored; a cash expense could be reversed with no open drawer;
an expense date was stored without checking it is a date; the "photo is being copied" picture printed a literal ….
**Checks:** see the commit; browser suites run with the local Chromium. **Mistakes/lessons:** `pkill -f` matched its own
shell; a guide that names a button by key cannot drift from the screen, and a probe that visits every guide target in the
running app found two wrong selectors (groups remembered the last tab). **Limits/next:** the app window and new icon need
a check on the centre's Windows PC (Edge); `dev_login` must be turned off for the first customer; guides cover the
first-sale core plus administration - exams/settlements guides can follow when those pages are sold.

## Isolate both PCs in the restore regression (2026-10-06)

**Why/source:** while validating the form integration on `codex/form-layout-sync-20261006`
(form commit `e69d24c`, base `b0f3950`), the 294-test source gate failed the inherited T30 restore
scenario. The same failure reproduced in isolation; instrumentation also produced a passing run,
consistent with a timing race. Each harness proxy blocks only incoming traffic: cutting PC1's
proxy still lets PC1 send its supposedly offline record to the administrator. A restore may
legitimately remove a known record absent from the backup; the intended test concerns unseen work.
**Fix:** cut both endpoints, assert the offline record is absent on the restoring PC before and
after restore, then reconnect both. Keep the existing convergence, surviving-record and audit
assertions. No application, restore or sync behaviour changes and no new user-visible strings.
**Evidence:** corrected T30 passed in three fresh processes (15.720s, 15.739s, 13.848s);
all 35 multi-PC tests passed in 605.719s. An initial attempt to repeat the same class within one
unittest process reused class-level databases and caused duplicate-record conflicts; fresh
processes correctly isolate repetitions. Frontend 26/26, lint, installer preflight and whitespace
checks passed. Browser execution remains subject to the PR's real Chrome gate before merge.
**Lesson:** an incoming-port proxy is not a bidirectional network disconnection. Assert isolation
in a concurrent-restore scenario instead of relying on timing. This supports L1 source validation;
the field recovery drill remains FS3/L4.

## Publish the pending form readability improvements (2026-10-06)

**Why/source:** the owner requested push, merge and main synchronization. Existing uncommitted
form changes were based on `main` at `b0f3950`; prepared on `codex/form-layout-sync-20261006`.
**What:** separate labels from preceding controls, align responsive settings fields, group rules
by door/school/follow-up, explain each rule in English and Formal Arabic, associate help with
controls through `aria-describedby`, and make each switch's whole labelled row clickable.
Message templates keep paired languages and collapse to one column on phones. Existing list
drawers use the same spacing. Added the required task and documentation record and corrected
a missing space between HTML attributes during review. Removed a legal reference from the new
school-group help so it describes configuration without suggesting regulatory acceptance.
**Tests:** the supplied frontend regression covers both languages, switch labelling/help,
list containers, rule sections and paired message fields: 26/26 frontend tests passed.
Python lint, installer preflight (1.1.0) and whitespace checks passed. The full local source
gate ran 294 tests (25 skips) and exposed an inherited restore test's incomplete simulated
partition; a separate test correction follows. Local browser checks skipped all 32 tests
because the configured browser was absent; GitHub's real Chrome gate is required before merge.
**Limits/next:** this is source integration for the pilot's usability, not new field acceptance.
The published `v1.1.0` installer stays tied to its original tag; these subsequent source changes
need a later installer build to appear in the executable. Private runtime files remain local.

## Hessa 1.1.0 installer published and verified (2026-10-06)

**Why:** the owner explicitly requested the Windows executable on GitHub. **Source/gate:**
`claude/basic-first-version` at `c78db6e`, merged by PR #11 into `main` at `6b5bf2d`; FS2 / L1 distribution.
**What:** pushed the annotated `v1.1.0` tag, synchronized local main, and monitored Actions run
`37423171664` until the source, browser and Windows-installer jobs all succeeded. The workflow compiled
the program, built the installer, checked startup/served pages in a temporary home, and published the release.
**Evidence:** installer preflight passed; branch run `37421882881` and release run `37423171664` succeeded.
Downloaded `Hessa-Setup-1.1.0.exe` (10,960,435 bytes) from the published GitHub asset;
SHA-256 `e70fa2541e76ffa37b809f9b3a33f1b356d15fc03c53633190c568915ac60758` matches GitHub's digest.
Release: https://github.com/coolman1984/Teachers/releases/tag/v1.1.0.
**Recovery/lessons:** the default GitHub API route timed out; a per-command proxy connection to an
alternate GitHub API address worked with normal TLS validation. Existing Git credentials stayed in
memory; local helpers and private runtime files were excluded from commits. No system proxy changes.
**Limits/next:** no local installation was performed. Clean-PC installation, real counter/printer
acceptance and restore on a second PC remain FS3 / L2-L4. This is the limited pilot candidate, not field acceptance.

## Basic first-version menu for the owner's own centre (2026-10-06)

**What:** the owner asked for a first version to run their own counter, teachers and students. The menu now shows only the core of
LAUNCH_SCOPE (overview, door, students, groups, money, reports, activity, settings, help). Exams, follow-up, teacher settlements and
devices are "extra" pages: hidden from the menu, palette, shortcuts and phone tab bar until ticked in Settings → Centre → "Pages in the
menu" (setting `extras`, validated by the server against `domain.EXTRA_PAGES`). Nothing is deleted, no permission changes, and a link
to a hidden page still opens it (the overview and the advisor link to follow-up). **Why:** a non-technical owner starting with real
students should see the daily work first; every feature stays one tick away. **Source:** main at b342c7c, gate L1 preparation.
**Checks run on Windows:** frontend tests, the Python unit/centre suites, and the browser suites (test_e2e_browser, test_e2e_center,
test_acceptance, test_center_devices) with the installed Chrome. **Mistake:** my new API test reused the name `test_23_` of an
existing test in the same class, so one would silently replace the other - renamed and checked both run. **Lesson:** grep for the
test name before adding a numbered test. **Windows test fix:** `test_ai.test_b_the_key_stays_on_this_pc` read every
file in the data folder and failed on Windows with "Permission denied" on `program.lock`, which the running server locks (Linux CI
never saw it); the lock file holds only a process id and is now skipped. **Test pop-up on the desk:** running the tests on the owner's PC
opened a real Windows message box ("data saved by a newer version 9.9.9") from `test_center_safety`, which starts a throwaway
server on a fake newer data folder; the owner thought their data was at risk. Test servers now set `HS_NO_DIALOG`, so the refusal is
written to the log and STARTUP_PROBLEM.txt only; real starts still show the box. **Lesson:** a test run on a working PC must never
show the person a window. `test_center_safety.SystemHealthTest` also failed on Windows only: it backdates backup files with
`os.rename`, which refuses an existing target on Windows; `os.replace` does what Linux rename does. **Next:** FS2 release v1.1.0 from a tag, FS3 install and the acceptance journey on the
real PC.

## First-sale documentation review corrections (2026-10-06)

Keep copied/standalone optional-service guides independent of repository-relative contract paths; point implementers to the online source contract. For transport, remove the stale-release installation instruction and unconditional no-data-loss claim, and describe the office-only pilot before optional phone work. Documentation only; all branch copies retain the same contract and application history. Verified source/standalone link targets and Markdown-only diffs.

## Owner-approved first-sale scope (2026-10-06)

Added LAUNCH_SCOPE.md and linked every tracked Markdown guide, plan and agent skill to it. Prioritize the limited paid pilot; defer optional features without deleting code or changing historical completion status. Documentation only: no UI, runtime, pricing or application version changes. Validation: documentation links, identical contract across branch targets, skill metadata, and git diff checks. Windows/customer acceptance remains pending; follow the launch ledger.

# Development History and Lessons Learned

Newest first. Every change adds an entry: what changed, why, mistakes, lessons.

## A correction to an AI question was lost when another question was added (CI, 2026-10-06)

**What:** in "Generate with AI", a teacher who started correcting one question and then added another lost the correction: the save
of the second redrew the list from the original text. Found by the browser job on GitHub (a slower machine finished the save while the
test was typing). **Fix:** every keystroke of a correction is kept in the question itself, so a redraw shows it. **Regression test:**
`test_ai.AiJourneyTest` now starts a correction, adds another question, waits for the redraw and checks the text is still there
(fails without the fix). **Review of #9:** keeping every keystroke opened the opposite hole - typing after "Add to the bank" while a slow
save runs would show text the bank never got. A correction is now frozen (fields disabled, keystrokes ignored, also after a redraw)
from the moment its save starts until it answers; `test_ai.test_b_slow_save_*` delays the save 1.5 s and checks shown = saved.
**Lesson:** a list that redraws after a save must redraw from what the person typed, not from what arrived - and what is being
saved must not move.

## The "sessions now" list widened a phone at the largest font (found 2026-10-06)

**What:** the full run of the acceptance tests at 15:00 found the overview wider than a 360 px phone: the list of sessions running now
is a grid, and a grid row grows to its content, so a long group, teacher and room pushed it off the screen. The page test only sees
it while sessions are running, which is why the morning runs passed. **Fix:** the list's column is `minmax(0, 1fr)`; the teacher and
room line wraps. **Regression test:** `test_acceptance.test_a0_*` puts a long row on the overview at any hour (it fails without the fix).
**Also:** the page-name check of G06 refused the free text that `test_multinode` kept in the teacher's page-name field; the test now
writes valid page names (the merge rules it proves are unchanged). **Lesson:** a test that depends on the clock needs a twin that
does not.

## Questions written by AI, checked by the teacher (review G04, plan P9.2 - 2026-10-06)

**What:** optional. An administrator pastes an Anthropic API key in Settings -> AI questions; in the question bank a teacher presses
"Generate with AI", chooses subject, grade and lesson (and notes), and reads each question that comes back: add it as it is, correct
it in place, or discard it. Added questions carry `source: 'ai'`.
**Privacy and money:** the key is kept in `data/ai.json` on that PC (owner-only file, like `gateway.json`) - not in the shared data,
the backups, the logs or any page (the page sees the last four letters). Only the subject name, grade, lesson and the teacher's
notes are sent - no student, parent, mark or teacher name. One request at a time per PC; the activity log says who asked for how many.
**How:** `server/ai.py` uses `urllib` (the server takes no outside packages, so the official SDK cannot be used) against the Messages
API: structured JSON output (a schema with the text, choices, answer letter and explanation), server-side fallback on a declined
request, the stop reason checked before reading (declined / cut short have their own messages), every question cleaned by the same
rules as a hand-written one and a broken one dropped rather than "fixed". The model is the plan's (`claude-sonnet-5-5`), checked
against the current model list first, as the review asked.
**Mistakes:** the first "correct then add" opened the question editor over the dialog and lost the list on the way back; it is now an
editor inside the list. The editor was cramped on a phone - it now stacks.
**Evidence:** `tests/test_ai.py` with a local stand-in for the AI service: no key -> clear message and nothing sent; a bad key shape and
a non-administrator refused; the key absent from the state, every other data file, the server output; the request carries the
lesson but no student name, code or phone; nothing saved before the teacher adds; key refused / busy / no credit / declined / cut
short / no internet each say what to do; a teacher limited to one teacher cannot ask for another's; in Chromium the administrator
saves the key and the teacher adds one, corrects one and discards one. Not yet tried with a real account (needs the owner's key).

## Question bank: write once, use in many exams (review G03, plan P9.2 - 2026-10-06)

**Why:** a teacher writes the same kind of questions every week; the plan's AI generator also needs a place to put the questions
a teacher accepts. **What:** a `questions` entity per teacher (subject, grade, lesson, 2-5 choices, the right answer, an
explanation, source manual/ai), Exams -> Question bank (search and filters, edit, delete to the Recycle Bin), "Add from the question
bank" in the exam form (order with arrows, remove), printing of the question paper and of the answer key with the explanations.
**Decisions:** an exam keeps a *copy* of each question (`paper`), not a link: a change in the bank never changes an exam already
made. The exam shows "Changed in the bank" and the teacher chooses "Use the new version"; if marks were already saved the page asks
first and the saved marks stay as they are (only sheets read later use the new key). The server derives the number of questions,
the choices and the answer key from the paper - the page cannot send a key that does not match. Questions are teacher-scoped like
exams and written with "Create exams and answer keys" (an assistant is refused).
**Mistakes:** an exam could not be opened for editing once created (the form existed, no button reached it); the marks sheet now has
"Edit exam", which asks before leaving marks that were typed but not saved.
**Evidence:** `tests/test_qbank.py` - bad questions refused with one clear message, the key follows the paper, a bank edit leaves the
exam alone, marks counted with the exam's own key, delete keeps the exam's copy and shows in the Recycle Bin, a teacher sees only
their bank and cannot write into another's, an assistant is refused; in Chromium (Arabic): write a question, add two to a new exam,
reorder, print paper and key, change the bank, take the new version with the confirmation, marks unchanged. Screens checked at
360 px and on a PC; the paper and key printed to A4 PDF.

## A public page for every teacher who wants one (review G06, plan P9.3 - 2026-10-06)

**Why:** parents look for a teacher before they come; today the centre sends timetables as pictures in WhatsApp groups that are old
the next day. **What:** a "Page name" in the teacher's form (for example `mr-ahmed`) publishes `<gateway>/p/mr-ahmed` on the same
internet mailbox as the parent cards: the teacher's name, bio and subjects, every active group with its days, times, price and the
seats still free, and a "Book on WhatsApp" button to the centre's booking number (Settings -> Centre). The centre PC sends the page
only when something on it changed (a signature per page, kept in `gateway-pages.json`); emptying the name takes the page down.
**Privacy:** only what a poster on the centre's door would show - never a student, a parent, the teacher's own phone or the
centre's share. **Decisions:** the address is English letters, numbers and dashes, 3-40 characters, unique (`err.slug`,
`err.slugTaken`); the page is read-only like the parent card; school groups are not listed.
**Mistakes:** the first Arabic text for free seats ("متبقٍ 3 مقعد") was wrong grammar - now "المقاعد المتبقية: 3"; an English bio
in the Arabic page put the full stop on the wrong side - the bio now follows its own direction (`dir="auto"`).
**Evidence:** `tests/test_gateway_parent.test_d_the_teacher_page` (bad and taken names refused, the page on a real local gateway
shows the group and 28 free seats of 30, no child names or phone numbers, the page address serves the app, removing the name gives
404) and `gateway/test/gateway.test.js` (pages stored, read publicly, removed); the page checked on a 360 px phone in both languages.

## main green again: a race in copying photos, a phone overflow and a test that clicked too early (2026-10-06)

**Why:** after #6 the browser job on main was red (top-students picture), and the next runs showed two more failures that came and went.
**What:** (1) *Real bug:* with three or more PCs, two sync threads could download the same photo at the same moment into the same
`.part` file; the second kept appending after the first had moved it into place, so the stored photo came out longer than the
original (or the download failed its checksum). Now one download per file at a time (`SyncService.fetching`), and a file that is
already in place is not fetched again. (2) The overview's "Sessions now and next" rows could not shrink: on a 360 px phone with the
largest font the page was 4 px too wide - only at hours when that list is full. (3) The G05 browser test clicked "Top students" when
the server had saved "shown to parents" but the panel had not yet got the answer; it now waits for the panel's own state.
**Mistakes:** all three passed locally most of the time; each was found only by reading the CI log and reproducing the exact condition
(three PCs, time of day, a slower browser).
**Evidence:** `tests/test_sync_files.py` - two threads fetch one file: corrupted/lost on the old code, intact and stored once now;
`test_acceptance` phone check reproduced at the same hour and passes now; G05 passes repeatedly.

## Integrate all outstanding branches and enforce the actual safety boundaries (2026-10-05)

**User/outcome:** a nontechnical centre team must trust that attendance, receipts and parent links represent what was saved.
The acceptance criteria and four-branch inventory are in `docs/INTEGRATION.md`. Both Claude heads were already included in
main; the ten ccr commits are retained as ancestors of the integration branch. There were no open GitHub issues or PRs.
Earlier uncommitted work in the previous workspace was preserved, with its published fixes checked against this history.

**Found before fixing:** a stale gateway upload could reactivate a replaced parent link; changing the gateway address left
unchanged cards unpublished; payment retries accepted changed amounts and truncated/reordered family batches; a scoped student
file exposed siblings outside its teacher scope; attendance rosters carried money and parent token material. New regression
tests failed on each of these before correction. A final role review also proved the assistant could bypass the screen's
money restriction through `/api/state`. The phone acceptance sweep found overflow in Arabic Settings and English Devices.

**Changes:** permanent gateway token tombstones, atomic replacement protection and deleted-student revocation independent of
local publishing caches; invalidate the publishing cache when the gateway URL changes. Ship and test a nondestructive v1 D1
migration. Match retries to the normalised saved receipt, collector and complete ordered family batch. Scope sibling/follow-up
queries; hide parent token material on staff responses. Financial permissions now apply to rosters, state, incremental updates,
scoped assistant student files, sibling door cards and follow-up balances/risk. Money-free risk calculation excludes the debt
signal, preserving attendance and marks follow-up. Match the browser's balance request/tab rules to the server permissions.
Wrap Settings feedback and Devices actions so large-font phone users can still reach them. Include integration regressions in
CI and require both office and browser gates before a Windows release build. Keep money append-only and add no runtime dependency.
Run joining, device management and backup-safety browser tests in the browser CI job too, where Playwright is installed;
the office runner must not silently skip those screens as the only coverage.

**Lessons/mistakes:** an idempotency key identifies a saved operation; it must not report success for different input. Permanent
revocation cannot depend on an expiring card or a single PC's cache. Test incremental state with a real changed receipt rather
than a full-reload fallback, and test a nonempty risk/family response. A scoped user still needs financial permissions. A local
test command initially named a nonexistent `AdviceTest`; its loader error was corrected by running the actual review module in
the complete office gate. No result from that failed invocation is counted as a successful gate.

**Limits:** the private owner workbook is absent; live tunnel/gateway accounts, Windows installation and real printer/phone
hardware remain deployment acceptance tasks. Synthetic bubble photos and Chromium do not prove real-world camera accuracy.
The optional AI question bank, teacher public page and hosted videos remain the explicit product backlog.

**Verification:** the complete office command selected 280 cases and completed with exit 0 (the private workbook case is
skipped). The initial pre-final office run reported 279 cases, OK with one skip; the additional case closes the assistant
state/delta bypass. The strengthened seven-role checks passed separately, including a real changed-receipt delta, a nonempty
sibling card, a scoped assistant and a nonempty risk response. Final browser suite: 34/34 in 169.918 s; all 21 routes fit both
languages on a 360 px phone, and the attendance update reached the other screen within three seconds. Thirty card lookups,
cards and check-ins took 0.89 s with 420 students/24 groups. Bubble marking: 960/960 on six synthetic degraded photos.
Frontend: 25/25; gateway: 16/16; CI selectors/installer manifest: 6/6. Pyflakes, installer preflight, gateway bundle build/syntax
and `git diff --check` passed. Python emitted existing resource warnings in old test fixtures and an SVG byte-string escape
warning; neither failed a check. Windows installation itself was not run.

## Top students picture and certificates (review G05, plan P9.3 - 2026-10-05)

**What:** the exam panel's "Top students" draws a 1080 x 1350 picture on a canvas (centre name, exam, teacher, the first ten with
medals and marks) to download and share, and prints certificates for the first three. **Privacy:** only from an exam already
shown to parents; nothing is posted by itself; first and father's name only by default. **Evidence:**
`test_center_review.test_g05_*` (refused before publishing, picture drawn and downloaded as PNG, three certificates printed).

## Bubble sheets: print, photograph, check, save (review G01, G02, plan P9.1 - 2026-10-05)

**Why:** marking a weekly MCQ quiz for 40 students by hand takes a teacher an evening; the plan asked for sheets read by a phone.
**What:** one geometry in millimetres (`js/omr.js`) draws the A4 sheet as SVG (prints at true size, no margins) and reads its photo:
grey levels, a threshold from the picture itself (Otsu), the four corner squares as the blobs nearest the photo's corners, a
perspective map (homography, 8x8 solve), and the darkness inside each bubble. A row with no mark or two marks is flagged, an unknown
code asks the person to choose the student, and nothing is saved before the person presses Save. The server recomputes the score
from the answers and the key.
**Decisions:** no library, no upload - the photo never leaves the phone or PC; max 75 questions (three columns of 25 beside the code);
the code is five columns of 0-9 (all centre codes are 5 digits).
**Evidence:** `tests/test_omr.py` - sheets drawn with known answers, then turned up to 10°, in perspective, blurred, darker, noisy,
on dark tables, with full and light pen marks: 960/960 bubbles right (plan target 98%); a blank photo is refused; a page claiming
20/20 for 3 right answers is stored as 15; the teacher journey (Arabic key, named sheets, photo, check, save) in Chromium.
**Limits:** not yet tried with real printers and phone cameras at the centre.

## Every role tries what it must not do (review E02 - 2026-10-05)

**What:** `tests/test_center_roles.py` signs in as each built-in profile (front desk, teacher limited to one teacher, assistant,
accountant, viewer) and sends the requests its screens never offer: reverse a receipt, approve a settlement, read reports, export
everything, manage people, read the security log, edit a receipt through the generic save, switch remote work on, read the gateway
secret, check in another teacher's student, take money, enter marks, write anything as a viewer. All are refused by the server.
**Found:** the Assistant profile has `door.use` (to take attendance at the door), and the server treated `door.use` as permission
to see money: the student file carried every payment and the door card every balance. The spec says assistants see no money. The
server now removes balances, money in advance and payments for anyone without `money.view`/`money.collect` (`money_filter`), and the
door card shows the groups only for them.
**Lessons:** hiding a screen is not a permission; the test must ask the server directly, as an attacker would.

## Documents for every reader, help inside the program, a tested disaster drill, a safer installer (review E10, F01-F10 - 2026-10-05)

**Why:** the people of a centre are not technical; the owner, the desk, a teacher, an assistant and a parent each need one page in
their words with the screens they will see, and the next technician needs to know where everything is and how to recover.
**What:** README, DESIGN, OPERATIONS, the hessa skill, five Egyptian-Arabic guides with pictures taken from the real program
(`tools/make_screens.py`, fictional sample centre), 15 help topics, `test_recovery` (dead disk, restore from the USB copy on a new
PC), installer in Arabic first with the firewall limited to private networks.
**Found:** the OPERATIONS draft said "restore from the second folder" - true only after copying the file into the new PC's backup
folder, and accounts are not part of a restore; the doc now says exactly that, and the test does exactly that.
**Lessons:** a recovery step is real only when a test performs it; a guide is right only when its button names are copied from the
dictionary, not remembered.
**Evidence:** `test_recovery`, `test_ci.InstallerTest`, `test_design` (every help question translated), the guide pictures.

## Acceptance on a full sample centre: phones, big fonts, two screens, the door peak (review E03-E05, E11 - 2026-10-05)

**Why:** "it works" had only been shown on desktop widths and small fixtures.
**What:** `tests/test_acceptance.py` builds the 420-student sample centre and (a) opens all 21 routes on a 360 px phone in Arabic and
English, night theme, extra-large font, failing on any console error or anything wider than the screen; (b) checks in a student
through the API and times the other door screen: under 3 s, and no `/api/state` request; (c) scans 30 cards (find + card +
check-in) - 1.2 s; (d) removes the sample without touching a real record.
**Found and fixed:** (1) six pages pushed sideways on a phone with the big font - fixed minimum column widths (22rem = 385 px at
XL) on every auto grid, side-by-side layouts that never collapsed, a segmented control that could not wrap, grid cells that grew to
their content; (2) the door told a student who arrived after the roll call marked him absent "already: absent" and left him absent
(he sat the session, was not charged, and the parent saw an absence) - he is now checked in with his arrival time.
**Lessons:** an acceptance sweep with the hardest settings (smallest screen, biggest font, RTL, dark) finds in minutes what a
desktop check never shows; a check-in rule written for "scanned twice" must not swallow "came late".
**Evidence:** `test_acceptance` 4/4, `test_center_review.test_a_student_marked_absent_who_arrives_is_checked_in`.

## The inherited tests now test the centre (review E07-E09 - 2026-10-05)

**Why:** since the fork, 6 browser scenarios and 25 multi-PC scenarios still wrote trips, vehicles and drivers, failed, and were left
out of CI - so the most valuable engine checks (outages, conflicts, crashes, tampering, restore, four PCs, people and profiles,
joining) were not running for Hessa at all.
**What:** the browser trip scenarios became `CentreAdminTest` (teacher-scoped account end to end, Recycle Bin, student import, slides,
report presentation). The multi-PC file kept every scenario and only changed its neutral record: a teacher (scope = its own id) and
settings rows for attachments; three assertions now compare sorted permissions. CI got `test_multinode` and a `browser` job.
**Found:** `store.py` refused `/files/../x` only in a top-level `src`; a setting value (the centre logo) could carry one - fixed.
**Lessons:** a red test left aside is a hole in the net, not noise: migrating it found a real gap in an afternoon.
**Evidence:** `test_multinode` 35/35 (about 3 minutes), `test_e2e_browser` 12/12, `test_ci` checks both CI selections.

## Work from outside the centre, safely (owner's request, review D01-D08 - 2026-10-05)

**Why:** the owner wants to run Hessa on the centre PC and work on it from a phone or another computer over the internet, without
ever opening the centre PC to the internet (a project rule).
**Decision:** no relay of our own. A secure tunnel program on the centre PC calls out (Tailscale - recommended, free, private to the
owner's devices, also carries laptop sync - or Cloudflare Tunnel for a public address with a domain). Building and hosting our own
relay would mean a server with the children's data outside the centre, a second login system and a new sync path - all risk, no gain.
**Found while designing it:** a tunnel hands requests to the program from 127.0.0.1, and the program trusted 127.0.0.1 as "the PC
itself" - so installing any tunnel would have opened the first-start screen, joining and the backup-folder settings to the whole
internet. Now a request that carries proxy headers (or comes from a Tailscale address) is "outside": refused until the
administrator switches remote work on at the centre, and then only for people with `remote.use`.
**What:** `outside`/`via_proxy`/`https` in app.py, the forwarded address (never a loopback one) in logs and lockouts, Secure cookie +
HSTS behind HTTPS, Origin checked against the forwarded host, Settings → Remote work (switch, last request, allowed people, the two
ways), `docs/REMOTE_ACCESS.md` in Egyptian Arabic, copied next to the program by the installer.
**Lessons:** "local" must mean the TCP peer AND no proxy in between; any feature that trusts 127.0.0.1 must be re-read whenever a
proxy appears.
**Evidence:** `tests/test_center_remote.py` (7): off by default with a page in both languages; a tunnel request is never local even
with a spoofed `X-Forwarded-For: 127.0.0.1`; only `remote.use` signs in, a refused session is ended at once, permission taken away
mid-session is enforced, logs carry the real address; switching on only at the centre; a foreign Origin is refused; a payment from
home retried with the same key is one receipt; Tailscale address ranges. `test_center_review.test_d_*` drives the switch in Chromium.
**Limits:** not tried with the owner's real Tailscale/Cloudflare accounts and a phone on 4G yet.

## The parent's link, from the centre PC to the phone (review C01-C06, P7 - 2026-10-05)

**Why:** the parent page was still the driver page of the trip system (odometer photos, trip events), the gateway still accepted
phone writes, the setup screen could not show the office secret Cloudflare needs, there was no "Parent link" in the student file,
and exams had no "show to parents" switch - so every half-entered mark would have reached parents.
**What:** (1) Worker: parents can only read one card; every write route of the old driver page is gone with its tables; a replaced
or removed link becomes a "stopped" row for 30 days (410), so the phone shows "this link no longer works" and its service worker
deletes the saved copy, instead of "not ready yet". (2) A new parent page (Formal Arabic first, English, light/dark, system fonts,
29 KB): money per group, the next seven days as the timetable really is, published marks with the rank, attendance dots with the
rate, payments; offline it shows the last copy with its age. (3) The office card adds the week and the amount due, and only marks of
exams whose teacher pressed "Shown to parents". (4) Settings → Parent links became a guided 4-step setup with a live status line;
gateway errors carry a dictionary key (`gw.err.*`) so the reason reads in Arabic; showing the office secret or the setup code is
written in the security log. (5) The student file has a "Parent link" tab: create and copy, create and send by WhatsApp (the same
"was it sent?" sender), replace.
**Mistakes found:** the gateway status counted stopped links as cards; the settings test asserted the old form. Playwright's offline
switch does not reach service-worker requests, so the offline test stops the real gateway instead (closer to a real outage anyway).
**Lessons:** a link that was revoked must answer differently from a link that never existed, or the phone cannot know to forget.
**Evidence:** `gateway/test/gateway.test.js` (12: read-only, no token stored, stopped = 410 and cleaned, size < 120 KB, no inline
styles, bundle); `tests/test_gateway_parent.py` (real Worker code under node + centre server + Chromium at 360 px: one child per
link, draft marks hidden, no phone numbers, English, an update arrives, the last copy opens when the mailbox is down, a replaced
link stops and nothing of the child stays on the phone, the centre keeps working when the mailbox is down);
`test_center_review.test_c05_*` (setup page, student tab, exam switch).
**Limits:** not yet tried on a real Cloudflare account or an old Android phone (TASKS P7.3 sub-task).

## Daily work: history buttons, readable security log, month in Excel, school statement, receipt paper (review B04-B08 - 2026-10-05)

**Why:** the review listed what the desk and the owner still did by hand or could not read: no history in the group panel or the
lists, the security log in English inside the Arabic screen, no spreadsheet of the month, no statement for school support groups, and
receipts only on an 80 mm roll.
**What:** (1) "History" in the group panel and every list editor opens the existing history-of-one-record dialog (undo included). (2)
`HS.audit.securityDetail` turns each fixed English sentence the server logs into a dictionary text with its values; a change list
("Role: a -> b; Permissions added: …") is translated part by part, permission ids become their names. The stored log is evidence and
stays as written. (3) Reports → Excel: 8 sheets through the existing `/api/xlsx`, built from the same scoped `/api/c/reports` answer
the screen shows. (4) `GET /api/c/school?groupId&ym` and its dialog/print/Excel. (5) Receipt paper per PC with a test print.
**Mistakes found:** `@page receipt { size: 80mm auto }` is not valid CSS, so Chromium silently printed every receipt on an A4 page -
found only because the new test reads the paper width back from a real PDF. The page is now measured and sized in mm at print time.
**Lessons:** print CSS must be tested by printing (PDF), not by reading the CSS. A translation table for log sentences needs a test
that scans the server for every sentence, or the next new sentence silently stays English.
**Evidence:** `tests/test_center_review.py` - `SchoolStatementTest` (split 15%/80% with a reversed receipt), `SecurityWordsTest`
(every literal log sentence in auth/app/sync/nodectl matches a pattern; every key in both dictionaries), browser tests for history
buttons + Arabic security log, the Excel workbook's sheet names, the school statement dialog, and the PDF paper width of 80/58/A5.
**Limits:** real thermal printers at the centre are still to be tried (B04 sub-task).

## The desk sees what the centre PC really saved (review A04-A07, B01, B02 - 2026-10-05)

**Why:** the completion review found four places where the screen and the truth could differ: the door read its sound and
auto-check-in switches from the browser while Settings saved them for the centre (so switching them off did nothing); opening a
WhatsApp chat was logged as "sent" even when the person cancelled; a lost connection left every save button looking usable; and the
Windows build stopped at the very end on two missing documents.
**What:** (1) the door reads `doorSounds`/`autoCheckin` from the centre settings - one switch for every PC, missing = on. (2) The
message sender asks "Did it go?" after the chat opens; only "Yes, sent" logs the follow-up and counts; a failed save says so and
can be repeated; the door and the student file use the same sender. (3) The browser refuses writes while `/api/version` fails
(`err.offline`), shows a bar on every page and dims the save buttons; a request that got no answer says so (`err.noAnswer`) and
triggers an immediate poll. Every payment dialog sends one random key; the server stores the receipt under `pk<key>`, so a Save
pressed again after a lost answer returns the first receipt (single and family payments). (4) `GATEWAY_SETUP.md` and
`RELEASE_NOTES.md` exist; `tools/build_windows.py --check` checks every shipped file and that the notes describe the version, and
CI runs it on each push. (5) The door card sells a handout (the student's teachers' handouts first; the server refuses more than
the stock) and takes money in advance, reusing the Money dialog with the student fixed. Version 1.1.0 (it continues after the
engine's 1.0.2; never lowered).
**Mistakes:** the earlier browser test clicked "Open WhatsApp" and asserted a follow-up - it tested the bug as the feature. The first
offline code used `toggleAttribute`, missing in older Android WebViews and in the Node test DOM - `setAttribute`/`removeAttribute` now.
**Lessons:** a log row must record what the person confirmed, never what the program merely started. A retry-safe write needs an id
chosen before the first try.
**Evidence:** `tests/test_center_review.py` (7 tests: same key = one receipt, bad key ignored, family batch once, stock refused, the
door obeys both switches incl. the beep count, offline bar + refused write + nothing saved after reconnect, handout + top-up from the
card); updated `test_e2e_center` message scenarios assert nothing is logged before "Yes, sent".
**Limits:** a phone that keeps a page open while the centre PC is off sees the bar only after its next 2-second poll.

## Personal link of a staff member works again (2026-10-05)

**Why:** review item A03 - the personal-link page asked for `js/quick.js`, which did not exist, so the link never signed in by itself; the
page was English only and showed broken characters ("â€¦") where an ellipsis was meant.
**What:** `js/quick.js` sends the page's own sign-in form once (a chat preview or a scanner does not run it, so it signs nobody in; the
POST rule on the server is unchanged). When another person is signed in, the page still asks first and never switches by itself. The
page is Arabic first with English below, and the log address `/k/…` is written correctly.
**Mistakes:** the file was referenced since the fork and no test opened the link in a browser - the console error went unnoticed.
**Evidence:** `tests/test_center_links.py` (the script is served, a preview signs nobody in, POST signs in, another signed-in person is
asked, a dead link answers 404, and Chromium lands in the app without console errors) - fails without the script, passes with it.

## Parent link: the right address, and old links really revoked (2026-10-05)

**Why:** the completion review (A01, A02) found that the link sent to parents could not open their child's page, and that replacing a
link only changed the hash on the centre PC - the gateway kept the old card, so a link sent to the wrong number kept working.
**What:** the link is `<gateway>/t/<token>` (the path the gateway serves; a `#token` is never sent to a server). The sender now keeps,
on this PC only, the hashes of the cards the gateway may hold; every round it asks the gateway to delete the ones no student carries
any more (link replaced, student removed). The list is written after each success, so an outage or a restart in between does not lose
the revoke.
**Mistakes:** the earlier test read the token after `#` and so confirmed the broken address instead of catching it.
**Evidence:** `tests/test_center_gateway.py` (a fake gateway in the test: right address, replace, outage + restart, removed student) -
all three fail on the code before and pass after; `test_center_api` test 18 checks the address and the message text.
**Limits:** a link replaced before this version (the hash was never recorded) is not revoked automatically - replace it once more; a
copy already saved on a parent's phone without internet cannot be wiped remotely. The parent page itself is still the inherited one (C02).

## Admin system and data safety, learned from Mr.Ayman-HR (2026-10-05)

**Why:** the owner asked to learn from his other system (BAMS) - its administrator tools, never-lose-data database, the ability to
connect several PCs and its advanced features - and to add what Hessa still lacked. Hessa already shared the engine (signed history,
offline-first sync, soft delete) but almost none of it was reachable from the screens: no way to join a second PC, no Devices page,
no light, a one-table activity log, backups without a second disk, and nothing that told the owner when something was wrong.
**What:** (1) *Devices & Sync* page and a light in the top bar (PCs, decisions, warnings, record check, administrator key, backup
administrator PC) and the first-start screens to **join** the centre PC (find or type the address, live check, first copy, "same PC
or a new one?" for a copied data folder). (2) Joining is closed until the owner presses "Add a PC": a 15-minute window for ONE
PC - stricter than BAMS, whose door stays open - because this system holds children's data. (3) `server/upgrade.py`: a verified
snapshot before every program update, refusal (and no change at all) of data written by a newer program, a plain startup-problem
note; SCHEMA 4. (4) Activity log with *Changes* and *Logins & security*, filters, spreadsheet export and readable before -> after
through one shared `HS.audit`. (5) Settings -> Data: second backup folder, "Check my data now", the five promises, update history.
(6) Overview card "Is everything safe?" (`/api/c/status`) and administrator advisor items (no/old/failed backup, one disk only,
sharing problems, decisions waiting, key not saved, check failed). (7) History of one record and "Undo this change" in the student
file (the undo is a new, permission-checked change: nothing is removed). (8) Merge: derived fields `follow:` their source so the owner
never sees "nameKey" as a four-button decision. (9) Help topics and the administrator guide, both languages.
**Decision:** BAMS "office mode" (a thin PC that only opens the administrator PC) is not ported: a browser on the centre PC's address
is exactly that and needs no installation; the Add-a-PC dialog now explains "join" versus "just open the address".
**Mistakes (found by the new tests, not by users):** the existing *Activity log page crashed on open* - it called `HS.pageHead`, a helper
that never existed; the existing change log showed **parents' phone numbers** in before/after to anyone with `logs.view`; `_archive_copy`
(used when a data folder is set up as a new PC) left `center.db` behind because it matched the wrong file name; the first join
refusal was swallowed by the port fallback and shown as "not the administrator PC"; I escaped values twice (`&amp;amp;`) in the first
Devices page; a wide backups table stretched the whole Settings page to 431 px on a 390 px phone; a CSV of typed names could run
`=HYPERLINK(...)` in Excel; Playwright `wait_for_function` is blocked by the page's CSP (no `eval`).
**Lessons:** open every page in a real browser at least once (a static check now also fails when a page calls a helper that does not
exist); anything that displays history values must go through one masking function; a security default of BAMS (open join door) is not
automatically right for another product - decide per product; screenshots at 390 px in Arabic found three layout problems no assertion would.
**Evidence:** new tests - safety (update copy, newer-data refusal, archive copy, history privacy, Data tab in a browser, status and advisor
over the real backup state, record history and undo in a browser), join (API and browser), Devices page (two real PCs, a real conflict decided
from the screen, record check, add and remove a PC, the Activity log with filters, export and a phone), design (helper calls exist), frontend
(readable history, CSV safety, activity log, status card). Failing-before/passing-after was shown for the history privacy fix, the archive
copy and the missing helper. Screenshots checked in Arabic/night 390 px and English/daylight 1280 px.
**Limits:** the history button exists in the student file and as a link from the Activity log (the API serves any record); undo covers plain
fields only (money, fee history, timetables and codes keep their own screens); the detail sentences of the security list are English
from the server; the backups table scrolls sideways on a phone.

## The last edge cases: sibling payment, Ramadan timetable, extra session (2026-10-05)

**Why:** the owner asked for all the remaining steps in one go.
**What:** (1) The door card's "Pay for brothers and sisters" opens one dialog listing every child and group of the family
with what each owes; the lines are saved by `pay/many` in one commit with consecutive receipt numbers and one printed
sheet; cash change and the repeated-reference check work there too. (2) A group can have one temporary timetable (Ramadan,
exam weeks): between two days it replaces the weekly times, the sessions of those days follow it, and the clash check sees
the regular times before it, the temporary ones during it and the regular ones after it; the timetable grid shows what is in
force today. (3) "Extra session" on the group panel adds a one-off session (`kind extra`, deterministic id like any other)
and refuses a teacher or room that is already busy; a cancelled one at the same time is brought back. (4) The school name
appears in the door search results, and extra sessions are marked in the day strips. `domain.clashes` now lists a clash
once even when a split group meets the same group on both sides of its temporary period.
**Mistakes:** the first test of the temporary timetable expected one clash but a split group produced two for the same
pair (before and after the period) - the function now deduplicates; my browser scenario clicked through the group panel I
had left open (the scrim intercepted the click - a test problem, closed the panel like a user would).
**Evidence:** new tests - domain (temporary timetable and its clashes), API (extra session, temporary timetable saved and
driving sessions, family lines without contact details) and a Chromium scenario (school in search, family dialog with change,
saved receipts of one batch, extra session, temporary period incl. the half-filled refusal); screenshots checked in Arabic/night
at 390 px and English/daylight at 1360 px, no console errors.
**Limits:** one temporary period per group; the sibling dialog pays groups the children are enrolled in (no handouts or
wallet); wallet top-up and handout sale on the door card are still open.

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
