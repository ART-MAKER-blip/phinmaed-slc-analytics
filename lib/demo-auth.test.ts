import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDemoSession,
  DEMO_PASSWORD,
  getDemoUserFromSession,
  verifyDemoCredentials,
} from './demo-auth';

test('development demo accounts authenticate with the shared demo password', () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const user = verifyDemoCredentials('SLC.demo@example.test', DEMO_PASSWORD);
    assert.equal(user?.role, 'slc');
    assert.equal(verifyDemoCredentials('slc.demo@example.test', 'wrong-password'), null);
    assert.equal(verifyDemoCredentials('unknown@example.test', DEMO_PASSWORD), null);
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});

test('demo sessions are validated and disabled outside development', () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const session = createDemoSession('admin');

  try {
    assert.equal(getDemoUserFromSession(session)?.role, 'admin');
    assert.equal(getDemoUserFromSession(`${session}x`), null);
    process.env.NODE_ENV = 'production';
    assert.equal(getDemoUserFromSession(session), null);
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});
