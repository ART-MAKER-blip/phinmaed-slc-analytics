import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDemoSession,
  DEMO_PASSWORD,
  getDemoUserFromSession,
  verifyDemoCredentials,
} from './demo-auth';

// NODE_ENV is typed read-only; tests switch it to check the development-only behavior.
const env = process.env as Record<string, string | undefined>;

test('development demo accounts authenticate with the shared demo password', () => {
  const originalEnvironment = process.env.NODE_ENV;
  env.NODE_ENV = 'development';

  try {
    const user = verifyDemoCredentials('SLC.demo@example.test', DEMO_PASSWORD);
    assert.equal(user?.role, 'slc');
    assert.equal(verifyDemoCredentials('slc.demo@example.test', 'wrong-password'), null);
    assert.equal(verifyDemoCredentials('unknown@example.test', DEMO_PASSWORD), null);
  } finally {
    if (originalEnvironment === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalEnvironment;
  }
});

test('demo sessions are validated and disabled outside development', () => {
  const originalEnvironment = process.env.NODE_ENV;
  env.NODE_ENV = 'development';
  const session = createDemoSession('admin');

  try {
    assert.equal(getDemoUserFromSession(session)?.role, 'admin');
    assert.equal(getDemoUserFromSession(`${session}x`), null);
    assert.equal(getDemoUserFromSession(createDemoSession('coo'))?.role, 'coo');
    assert.ok(getDemoUserFromSession(session)?.permissions.includes('admin.users'));
    env.NODE_ENV = 'production';
    assert.equal(getDemoUserFromSession(session), null);
  } finally {
    if (originalEnvironment === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalEnvironment;
  }
});
