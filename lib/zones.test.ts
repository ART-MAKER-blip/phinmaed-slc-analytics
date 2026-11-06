import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, failureRate, studentZone, subjectZone, summarize, type RuleSet } from './zones';

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
