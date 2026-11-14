import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientIp,
  LOGIN_WINDOW_MINUTES,
  MAX_FAILURES_PER_EMAIL,
  MAX_FAILURES_PER_IP,
  retryAfterSeconds,
  waitMessage,
} from './login-limit';

const now = new Date('2026-11-14T10:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

test('sign-in is allowed below the limits', () => {
  assert.equal(
    retryAfterSeconds({ email: MAX_FAILURES_PER_EMAIL - 1, ip: MAX_FAILURES_PER_IP - 1, oldestEmail: minutesAgo(1), oldestIp: minutesAgo(1) }, now),
    0,
  );
});

test('too many failures for one email blocks until the oldest leaves the window', () => {
  const wait = retryAfterSeconds({ email: MAX_FAILURES_PER_EMAIL, ip: 0, oldestEmail: minutesAgo(5), oldestIp: null }, now);
  assert.equal(wait, (LOGIN_WINDOW_MINUTES - 5) * 60);
});

test('too many failures from one address blocks every email from it', () => {
  const wait = retryAfterSeconds({ email: 0, ip: MAX_FAILURES_PER_IP, oldestEmail: null, oldestIp: minutesAgo(14) }, now);
  assert.equal(wait, 60);
});

test('the longer of two waits applies, and a block is never 0 seconds', () => {
  const both = retryAfterSeconds(
    { email: MAX_FAILURES_PER_EMAIL, ip: MAX_FAILURES_PER_IP, oldestEmail: minutesAgo(10), oldestIp: minutesAgo(2) },
    now,
  );
  assert.equal(both, 13 * 60);
  const edge = retryAfterSeconds({ email: MAX_FAILURES_PER_EMAIL, ip: 0, oldestEmail: minutesAgo(LOGIN_WINDOW_MINUTES), oldestIp: null }, now);
  assert.equal(edge, 1);
});

test('client address comes from the first forwarded entry', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
  assert.equal(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(clientIp(new Headers()), 'unknown');
});

test('wait message rounds up to whole minutes', () => {
  assert.equal(waitMessage(61), 'Too many failed sign-ins. Try again in 2 minutes.');
  assert.equal(waitMessage(30), 'Too many failed sign-ins. Try again in 1 minute.');
});
