const test = require('node:test');
const assert = require('node:assert/strict');
const { CredentialRegistry } = require('./credential-registry.js');

test('credential normalization keeps metadata only and no secret storage', () => {
  const registry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'YOUTUBE_API_KEY',
        providerId: 'YOUTUBE',
        environment: 'production',
        configured: true,
        verified: false,
        lastValidated: '2026-07-09T00:00:00.000Z',
        requiredScopes: ['youtube.upload'],
        status: 'warning',
        validationMessage: 'Awaiting verification.',
        secretValue: 'SHOULD_NOT_EXIST'
      }
    ]
  });

  const credential = registry.getCredential('YOUTUBE_API_KEY');

  assert.equal(credential.credentialId, 'YOUTUBE_API_KEY');
  assert.equal(credential.providerId, 'YOUTUBE');
  assert.equal(credential.environment, 'production');
  assert.equal(credential.configured, true);
  assert.equal(credential.verified, false);
  assert.equal(credential.status, 'WARNING');
  assert.equal('secretValue' in credential, false);
});

test('duplicate credential registration is rejected', () => {
  const registry = new CredentialRegistry({ environment: 'production' });

  registry.registerCredential({
    credentialId: 'GOOGLE_VERTEX_API_KEY',
    providerId: 'VERTEX_AI',
    environment: 'production',
    configured: true,
    verified: true,
    requiredScopes: [],
    status: 'VERIFIED',
    validationMessage: 'ok'
  });

  assert.throws(
    () => registry.registerCredential({
      credentialId: 'GOOGLE_VERTEX_API_KEY',
      providerId: 'VERTEX_AI',
      environment: 'production',
      configured: true,
      verified: true,
      requiredScopes: [],
      status: 'VERIFIED',
      validationMessage: 'ok'
    }),
    /Credential already registered/
  );
});

test('missing credential detection returns MISSING_CREDENTIALS', () => {
  const registry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'YOUTUBE_CLIENT_ID',
        providerId: 'YOUTUBE',
        environment: 'production',
        configured: false,
        verified: false,
        requiredScopes: [],
        status: 'MISSING',
        validationMessage: 'missing'
      }
    ]
  });

  const result = registry.validateProviderCredentials({
    providerId: 'YOUTUBE',
    environment: 'production',
    requiredCredentials: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'MISSING_CREDENTIALS');
  assert.equal(Array.isArray(result.details.missingCredentials), true);
  assert.equal(result.details.missingCredentials.includes('YOUTUBE_CLIENT_SECRET'), true);
});

test('environment validation returns ENVIRONMENT_MISMATCH', () => {
  const registry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'ELEVENLABS_API_KEY',
        providerId: 'ELEVENLABS',
        environment: 'staging',
        configured: true,
        verified: true,
        requiredScopes: [],
        status: 'VERIFIED',
        validationMessage: 'ok'
      }
    ]
  });

  const result = registry.validateProviderCredentials({
    providerId: 'ELEVENLABS',
    environment: 'production',
    requiredCredentials: ['ELEVENLABS_API_KEY']
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'ENVIRONMENT_MISMATCH');
});

test('missing scopes returns MISSING_SCOPES', () => {
  const registry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'YOUTUBE_REFRESH_TOKEN',
        providerId: 'YOUTUBE',
        environment: 'production',
        configured: true,
        verified: true,
        requiredScopes: ['youtube.readonly'],
        status: 'VERIFIED',
        validationMessage: 'ok'
      }
    ]
  });

  const result = registry.validateProviderCredentials({
    providerId: 'YOUTUBE',
    environment: 'production',
    requiredCredentials: ['YOUTUBE_REFRESH_TOKEN'],
    requiredScopes: ['youtube.upload']
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'MISSING_SCOPES');
  assert.equal(result.details.missingScopes.length, 1);
});

test('verification failures are reported', () => {
  const registry = new CredentialRegistry({
    environment: 'production',
    initialCredentials: [
      {
        credentialId: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        providerId: 'GOOGLE_CLOUD',
        environment: 'production',
        configured: true,
        verified: false,
        requiredScopes: [],
        status: 'FAILED',
        validationMessage: 'failed to verify'
      }
    ]
  });

  const result = registry.validateProviderCredentials({
    providerId: 'GOOGLE_CLOUD',
    environment: 'production',
    requiredCredentials: ['GOOGLE_APPLICATION_CREDENTIALS_JSON']
  });

  assert.equal(result.isValid, false);
  assert.equal(result.code, 'VERIFICATION_FAILURE');

  const summary = registry.getCredentialSummary({ environment: 'production' });
  assert.equal(summary.credentialCount, 1);
  assert.equal(summary.configuredCredentials, 1);
  assert.equal(summary.verifiedCredentials, 0);
  assert.equal(summary.warningCredentials, 1);
});
