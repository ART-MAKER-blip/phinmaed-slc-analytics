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
| `/` | Dashboard selected from the signed-in user's administrator-assigned role |
| `/imports` | Grades upload, import history (from PostgreSQL) |
| `/imports/[batchId]` | Validation report, file preview, accept or reject, original file and error list downloads |
| `/deliberation` | Concern, evidence, agreed action, owner, due date, and referral with a restricted note |
| `/reports` | Periodic and semester report with program breakdown |

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

## Current limitations

Authentication, role and scope checks, audit logging and grade imports are connected to PostgreSQL. Dashboard metrics, deliberation, period cycle and report pages still show sample data from `lib/data.ts`, and zone snapshots are not yet computed from imported grades.
