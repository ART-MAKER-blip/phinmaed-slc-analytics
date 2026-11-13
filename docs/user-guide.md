# User guide

How each role uses the PHINMAED Student Learning Analytics and Deliberation System. Screen and button names are written in **bold** as they appear in the app.

## Signing in and your account

- Sign in at the login page with your work email and password. There is no self sign-up: a **System Administrator** creates every account and decides its role and scope.
- If your account has no role yet, sign-in tells you to contact the administrator.
- Click your name at the bottom of the sidebar to open **Account**. It shows your roles and scope, and lets you **Change password**. Changing it signs you out on your other devices.
- If you forget your password, ask an administrator to **Reset password**. You get a new temporary password; change it after signing in.
- **Sign out** is at the bottom of the sidebar.

### Scope: what part of the data you see

Every role is given at a campus, either for **all programs** or for **one program**. You only ever see students, subjects and teacher results inside your scope. For example, a Dean scoped to *COC · BSIT* sees BSIT students and subjects only; asking for another program (even by changing the web address) shows nothing from it.

## Roles at a glance

The sidebar shows only the pages your role can use.

| Role | Main job in the system | Pages |
|---|---|---|
| **Student Learning Coordinator (SLC)** | Review zone results, run deliberations, assign actions, refer students | Dashboard, Import reports (view), Deliberation, Period cycle, Reports |
| **Dean / Program Head** | Review program results, take part in and record deliberations | Dashboard, Deliberation, Period cycle, Reports |
| **Faculty / Teacher** | See own class results; carry out assigned actions | Dashboard, Deliberation (own actions) |
| **Active Learning Coordinator (ALC)** | Teaching-related concerns and referrals to ALC | Dashboard, Deliberation, Period cycle, Reports (view) |
| **SSP Adviser / Coordinator** | Referrals sent to SSP | Dashboard, Deliberation (SSP referrals) |
| **Kasama Support Hub (KSH) Staff** | Referrals sent to KSH, with restricted notes | Dashboard, Deliberation (KSH referrals) |
| **Chief Operating Officer (COO)** | Campus results, reports, approve zone rule sets | Dashboard, Zones, Reports |
| **Dean of Deans** | Semester results across programs, approve zone rule sets | Dashboard, Zones, Reports |
| **Team Learning / PEN-wide Leadership** | Compare campuses and track improvement | Dashboard, Reports |
| **Data Manager** | Import grade files, calculate zones | Dashboard, Import reports, Zones |
| **System Administrator** | Accounts, campuses/programs/terms, draft rule sets, audit log | Dashboard, Import reports, Zones, Administration, Audit log |

## The grading-period cycle

Each grading period (P1, P2, P3) follows the same steps:

1. **Data Manager** imports the grade file from the SIS.
2. **Data Manager** calculates zones (once a COO or Dean of Deans has approved the rule set for the term).
3. **SLC, Deans and leadership** review results on the **Dashboard** and in **Reports**.
4. **SLC / Dean** open concerns, deliberate, assign interventions and make referrals in **Deliberation**.
5. **Owners and support teams** log follow-ups and update referrals.
6. In the next period, **Reports** shows which flagged students moved out of Yellow or Red.

---

## Data Manager

### Import a grade file

1. Open **Import reports**.
2. Under **Periodic grades**, choose the **Campus**, **Term** and **Period**, then choose the file and click **Upload and validate**.
   - Files must be **CSV**. In Excel use *File → Save As → CSV UTF-8*. Maximum 10 MB.
   - Click **Template** to download the expected columns with an example row.
3. You land on the batch page. It shows how many rows are valid, the **Validation report** listing each problem with its row number, and a preview with problem rows highlighted.
   - Problems found: missing columns, missing values, duplicate rows, unknown programs, wrong term or period, invalid values, and **unmatched identifiers** (a student or teacher ID whose name or program disagrees with what is already on record, which usually means a typo).
   - **Download error list** gives the problems as a spreadsheet to send back to whoever prepared the file.
4. Decide:
   - **Accept … rows** imports the valid rows. Rows with problems are skipped and stay listed, so you can fix them in the source file and upload them again.
   - **Reject batch** imports nothing.
   - If required columns are missing, the file cannot be accepted at all.
5. The original file is kept. **Original file** downloads it exactly as uploaded. The same file cannot be imported twice.

A corrected file for the same period replaces earlier grades for the same student and subject; the earlier values are kept in history.

### Calculate zones

1. Open **Zones**.
2. Under **Calculate zones**, choose campus, term and period, and click **Calculate zones**.
3. The run appears under **Snapshot runs** with the number of students and subject sections in each zone.
4. **Verify** recalculates a run from the grades as they were at that time and confirms every result matches.

Recalculate after importing corrected grades; each calculation is kept as a separate run, and pages use the latest one.

Your **Dashboard** lists imports waiting for a decision and the last calculation.

---

## SLC, Dean / Program Head, COO, Dean of Deans, Team Learning

### Dashboard: zone overview

