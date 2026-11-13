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
2. Apply the authentication schema: `psql "$DATABASE_URL" -f db/schema.sql`.
3. To create one test account for each role, run this from a local development terminal:
   ```bash
   NODE_ENV=development SLC_ALLOW_DEMO_SEED=1 npm run seed-demo
   ```
   Save the randomly generated passwords printed in the terminal; they are only displayed once. Re-running the command resets all demo passwords. This command refuses to run in production.
4. Or create a single account interactively with `npm run create-user`; enter the user's name, email, role, and a password of at least 12 characters.
5. Start the app and sign in at `/login`.

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
| `/imports` | File preview, error report and import history |
| `/deliberation` | Concern, evidence, agreed action, owner, due date, and referral with a restricted note |
| `/reports` | Periodic and semester report with program breakdown |

- `lib/zones.ts` is the rule engine. Thresholds sit in a `RuleSet` that carries an effective term, so a later term can change them without changing earlier results.
- `lib/data.ts` holds placeholder data. Replace it with PostgreSQL queries based on the ERD in Appendix C.
- Teacher results are shown as indicators only (no zone, rank or rating), as the proposal's delimitation requires.
- Predictive or machine-learning scoring is not included, as the proposal's delimitation requires.
- Brand colors are estimates. Set the official ones in `tailwind.config.ts`, and add the official logo in `components/Sidebar.tsx`.

## Current limitations

Authentication and session checks are connected, but dashboard metrics and queue items remain sample data. Real imports, saved deliberations/referrals, audit logging, and live reporting are not connected.
