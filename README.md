# Hessa (حِصّة) — the tutoring-centre system

Hessa runs an Egyptian private-tutoring centre (سنتر) on its own PC: students, groups and timetable, the front desk (check-in by
card, name or phone in under three clicks), fees and receipts that are never deleted (only reversed), cash shifts, handouts, exams
and ranks, early warning of students about to leave, teacher settlements, profitability, a read-only link for parents, and work
from home through a secure tunnel. It works with **no internet**, keeps several PCs of the centre in sync, and is fully bilingual
(Formal Arabic first, English) with light and dark themes and a phone layout.

| For | Read |
|---|---|
| The centre's people (Egyptian Arabic, with pictures) | [Owner](docs/GUIDE_OWNER.md) · [Front desk](docs/GUIDE_DESK.md) · [Teacher](docs/GUIDE_TEACHER.md) · [Assistant](docs/GUIDE_ASSISTANT.md) · [Parent](docs/GUIDE_PARENT.md) |
| Setting up | [Parent links](docs/GATEWAY_SETUP.md) · [Work from outside](docs/REMOTE_ACCESS.md) · [Administrator](docs/GUIDE_ADMIN.md) |
| Running and repairing it | [Operations](docs/OPERATIONS.md) · [Build and release](docs/BUILD_AND_RELEASE.md) · [Release notes](docs/RELEASE_NOTES.md) |
| Changing it | [CLAUDE.md](CLAUDE.md) (rules) · [Design](docs/DESIGN.md) · [Execution plan](docs/EXECUTION_PLAN.md) · [Tasks](TASKS.md) · [History](DEVELOPMENT_HISTORY.md) |
| Branch consolidation and verified limits | [Integration review](docs/INTEGRATION.md) |

## Run it

```
cd server
python3 app.py            # Python 3.11+, standard library only
```

Open http://localhost:8095 on the same PC: the first start creates the administrator. Other PCs and phones of the centre open
`http://<centre-pc>:8095` (Overview → "Open on phone" shows the address and a QR code). To try it with a fictional centre:
Overview → **Load sample centre**; Settings → Data → **Delete all sample data** removes it again without touching real records.

On Windows the installer (`Hessa-Setup-<version>.exe`, see Build and release) installs it as a program that starts with Windows and
keeps its data in `%ProgramData%\Hessa`.

## Test it

```
node --test tests/test_frontend.js
python3 -m pyflakes server/*.py tools/*.py tests/*.py
cd tests
python3 -m unittest test_unit test_convergence test_design test_ci test_center_domain test_center_api test_center_review test_center_remote test_qbank test_ai test_xlsx test_integration
python3 -m unittest test_sample test_multinode test_gateway_parent                       # several PCs, the parent link (~5 min)
HS_CHROMIUM=/opt/pw-browsers/chromium python3 -m unittest test_e2e_center test_e2e_browser test_acceptance   # real browser
cd ../gateway && node --test --no-warnings test/gateway.test.js
```

The browser tests need Playwright (`pip install playwright`) and a Chromium or Chrome (`HS_CHROMIUM`); they are skipped without
them. `python3 tools/build_windows.py --check` checks every file the installer ships.

## How it is built

- `server/` — Python standard library only: an HTTP server (`app.py`), the signed append-only history and multi-PC sync engine
  (`journal.py`, `replica.py`, `sync.py`), the data store (`store.py`), the centre's rules (`domain.py`, pure) and operations
  (`center.py`), accounts and permissions (`auth.py`), the parent-link sender (`gateway_client.py`).
- `js/` — plain browser JavaScript, no framework: one file per page in `js/views/`, both dictionaries in `js/i18n/`.
- `gateway/` — the optional internet mailbox for parents' links (a Cloudflare Worker + D1, no dependencies), with its own page.
- `tests/` — real HTTP servers, several PCs with cut-able network links, and Chromium.

Nothing about a real centre belongs in this public repository: every name in the tests, the sample centre and the guide pictures
is fictional.
