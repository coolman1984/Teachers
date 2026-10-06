<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Agent instructions (ChatGPT / Codex / any agent)

The operating rules are in **[CLAUDE.md](CLAUDE.md)** – read it completely before your first command, whatever agent you are.
Then read **[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)** completely and continue with the first unticked task in
**[TASKS.md](TASKS.md)**. Read **[DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md)** before changing money, sync or attendance logic.

Three rules matter more than the rest:
1. **Every behaviour change has a DEVELOPMENT_HISTORY.md entry and a test in the same commit.**
2. **Money records are append-only; balances are computed.**
3. **Evidence before "done":** run the checks of EXECUTION_PLAN Part G and report the real output.
