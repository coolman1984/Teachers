<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Branch integration review — 2026-10-05

Hessa serves nontechnical centre staff: find a student, record attendance, collect the right fee once, give a receipt,
and let a parent read the authorised progress card. The owner also needs shared PCs and recoverable data.

## Acceptance criteria

- Every existing development head is included in the integration history; preserve all original commits and receipts.
- Attendance, payments, family payments, parent links, exam marking and recovery work through real HTTP and browser journeys.
- A retry returns the original receipt only for the same request; changing a saved request reports an actionable error.
- Staff responses respect teacher scopes, contact permissions and financial permissions, including background state updates.
- A replaced/deleted parent link stays stopped after cleanup, stale uploads, restarts and lost local caches.
- All 21 main routes fit a 360 px phone in both languages with the largest font and dark theme.
- Office, frontend, gateway, browser, lint and installer-file gates pass before merging; document hardware limits separately.

## Inventory

No open issues or pull requests were present at the start of this review. Closed issues are not a backlog.

| Branch | Original head | Disposition |
| --- | --- | --- |
| `main` | `24828d1` | Existing merged baseline |
| `claude/ecstatic-wright-9hzizi` | `a596a01` | Already an ancestor of the baseline |
| `claude/modest-ride-c2mpdx` | `be99c55` | Already an ancestor of the baseline |
| `ccr-abf37473-lvpces` | `8296f7a` | Ten outstanding commits, retained as the integration parent |

Use a merge commit for the integration PR rather than squash: the branch ancestry is evidence that the outstanding work
is included. The branches remain available as history. The initial default branch was the older Claude branch; its
content needs to point at the merged result even if changing the repository's default-branch name requires account access.

## Corrections found by verification

- Permanent parent-link tombstones prevent stale office copies from reviving a replaced or removed link. Student deletion
  revokes gateway cards even when the deleting PC never published them. Changing the gateway URL republishes unchanged cards.
- The old gateway database can be migrated without dropping its cards or revocation history. See [gateway setup](GATEWAY_SETUP.md).
- Payment retries compare the actual normalised receipt details and collector. Family retries require the complete ordered batch.
- Student families/follow-ups respect teacher scope. Parent token material is removed from staff state and roster responses.
- Financial visibility is enforced on the server, not merely by removing controls from the assistant's screen.
- Settings feedback and device actions wrap on small screens with large fonts, keeping every action reachable.
- Windows release builds depend on the browser gate as well as office tests, and ship the gateway migration.

## Evidence and limits

Regression tests were first run against the unfixed integration baseline and reproduced the defects. They are included in
`test_integration`, `test_center_gateway`, `test_center_roles` and the gateway test suite. The existing phone acceptance sweep
also reproduced both layout overflows before the wrapping fix. The final test counts and timings are recorded in
[development history](../DEVELOPMENT_HISTORY.md). GitHub Actions runs the same required gates for the integration PR.

The fixture uses fictional data. The owner's private workbook is deliberately absent and its test is skipped. This environment
can test the installer manifest but cannot execute the Windows installer. Real centre PCs, printers, scanners, phone photos,
Android browsers and live tunnel/gateway accounts still require the deployment checks listed in the execution plan.

The optional AI question bank, teacher public page and hosted lesson videos remain the explicit product backlog in `TASKS.md`.
They are not unmerged branch fixes and are not marked finished by this integration.
