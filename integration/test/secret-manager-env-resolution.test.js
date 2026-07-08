import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SecretManager } from '../src/infrastructure/secret-manager.js';

test('secret manager resolves elevenlabs key from local env file without leaking secrets', () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  const loggedEntries = [];

  console.log = (...args) => { loggedEntries.push(args.join(' ')); };
  console.info = (...args) => { loggedEntries.push(args.join(' ')); };
  console.warn = (...args) => { loggedEntries.push(args.join(' ')); };
  console.error = (...args) => { loggedEntries.push(args.join(' ')); };

  try {
    delete process.env.ELEVENLABS_API_KEY;

    const manager = new SecretManager({ environment: 'production' });
    const secret = manager.getSecret({ providerId: 'elevenlabs', secretName: 'apiKey' });

    assert.equal(secret.configured, true);
    assert.equal(typeof secret.value, 'string');
    assert.equal(secret.value.trim().length > 0, true);

    const leakageInLogs = loggedEntries.some(entry => entry.includes(secret.value));
    assert.equal(leakageInLogs, false);

    const invalidEnvPath = join('/tmp', 'atlas-secret-manager-invalid.env');
    writeFileSync(invalidEnvPath, 'INVALID_LINE_WITHOUT_SEPARATOR\n', 'utf8');

    try {
      new SecretManager({
        environment: 'production',
        env: process.env,
        loadFromEnvFile: true,
        envFilePath: invalidEnvPath
      });
      assert.fail('Expected SecretManager bootstrap to fail on invalid env file.');
    } catch (error) {
      assert.equal(typeof error.message, 'string');
      assert.equal(error.message.includes(secret.value), false);
    } finally {
      rmSync(invalidEnvPath, { force: true });
    }
  } finally {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    if (typeof originalKey === 'string') {
      process.env.ELEVENLABS_API_KEY = originalKey;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  }
});
