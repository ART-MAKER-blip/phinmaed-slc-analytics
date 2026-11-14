# Technical notes

For developers working on the code. For running the system see [getting-started.md](getting-started.md); for what each screen does see [user-guide.md](user-guide.md).

## Stack and layout

TypeScript, Next.js 14 (App Router), Tailwind CSS, PostgreSQL (via `pg`, no ORM). Tests use Node's built-in test runner through `tsx`.

- `app/` holds route entry points. Pages under `app/(protected)/` require a signed-in user; each page checks its own permission with `guardRoute()` and loads data on the server.
- `app/api/` holds route handlers. They start with `handleApi(permission, …)` from `lib/api.ts`, which checks the permission, refuses demo logins, and turns `ApiError` into JSON responses.
- `features/` holds page UI grouped by area (`dashboard`, `imports`, `zones`, `reports`, `deliberation`, `admin`). Files marked `'use client'` are interactive forms; everything else renders on the server.
- `lib/` holds domain logic. Pure rule modules (`zones.ts`, `access.ts`, `imports/grades.ts`, `concerns/rules.ts`, `admin/validate.ts`) have unit tests next to them. Database code is in `*/server.ts` files marked `server-only`.
- `db/migrations/` holds numbered SQL files applied by `npm run migrate`. Never edit an applied file; add a new one.
- `data/` holds made-up files in the SIS export layout (`npm run make-dummy-data` regenerates them). Git ignores anything else in `data/`.

| Route | Screen |
|---|---|
| `/login` | Email/password sign-in; credentials are checked against PostgreSQL |
| `/` | Zone overview from the latest snapshot (SLC, Team Learning Lead, COO), or the administrator dashboard |
| `/imports` | SIS export upload (.xlsx or .csv) and import history |
| `/imports/[batchId]` | Validation report, file preview, accept or reject, original file and error list downloads |
| `/deliberation` | Concerns from flagged results, filtered by status and access |
| `/deliberation/[concernId]` | Deliberations, interventions with follow-ups, referrals with restricted notes, close/reopen |
| `/audit` | Audit log review (administrator) |
| `/admin/users` | Accounts, roles and campus/program scopes, teacher links, password resets |
| `/admin/reference` | Campuses, colleges, programs offered per campus, terms and their dates |
| `/account` | Your roles and scope; change your password |
| `/zones` | Rule sets (draft, approve, retire), zone calculation per period, runs and verification |
| `/reports` | Reports by program and year level, period trend, outcome review, campus comparison, CSV export |
| `/period-cycle` | Four-week period timeline (still sample data) |

## Design decisions

- Zones are rule-based; there is no predictive or machine-learning scoring.
- Teachers get zones, following the client's SLC collated summary. This departs from the proposal's "indicators only" delimitation and is listed as an open question in the README.
- Brand colors are estimates. Set the official ones in `tailwind.config.ts` and add the official logo in `components/Sidebar.tsx`.
- There is no public signup. An administrator provisions each account; the first role in `lib/roles.ts` order picks the dashboard. Passwords are scrypt hashes; sessions are random opaque tokens stored hashed in PostgreSQL and sent in HttpOnly cookies.

## Database

Migrations: `001_auth.sql` (accounts, sessions), `002_schema.sql` (everything else, plus roles and permissions), `003_reference_data.sql` (COC starting data). Main tables:

- **Organization:** `campus`, `college`, `program` (names match the SIS `COLLEGE` and `COURSE` columns), `campus_program`, `term` (code `2025-2` = SY 25-26 Sem II), `grading_period` (P1–P3), `year_level`.
- **Academic records:** `student` (SIS ID without the apostrophe, full name, gender, admission type), `student_term` (program, year level and SSP section/adviser per term), `course` (subject code, name, type, units), `course_offering` (subject + section + term), `teacher` (identified by normalized name, since the export has no teacher ID), `teaching_assignment`, `enrollment` (one row per student and subject offering: raw `p1_raw`/`p2_raw`/`p3_raw`, final grade, remarks, modality, enlistment mode).
- **History:** a trigger copies every replaced `enrollment` row into `enrollment_history` with the period it was valid, so past snapshots can be recomputed. Enrollments cannot be deleted.
- **Rules and results:** `zone_rule_set` (thresholds per level in `zone_threshold`, plus `passing_mark`, `failed_values`, `skipped_values`, `failing_remarks`; locked once approved), `snapshot_run`, `student_zone_snapshot`, `subject_result_snapshot`, `teacher_result_snapshot` (read-only).
- **Workflow:** `concern` (one open concern per student per term), `deliberation`, `intervention`, `follow_up`, `referral` (with `recipient`), `referral_note`, `report_run`, `audit_log` (append-only).

## Access control

- Four roles (`slc`, `tl`, `coo`, `admin`) with permissions in `role_permission`; scopes in `user_role_scope` (campus and optional program; empty means all). `lib/permissions.ts` mirrors the role permissions for demo logins, and `npm test` fails if it drifts from the migration.
- Each restricted page calls `guardRoute()` (`lib/authorize.tsx`); the page-to-permission map is `ROUTE_PERMISSIONS` in `lib/access.ts` (the most specific route wins). The sidebar uses the same map, but the server check enforces access.
- API routes go through `handleApi('<permission>', …)` in `lib/api.ts`, or `handleApi(null, …)` when the handler applies finer rules itself (concern actions). Queries limit rows with `programsAtCampus()` / `scopeCondition()`.
- Sign-ins, failed sign-ins, sign-outs, denied access and every data change are written to `audit_log`; data changes call `writeAudit(entry, client)` in the same transaction.

