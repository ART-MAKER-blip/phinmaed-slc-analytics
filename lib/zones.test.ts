import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, DEFAULT_RULES, failureRate, studentZone, subjectZone, summarize, validateThresholds,
  type RuleSet, type Zone, type ZoneLevel, type ZoneThreshold,
} from './zones';

// Test case 7 in the proposal: students with 0, 1 and 2 or more failed subjects.
test('student zones follow 0 / 1 / 2+ failed subjects', () => {
  assert.equal(studentZone(0), 'green');
  assert.equal(studentZone(1), 'yellow');
  assert.equal(studentZone(2), 'red');
  assert.equal(studentZone(5), 'red');
});

// Test case 8: failure rates of 10%, 10.01%, 40% and 40.01%.
test('subject zones follow the 10 / 40 percent boundaries', () => {
  assert.equal(subjectZone(10), 'green');
  assert.equal(subjectZone(10.01), 'yellow');
  assert.equal(subjectZone(40), 'yellow');
  assert.equal(subjectZone(40.01), 'red');
  assert.equal(subjectZone(0), 'green');
  assert.equal(subjectZone(100), 'red');
});

test('failure rate is rounded to two decimals and handles empty classes', () => {
  assert.equal(failureRate(19, 41), 46.34);
  assert.equal(failureRate(0, 0), 0);
});

// Test case 9: a new rule set changes new results only.
test('a different rule set changes the result without touching the default', () => {
  const stricter: RuleSet = { ...DEFAULT_RULES, id: 'rs-2027-1', effectiveTerm: '2027-1', student: { yellowMin: 1, redMin: 3 } };
  assert.equal(studentZone(2, DEFAULT_RULES), 'red');
  assert.equal(studentZone(2, stricter), 'yellow');
});

test('summarize returns counts and rates together', () => {
  const s = summarize([0, 0, 1, 2], (n) => studentZone(n));
  assert.deepEqual(s.counts, { green: 2, yellow: 1, red: 1 });
  assert.equal(s.total, 4);
  assert.equal(s.rates.green, 50);
});

const STORED: ZoneThreshold[] = [
  { level: 'student', zone: 'green', min: 0, max: 0 },
  { level: 'student', zone: 'yellow', min: 1, max: 1 },
  { level: 'student', zone: 'red', min: 2, max: null },
  { level: 'subject', zone: 'green', min: 0, max: 10 },
  { level: 'subject', zone: 'yellow', min: 10.01, max: 40 },
  { level: 'subject', zone: 'red', min: 40.01, max: 100 },
];

test('stored rule sets classify students by failed subjects (test case 7)', () => {
  assert.deepEqual([0, 1, 2, 5].map((n) => classify(STORED, 'student', n)), ['green', 'yellow', 'red', 'red']);
});

test('stored rule sets classify subjects at the documented boundaries (test case 8)', () => {
  assert.deepEqual(
    [0, 10, 10.01, 40, 40.01, 100].map((r) => classify(STORED, 'subject', r)),
    ['green', 'green', 'yellow', 'yellow', 'red', 'red'],
  );
  // 10.004% rounds to 10.00 (green); 10.005% rounds to 10.01 (yellow).
  assert.equal(classify(STORED, 'subject', 10.004), 'green');
  assert.equal(classify(STORED, 'subject', 10.005), 'yellow');
  assert.throws(() => classify(STORED, 'subject', 120), /No subject zone/);
});

test('the seeded thresholds are a valid rule set', () => {
  assert.deepEqual(validateThresholds(STORED), []);
});

test('incomplete or gapped rule sets are rejected', () => {
  const without = (level: ZoneLevel, zone: Zone) => STORED.filter((t) => !(t.level === level && t.zone === zone));
  assert.match(validateThresholds(without('subject', 'yellow')).join(), /subject level needs/);
  const gap = STORED.map((t) => (t.level === 'subject' && t.zone === 'yellow' ? { ...t, min: 11 } : t));
  assert.match(validateThresholds(gap).join(), /must start right after green/);
  const fractional = STORED.map((t) => (t.level === 'student' && t.zone === 'yellow' ? { ...t, min: 1, max: 1.5 } : t));
  assert.ok(validateThresholds(fractional).length > 0);
});
