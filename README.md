# PHINMAED Student Learning Analytics and Deliberation System

A web application for the PHINMA Education periodic grade review. It imports SIS grade files, places students and subjects in Green, Yellow and Red zones, and supports deliberation, interventions, referrals and reporting, with access limited by role, campus and program. PHINMA Cagayan de Oro College (COC) is the pilot site.

Built with TypeScript, Next.js, Tailwind CSS and PostgreSQL.

## Guides

| Guide | For |
|---|---|
| [Getting started](docs/getting-started.md) | Running the system on your computer with a local database and test accounts |
| [User guide](docs/user-guide.md) | What each role can do, and how to use each screen |
| [What the system can do so far](docs/system-status.md) | Progress against the proposal's objectives and test cases, limitations, and assumptions to confirm |
| [Technical notes](docs/technical-notes.md) | Code layout, access rules, and how imports, zones, reports and deliberation work |
| [Sample files](samples/README.md) | Made-up grade files for testing imports and zones |

## Quick start

You need Node.js 18.17+ and Docker. Full steps, Windows commands and troubleshooting are in [Getting started](docs/getting-started.md).

```bash
npm install

# 1. Local database (pick your own password)
docker run -d --name slc-pg --restart unless-stopped \
  -e POSTGRES_USER=slc -e POSTGRES_PASSWORD=choose-a-password -e POSTGRES_DB=slc_app \
  -p 127.0.0.1:5432:5432 -v slc-pg-data:/var/lib/postgresql/data postgres:16-alpine

# 2. Point the app at it (this file is ignored by Git)
echo "DATABASE_URL=postgresql://slc:choose-a-password@localhost:5432/slc_app" > .env.local

# 3. Tables, starting data, and one test account per role (save the printed passwords)
npm run migrate
NODE_ENV=development SLC_ALLOW_DEMO_SEED=1 npm run seed-demo

# 4. Run
npm run dev        # http://localhost:3000
```

Sign in with a `<role>.demo@example.test` email and the password printed in step 3. The shared password `SLCdemo-2026!` opens a sample-data demo that does not use the database.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run migrate` | Apply new database migrations (safe to re-run) |
| `npm run seed-demo` | Create or reset one test account per role (development only) |
| `npm run create-user` | Create one account interactively, for example the first administrator |
| `npm test` | Run the automated tests |
| `npm run build` | Build for production |

## Status

The full grading-period cycle works against the database: import, zone calculation, dashboards, reports, deliberation, referrals, administration and the audit log. The period cycle page still uses sample data, and Excel files must be saved as CSV before import. See [What the system can do so far](docs/system-status.md) for the details and the list of assumptions to confirm with PHINMA.
