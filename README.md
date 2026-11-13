# PHINMAED Student Learning Analytics and Deliberation System

Stack: TypeScript, Next.js (App Router), Tailwind CSS, PostgreSQL.

## Run it

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # zone rule tests
npm run build
```

## Authentication setup

1. Create a PostgreSQL database and set `DATABASE_URL` (see `.env.example`; create a local `.env.local` and do not commit real credentials). The helper scripts load `.env.local`; for the `psql` command below, also export `DATABASE_URL` in that terminal.
2. Apply the database migrations: `npm run migrate`. This creates the full schema from the proposal's ERD (Appendix C) and the COC reference data (campus, programs, terms, zones, the draft rule set, roles and permissions). Applied files are tracked in `schema_migrations`, so the command is safe to re-run. To change the schema later, add a new numbered file in `db/migrations/`; never edit one that has already been applied. Databases set up with the old `db/schema.sql` upgrade automatically, and existing users keep their role, scoped to COC.
3. To create one test account for each role, run this from a local development terminal:
   ```bash
   NODE_ENV=development SLC_ALLOW_DEMO_SEED=1 npm run seed-demo
   ```
   Save the randomly generated passwords printed in the terminal; they are only displayed once. Re-running the command resets all demo passwords. This command refuses to run in production.
4. Or create a single account interactively with `npm run create-user`; enter the user's name, email, role, and a password of at least 12 characters.
5. Start the app and sign in at `/login`.

### Access control

- Roles, permissions and campus/program scopes live in the database (`role`, `permission`, `role_permission`, `user_role`, `user_role_scope`). A user may hold several roles; the dashboard shown is that of the first role in `lib/roles.ts` order.
- Each restricted page calls `guardRoute()` from `lib/authorize.tsx` on the server; the page-to-permission map is `ROUTE_PERMISSIONS` in `lib/access.ts`. The sidebar uses the same map to hide links, but the server check is what enforces access.
- API routes should start with `requireApiPermission('<permission>')`, and server-side queries should filter rows with `scopeCondition()` from `lib/access.ts`.
- Sign-ins, failed sign-ins, sign-outs and denied page access are written to `audit_log`. For data changes, call `writeAudit(entry, client)` inside the same transaction.
- `lib/permissions.ts` copies the role permissions for development demo accounts. `npm test` fails if it drifts from the migration.

There is no public signup or role picker. An administrator provisions each account, and the assigned role determines which dashboard is shown. Passwords are stored as scrypt hashes; sessions use random, opaque tokens stored hashed in PostgreSQL and sent in HttpOnly cookies. Sign-out revokes the server-side session.

With `npm run dev`, the login page also provides local demo credentials for all roles. Each demo account uses the password `SLCdemo-2026!`; these accounts are development-only, do not require a database, and are disabled in production. For database-backed testing, use the seed command above instead.

The app's sample dashboard data is still placeholder data in the code, not saved per user in PostgreSQL. The signed-in account's role selects its dashboard, but the sample metrics are shared. Before using real student records, connect each page's data queries to PostgreSQL and enforce role, campus, and assignment permissions in the server-side queries/API handlers—not only in the UI. Add deployment-level HTTPS, rate limiting, backups, and monitoring before production use.

## What is here

## Code organization

- `app/` contains the Next.js route entrypoints; each `page.tsx` delegates to its feature module.
- `features/` contains page-specific UI and behavior, grouped by route (`dashboard`, `deliberation`, `imports`, `reports`).
- `components/` contains UI shared across features.
- `lib/` contains shared data and domain logic, including zone calculations.

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

- `lib/zones.ts` is the rule engine. Thresholds sit in a `RuleSet` that carries an effective term, so a later term can change them without changing earlier results.
- `lib/data.ts` holds placeholder data. Replace it with PostgreSQL queries based on the ERD in Appendix C.
- Teacher results are shown as indicators only (no zone, rank or rating), as the proposal's delimitation requires.
- Predictive or machine-learning scoring is not included, as the proposal's delimitation requires.
- Brand colors are estimates. Set the official ones in `tailwind.config.ts`, and add the official logo in `components/Sidebar.tsx`.

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
- Faculty accounts see their own classes once `app_users.teacher_id` links them to a teacher record (there is no screen for this yet).
- Demo accounts see the sample data from `lib/data.ts`.

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

## Current limitations

The period cycle page still shows sample data. Excel files must be saved as CSV before import. One open concern per student per term is suggested by the new-concern list but not enforced by the database.
