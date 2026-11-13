# Technical notes

For developers working on the code. For running the system see [getting-started.md](getting-started.md); for what each screen does see [user-guide.md](user-guide.md).

## Stack and layout

TypeScript, Next.js 14 (App Router), Tailwind CSS, PostgreSQL (via `pg`, no ORM). Tests use Node's built-in test runner through `tsx`.

- `app/` holds route entry points. Pages under `app/(protected)/` require a signed-in user; each page checks its own permission with `guardRoute()` and loads data on the server.
- `app/api/` holds route handlers. They start with `handleApi(permission, …)` from `lib/api.ts`, which checks the permission, refuses demo logins, and turns `ApiError` into JSON responses.
- `features/` holds page UI grouped by area (`dashboard`, `imports`, `zones`, `reports`, `deliberation`, `admin`). Files marked `'use client'` are interactive forms; everything else renders on the server.
- `lib/` holds domain logic. Pure rule modules (`zones.ts`, `access.ts`, `imports/grades.ts`, `concerns/rules.ts`, `admin/validate.ts`) have unit tests next to them. Database code is in `*/server.ts` files marked `server-only`.
- `db/migrations/` holds numbered SQL files applied by `npm run migrate`. Never edit an applied file; add a new one.
- `samples/` holds made-up grade files for testing.

| Route | Screen |
|---|---|
| `/login` | Email/password sign-in; credentials are checked against PostgreSQL |
| `/` | Dashboard for the signed-in role: zone overview from the latest snapshot (SLC, Dean, COO, Dean of Deans, Team Learning), or live Data Manager, Administrator and Faculty dashboards |
| `/imports` | Grades upload, import history (from PostgreSQL) |
| `/imports/[batchId]` | Validation report, file preview, accept or reject, original file and error list downloads |
| `/deliberation` | Concerns from flagged results, filtered by status and access |
| `/deliberation/[concernId]` | Deliberations, interventions with follow-ups, referrals with restricted notes, close/reopen |
| `/audit` | Audit log review (administrator) |
| `/admin/users` | Accounts, roles and campus/program scopes, teacher links, password resets |
| `/admin/reference` | Campuses, programs offered per campus, terms and their dates |
| `/account` | Your roles and scope; change your password |
| `/zones` | Rule sets (approve), zone calculation runs, and verification |
| `/reports` | Periodic and semester reports by program, outcome review, campus comparison, CSV export |
| `/period-cycle` | Four-week period timeline (still sample data) |

## Design decisions

- Teacher results are indicators only (no zone, rank or rating), as the proposal's delimitation requires.
- No predictive or machine-learning scoring; zones are rule-based.
- Brand colors are estimates. Set the official ones in `tailwind.config.ts` and add the official logo in `components/Sidebar.tsx`.
- There is no public signup or role picker. An administrator provisions each account, and the assigned role determines which dashboard is shown. Passwords are stored as scrypt hashes; sessions use random, opaque tokens stored hashed in PostgreSQL and sent in HttpOnly cookies. Sign-out revokes the server-side session.

## Access control

- Roles, permissions and campus/program scopes live in the database (`role`, `permission`, `role_permission`, `user_role`, `user_role_scope`). A user may hold several roles; the dashboard shown is that of the first role in `lib/roles.ts` order.
- Each restricted page calls `guardRoute()` from `lib/authorize.tsx` on the server; the page-to-permission map is `ROUTE_PERMISSIONS` in `lib/access.ts`. The sidebar uses the same map to hide links, but the server check is what enforces access.
- API routes go through `handleApi('<permission>', …)` in `lib/api.ts` (or `handleApi(null, …)` when the handler applies finer rules itself, as concern actions do). Server-side queries limit rows with `programsAtCampus()` / `scopeCondition()` from `lib/access.ts`.
- Sign-ins, failed sign-ins, sign-outs and denied page access are written to `audit_log`. For data changes, call `writeAudit(entry, client)` inside the same transaction.
- `lib/permissions.ts` copies the role permissions for development demo accounts. `npm test` fails if it drifts from the migration.

## Grade imports

1. A user with `import.upload` (Data Manager, Administrator) chooses campus, term and period and uploads a CSV. Use **Template** on the imports page for the column layout.
2. The server validates the file and stores the original bytes, a SHA-256 checksum, and every issue: missing columns, missing values, duplicate rows, unmatched identifiers (a student or teacher id whose name or program disagrees with existing records), term/period mismatches, unmapped programs and invalid values.
3. On the batch page, accepting imports the valid rows and skips rows with issues. The file is validated again at that moment against the current database. Students, enrollments, courses, offerings, teachers and teaching assignments are created as needed; a later file for the same period replaces a grade, and the earlier value stays in the earlier batch's file.
4. Uploads, accepts, rejects and original-file downloads are recorded in `audit_log`. The same file cannot be imported twice.

