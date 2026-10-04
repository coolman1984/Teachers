# Centre settings and reference lists

Settings → Lists contains subjects, rooms, teachers and handouts. New/edit opens a side panel; Delete moves a row to the Recycle Bin.
Teacher terms support percentage, monthly rent, session rent, student-visit rent or a mixture. The example uses 10,000 EGP,
20 sessions and 300 visits. Changing the settlement model clears the fields that no longer apply.

Centre and Rules tabs save structured settings rows with their current settingsVer values in one audited commit. Numeric rules
are validated by the server. Messages edits six kinds in both languages. Templates accept {student}, {group}, {date}, {amount},
{balance}, {center} and {link}; the preview uses example data and does not send anything.

Parent links are optional. Gateway status exposes configuration and connection errors, never keys. Generate keys once and copy the
explicitly revealed setup code only to another authorised centre PC. Keys remain in gateway.json outside the shared database.
The setup code includes secrets and must never be pasted into source control or public messages. Publishing the parent worker/page
is a separate deployment described by P7; configuring this tab alone does not deploy it.

Read-only users have no save controls. Contact editors require contacts.view. Saving a row that has hidden phone fields preserves
those fields; changing them without permission fails. Concurrent edits return a conflict rather than overwriting another user's save.

Verification: node --test --test-isolation=none tests/test_frontend.js; from tests, python -m unittest test_center_api test_design test_center_network.
Chrome visual, keyboard and responsive verification is tracked separately in TASKS.md.
