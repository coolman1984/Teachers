<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Checks and development integration

The current workflow tests every push to main/session branches and every pull request.
It runs the frontend startup/flow checks, gateway checks, current engine/centre/Excel
regressions, sample lifecycle, real two-PC partition tests and the independently preserved
remote centre tests. `tests/test_ci.py` verifies that every selected Python module exists.
Pyflakes checks the server, developer tools and tests before the runtime checks.

Every inherited suite now tests the centre (test_multinode, test_e2e_browser). A separate `browser` job runs the screen tests
with the runner's Chrome (test_e2e_browser, test_e2e_center, test_center_review, test_gateway_parent, test_acceptance).
`python tools/build_windows.py --check` runs on every push and fails in seconds when a shipped file is missing.

Installer builds run on manual workflow dispatch or explicit `v*` tags. A tagged push can
publish an installer; ordinary development merges do not publish a release. To release: raise
`server/version.py` (never lower it), describe the version in `docs/RELEASE_NOTES.md` (the preflight
refuses otherwise), push the tag `v<version>`. The release carries the installer, the gateway files and
`GATEWAY_SETUP.md`; `REMOTE_ACCESS.md` is installed next to the program. Testing the installer on a clean
Windows PC and an update over an older version is still a manual step (TASKS F01, F02).

To integrate an iteration, preserve other remote work, run the current checks, push the
session branch and then fast-forward main to that tested merge. Never force-push. Runtime
data, credentials and the owner's untracked files stay local.
