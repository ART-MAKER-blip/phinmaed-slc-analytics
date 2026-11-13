# What the system can do so far

Status as of November 2026, compared with the proposal's objectives (Section IV) and functional test cases (Appendix F). "Done" means it works against the PostgreSQL database and was tested end to end; it has not yet been tested with real PHINMA COC data.

## Summary

The full grading-period cycle works: import SIS grade files with validation, calculate zones with an approved rule set, review results on dashboards and in reports, record deliberations, interventions, follow-ups and referrals, and review the audit log. Access is enforced on the server by role, campus and program.

## Objectives

| # | Objective | Status | Notes |
|---|---|---|---|
| 1 | Import module with validation, preview and error report | Done | CSV only (Excel must be saved as CSV). Checks columns, missing values, duplicates, identifiers, term/period and program mapping. |
| 2 | Preserve each import's original file, date, uploader and status | Done | Original file stored with a checksum; downloadable. |
| 3 | Configurable rule engine tied to an effective term | Done | Rule sets are drafted, approved (then locked) and retired in the app. |
| 4 | Student, subject and teacher views by term, year level, program and campus, with counts and rates | Mostly done | Dashboards and reports by term, period, program and campus. Year level is shown per student but is not yet a report filter. Dashboards list the top 10 at-risk students and subjects; there are no full Students / Subjects / Teachers list pages yet. |
| 5 | Deliberation records: concerns, evidence, actions, owners, due dates, follow-ups, outcomes | Done | |
| 6 | Referrals to ALC, SSP and KSH with restricted notes | Done | Teams see only their own referrals; notes only for permitted roles. |
| 7 | Periodic and semester reports for Deans, COOs, Team Learning and the Dean of Deans | Done | CSV export, scoped to the user. No PDF export yet. |
| 8 | Outcome tracking | Done | Movement out of Yellow/Red between periods, intervention completion, and each student's or subject's zone per period. |
| 9 | Role-based access by campus and program, with audit logging | Done | 11 roles, 23 permissions; enforced on every page and API call. |
| 10 | Usability and effectiveness evaluation | Not started | Research activity for the testing phase (Appendix F questionnaire). |

## Functional test cases (Appendix F)

| # | Test | Status | How to check |
|---|---|---|---|
| 1 | Login / authentication | Pass | Sign in; the dashboard matches the role. |
| 2 | Role-based access | Pass | Pages not allowed for a role are hidden and show "You do not have access" if opened directly. |
| 3 | Campus / program scoping | Pass | A Dean scoped to BSIT sees only BSIT, even when asking for another program. |
| 4 | Data import | Pass | Upload `samples/grades_2026-1_P1.csv`, then accept. |
| 5 | Import validation | Pass | Upload `samples/grades_with_errors.csv`. |
| 6 | Import audit record | Pass | Import history and the batch page show file, date, uploader, status; original file downloads unchanged. |
| 7 | Student zone computation | Pass | 0 / 1 / 2+ failed subjects → Green / Yellow / Red (also unit tested). |
| 8 | Subject zone computation | Pass | 10% / 10.01% / 40% / 40.01% → Green / Yellow / Yellow / Red (unit tested). |
| 9 | Zone rule set by term | Pass | A new rule set applies from its effective term; earlier runs keep their rule set and results. |
| 10 | Teacher-level view | Pass | Counts and rates only; no zone, rank or rating. |
| 11 | Cross-campus comparison | Pass | Reports → Campus comparison, same definitions and denominators. Only COC has data in the pilot. |
| 12 | Concern and deliberation record | Pass | |
| 13 | Intervention and follow-up | Pass | |
| 14 | Referral creation | Pass | |
| 15 | Restricted referral notes | Pass | Dean and ALC see "Restricted notes are hidden"; KSH sees only KSH notes. |
| 16 | Outcome review | Pass | Reports → Outcome review after calculating two periods. |
| 17 | Periodic report | Pass | |
| 18 | Semester report | Pass | Report type → Semester. |
| 19 | Report access and export | Pass | Exports contain only the user's scope; out-of-scope requests are refused. |
| 20 | Snapshot reproducibility | Pass | Zones → Verify, including after a grade is later corrected. |
| 21 | Audit logging | Pass, with a difference | Creates and edits are logged with before/after values. Records are never deleted (they are closed, cancelled or deactivated instead), so there is no delete to log. |

Automated tests: `npm test` runs 42 unit tests covering zone rules, import validation, access rules, restricted notes and administration checks.

## Not done yet

- **Period cycle** page still shows sample data.
- **Attendance and permit files** cannot be imported yet; the ERD has no tables for them.
- **Excel files** must be saved as CSV before import.
- **Full list pages** for Students, Subjects and Teachers (as in the Figma prototype) are not built; dashboards show the top 10.
- **Year level** filter in reports.
- **PDF export** of reports.
- **Forgot password** link on the login page; an administrator resets passwords instead.
- **One open concern per student per term** is suggested by the form but not enforced.
- **Email or in-app notifications** (for example when a referral is sent).
- **Production deployment**: HTTPS, sign-in rate limiting, backups and monitoring still need to be set up.

## Assumptions to confirm with PHINMA

These are working assumptions in the current build:

- **SIS file columns**: `student_id, last_name, first_name, program, year_level, course_code, course_title, section, result_status`, plus optional `grade, teacher_id, teacher_name, attempt, term, period`.
- **Grade scale**: grades are stored as text and not range-checked.
- **Result statuses**: Failed counts as a failed subject. INC counts in the subject's denominator but not as failed. Dropped, withdrawn and no-grade are left out of the denominator. A student's latest attempt counts.
- **Zone thresholds**: the shared definitions from the proposal (student 0 / 1 / 2+; subject 0–10% / 10.01–40% / 40.01–100%, rates rounded to 2 decimals).
- **Programs and terms**: BSIT, BSEd, BSBA and BSCrim at COC, and terms 2026-1 and 2026-2, are placeholders. Administrators can change these in the app.
- **Named students in reports**: dashboards show student names to roles allowed to see student results; reports and exports show counts only.
