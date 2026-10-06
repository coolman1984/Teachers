---
name: hessa
description: Working memory for changing Hessa (the tutoring-centre system) - where things are, the rules that must never break, the checks before a push. Read it before touching server/, js/ or gateway/.
---

<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../../../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Hessa — short working memory

Read `CLAUDE.md` (rules), then `docs/EXECUTION_PLAN.md`, `TASKS.md`, and `DEVELOPMENT_HISTORY.md` before money, sync or attendance.

## Never
- Lose data: soft delete; receipts and expenses are never edited or deleted - a reversing record is added.
- Store a running balance: balances are computed from attendance + receipts (`center.balances`, one account per student + group).
- Open the centre PC to the internet. Parent links go through `gateway/` (read only); remote work through a tunnel, and any request
  carrying proxy headers or from 100.64.0.0/10 is "outside" (`app.py` `outside`), refused unless remote work is on + `remote.use`.
- Put parents' phone numbers in the parent card, logs or exports for users without `contacts.view`; secrets in the shared DB or logs.
- Treat 127.0.0.1 as "the PC itself" without checking `via_proxy`.
- Push to `main`, force-push, or commit real names, phones or the owner's files (public repository).

## Where
| Need | File |
|---|---|
| a rule (fees, risk, clashes, codes) | `server/domain.py` (pure, table-tested in `test_center_domain`) |
| an operation (door, pay, enrol, settle) | `server/center.py` + route in `app.py` `center_get`/`center_post` |
| a field | `server/store.py` `ENTITIES` |
| a permission | `server/auth.py` `PERMISSIONS` + `perm.<id>` in both dictionaries |
| a page | `js/views/<id>.js`, `index.html` order, `js/shell.js` `PAGES`, `tests/test_acceptance.PAGES` |
| words | `js/i18n/en.js` + `js/i18n/ar.js` (Formal Arabic); guides in `docs/GUIDE_*.md` are Egyptian Arabic |
| parent card / gateway | `server/gateway_client.py` `card_for`, `gateway/src/worker.js`, `gateway/public/app/*` |
| guide pictures | `python3 tools/make_screens.py` (fictional sample centre) |
| in-app guides / situations | `js/views/guides.js` (steps + selectors) and `gd.<id>.*` / `sit.<id>.*` in both dictionaries; `[[key]]` names a button by its label key; a new button a guide points at needs a stable `data-` attribute |
| trial sign-in, app window | `auth.py` `trial_setup` (`dev_login`), `server/appwindow.py` (`app_window`) |

## Patterns that already exist - reuse them
- Payment retried after a lost answer: send `key` (random hex per dialog); the receipt id is `pk<key>`.
- "Was it sent?": `HS.waQueue` - opening WhatsApp is never logged as sent.
- Offline: `HS.api` refuses writes while `/api/version` fails (`err.offline`); never queue writes in the browser.
- Errors to people: `Problem('err.x', English, **vars)` / `GatewayError(msg, 'gw.err.x')`; fixed log sentences are translated in
  `HS.audit.securityDetail` (add a pattern when you add a sentence - `SecurityWordsTest` fails otherwise).
- Phone layout: grids use `minmax(min(Xrem, 100%), 1fr)`; check with `test_acceptance` (360 px, XL font, both languages, dark).
- Receipts: `HS.printReceipt` measures the page; paper per PC in prefs.

## Checks before a push
```
node --test tests/test_frontend.js && python3 -m pyflakes server/*.py tools/*.py tests/*.py
cd tests && python3 -m unittest test_unit test_convergence test_design test_ci test_center_domain test_center_api test_center_review test_center_remote test_xlsx
python3 -m unittest test_sample test_multinode test_gateway_parent test_recovery            # before a PR
HS_CHROMIUM=/opt/pw-browsers/chromium python3 -m unittest test_e2e_center test_e2e_browser test_acceptance
cd ../gateway && node --test --no-warnings test/gateway.test.js
python3 tools/build_windows.py --check
```
Add a regression test for every bug; tick `TASKS.md`; add a `DEVELOPMENT_HISTORY.md` entry (what, why, mistakes, lessons).
