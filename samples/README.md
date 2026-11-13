# Sample grade files

Made-up data for testing imports and zone calculation. The names are random and the files contain no real student records.

| File | What it contains |
|---|---|
| `grades_2026-1_P1.csv` | 80 students in BSIT, BSEd, BSBA and BSCrim, 3 subjects each (240 rows), term 2026-1, Period 1. Some subjects fail more often than others, so subject zones vary. |
| `grades_2026-1_P2.csv` | The same students and subjects for Period 2. Most students who failed in P1 recover, so the outcome review in Reports has something to show. |
| `grades_with_errors.csv` | 6 rows: 2 valid, and 4 with deliberate mistakes (a duplicate row, an unknown program `BSXX`, a missing student ID, and a year level of 7 with an unknown result status). Use it to see the validation report. |

When uploading, choose term **2026-1** and the matching period (**P1** or **P2**). The column layout is the same as the **Template** button on the Import reports page.
