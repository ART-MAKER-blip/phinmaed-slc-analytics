# What the system can do so far

Status as of November 14, 2026, compared with the proposal's objectives (Section IV) and functional test cases (Appendix F). "Done" means it works against PostgreSQL and was tested end to end with the dummy data. The importer and zone calculation were also run once against a real COC export (13,461 rows) in a temporary database, which was deleted afterwards.

## Summary

The grading-period cycle works with the real SIS **Grade Deliberation Report** format: import the `.xlsx` or `.csv` export with validation, calculate student, subject and teacher zones for P1, P2 and P3 with an approved rule set, review dashboards and reports (by program, year level and period trend), record deliberations, interventions and referrals, and review the audit log. There are four users: SLC, Team Learning Lead, COO (view only) and System Administrator.

## Changes from the approved proposal

| Proposal | Now | Why |
|---|---|---|
| Teacher results are indicators only, with no zone | Teachers get Green/Yellow/Red zones (same limits as subjects) | Matches the client's SLC collated summary. **Needs the adviser's or panel's agreement.** |
| Many user roles (Deans, Faculty, ALC, SSP, KSH, Dean of Deans, Team Learning, Data Manager, …) | Four roles: SLC, Team Learning Lead, COO (view only), System Administrator | The client named these as the final users. ALC, SSP and KSH referrals are recorded by the SLC. |
| Grades per period with a pass/fail status | Period scores P1–P3 from one export, a passing mark, and configurable `NA`/`INC`/`ABS` handling | Matches the real SIS export. |

## Objectives

| # | Objective | Status | Notes |
|---|---|---|---|
| 1 | Import module with validation, preview and error report | Done | Real SIS layout, `.xlsx` and `.csv`. Errors skip a row; warnings are imported. Handles the export's quirks (apostrophe IDs, spaces, `-`, year level from `SEMESTER`). |
| 2 | Preserve each import's original file, date, uploader and status | Done | Original file stored with a checksum; downloadable; same file cannot be imported twice. |
| 3 | Configurable rule engine tied to an effective term | Done | Thresholds, passing mark, failed/skipped values and P3 remarks are rule set settings; approved rule sets lock. |
| 4 | Student, subject and teacher views by term, year level, program and campus, with counts and rates | Mostly done | Dashboards and reports by term, period, program, year level and campus. Dashboards list the top 10 students, subject sections and teachers; there are no full list pages yet. |
| 5 | Deliberation records | Done | |
| 6 | Referrals with restricted notes | Done | Recorded by the SLC; SSP referrals record the student's SSP adviser; notes visible to the SLC only. |
| 7 | Periodic and semester reports | Done | CSV export, scoped to the user. No PDF yet. |
| 8 | Outcome tracking | Done | Outcome review between periods, period trend (P1 → P2 → P3), intervention completion. |
| 9 | Role-based access by campus and program, with audit logging | Done | 4 roles, 21 permissions, enforced on every page and API call. |
| 10 | Usability and effectiveness evaluation | Not started | Research activity for the testing phase. |

## Functional test cases (Appendix F)

| # | Test | Status | How to check |
|---|---|---|---|
| 1 | Login / authentication | Pass | Sign in; the dashboard matches the role. |
| 2 | Role-based access | Pass | The COO opening Imports, Zones, Deliberation, Administration or Audit log sees "You do not have access". |
| 3 | Campus / program scoping | Pass | An account scoped to one program sees only that program. |
| 4 | Data import | Pass | Upload `data/dummy_sis_grades_sample.csv` (term 2025-2) and accept. |
| 5 | Import validation | Pass | Upload `data/dummy_sis_grades_errors.csv`. |
| 6 | Import audit record | Pass | Batch page and import history; original file downloads unchanged. |
| 7 | Student zone computation | Pass | 0 / 1 / 2+ failed subjects (unit tested, including the failed-subject rules). |
| 8 | Subject zone computation | Pass | 10% / 10.01% / 40% / 40.01% → Green / Yellow / Yellow / Red (unit tested). |
| 9 | Zone rule set by term | Pass | A new rule set applies from its effective term; earlier runs keep theirs. |
| 10 | Teacher-level view | Changed | Teachers now get zones (see "Changes from the approved proposal"). |
| 11 | Cross-campus comparison | Pass | Reports → Campus comparison (only COC has data in the pilot). |
| 12 | Concern and deliberation record | Pass | |
| 13 | Intervention and follow-up | Pass | |
| 14 | Referral creation | Pass | |
| 15 | Restricted referral notes | Pass | Only SLC accounts see notes; the Team Learning Lead and COO cannot open concerns. |
| 16 | Outcome review | Pass | Reports after calculating two periods. |
| 17 | Periodic report | Pass | |
| 18 | Semester report | Pass | Report type → Semester (proposal said "as the Dean of Deans"; now the Team Learning Lead or COO). |
| 19 | Report access and export | Pass | Exports contain only the user's scope. |
| 20 | Snapshot reproducibility | Pass | Zones → Verify, including after a newer export updated the scores. |
| 21 | Audit logging | Pass, with a difference | Creates and edits are logged with before/after values; records are closed or deactivated rather than deleted. |

Automated tests: `npm test` runs 46 unit tests covering the SIS importer, period and zone rules, access rules, restricted notes and administration checks.

## Not done yet

- **Period cycle** page still shows sample data.
- **Attendance and permit files** cannot be imported; only the grade deliberation report.
- **Full list pages** for students, subjects and teachers; dashboards show the top 10.
- **PDF export** of reports.
- **Forgot password** link; the administrator resets passwords.
- **Notifications** (for example when a referral is sent).
- **Accounts for ALC, SSP and KSH** if the client later wants them (the access rules already support it).
- **Production deployment**: HTTPS, sign-in rate limiting, backups and monitoring.

## Open questions for the client

See [Open questions for the client](../README.md#open-questions-for-the-client) in the README: teacher zones, passing mark, `NA`/`INC`/`ABS`, P3 remarks, zero scores, thresholds, year level, other-college rows, teacher identity, referrals, roles and term codes.
