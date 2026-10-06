<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Operations — running, maintaining and recovering a centre's Hessa

For the technician who looks after the centre's PCs, and for the next developer. Commands are for Windows (installed program);
the portable/development version does the same with `python3 server/app.py` and `python3 server/nodectl.py <command>`.

## Where things are

| What | Installed | Notes |
|---|---|---|
| Program | `C:\Program Files\Hessa\Hessa.exe` | replaced by updates; holds no data |
| Settings of this PC | `%ProgramData%\Hessa\config.json` | port 8095, sync port 8463, second backup folder, remote work switch |
| Data | `%ProgramData%\Hessa\data\` | `center.db` (records), `journal.db` (signed history - the source of truth), `auth.db` (accounts), `uploads\` |
| Parent-link secrets | `data\gateway.json` | this PC only, never in the shared data; `gateway-cards.json` = hashes of cards to revoke |
| AI question key (optional) | `data\ai.json` | this PC only (readable by this Windows account), never in the shared data, backups or logs; Settings -> AI questions |
| Backups | `%ProgramData%\Hessa\backups\` + the second folder | every 6 hours and before every update, verified |
| Logs | `data\logs\server.log`, `data\logs\sync-YYYY-MM.jsonl` | no passwords, no link tokens |

Ports: **8095** (the screens, the centre's network only), **8463** (sync between the centre's PCs, its own TLS and device keys).
Neither is ever opened to the internet: parent links go through the Cloudflare mailbox (`GATEWAY_SETUP.md`), work from home
through a tunnel that calls out (`REMOTE_ACCESS.md`).

## Maintenance tools

`Hessa.exe tool <command>` from a command window (as administrator):

| Command | Does |
|---|---|
| `status` | this PC, its role, the history size, every PC of the centre, the data fingerprint |
| `verify` | checks every signature of the whole history (exit code 2 when something is wrong) |
| `rebuild` | folds the history again into a fresh `center.db` (the records file is only a view of the history) |
| `reset-admin` | emergency: new temporary administrator password, on the administrator PC only |
| `export-authority <file>` / `import-authority <file>` | moves the administrator key (passphrase protected) to another PC |

In the program: Settings → Data → **Check my data now** (databases + whole history), Devices & Sync → record check.

## Recovery drills (review E10) — what to do, and what the tests prove

| It happened | Do | Proven by |
|---|---|---|
| The disk of the centre PC died | **Several PCs**: every joined PC holds the full data and history - make it the administrator PC (`import-authority` with the saved key, or the backup administrator PC takes over by itself) and join a new PC to it. **One PC only**: install Hessa on the new PC, create the administrator, copy the newest `db\to_*.db` from the second backup folder (USB/other disk) into `%ProgramData%\Hessa\backups\db\`, then Settings → Data → restore it. Accounts are not restored with data (a restore never brings back an old password): create them again. | `test_recovery` (one PC), `test_multinode.T30_Restore`, `T36_BackupAdminPC` |
| Someone deleted many records | Settings → Data → **Recycle Bin**, or restore a backup: a restore is a new change on top (work done on other PCs afterwards survives) | `T30_Restore.test_restore_is_a_change_not_a_rollback` |
| An update failed | The update made a verified snapshot first; the program refuses data written by a newer version and never touches it | `test_center_safety`, `test_unit` (upgrade) |
| A data folder was copied to another PC by mistake | On start the copy asks "same PC or a new one?"; a copy is never allowed to pretend to be the original | `test_center_join` |
| A PC was removed while switched off | It learns it was removed at the next contact and stops syncing; nothing it holds is lost | `T36_BackupAdminPC.test_z_removed_while_off` |
| History tampered with | `verify` and the record check show it and say which PC | `T29_Tamper` |
| Two PCs edited the same record offline | Devices & Sync → **to decide**: the administrator chooses; money is never merged (each receipt is its own record with its PC letter) | `T11_Conflicts`, `test_center_multinode` |
| The internet is down | Nothing changes inside the centre; parent cards and remote work wait | `test_gateway_parent.test_c`, `test_center_remote` |
| The centre PC is off | Phones and other screens show "Connection to the centre PC lost" and save nothing; PCs with their own copy keep working and catch up | `test_center_review.test_a07`, `test_center_network` |

Practise one drill per term on a spare PC with the sample centre: restore yesterday's backup and compare the overview numbers.

## Adding a field or a page (for the next developer)

- **A field**: add it to `store.ENTITIES` (js name, column, kind, Excel header); the table gets the column by itself. Validate in
  `center.normalize_ops`, show it with keys in both dictionaries, and say in `upgrade.py` if the schema number changes.
- **A page**: `js/views/<id>.js` (`HS.views.<id> = HS.withData({render, mount})`), add it to `index.html` in the order of
  EXECUTION_PLAN P1.1 and to `PAGES` in `js/shell.js`, both dictionaries, a browser test that opens it, and a route in
  `tests/test_acceptance.PAGES` so it is checked on a 360 px phone.
- **An operation that changes money or attendance**: a function in `center.py` (`ctx.need`, `ctx.need_teacher`, `Problem('err.*')`,
  one `ctx.commit`), a route in `app.py`, never the generic `/api/commit`. Payments take a `key` so a retry is taken once.
- Before every push: the checks in `CLAUDE.md` / EXECUTION_PLAN Part G. Never push to `main`, never force-push.
