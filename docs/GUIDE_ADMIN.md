<!-- first-sale-contract: 2026-10-06 -->
> **Owner decision — 6 October 2026:** Read [the first-sale contract](../LAUNCH_SCOPE.md) before using this document. The limited pilot core and its launch gates take priority; extra features belong to later releases or separately accepted add-ons. Existing implementation/history below is preserved and is not a claim of first-sale acceptance.

# Administrator guide

Day-to-day guides in Egyptian Arabic: [owner](GUIDE_OWNER.md), [front desk](GUIDE_DESK.md), [teacher](GUIDE_TEACHER.md),
[assistant](GUIDE_ASSISTANT.md), [parent](GUIDE_PARENT.md). Setting up: [parent links](GATEWAY_SETUP.md), [work from outside](REMOTE_ACCESS.md).
Recovering: [operations](OPERATIONS.md).

Start Hessa on the centre PC and open http://localhost:8095 in Google Chrome.
Use the administrator account created for your local installation.

## People and permissions
Settings → People & access. Every person signs in with their own name. Choose a **profile** (Front desk, Teacher, Assistant,
Accountant, Viewer…) and the boxes are ticked for you; change single ticks if needed. The orange group (administrator rights)
is never ticked by "Select all" and is never possible with a personal link. **Profiles → Who can do what** shows every
permission against every profile in one table and prints it - check it once after changing a profile.

## Try the fictional centre

Overview → **Load sample centre** loads the demonstration records. Settings → Data →
**Delete all sample data** archives generated records and disables demonstration accounts,
preserving your own data and administrator account.

The fictional accounts `owner`, `desk1`, `desk2`, `t.ahmed` and `asst.mona` initially
get a new password each time the sample is loaded (Settings → Data → "Demo password", administrators only) and must change it before entering data.
See [Sample data and real imports](SAMPLE_DATA.md) for roles, safe removal and test details.

## Import real students

Overview → **Preview real student data** reads a CSV or Excel file without saving.
Review and correct the selected rows, choose groups and save only after confirmation.
Both student-management and contact-view permissions are required.
Take a backup through Settings → Data before importing valuable records.


## Several PCs: Devices & Sync
The centre PC (the first PC, where you created the administrator) is the administrator PC. Other PCs can **join** it and
keep their own full copy, so the front desk keeps working when the centre PC is off. Everything is exchanged by itself.

* **The light** in the top bar: green = all PCs up to date, blue = sharing now, amber = this PC works alone (nothing is
  lost, it catches up), red = open Devices & Sync and read the warning.
* **Add a PC** (centre PC, Devices & Sync): opens a 15-minute window for ONE new PC and shows the address to type. On the new
  PC choose *Join the centre PC*; the page tells you the moment it has joined and closes the window again.
* **To decide**: when two PCs changed the same thing at the same time you choose the right value once; every PC then shows it.
* **Save the administrator key** once on a USB drive. It is the only way to keep managing PCs and accounts if the centre PC breaks.
* **Remove** a lost or replaced PC: it can no longer share data; what it recorded stays.
* A PC that only needs to *look* can skip all this: open the centre PC's web address in its browser and sign in.

## Your data's safety
* Deleting only moves a record to the **Recycle Bin**. Receipts and expenses are never edited or deleted: a mistake is
  corrected by a reversing record.
* Every change is kept for good in the **Activity log** (Changes: who, when, which PC, before → after; Logins & security:
  sign-ins and refused attempts). Parents' numbers are shown there only to people with the permission to see contacts.
* **History of one record**: student file → History. *Undo this change* saves the earlier values as a new change.
* Settings → Data and backups: automatic backups, a **second folder on a USB drive** (so the data survives a dead disk), and
  **Check my data now**. The Overview card *Is everything safe?* and the advisor warn when something needs you.
* Before Hessa is updated it makes a verified safety copy (`data/upgrades/`); data written by a newer Hessa is refused, never changed.

The remaining daily-operation screens and final delivery guide are still being built.
