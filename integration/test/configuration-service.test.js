import test from 'node:test';
import assert from 'node:assert/strict';
import { SecretManager } from '../src/infrastructure/secret-manager.js';
import { ConfigurationService } from '../src/infrastructure/configuration-service.js';

test('secret manager supports environments and known provider secrets', () => {
  const secretManager = new SecretManager({
    environment: 'production',
    env: {
      ELEVENLABS_API_KEY: 'el-key',
      OPENAI_API_KEY: 'oa-key',
      GOOGLE_CLOUD_PROJECT: 'atlas-prod',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"type":"service_account"}',
      YOUTUBE_API_KEY: 'yt-key',
      YOUTUBE_CLIENT_ID: 'yt-client',
      YOUTUBE_CLIENT_SECRET: 'yt-secret',
      YOUTUBE_REFRESH_TOKEN: 'yt-refresh'
    }
  });

  assert.equal(secretManager.getEnvironment(), 'production');
  assert.equal(secretManager.getProviderSecrets('elevenlabs').missingRequiredSecrets.length, 0);
  assert.equal(secretManager.getProviderSecrets('google-vertex').missingRequiredSecrets.length, 0);
  assert.equal(secretManager.getProviderSecrets('openai').missingRequiredSecrets.length, 0);
  assert.equal(secretManager.getProviderSecrets('youtube').missingRequiredSecrets.length, 0);
});

test('configuration service provides endpoint, retry, timeout, rate limit, and feature flags', () => {
  const configurationService = new ConfigurationService({
    environment: 'development',
    secretManager: new SecretManager({ environment: 'development', env: { ELEVENLABS_API_KEY: 'dev-key' } })
  });

  assert.equal(configurationService.getProviderEndpoint('elevenlabs'), 'https://api.elevenlabs.io/v1/text-to-speech');
  assert.deepEqual(configurationService.getProviderRetryPolicy('elevenlabs'), { maxRetries: 1, baseDelayMs: 100 });
  assert.equal(configurationService.getProviderTimeoutMs('elevenlabs'), 8000);
  assert.deepEqual(configurationService.getProviderRateLimit('elevenlabs'), { requestsPerMinute: 60 });
  assert.equal(configurationService.isFeatureEnabled('enableProviderShadowMode'), true);
});

test('configuration service resolves the Atlas asset root and subdirectories', () => {
  const configurationService = new ConfigurationService({
    environment: 'production',
    assetRoot: '/var/lib/atlas/assets/'
  });

  assert.equal(configurationService.getAssetRoot(), '/var/lib/atlas/assets');
  assert.equal(configurationService.getAssetPath('audio'), '/var/lib/atlas/assets/audio');
  assert.equal(configurationService.getAssetPath('images'), '/var/lib/atlas/assets/images');
  assert.equal(configurationService.getAssetPath('video'), '/var/lib/atlas/assets/video');
  assert.equal(configurationService.getAssetPath('reports'), '/var/lib/atlas/assets/reports');
  assert.equal(configurationService.getAssetPath('archive'), '/var/lib/atlas/assets/archive');
});

test('configuration service defaults the asset root deterministically for tests', () => {
  const configurationService = new ConfigurationService({
    environment: 'testing',
    assetRoot: ''
  });

  assert.equal(configurationService.getAssetRoot(), '/var/lib/atlas/assets');
  assert.deepEqual(configurationService.getAssetPaths(), {
    archive: '/var/lib/atlas/assets/archive',
    audio: '/var/lib/atlas/assets/audio',
    images: '/var/lib/atlas/assets/images',
    reports: '/var/lib/atlas/assets/reports',
    video: '/var/lib/atlas/assets/video'
  });
});

test('startup validation reports missing secrets, invalid configuration, and missing required providers', () => {
  const configurationService = new ConfigurationService({
    environment: 'production',
    secretManager: new SecretManager({ environment: 'production', env: {} })
  });

  configurationService.registerProviderConfiguration('future-images', {
    endpoint: '',
    retryPolicy: { maxRetries: -1, baseDelayMs: -1 },
    timeoutMs: 0,
    rateLimit: { requestsPerMinute: 0 },
    requiredSecrets: ['apiToken']
  });

  const validation = configurationService.validateStartup({
    requiredProviders: ['elevenlabs', 'future-images', 'nonexistent-provider']
  });

  assert.equal(validation.status, 'BLOCKED');
  assert.deepEqual(validation.missingRequiredProviders, ['nonexistent-provider']);
  assert.equal(validation.missingSecrets.some(secret => secret.providerId === 'elevenlabs'), true);
  assert.equal(validation.missingSecrets.some(secret => secret.providerId === 'future-images'), true);
  assert.equal(validation.invalidConfiguration.some(entry => entry.providerId === 'future-images' && entry.field === 'endpoint'), true);
  assert.equal(validation.invalidConfiguration.some(entry => entry.providerId === 'future-images' && entry.field === 'retryPolicy'), true);
  assert.equal(validation.invalidConfiguration.some(entry => entry.providerId === 'future-images' && entry.field === 'timeoutMs'), true);
  assert.equal(validation.invalidConfiguration.some(entry => entry.providerId === 'future-images' && entry.field === 'rateLimit'), true);
});

test('startup validation is ready when required providers and secrets are configured', () => {
  const env = {
    ELEVENLABS_API_KEY: 'el-key',
    OPENAI_API_KEY: 'oa-key'
  };
  const configurationService = new ConfigurationService({
    environment: 'production',
    secretManager: new SecretManager({ environment: 'production', env })
  });

  const validation = configurationService.validateStartup({ requiredProviders: ['elevenlabs', 'openai'] });

  assert.equal(validation.status, 'READY');
  assert.equal(validation.missingRequiredProviders.length, 0);
  assert.equal(validation.missingSecrets.length, 0);
  assert.equal(validation.invalidConfiguration.length, 0);
});

test('production health report summarizes provider readiness', () => {
  const configurationService = new ConfigurationService({
    environment: 'production',
    secretManager: new SecretManager({
      environment: 'production',
      env: {
        ELEVENLABS_API_KEY: 'el-key',
        OPENAI_API_KEY: 'oa-key'
      }
    })
  });

  const healthReport = configurationService.generateProductionHealthReport({
    requiredProviders: ['elevenlabs', 'openai', 'youtube']
  });

  assert.equal(healthReport.environment, 'production');
  assert.equal(healthReport.overallStatus, 'BLOCKED');
  assert.equal(healthReport.providerHealth.length, 3);
  assert.equal(healthReport.providerHealth.some(provider => provider.providerId === 'elevenlabs' && provider.status === 'HEALTHY'), true);
  assert.equal(healthReport.providerHealth.some(provider => provider.providerId === 'openai' && provider.status === 'HEALTHY'), true);
  assert.equal(healthReport.providerHealth.some(provider => provider.providerId === 'youtube' && provider.status === 'DEGRADED'), true);
});