- Shows the latest zone results for your scope. Use **P1 / P2 / P3** to switch periods.
- **Subject level**, **Student level** and **Teacher level** summaries show counts with their percentages, so small groups are not overstated.
- **Students at risk** lists Yellow and Red students with most failed subjects first.
- **Subjects to review** lists subject sections with the highest failure rates, with each teacher's results across their classes.
- Teacher results are **indicators for review only**, not ratings or rankings.
- Sections appear only if your role may see them (for example, the COO sees student and subject results but not teacher results).

### Reports

1. Open **Reports** and choose **Report type** (Periodic, or Semester to use the latest period calculated in the term), **Campus**, **Term**, **Period** and **Program**, then **Apply**.
2. You see:
   - **Student zones by program**, each with counts and percentages.
   - **Subject sections in the Red zone**.
   - **Outcome review**: of the students in Yellow or Red in the previous period, how many are now Green, moved from Red to Yellow, stayed the same, or moved to Red.
   - **Campus comparison** (COO, Dean of Deans, Team Learning).
3. **Export CSV** downloads the report. It contains only what you are allowed to see, and each export is recorded.

---

## Deliberation (SLC, Dean, ALC)

### Open a concern

1. Open **Deliberation**.
2. Under **Open a concern**, choose a student or subject section from the latest flagged results (students who already have an open concern are not listed), choose the **Concern type**, describe the concern, and click **Open concern**.

### Work on a concern

On the concern page:

- **Record deliberation**: meeting date, the decision and agreed actions, the evidence reviewed, and who took part. The latest zone results are attached as evidence automatically.
- **Add intervention**: the type, the agreed action, who is responsible (the **Owner**), a target and a due date.
- **Log follow-up** on an intervention: a check-in date, progress, next step, outcome, and its new status (for example *Completed*).
- **Refer to a support team**: ALC, SSP adviser or Kasama Support Hub. Only the fact, date, destination and status are recorded. Roles allowed to (the SLC) may add a **restricted note**.
- The side panel shows the student's or subject's zone in each period of the term.
- **Close concern** when it is resolved. A closed concern cannot be changed until you **Reopen concern**.

### Who sees what on a concern

| Person | Sees |
|---|---|
| SLC | Everything, including restricted notes |
| Dean, ALC | Everything except restricted notes |
| SSP or KSH staff | Only concerns referred to their team: the concern, and their own team's referral and notes. Not the deliberations or other teams' referrals |
| Intervention owner (for example a teacher) | Only the concern and their own interventions |
| Others | Nothing |

---

## SSP and KSH staff (and ALC for its referrals)

1. Your **Dashboard** shows new, in-progress and closed referrals for your team, plus actions assigned to you. Click a referral to open it.
2. On the concern page, change your referral's status (**Sent → Acknowledged → In progress → Closed**).
3. **Add restricted note** to record sensitive details. Only roles allowed to see notes for your team can read them. Counseling records and case files stay outside this system.

---

## Faculty / Teacher

- Your **Dashboard** shows your classes from the latest calculation: students counted, how many failed, and the failure rate as an **indicator for review**. An administrator must first link your account to your teacher record.
- **Actions assigned to you** shows interventions where you are the owner. Open them from **Deliberation**, and use **Log follow-up** to report progress or mark them completed.

---

## COO and Dean of Deans: zone rule sets

1. Open **Zones**. Each rule set shows its Green, Yellow and Red ranges for students (failed subjects) and subjects (failure rate).
2. **Approve** a draft to put it into effect from its effective term. Its numbers can no longer be changed.
3. **Retire** an approved rule set to stop new calculations from using it. Past runs keep the rule set they used.

---

## System Administrator

### Accounts (Administration → Users and access)

- **New account**: enter the name and work email, and add one or more **Roles and scope** rows (role, campus, all programs or one program). Click **Create account**. A **temporary password** appears once; give it to the person privately.
- Click a name to edit it: change roles and scope, link a **teacher record** (so a faculty account sees its classes), untick **Account active** to deactivate (this signs the person out everywhere), or **Reset password**.
- You cannot deactivate yourself or remove your own administrator role, and the last active administrator cannot be removed.

### Campuses, programs and terms (Administration → Campuses, programs and terms)

- Add or rename campuses and programs, and tick which programs each campus offers. Imports only accept programs offered at the chosen campus.
- Add terms using codes like `2026-1` and set their start, end and grade release dates.
- Codes cannot be changed once created, because imports and reports refer to them.

### Draft rule sets (Zones)

- **New draft rule set**: a code, a name, the effective term, and four numbers: where student Yellow and Red start (failed subjects), and where subject Green and Yellow end (failure rate). Red covers the rest.
- **Edit draft** or **Delete draft** while it is still a draft. A COO or Dean of Deans approves it.

### Audit log

**Audit log** lists sign-ins, failed sign-ins, denied access, imports, zone calculations, deliberation records, referrals, exports and administration changes, newest first. Filter by **Action**. Entries cannot be edited or deleted, and restricted note text and passwords are never written to it.
