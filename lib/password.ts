import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const DUMMY_PASSWORD_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, saltHex, hashHex] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    !/^[a-f0-9]{32}$/i.test(saltHex ?? '') ||
    !/^[a-f0-9]{128}$/i.test(hashHex ?? '')
  ) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return timingSafeEqual(expected, actual);
}
