<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Hessa (حِصّة) – rules for every change

Owner: Mohamed. Users are centre owners, front-desk staff, teachers and assistants who are **not technical**; parents use a phone link.
Fork of the owner's Trip Orders engine (`coolman1984/Yousef-Transportation`) – same engine, same design, same discipline.
Start with `docs/EXECUTION_PLAN.md` (the playbook – read all of it), then `TASKS.md` (where to continue).

## Always
1. Same commit: code + tests + **both** dictionaries (`js/i18n/en.js`, `js/i18n/ar.js` – screens in **Formal Arabic**; help texts `gd./sit./hq./help./guide./sup./tour./slide.` in **polished Egyptian Arabic** a 12-year-old understands, owner 2026-10-08) + docs,
   `TASKS.md` tick, `DEVELOPMENT_HISTORY.md` entry (newest first: what, why, mistakes, lessons).
2. Run the checks in EXECUTION_PLAN Part G before every push; a regression test for every bug.
3. Server: Python standard library only. Browser: plain JS like the existing files. No frameworks.
4. Every write is permission-checked on the server, scoped to the user's teachers, audited, and reversible.
5. Replies to the owner: simple Egyptian Arabic, conclusion first, then steps, then decisions with defaults.

## Never
- Never lose data: soft delete only; receipts and expenses are never edited or deleted – a reversing record is added.
- Never store a running money balance – balances are computed from attendance and receipts.
- Never make the centre PC reachable from the internet (the parent link goes through the gateway).
- Never put parents' phone numbers in the parent card, logs or exports for users without `contacts.view`.
- Never store secrets (gateway, AI key) in the shared database or logs.
- Never push to `main` or force-push. Never claim a test passed that you did not run.
- This repository is **public**: never commit real names, phone numbers, the owner's files or secrets.
