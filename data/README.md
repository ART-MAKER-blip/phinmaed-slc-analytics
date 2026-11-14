# Dummy SIS data

Made-up files in the same layout as the SIS **Grade Deliberation Report** export (24 columns, one row per student per subject). Every name and ID is invented; there are no real student records here.

| File | What it contains |
|---|---|
| `dummy_sis_grades_sample.csv` | 120 BSIT students at COC, term 2025-2 (SY 25-26 Sem II), years 1–4, with P1, P2 and P3 scores, final grades and remarks (604 rows). |
| `dummy_sis_grades_P1_only.csv` | The same rows as they look early in the term: only P1 is filled in, P2/P3 are `NA`, and there is no final grade yet. Upload it first, then the full file, to see scores update. |
| `dummy_sis_grades_errors.csv` | 8 rows: valid ones plus a duplicate, an unknown program, a missing student ID, an out-of-range score with an unknown remark, a wrong term, and a section from another campus. |

The files copy the quirks of the real export so the importer is tested against them: student IDs with a leading apostrophe, names and teachers with trailing spaces, `YEAR LEVEL` showing `YEAR 1` for everyone (the year comes from `SEMESTER`, e.g. `Y2S2`) and sometimes empty, `-` for none, SSP subjects graded `COMPLETE`, `NA`/`INC`/`ABS` period values, and one student listed under another college.

Regenerate them with `npm run make-dummy-data`. Load the full file through the real importer with:

```bash
NODE_ENV=development SLC_ALLOW_SAMPLE_SEED=1 npm run seed-sample -- --calculate
```

**Never put real SIS exports in this folder.** Git ignores everything here except `dummy_*.csv` and this README.