## Security

- **Passwords and sessions:** passwords are at least 12 characters and hashed with scrypt; a wrong email takes as long to check as a wrong password. Sessions are random tokens stored only as hashes, sent in an HttpOnly, SameSite=Lax cookie (Secure in production), and cleared when an account is deactivated or its password is reset.
- **Sign-in limits** (`lib/login-limit.ts`, table `login_attempt`): 5 failed sign-ins for one email, or 30 from one address, within 15 minutes block further tries until the oldest failure is 15 minutes old (HTTP 429, logged as `login_blocked`). A successful sign-in clears that email's count. Behind a reverse proxy the address comes from `X-Forwarded-For`; make sure the proxy sets it.
- **Cross-site requests** (`middleware.ts`, `lib/same-origin.ts`): API requests that change data are refused (403) when `Origin` or `Sec-Fetch-Site` shows they came from another website, so another site cannot use a signed-in user's cookie to upload or approve anything.
- **Headers** (`next.config.mjs`): Content-Security-Policy (own scripts only, Google Fonts for the typeface, no framing), `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a permissions policy; in production also HSTS and upgrade to HTTPS. The `X-Powered-By` header is off.
- **Still needed before go-live:** upgrade Next.js (`npm audit` reports advisories against 14.x), HTTPS at the host, database backups, and forcing a password change after an administrator reset.

## SIS import

- `lib/imports/read.ts` reads `.xlsx` (first sheet, or one named "Grade Deliberation Report", via `read-excel-file`) or UTF-8 `.csv` into a table of strings.
- `lib/imports/grades.ts` validates it (pure, unit tested). Required columns: `SESSION, COURSE, STUDENT ID, NAME, SEMESTER, CODE, SUBJECT NAME, SECTION, P1, P2, P3, REMARKS`; the other columns of the 24-column export are optional. Per row:
  - **Errors (row skipped):** missing values, duplicate student and subject, `SESSION` for another term, `SEMESTER` for another semester, unknown `COURSE`, `SECTION` of another campus, a score outside 0–100 or an unknown text value, an unknown `GRADE` or `REMARKS`, a student whose name or program disagrees with existing records or with an earlier row.
  - **Warnings (row imported):** `COLLEGE` differs from the program's college; year level taken from `YEAR LEVEL` because `SEMESTER` is missing.
  - Normalization: apostrophe and spaces removed from `STUDENT ID`, spaces collapsed in names, `-` treated as empty, year level from `SEMESTER` (`Y2S2`), period text upper-cased, `REMARKS` matched case-insensitively.
- `lib/imports/server.ts` stores the batch (original bytes, SHA-256, issues). Accepting re-validates against the current database and upserts students, `student_term`, subjects, offerings, teachers, assignments and enrollments in one transaction; only changed enrollments are updated, so re-importing the same data adds no history. The same file cannot be accepted twice.

## Zone calculation

- `periodOutcome()` in `lib/zones.ts` decides each subject's outcome for a period: **not counted** if empty or a skipped value (`NA`); **failed** if a failed value (`INC`, `ABS`) or below the passing mark; in P3, also failed if `REMARKS` is a failing remark (`FAILED`, `NO CREDIT`).
- `lib/snapshots/server.ts` locks `enrollment` for writes, reads the scores as of that moment, and computes: students (failed subjects among counted ones; students with nothing counted are left out), subject sections (failed ÷ counted), and teachers (failed ÷ counted across all their classes). Zones come from `classify()` with the rule set's thresholds.
- The approved rule set for a term is the one with the latest effective term up to it. Only the Team Learning Lead (`rules.approve`) approves; the administrator (`rules.configure`) drafts.
- **Verify** recomputes a run from `enrollment` + `enrollment_history` at its `calculated_at` with its rule set and compares every row.

## Dashboards and reports

- Pages render on the server from the latest run for the selected campus, term and period (`campus`, `term`, `period` URL parameters); the browser only receives what the role may see.
- Students are scoped by their program, subject sections by the programs their subject belongs to, teachers by whether they teach any subject of those programs.
- Reports: zones by program and year level, subject and teacher zone counts, the **period trend** (each zone's share per period and the change from the previous one, as in the SLC workbook), the outcome review, and campus comparison (`results.compare_campus`). **Export CSV** re-loads with the user's scope and records a `report_run`.
- Demo logins (`SLCdemo-2026!`, no database) see sample data from `lib/data.ts`.

## Deliberation and referrals

- The SLC (`concern.manage`) opens concerns about flagged students or subject sections in scope; one open concern per student per term.
- Concern pages: deliberations (latest zone run attached as evidence), interventions and follow-ups, referrals to ALC, SSP or KSH (SSP referrals record the student's `ssp_adviser`), close and reopen.
- `lib/concerns/rules.ts` still supports team-level access for support staff (`ROLE_TEAMS`), but no role maps to a team because ALC, SSP and KSH have no accounts. Restricted notes are returned only to `referral_note.view` (SLC). Note text is never written to the audit log.

## Administration

- **Users** (`admin.users`): accounts with roles and scopes, one-time temporary passwords, deactivation, resets; lockout protection for administrators.
- **Reference data** (`admin.reference_data`): campuses, colleges, programs (with their college) and which campus offers them, terms and dates. Codes are fixed once created; term codes must look like `2025-2`.
- **Rule sets** (`/zones`): the administrator drafts thresholds and period settings; the Team Learning Lead approves or retires.
- `npm run create-user` sets up the first administrator; `npm run seed-demo` and `npm run seed-sample` are for development only.
