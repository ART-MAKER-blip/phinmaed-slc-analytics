# User guide

How the four users of the PHINMAED Student Learning Analytics and Deliberation System use it. Screen and button names are written in **bold** as they appear in the app.

## Signing in and your account

- Sign in with your work email and password. There is no self sign-up: the **System Administrator** creates every account and decides its role and scope.
- If your account has no role yet, sign-in tells you to contact the administrator.
- Click your name at the bottom of the sidebar to open **Account**: your roles and scope, and **Change password** (this signs you out on your other devices).
- Forgot your password? Ask the administrator to **Reset password**; you get a temporary one to change after signing in.

### Scope

Each role is given at a campus, for **all programs** or **one program**, or for all campuses. You only see students, subjects and teachers inside your scope, even if you change the web address.

## Roles at a glance

The sidebar shows only the pages your role can use.

| Role | Job in the system | Pages |
|---|---|---|
| **Student Learning Coordinator (SLC)** | Imports the SIS export, calculates zones, reviews results, runs deliberations, assigns actions, refers students | Dashboard, Import reports, Deliberation, Period cycle, Zones, Reports |
| **Team Learning Lead** | Reviews results across campuses and periods; approves zone rule sets | Dashboard, Zones, Reports |
| **Chief Operating Officer (COO)** | Views results and reports; changes nothing | Dashboard, Reports |
| **System Administrator** | Accounts, campuses, colleges, programs and terms; draft rule sets; imports; audit log | Dashboard, Import reports, Zones, Administration, Audit log |

## The grading-period cycle

1. After each period's grades are released, the **SLC** downloads the **Grade Deliberation Report** from the SIS and imports it. The same export holds P1, P2 and P3; later uploads in the term fill in the newer periods.
2. The **SLC** calculates zones for the period (P1, P2 or P3).
3. The **SLC**, **Team Learning Lead** and **COO** review the **Dashboard** and **Reports**.
4. The **SLC** opens concerns for flagged students, records deliberations, assigns interventions and refers students to ALC, SSP or KSH.
5. The **SLC** logs follow-ups and updates referral status.
6. In the next period, **Reports** shows which students moved out of Yellow or Red, and the period trend.

### How zones are decided

For each period, each subject a student takes counts as:

- **failed** if the period score is below the passing mark (60 by default), or the score is `INC` or `ABS`;
- **not counted** if the score is `NA` or empty (for example, SSP subjects, or P3 before it is encoded);
- in **P3 only**, also **failed** if the final remark is `FAILED` or `NO CREDIT`.

Then:

| Level | Green (Safe) | Yellow (Danger) | Red (Critical) |
|---|---|---|---|
| Student: failed subjects in the period | 0 | 1 | 2 or more |
| Subject section: % of counted students who failed | 0–10% | 10.01–40% | 40.01–100% |
| Teacher: % failed across all their classes | 0–10% | 10.01–40% | 40.01–100% |

All of these numbers are settings of the approved **rule set** (see Zones).

---

## Student Learning Coordinator (SLC)

### Import the SIS export

1. Open **Import reports**. Choose the **Campus** and the **Term** (the term must match the file's `SESSION`; `SY 25-26 SEM II` is **2025-2**), choose the file (`.xlsx` as downloaded, or `.csv`), and click **Upload and validate**.
2. The batch page shows:
   - **Errors**: rows that will be skipped, with the row number and reason (duplicate student and subject, unknown program, wrong term or campus, a score outside 0–100, an unknown remark, a student whose name or program disagrees with what is on record).
   - **Warnings**: rows that are imported but worth checking (a different `COLLEGE` than the program's, or a year level taken from `YEAR LEVEL` because `SEMESTER` was empty).
   - A preview with error rows in red and warning rows in yellow. **Download error list** gives everything as a spreadsheet.
3. **Accept … rows** imports the valid rows; **Reject batch** imports nothing. The original file is kept (**Original file** downloads it), and the same file cannot be imported twice.

The importer handles the export's quirks for you: the apostrophe before student IDs, extra spaces in names, `-` for empty SSP columns, and the year level from `SEMESTER` (`Y2S2` = year 2).

### Calculate zones

1. Open **Zones** → **Calculate zones**, choose campus, term and **period**, and click **Calculate zones**.
2. The run appears under **Snapshot runs** with students, subject sections and teachers per zone.
3. **Verify** recalculates a run from the scores as they were then and confirms every result still matches.

Recalculate after importing a newer export; each run is kept, and pages show the latest one.

### Dashboard and reports

- **Dashboard**: switch **P1 / P2 / P3**. Summaries for subject sections, students and teachers (count and percentage per zone), **Students at risk**, **Subjects and teachers to review**, and **Teachers to review**.
- **Reports**: choose **Report type** (Periodic, or Semester for the latest period calculated), campus, term, period and program, then **Apply**:
  - student zones **by program** and **by year level**;
  - **Period trend**: each zone's share in P1, P2 and P3 and the change from the previous period, for students, subject sections and teachers (green numbers are improvements);
  - **Outcome review**: of the students in Yellow or Red in the previous period, how many are now Green, improved, unchanged or worse;
  - **Export CSV**, recorded in the audit log.

### Deliberation

1. **Deliberation** → **Open a concern**: choose a flagged student or subject section from the latest results, the concern type, and describe it. A student can have one open concern per term.
2. On the concern page:
   - **Record deliberation**: meeting date, decision and agreed actions, evidence (the latest zone results are attached automatically), participants.
   - **Add intervention**: type, agreed action, owner, target and due date. **Log follow-up** records progress and can mark it completed.
   - **Refer to a support team**: ALC, SSP adviser or Kasama Support Hub. Only the referral, its date, destination and status are recorded; for SSP, the student's SSP adviser from the export is recorded as the recipient. You may add a **restricted note**, which only SLC accounts can read. Update the referral's status as the team reports back.
   - The side panel shows the student's or subject's zone in each period.
   - **Close concern** when resolved (**Reopen concern** if needed).

---

## Team Learning Lead

- **Dashboard** and **Reports** as described for the SLC, normally across all campuses, with **Campus comparison** in Reports.
- **Zones**: each rule set shows its Green/Yellow/Red ranges for students, subjects and teachers, and its passing mark and value settings. **Approve** a draft to put it into effect from its effective term (its settings then lock). **Retire** an approved rule set to stop new calculations from using it; past runs keep it.

## Chief Operating Officer (COO)

- **Dashboard** and **Reports**, including **Campus comparison** and **Export CSV**. The COO cannot import, calculate, deliberate or change settings.

## System Administrator

- **Administration → Users and access**: create accounts (a one-time temporary password is shown), set each role's campus and program scope, deactivate accounts (signs them out everywhere), reset passwords. You cannot deactivate yourself or remove your own administrator role, and one active administrator must always remain.
- **Administration → Campuses, programs and terms**: add or rename campuses, colleges and programs, tick which programs each campus offers, add terms and set their dates. **College and program names must match the SIS `COLLEGE` and `COURSE` columns exactly**, because imports are matched by name.
- **Zones → New draft rule set**: code, name, effective term, the student and subject limits (teachers use the subject limits), the passing mark, which period values count as failed or are not counted, and which P3 remarks count as failed. **Edit draft** or **Delete draft** until the Team Learning Lead approves it.
- **Import reports** and **Calculate zones** work as for the SLC.
- **Audit log**: sign-ins, denied access, imports, calculations, deliberation records, referrals, exports and administration changes, newest first. Entries cannot be edited or deleted; passwords and restricted note text are never written to it.
