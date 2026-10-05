# Testing with sample and real data

Open Overview and choose **Load sample centre**. The administrator needs Data import,
Manage users and access to all teachers, on the administrator PC. Settings → Data has the same controls.
The generator adds 420 fictional students, 24 groups, eight teachers, four rooms,
10 subjects, 10 handouts and eight weeks of attendance, fees, exams and cash shifts.
The timetable has no room or teacher clashes. Example warning students have declining
attendance and marks; profitability includes full, healthy, watch, merge and loss groups.

All generated business records have an `smp-` id. Student codes skip existing codes,
including archived records. Centre sample defaults yield to your explicit settings.
Existing students, money records and the administrator account are preserved.
If the database already has students, the server creates a backup before loading.
Repeated loading while the sample is active makes no changes.

| Sample account | Role | Teacher access |
|---|---|---|
| owner | Centre manager | All |
| desk1, desk2 | Front desk | All |
| t.ahmed | Teacher | Sample teacher 4 |
| asst.mona | Assistant | Sample teacher 4 |

Their initial password is `Hessa-2026!`. A password change is required before writes.
These accounts are created through the normal signed account-management workflow;
their account ids are regular ids and their notes explicitly identify sample accounts.
Loading refuses to replace an existing unrelated account using one of these usernames.

**Delete all sample data** archives only generated `smp-` business records in one
audited change and disables marked sample accounts, ending their sessions.
Real records and the administrator remain. Re-loading re-enables the managed sample
accounts with their initial temporary password and generates a fresh sample.
New manually entered records with normal ids remain even if they refer to a
sample student/group. Deterministic attendance/marks for sample entities keep sample
ids and are archived with that centre. Use the normal reversal workflow for manual test receipts;
sample removal never erases those receipts. Restoring archived business records through
the recycle bin does not re-enable disabled accounts.

## Real student spreadsheets

Choose **Preview real student data** on Overview, or Students → Import. A CSV or Excel
file can contain `Name`, `Grade`, `Parent mobile`, `Code`, `Group`, `School`, `Parent name`,
`Mobile` and `Notes` columns. Arabic headers are recognised too.
Use these CSV headers as a starting point, and add the records you intend to import:

```csv
Name,Grade,Parent mobile,Code,Group,School,Parent name,Mobile,Notes
```

Grade values are
P1–P6, M1–M3 and S1–S3; common Arabic grade descriptions are recognised.
Group names must match an existing group, or choose the group in the preview.

Preview changes no data. Review the name, code, grade, parent number and group;
correct warnings and select the rows to save. Select a default grade for missing
grades if needed. The consent checkbox records consent for newly created students;
only tick it when consent has actually been obtained. Existing matched profiles are
kept, with new enrolments added when selected. Existing students match by normalised
name and exact parent number; missing numbers do not match a populated parent number.
Repeated rows within a batch and repeated imports do not duplicate matching students
or active enrolments. Different people with the same name and parent number need
manual review before importing.

The server validates phones, grades, group references, capacity and teacher access, and commits
the chosen batch atomically. A scoped importer must assign new students to an allowed
group. Both student-management and contact-view permissions are required. Real files
stay local; never commit them or real names/numbers to this public repository.
No real owner file has been supplied or tested yet.

## Checks

From `tests`: `python -m unittest test_sample test_center_api test_design`.
From the repository: `node --test tests/test_frontend.js`.
Sample tests verify determinism, references, codes, timetable, cash arithmetic,
dashboard, warning/profitability signals, scoped reads, removal, reload and signatures.
They also measure card <150 ms, dashboard <400 ms and startup <1.5 s / 6 MB on this PC.
These are local measurements, not a guarantee for every machine.

For an offline JSON fixture: `python tools/make_sample.py --date 2026-10-04`.
It writes ignored `data/sample-centre.json`. To load into a running local server:
`python tools/make_sample.py --load --username admin`; the password is prompted privately.
The CLI prints sample credentials only, never the administrator password.