Working assumptions to confirm with PHINMA: the SIS column layout (`lib/imports/grades.ts`), the grade scale (grades are stored as text and not range-checked), and how INC, dropped and withdrawn results count (`result_status` in `db/migrations/003_coc_reference_data.sql`). Excel files must be saved as CSV UTF-8 first; attendance and permit files are not connected yet.

## Zone calculation

1. A rule set starts as a draft. A user with `rules.approve` (COO, Dean of Deans) approves it on `/zones`; the database then locks its thresholds. A rule set applies from its effective term until a later one is approved.
2. A user with `zones.calculate` (Data Manager, Administrator) picks campus, term and period and runs the calculation. It uses each student's latest attempt per offering:
   - **Student zone:** number of failed subjects (`result_status.counts_as_failed`).
   - **Subject zone:** per offering (course section), failed ÷ graded, rounded to 2 decimals. Statuses with `counts_in_denominator = false` (dropped, withdrawn, no grade) are left out of the rate.
   - **Teacher results:** counts per teaching assignment only, with no zone, rank or rating.
3. Each run is saved with its rule set and the exact time it read the grades. Grade writes are blocked for that moment, and saved results cannot be edited.
4. **Verify** recalculates a run from the grades in force at that time (replaced grades are kept in `grade_record_history`) and its rule set, then compares every row (functional test case 20).

## Dashboards and reports

- Pages are rendered on the server from the latest snapshot run for the selected campus, term and period (URL parameters `campus`, `term`, `period`). The browser receives only what the role may see.
- Figures are limited to the user's campus/program scope: students by their program, subject sections by the programs their course belongs to, and teacher indicators by those sections. Sections appear only with the matching permission (`results.student`, `results.subject`, `results.teacher`, `results.compare_campus`).
- Reports show counts with rates per program, Red subject sections, and an outcome review: how students who were Yellow or Red in the previous period of the term moved. A semester report uses the latest period calculated in the term.
- **Export CSV** (`report.generate`) loads the data again with the user's scope, records a `report_run` with its filters, and writes an audit entry. Requests for a program outside the user's scope are refused.
- Faculty accounts see their own classes once an administrator links them to a teacher record (`app_users.teacher_id`).
- Development demo logins (`SLCdemo-2026!`, no database) see the sample data from `lib/data.ts`; they cannot save anything.

## Deliberation, interventions and referrals

- A user with `concern.manage` (SLC, Dean, ALC) opens a concern about a student or subject section flagged in the latest zone results, within their scope.
- On the concern: record deliberations (meeting date, decision, participants, evidence; the latest zone run is attached as evidence automatically), add interventions with an owner and due date, log follow-ups that can change an intervention's status, refer to ALC, SSP or KSH, and close or reopen the concern. A closed concern accepts no changes until reopened.
- Access per concern (`lib/concerns/rules.ts`):
  - **Full** – coordinators within campus/program scope see everything except restricted notes they lack permission for.
  - **Team** – SSP, KSH and ALC staff see concerns referred to their team: the concern and their own team's referrals only, not deliberations or other teams' referrals. They can update their referral's status and add notes.
  - **Owner** – a person assigned an intervention sees the concern and their own interventions, and can log follow-ups on them.
- Restricted notes live in `referral_note` and are returned only to roles with `referral_note.view`, and for team staff only on their own team's referrals. Note text is never written to the audit log.
- Every change is re-authorized on the server and audited. Records are not deleted; changes are status updates, and the audit log keeps who changed what from and to.

## Administration

- **Users** (`admin.users`): create accounts with one or more roles, each scoped to a campus (all or one program). New accounts and password resets get a one-time temporary password shown once on screen; it is never stored in readable form or written to the audit log. Deactivating an account signs it out everywhere. Administrators cannot deactivate themselves or remove their own administrator role, and at least one active administrator always remains. A faculty account can be linked to one teacher record so it sees its own classes.
- **Account**: every user can see their roles and scope and change their password; other sessions are then signed out.
- **Reference data** (`admin.reference_data`): add campuses, programs and terms, rename them, set term dates, and choose which programs each campus offers. Codes cannot change after creation because imports and reports use them. Term codes must look like `2026-1`. A program with enrolled students cannot be removed from a campus.
- **Rule sets** (on `/zones`): administrators (`rules.configure`) create, edit and delete drafts from four numbers (where student Yellow and Red start, where subject Green and Yellow end). COO and Dean of Deans (`rules.approve`) approve drafts and retire approved rule sets; past calculations keep the rule set they used.
- `npm run create-user` and the demo seed still work for setting up the first administrator.
