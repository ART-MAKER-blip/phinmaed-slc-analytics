import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from './same-origin';

const h = (values: Record<string, string>) => new Headers(values);

test('reads are always allowed', () => {
  assert.equal(isSameOriginRequest('GET', h({ origin: 'https://evil.example', host: 'slc.example' })), true);
});

test('a POST from the app itself is allowed', () => {
  assert.equal(isSameOriginRequest('POST', h({ origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'same-origin' })), true);
});

test('a POST from another site is refused', () => {
  assert.equal(isSameOriginRequest('POST', h({ origin: 'https://evil.example', host: 'slc.example' })), false);
  assert.equal(isSameOriginRequest('POST', h({ 'sec-fetch-site': 'cross-site', host: 'slc.example' })), false);
  assert.equal(isSameOriginRequest('POST', h({ origin: 'null', host: 'slc.example' })), false);
});

test('behind a proxy the forwarded host is compared', () => {
  assert.equal(isSameOriginRequest('POST', h({ origin: 'https://slc.example', host: '127.0.0.1:3000', 'x-forwarded-host': 'slc.example' })), true);
});

test('tools that send no browser headers are allowed (they carry no session cookie of their own)', () => {
  assert.equal(isSameOriginRequest('POST', h({ host: 'slc.example' })), true);
});
