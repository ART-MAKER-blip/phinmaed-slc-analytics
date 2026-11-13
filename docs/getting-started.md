# Getting started: run the system on your computer

This guide sets up the system with its own local database so you can test it with the sample files. It takes about 15 minutes the first time.

## 1. What you need

- **Node.js 18.17 or newer** (Node 20 LTS recommended). Check with `node -v`.
- **Docker Desktop** (or Docker Engine on Linux), to run PostgreSQL without installing it. Check with `docker -v`.
  If you already have PostgreSQL 13 or newer installed, you can use it instead (see step 3b).
- **Git**, to get the code.

## 2. Get the code and install packages

```bash
git clone https://github.com/ART-MAKER-blip/phinmaed-slc-analytics.git
cd phinmaed-slc-analytics
npm install
```

## 3. Start a database

### 3a. With Docker (recommended)

Pick a password for your local database (any long random text) and run:

```bash
docker run -d --name slc-pg --restart unless-stopped \
  -e POSTGRES_USER=slc -e POSTGRES_PASSWORD=choose-a-password -e POSTGRES_DB=slc_app \
  -p 127.0.0.1:5432:5432 -v slc-pg-data:/var/lib/postgresql/data postgres:16-alpine
```

On Windows PowerShell, put the command on one line (remove the `\`).

The `slc-pg-data` volume keeps your data when the container restarts.

### 3b. With an existing PostgreSQL

Create an empty database (for example `createdb slc_app`) and note its user and password.

## 4. Tell the app where the database is

Create a file named `.env.local` in the project folder (next to `package.json`) with one line:

```
DATABASE_URL=postgresql://slc:choose-a-password@localhost:5432/slc_app
```

Use the same user, password and database name as in step 3. This file is ignored by Git, so your password is never committed. Never put real credentials in `.env.example`.

## 5. Create the tables and starting data

```bash
npm run migrate
```

This creates every table from the ERD and the COC starting data: the campus, 4 programs, terms 2026-1 and 2026-2, periods P1–P3, the zones, a **draft** zone rule set, and all roles and permissions. Running it again is safe; it only applies what is new.

## 6. Create test accounts

This creates one database account for each of the 11 roles and prints a random password for each:

**macOS / Linux / Git Bash**
```bash
NODE_ENV=development SLC_ALLOW_DEMO_SEED=1 npm run seed-demo
```

**Windows PowerShell**
```powershell
$env:NODE_ENV="development"; $env:SLC_ALLOW_DEMO_SEED="1"; npm run seed-demo
```

Copy the table it prints; the passwords are shown only once. Running it again gives every test account a new password. The command refuses to run in production.

The accounts are `<role>.demo@example.test`, for example `slc.demo@example.test`, `data_manager.demo@example.test` and `admin.demo@example.test`.

To create a single real account instead, run `npm run create-user` and answer the questions. After that, administrators create everyone else in the app (**Administration → Users and access**).

## 7. Start the app

```bash
npm run dev
```

Open http://localhost:3000 and sign in with an account from step 6.

> **Important:** use the password printed in step 6. In development, the login page also offers built-in demo logins with the shared password `SLCdemo-2026!`. Those demo logins do **not** use the database: they show sample data, cannot save anything, and are disabled in production. If you sign in with a test email and `SLCdemo-2026!`, you get the demo, not your database account.

## 8. Try it with the sample data

The `samples/` folder has made-up grade files. A full walkthrough:

1. **Data Manager** (`data_manager.demo@example.test`) → **Import reports**
   - Upload `samples/grades_with_errors.csv` (term 2026-1, period P1) to see the validation report, then click **Reject batch**.
   - Upload `samples/grades_2026-1_P1.csv` with period **P1**, then click **Accept … rows**.
   - Upload `samples/grades_2026-1_P2.csv` with period **P2**, then click **Accept … rows**.
2. **COO** → **Zones** → **Approve** the rule set `rs-2026-1`. Zones cannot be calculated until a rule set is approved.
3. **Data Manager** → **Zones** → **Calculate zones** for P1, then for P2. Click **Verify** on a run to check it can be reproduced.
4. **SLC** → **Dashboard**: switch between P1 and P2. Then **Reports**: see students by program, the outcome review, and **Export CSV**.
5. **SLC** → **Deliberation**: open a concern for a flagged student, record a deliberation, add an intervention owned by the Faculty account, and refer the student to KSH (with a restricted note) and SSP.
6. Sign in as **KSH**, **SSP**, **Dean** and **Faculty** to see how each one sees the same concern differently.
7. **Admin** → **Administration**: create an account, change a role's scope, and link `faculty.demo` to a teacher (for example *Lim, Carlo*) so the Faculty dashboard shows that teacher's classes. Then check the **Audit log**.

The [user guide](user-guide.md) explains each of these screens.

## Everyday commands

| Task | Command |
|---|---|
| Start the app | `npm run dev` |
| Apply new database changes after pulling | `npm run migrate` |
| Run the automated tests | `npm test` |
| Check that the app builds | `npm run build` |
| Stop the database | `docker stop slc-pg` |
| Start it again | `docker start slc-pg` |
| Delete the database and start over | `docker rm -f slc-pg` then `docker volume rm slc-pg-data`, then repeat steps 3–6 |

## Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL is required` | `.env.local` is missing or in the wrong folder. It must sit next to `package.json`. |
| `password authentication failed` | The password in `.env.local` does not match the one used in step 3. If you changed it, delete the container and volume and start again. |
| `port is already allocated` when starting Docker | Something else uses port 5432. Change `-p 127.0.0.1:5432:5432` to `-p 127.0.0.1:5433:5432` and use `localhost:5433` in `.env.local`. |
| Sign-in works but pages show sample data and nothing saves | You used `SLCdemo-2026!`. Sign out and use the password printed by `seed-demo`. |
| "Your account has no role assigned yet" | An administrator must give the account a role in **Administration → Users and access**. |
| "No approved zone rule set applies to term …" | Sign in as COO or Dean of Deans and approve a rule set on **Zones**. |
| The dashboard says there are no zone results | Import grades for that period, then run **Calculate zones** for it. |
| `'NODE_ENV' is not recognized` on Windows | Use the PowerShell version of the command in step 6. |
| Forgot a test password | Run the `seed-demo` command again, or have an administrator use **Reset password**. |
