# PHINMAED Student Learning Analytics and Deliberation System (UI prototype)

Stack from the proposal: TypeScript, Next.js (App Router), Tailwind CSS. PostgreSQL is the planned database and is not connected yet.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # zone rule tests (proposal test cases 7, 8 and 9)
npm run build
```

## What is here

## Code organization

- `app/` contains the Next.js route entrypoints; each `page.tsx` delegates to its feature module.
- `features/` contains page-specific UI and behavior, grouped by route (`dashboard`, `deliberation`, `imports`, `reports`).
- `components/` contains UI shared across features.
- `lib/` contains shared data and domain logic, including zone calculations.

| Route | Screen |
|---|---|
| `/login` | Demo sign-in with a role picker; credentials are not validated |
| `/` | Role-specific dashboard; the SLC view includes student and subject zones, flagged students, and teacher indicators |
| `/imports` | File preview, error report and import history |
| `/deliberation` | Concern, evidence, agreed action, owner, due date, and referral with a restricted note |
| `/reports` | Periodic and semester report with program breakdown |

- `lib/zones.ts` is the rule engine. Thresholds sit in a `RuleSet` that carries an effective term, so a later term can change them without changing earlier results.
- `lib/data.ts` holds placeholder data. Replace it with PostgreSQL queries based on the ERD in Appendix C.
- Teacher results are shown as indicators only (no zone, rank or rating), as the proposal's delimitation requires.
- Predictive or machine-learning scoring is not included, as the proposal's delimitation requires.
- Brand colors are estimates. Set the official ones in `tailwind.config.ts`, and add the official logo in `components/Sidebar.tsx`.

## Prototype limitations

Authentication, server-side role enforcement, real imports, saving deliberations and referrals, audit log, and live reporting are not connected. Dashboard metrics and queue items are sample data. The deliberation page has a "Preview as" selector that only demonstrates restricted notes.
