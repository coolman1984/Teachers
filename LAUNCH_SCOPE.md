# First-sale contract — Hessa

**Decision:** first commercial priority, a limited assisted pilot for one small tutoring centre, one reception desk and one primary Windows PC. Sell “know who attended, who paid, who owes money, and what is in the drawer.” Additional users/devices are included only after verifying their actual setup.

## First paid pilot: included core

Students and enrolments; groups/basic timetable; find a student and record attendance manually/by code; supported fee collection and receipt; expenses; cash-shift opening/closing; basic balances/day or month report/export; roles; correction/reversal and verified backup/restore. Select and validate the customer's actual fee model rather than promising every possible arrangement.

**Acceptance journey:** create student → enrol in group → check in → collect fee once → print agreed receipt → correct through reversal if needed → close drawer → export report → restore on another PC and confirm balances/records. A reception user cannot access administrator-only actions or another teacher's restricted data. Network failure and payment retry must not produce duplicate money.

## Later releases and separately accepted extras

| Lane | Features | Boundary |
| --- | --- | --- |
| Next release / optional add-on | Parent links, teacher settlements/profitability, handouts, basic exams/results, follow-up, additional PCs | Preserve existing implementations; include in a quote only after relevant real setup and user acceptance |
| Later enhancements | Question bank expansion, AI question generation, camera bubble-sheet marking, public teacher pages, remote work, automated messaging | Not first-sale gates; real service accounts, phone/printer/tunnel checks remain when relevant |
| Future discovery | Video protection/hosting, larger multi-site or hosted service, new school-specific packages | New scope needs owner/customer decision; not a promised delivery |

Parent links/public pages need a tested live gateway; AI needs a real service-account check; camera marking needs real printed sheets/phone photos. Existing code for these is not automatically part of the paid pilot. No school regulation/compliance claim in the basic offer.

## Repository facts at decision time

Main at 55596d6 contained all five existing branch heads' application work; the default Claude branch was older than main. No published Hessa release existed at review time. Green source/browser checks are not a clean-Windows install, real printer test or live gateway proof. Recheck these facts before choosing a candidate; do not use a branch name or an old integration document as acceptance evidence.

## Authority and agent workflow

Owner-approved on 6 October 2026: prioritize a narrow first paid pilot over completing the entire historical roadmap.
This document takes precedence over older launch scope, mandatory optional features, and instructions to take the first unchecked historical task. Later explicit owner instructions still win.

Read this file before CLAUDE.md, TASKS.md and the older execution plans. Select the earliest unverified **launch gate** below; do not start a deferred feature merely because it is unchecked in TASKS.md. Completed checkboxes record implementation history, not customer acceptance. Keep existing features/code/data; deferral changes the sales promise and work priority, not implementation status. Fix regressions and security/data risks in existing optional features if they can affect the core, or explicitly isolate/disable the affected path through reviewed implementation. This documentation update does not itself change or hide the UI.

Record each work slice in DEVELOPMENT_HISTORY.md: branch/source commit, gate, actual checks, skips, remaining dependency and next step. Recheck this contract from origin/main before starting and before publishing work; merge or cherry-pick the latest documentation if an old session lacks it. Never overwrite another agent's work, force-push or merge application changes merely to distribute these docs. Use a PR for main. All branches carry the same contract, but may have different application code; no branch-wide code/readiness equivalence is claimed.

## Minimum quality that cannot be traded away

- Correct money and historical calculations for the explicitly supported pricing model; no silent duplication on retry.
- Server-enforced roles and access to records, reports, contacts and attachments.
- Visible save success only after saving; understandable failure/retry; manual recovery with an audit trail.
- Verified backup and restoration on a different clean Windows PC; records and identities needed for the promised use survive.
- Install/start/restart and safe upgrade on the exact customer candidate; do not sell an old binary as the current source.
- Keep existing design and simple Arabic guidance. Restrict the supported deployment rather than adding architectural scope.

Acceptable compromises: manual entry, operator-assisted configuration/training, one site/primary PC, a small feature set, manual scheduled backups with a proven restore process, and later visual polish. Never waive a core data/security failure under “not perfect”. Advanced support tooling, automatic updates, commercial licensing automation and presentation films are not first-pilot dependencies. Customer support may be attended and manual. A wider self-service/public release needs its own verified distribution/signing/support decision; do not label the limited pilot a general production release.

## Launch gate ledger — no acceptance claimed by this documentation

| Gate | Evidence required | Current contract status |
| --- | --- | --- |
| L1 Candidate | One explicit source commit, integrated required fixes, matching installer and clear supported scope | Pending candidate selection/verification |
| L2 Core journey | Real user completes the journey below, including correction, retry and denied-role paths | Pending exact-candidate acceptance |
| L3 Windows and devices | Clean install, restart, safe upgrade; test the actual printer/phone only when included | Pending field verification |
| L4 Recovery | Backup then restore to another clean PC; verify records, totals, login and required configuration | Pending field drill |
| L5 Paid pilot | One named customer/site, agreed limits, assisted onboarding and documented support | Pending customer agreement |
| L6 Quote and handoff | Written scope/exclusions, acceptance checklist, support terms and separately priced extras | Pending customer-specific quotation |

Do not assign future software version numbers now or lower/bump the application's version for this docs-only change. “Next release” below is a commercial roadmap lane, not a claim that code is absent or an irrevocable delivery date. Start outreach/quotations while gates are being closed; customer operational use waits for the applicable gates.

## Quotation / RFQ contract

Quote one site, the supported device/user allowance, setup and data-import limits, training, license and bounded support. Itemize optional internet services, hardware and later features separately. Price from onboarding/support cost and customer willingness to pay; no price was approved here. Write the customer's acceptance scenario and supported capacity into the quote. No tax/accounting certification, guaranteed message delivery, unlimited hosting or “never lose data” claims. A hosted multi-customer service is a separate future decision, not silently included in this local pilot.

## Branch distribution

This owner decision is distributed as documentation-only commits to every existing remote development branch and main via a documentation PR. Snapshot targets: `ccr-abf37473-lvpces`, `claude/ecstatic-wright-9hzizi`, `claude/modest-ride-c2mpdx`, `codex/teachers-integration`, `main`. New branches must inherit it from main. Active agents must fetch and integrate it; uncommitted sessions are not updated automatically.
