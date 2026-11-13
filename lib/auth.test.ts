import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from './password';

test('password hashes verify only the matching password', async () => {
  const hash = await hashPassword('a-long-example-password');
  assert.notEqual(hash, 'a-long-example-password');
  assert.equal(await verifyPassword('a-long-example-password', hash), true);
  assert.equal(await verifyPassword('a-different-password', hash), false);
});

test('malformed password hashes are rejected', async () => {
  assert.equal(await verifyPassword('password', 'not-a-hash'), false);
  assert.equal(await verifyPassword('password', 'scrypt$invalid$invalid'), false);
});
