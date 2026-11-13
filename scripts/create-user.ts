import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { loadEnvConfig } from '@next/env';
import { getPool } from '@/lib/database';
import { hashPassword } from '@/lib/password';
import { isRoleId, ROLES } from '@/lib/roles';
import { assignRoleAtCampus } from './user-roles';

function prompt(label: string) {
  const readline = createInterface({ input: stdin, output: stdout });
  return new Promise<string>((resolve) => {
    readline.question(label, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

function promptPassword() {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error('Run this command from an interactive terminal to enter the password securely.');
  }

  return new Promise<string>((resolve, reject) => {
    stdout.write('Temporary password (minimum 12 characters): ');
    stdin.setRawMode(true);
    stdin.resume();
    let password = '';

    function finish(error?: Error) {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(password);
    }

    function onData(buffer: Buffer) {
      for (const byte of buffer) {
        if (byte === 3) return finish(new Error('User creation cancelled.'));
        if (byte === 13 || byte === 10) return finish();
        if (byte === 127 || byte === 8) password = password.slice(0, -1);
        else if (byte >= 32 && byte <= 126) password += String.fromCharCode(byte);
      }
    }

    stdin.on('data', onData);
  });
}

async function main() {
  loadEnvConfig(process.cwd());
  const pool = getPool();
  try {
    const name = await prompt('User name: ');
    const email = (await prompt('Work email: ')).toLowerCase();
    const role = await prompt(`Role (${ROLES.map((item) => item.id).join(', ')}): `);
    if (!name || name.length > 120) throw new Error('Enter a name between 1 and 120 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email.');
    if (!isRoleId(role)) throw new Error('Choose a listed role.');
    const password = await promptPassword();
    if (password.length < 12 || password.length > 1024) throw new Error('Password must be 12 to 1024 characters.');

    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: string }>(
        'INSERT INTO app_users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [email, name, passwordHash],
      );
      await assignRoleAtCampus(client, user.rows[0].id, role, 'COC');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log(`Created ${email} with the ${role} role at COC.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'User creation failed.');
  process.exitCode = 1;
});
