# PHINMAED Student Learning Analytics and Deliberation System

A web application for the PHINMA Education periodic grade review. It imports the SIS **Grade Deliberation Report** export, places students, subjects and teachers in Green, Yellow and Red zones for each grading period (P1, P2, P3), and supports deliberation, interventions, referrals and reporting, with access limited by role, campus and program. PHINMA Cagayan de Oro College (COC) is the pilot site.

Built with TypeScript, Next.js, Tailwind CSS and PostgreSQL.

## Who uses it

| Role | Does |
|---|---|
| **Student Learning Coordinator (SLC)** | Imports the SIS export, calculates zones, reviews results, records deliberations, interventions and referrals |
| **Team Learning Lead** | Views results across campuses and reports; approves zone rule sets |
| **Chief Operating Officer (COO)** | Views dashboards and reports only |
| **System Administrator** | Manages accounts, campuses, colleges, programs and terms; drafts rule sets; imports; reviews the audit log |

## Guides

| Guide | For |
|---|---|
| [Getting started](docs/getting-started.md) | Running the system on your computer with a local database, test accounts and dummy data |
| [User guide](docs/user-guide.md) | What each role can do, and how to use each screen |
| [What the system can do so far](docs/system-status.md) | Progress against the proposal's objectives and test cases, and limitations |
| [Technical notes](docs/technical-notes.md) | Code layout, the SIS import format, zone rules, access rules |
| [Dummy data](data/README.md) | Made-up files in the real SIS export layout |

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

# 4. Optional: load the dummy SIS export through the real importer and calculate P1-P3
NODE_ENV=development SLC_ALLOW_SAMPLE_SEED=1 npm run seed-sample -- --calculate

# 5. Run
npm run dev        # http://localhost:3000
```

Sign in with `slc.demo@example.test`, `tl.demo@example.test`, `coo.demo@example.test` or `admin.demo@example.test` and the password printed in step 3. The shared password `SLCdemo-2026!` opens a sample-data demo that does not use the database.

## Browse the database (like phpMyAdmin)

[Adminer](https://www.adminer.org/) is a web page for browsing tables, running SQL and checking imports. Run it in Docker next to the database:

```bash
docker network create slc-net
docker network connect slc-net slc-pg
docker run -d --name slc-adminer --restart unless-stopped --network slc-net \
  -p 127.0.0.1:8080:8080 adminer:4.8.1
```

Open http://localhost:8080 and sign in:

| Field | Value |
|---|---|
| System | PostgreSQL |
| Server | `slc-pg` (the database container's name, not `localhost`) |
| Username | `slc` |
| Password | the password you chose in step 1 of the quick start |
| Database | `slc_app` |

Forgot the password? It is in `.env.local`, between `slc:` and `@`. To print it:

```bash
sed -E 's#^.*://[^:]+:([^@]+)@.*#\1#' .env.local
```

If your database container has another name, use that name in `docker network connect` and in the Server field. Stop Adminer with `docker stop slc-adminer` and start it with `docker start slc-adminer`. It only listens on your own machine (`127.0.0.1`).

Good tables to start with: `import_batch` (uploads), `enrollment` (imported scores), `student_zone_snapshot` (zone results) and `audit_log` (who did what). Edit rows only in a test database. Snapshot tables and the audit log reject changes on purpose, and changing scores directly skips the import history.

Prefer a desktop app? [DBeaver](https://dbeaver.io/) and [pgAdmin](https://www.pgadmin.org/) also work. Connect to host `localhost`, port `5432`, and the same database, username and password.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run migrate` | Apply new database migrations (safe to re-run) |
| `npm run seed-demo` | Create or reset one test account per role (development only) |
| `npm run seed-sample` | Import `data/dummy_sis_grades_sample.csv` through the real importer; `-- --calculate` also approves the starting rule set and calculates P1–P3 (development only) |
| `npm run make-dummy-data` | Regenerate the dummy files in `data/` |
| `npm run create-user` | Create one account interactively, for example the first administrator |
| `npm test` | Run the automated tests |
| `npm run build` | Build for production |

## Data privacy

Real SIS exports contain student records (Data Privacy Act, RA 10173). Never commit them: Git ignores everything in `data/` except the `dummy_*` files. Uploaded files are stored only in the database, with an audit entry for every upload, decision and download.

## Open questions for the client

These are working assumptions in the current build. Each one is a setting or a short code change once PHINMA confirms it.

1. **Teacher zones.** The SLC collated summary gives teachers Green/Yellow/Red zones, so the app does too (same limits as subjects). The approved proposal said teacher results would be indicators only, so this change needs the adviser's or panel's agreement.
2. **Passing mark.** A period score below **60** counts as failed. It is a setting in each rule set.
3. **Text period values.** `NA` and empty cells are not counted; `INC` and `ABS` count as failed. Also rule set settings.
4. **Final remarks.** In P3, a final remark of `FAILED` or `NO CREDIT` counts as failed even if the P3 score passed or is `NA`.
5. **Zero scores.** A score of `0` counts as failed. If `0` sometimes means "not yet encoded", the SIS should export `NA` instead, or `0` should become a skipped value.
6. **Zone thresholds.** Students: 0 / 1 / 2+ failed subjects. Subjects and teachers: 0–10% / 10.01–40% / 40.01–100% failed, rates rounded to 2 decimals.
7. **Year level.** Taken from `SEMESTER` (`Y2S2` = year 2), because `YEAR LEVEL` in the export shows `YEAR 1` for most students.
8. **Other-college rows.** About 50 rows in the real export list a different `COLLEGE` than the program's. They are imported under the program from `COURSE`, with a warning.
9. **Teacher identity.** The export has teacher names but no teacher ID, so teachers are matched by name (trimmed, upper case). A spelling change in the SIS would create a second teacher.
10. **Subject section.** A subject's class is identified by `CODE` + `SECTION` within a term.
11. **Referrals.** ALC, SSP and KSH staff have no accounts. The SLC records referrals and updates their status; an SSP referral records the student's SSP adviser from the export. Restricted notes are visible to the SLC only.
12. **Roles.** The Team Learning lead approves rule sets and the COO only views. Confirm that the COO should be able to export reports.
13. **Term codes.** `SY 25-26 SEM II` is stored as term `2025-2`; summer is semester 3.
