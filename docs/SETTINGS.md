<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Centre settings and reference lists

Settings → Lists contains subjects, rooms, teachers and handouts. New/edit opens a side panel; Delete moves a row to the Recycle Bin.
Teacher terms support percentage, monthly rent, session rent, student-visit rent or a mixture. The example uses 10,000 EGP,
20 sessions and 300 visits. Changing the settlement model clears the fields that no longer apply.

Settings → Centre → "Pages in the menu" chooses the extra pages (Exams, Follow-up, Teacher settlements, Devices). Without a
choice the menu is the basic first version: overview, door, students, groups, money, reports, activity, settings and help. The
setting `extras` is a list of those page ids, checked by the server (`domain.EXTRA_PAGES`). Hiding a page only shortens the menu,
the palette, the shortcuts and the phone tab bar: the data stays, permissions are unchanged and a link to the page still opens it.

Centre and Rules tabs save structured settings rows with their current settingsVer values in one audited commit. Numeric rules
are validated by the server. Messages edits six kinds in both languages. Templates accept {student}, {group}, {date}, {amount},
{balance}, {center} and {link}; the preview uses example data and does not send anything.

Parent links are optional. Gateway status exposes configuration and connection errors, never keys. Generate keys once and copy the
explicitly revealed setup code only to another authorised centre PC. Keys remain in gateway.json outside the shared database.
The setup code includes secrets and must never be pasted into source control or public messages. Publishing the parent worker/page
is a separate deployment described by P7; configuring this tab alone does not deploy it.

Read-only users have no save controls. Contact editors require contacts.view. Saving a row that has hidden phone fields preserves
those fields; changing them without permission fails. Concurrent edits return a conflict rather than overwriting another user's save.

Verification: node --test tests/test_frontend.js; from tests, python -m unittest test_center_api test_design test_center_network.
Chrome visual, keyboard and responsive verification is tracked separately in TASKS.md.
