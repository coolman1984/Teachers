# Checks and development integration

The current workflow tests every push to main/session branches and every pull request.
It runs the frontend startup/flow checks, gateway checks, current engine/centre/Excel
regressions, sample lifecycle, real two-PC partition tests and the independently preserved
remote centre tests. `tests/test_ci.py` verifies that every selected Python module exists.
Pyflakes checks the server, developer tools and tests before the runtime checks.

The inherited trip/driver suites reference removed modules and routes. They are not centre
acceptance tests. Centre browser acceptance remains unfinished under P8 in TASKS.md;
these local/HTTP and Node checks do not claim Chrome visual or complete-app readiness.

Installer builds run on manual workflow dispatch or explicit `v*` tags. A tagged push can
publish an installer; ordinary development merges do not publish a release. Final installer,
version, release documentation and full browser checks remain P10/P8 work.

To integrate an iteration, preserve other remote work, run the current checks, push the
session branch and then fast-forward main to that tested merge. Never force-push. Runtime
data, credentials and the owner's untracked files stay local.
