/**
 * Generates made-up SIS "Grade Deliberation Report" files in data/. No real student data:
 * every name is built from short lists below. The layout and quirks match the real export
 * (apostrophe student IDs, trailing spaces, YEAR LEVEL always "YEAR 1", "-" for none,
 * SSP subjects graded COMPLETE, NA/INC/ABS period values, a student from another college).
 *
 *   npm run make-dummy-data
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SIS_COLUMNS } from '../lib/imports/grades';

// Deterministic random numbers so the files are the same every time.
let seed = 20251;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

const LAST = ['DELA CRUZ', 'REYES', 'SANTOS', 'GARCIA', 'MENDOZA', 'TORRES', 'FLORES', 'RAMOS', 'NAVARRO', 'AQUINO',
  'CASTILLO', 'VILLANUEVA', 'BAUTISTA', 'LIM', 'TAN', 'GONZALES', 'PADILLA', 'SALAZAR', 'ROSALES', 'CABRERA'];
const FIRST = ['JUAN', 'MARIA', 'JOSE', 'ANA', 'MARK', 'GRACE', 'PAOLO', 'KIM', 'JOY', 'CARLO', 'LIZA', 'MIGUEL',
  'BEA', 'REY', 'NINA', 'LEO', 'IVY', 'DAN', 'ELLA', 'NOEL'];
const TEACHERS = ['ABELLA, ROSA M', 'BALDO, PETER C', 'CRUZ, LORNA T', 'DIAZ, ALAN R', 'ESTRADA, MAY B', 'FUENTES, OSCAR L',
  'GALANG, TINA P', 'HERRERA, JUN S', 'IBARRA, CORA D', 'JAVIER, NOEL F', 'LACSON, VIC A', 'MORALES, IRENE G'];
const ADVISERS = ['PEREZ, ARNEL Q', 'QUIMPO, BELLA R', 'RIVERA, CHITO S', 'SORIANO, DINA T'];

// Subjects per year level: [code, name, type, units, teacher index, difficulty].
const SUBJECTS: Record<number, [string, string, string, number, number, number][]> = {
  1: [['ITE 186', 'COMPUTER PROGRAMMING 2', 'Lecture and Laboratory', 3, 0, 0.35], ['GEN 008', 'LIVING IN THE IT ERA', 'Lecture', 3, 1, 0.1],
    ['GEN 005', 'THE CONTEMPORARY WORLD', 'Lecture', 3, 2, 0.08], ['PED 031', 'PHYSICAL ACTIVITIES TOWARD HEALTH AND FITNESS 2', 'Lecture', 2, 3, 0.04],
    ['NST 022', 'NATIONAL SERVICE TRAINING PROGRAM 2', 'Lecture', 3, 4, 0.03], ['SSP 006', 'STUDENT SUCCESS PROGRAM 2', 'Lecture', 1, 5, 0]],
  2: [['ITE 048', 'DISCRETE STRUCTURES', 'Lecture', 3, 6, 0.4], ['ITE 399', 'HUMAN COMPUTER INTERACTION', 'Lecture and Laboratory', 3, 7, 0.15],
    ['ART 002', 'ART APPRECIATION', 'Lecture', 3, 8, 0.05], ['GEN 013', "PEOPLE AND THE EARTH'S ECOSYSTEMS", 'Lecture', 3, 2, 0.12],
    ['SSP 008', 'STUDENT SUCCESS PROGRAM 4', 'Lecture', 1, 5, 0]],
  3: [['ITE 308', 'WEB SYSTEM AND TECHNOLOGIES', 'Lecture and Laboratory', 3, 9, 0.2], ['ITE 400', 'SYSTEMS INTEGRATION AND ARCHITECTURE', 'Lecture and Laboratory', 3, 10, 0.25],
    ['ITE 393', 'APPLICATIONS DEVELOPMENT AND EMERGING TECHNOLOGIES', 'Lecture and Laboratory', 3, 0, 0.18], ['GEN 009', 'THE ENTREPRENEURIAL MIND', 'Lecture', 3, 11, 0.06]],
  4: [['ITE 311', 'CAPSTONE PROJECT 2', 'Lecture', 6, 10, 0.15], ['ITE 401', 'SOCIAL AND PROFESSIONAL ISSUES', 'Lecture and Laboratory', 3, 9, 0.05]],
};
const SECTIONS: Record<number, string[]> = {
  1: ['COC-FA1-IT1-01', 'COC-FA1-IT1-02'], 2: ['COC-FAB-IT2-01', 'COC-FAB-IT2-02'], 3: ['COC-FAB-IT3-01'], 4: ['COC-FAB-IT4-01'],
};
const STUDENTS_PER_YEAR: Record<number, number> = { 1: 50, 2: 40, 3: 22, 4: 8 };

type Row = Record<(typeof SIS_COLUMNS)[number], string>;

function score(difficulty: number, weak: boolean) {
  const fails = rand() < difficulty * (weak ? 2.2 : 0.6);
  return fails ? round2(35 + rand() * 24) : round2(62 + rand() * 38);
}

function finalGrade(scores: number[]) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg < 60) return { grade: '4', remarks: 'FAILED' };
  const scale = [[97, '1'], [94, '1.25'], [91, '1.5'], [88, '1.75'], [85, '2'], [82, '2.25'], [79, '2.5'], [76, '2.75']] as const;
  return { grade: scale.find(([min]) => avg >= min)?.[1] ?? '3', remarks: 'Passed' };
}

const full: Row[] = [];
const p1Only: Row[] = [];
let n = 0;
for (const year of [1, 2, 3, 4]) {
  for (let i = 0; i < STUDENTS_PER_YEAR[year]; i += 1) {
    n += 1;
    const id = `2${5 - year}${String(n).padStart(2, '0')}-${String(100000 + n * 37).slice(-6)}`;
    // Most IDs keep the SIS apostrophe; a few come through as plain text, as in the real export.
    const studentId = n % 15 === 0 ? id : `'${id}`;
    const name = `${pick(LAST)}, ${pick(FIRST)} ${String.fromCharCode(65 + Math.floor(rand() * 26))} `;
    const section = pick(SECTIONS[year]);
    const weak = rand() < 0.3;
    const otherCollege = n === 7;
    const restudy = rand() < 0.03;
    const remote = rand() < 0.02;
    const gender = rand() < 0.72 ? 'Male' : 'Female';
    const admission = rand() < 0.95 ? 'Regular' : pick(['Transferee', 'Returnee']);
    const adviser = pick(ADVISERS);
    for (const [code, subject, type, units, teacher, difficulty] of SUBJECTS[year]) {
      const isSsp = code.startsWith('SSP');
      const base = {
        SESSION: 'SY 25-26 SEM II',
        COLLEGE: otherCollege ? 'College of Engineering and Architecture' : 'College of Information Technology Education',
        COURSE: 'Bachelor of Science in Information Technology',
        'STUDENT ID': studentId, NAME: name, SEMESTER: `Y${year}S2`,
        // The real export says YEAR 1 for everyone and sometimes leaves it empty.
        'YEAR LEVEL': n % 23 === 0 ? '' : 'YEAR 1',
        CODE: code, 'SUBJECT NAME': subject, 'SUBJECT TYPE': type, UNITS: String(units), SECTION: section,
        TEACHER: `${TEACHERS[teacher]}${teacher % 3 === 0 ? ' ' : ''}`,
        'SSP SECTION': isSsp ? section : '-', 'SSP ADVISER': isSsp ? adviser : '-',
        MODALITY: remote ? 'FLEX REMOTE' : 'FLEX', 'ENLISTMENT MODE': restudy ? 'Re-Study' : 'Regular',
        'ADMISSION TYPE': admission, GENDER: gender,
      };
      let p = { P1: 'NA', P2: 'NA', P3: 'NA' };
      let grade = 'COMPLETE';
      let remarks = 'Passed';
      if (!isSsp) {
        const s = [score(difficulty, weak), score(difficulty, weak), score(difficulty * 0.7, weak)];
        p = { P1: String(s[0]), P2: String(s[1]), P3: String(s[2]) };
        ({ grade, remarks } = finalGrade(s));
        const r = rand();
        if (r < 0.015) { p.P3 = 'INC'; grade = 'INC'; remarks = 'INCOMPLETE'; }
        else if (r < 0.025) { p.P2 = 'ABS'; p.P3 = '0'; grade = 'FA'; remarks = 'FAILED'; }
        else if (r < 0.04) { p.P3 = '0'; grade = 'NC'; remarks = 'NO CREDIT'; }
      }
      full.push({ ...base, ...p, GRADE: grade, REMARKS: remarks } as Row);
      // Early in the term only P1 is in, and there is no final grade yet.
      p1Only.push({ ...base, P1: p.P1, P2: 'NA', P3: 'NA', GRADE: '-', REMARKS: '-' } as Row);
    }
  }
}

const errors: Row[] = [
  full[0],
  full[0], // duplicate row
  { ...full[1], 'STUDENT ID': "'2599-999999", NAME: 'LOPEZ, IVY M', COURSE: 'Bachelor of Science in Nursing' }, // unknown program
  { ...full[2], 'STUDENT ID': '' }, // missing student ID
  { ...full[3], 'STUDENT ID': "'2599-999998", NAME: 'UY, DAN P', P1: '120', REMARKS: 'MAYBE' }, // bad score and remark
  { ...full[4], 'STUDENT ID': "'2599-999997", NAME: 'GO, FAY L', SESSION: 'SY 24-25 SEM II' }, // wrong term
  { ...full[5], 'STUDENT ID': "'2599-999996", NAME: 'SY, HAL R', SECTION: 'AU-FA1-IT1-01' }, // other campus
  full[6],
];

const out = path.join(process.cwd(), 'data');
mkdirSync(out, { recursive: true });
const write = (file: string, rows: Row[]) => {
  // Cells are written as-is: the real export has apostrophes and "-" that must survive.
  const lines = [SIS_COLUMNS.join(','), ...rows.map((r) => SIS_COLUMNS.map((c) => {
    const v = r[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  }).join(','))];
  writeFileSync(path.join(out, file), `${lines.join('\r\n')}\r\n`);
  console.log(`${file}: ${rows.length} rows`);
};
write('dummy_sis_grades_sample.csv', full);
write('dummy_sis_grades_P1_only.csv', p1Only);
write('dummy_sis_grades_errors.csv', errors);
