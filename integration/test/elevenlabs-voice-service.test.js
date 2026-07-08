import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { AssetRegistry } from '../src/asset-registry.js';
import { ElevenLabsVoiceService } from '../src/services/voice-service.js';
import { SecretManager } from '../src/infrastructure/secret-manager.js';
import { ConfigurationService } from '../src/infrastructure/configuration-service.js';

const TEST_OUTPUT_DIR = '/tmp/atlas-elevenlabs-voice-service-test';

function resetOutputDir() {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
}

function createOkResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return null;
      }
    },
    async arrayBuffer() {
      return Uint8Array.from(bytes).buffer;
    }
  };
}

function createErrorResponse(status, retryAfter = null) {
  return {
    ok: false,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'retry-after') {
          return retryAfter;
        }

        return null;
      }
    },
    async arrayBuffer() {
      return Uint8Array.from([]).buffer;
    }
  };
}

function createConfiguredServices({
  env = {},
  retryPolicy = { maxRetries: 0, baseDelayMs: 1 },
  timeoutMs = 100,
  endpoint = 'https://api.elevenlabs.io/v1/text-to-speech'
} = {}) {
  const secretManager = new SecretManager({
    environment: 'testing',
    env,
    loadFromEnvFile: false
  });
  const configurationService = new ConfigurationService({
    environment: 'testing',
    secretManager
  });

  configurationService.registerProviderConfiguration('elevenlabs', {
    endpoint,
    retryPolicy,
    timeoutMs,
    rateLimit: { requestsPerMinute: 100 },
    requiredSecrets: ['apiKey']
  });

  return {
    secretManager,
    configurationService
  };
}

test('elevenlabs voice service authentication succeeds with production key from secret manager', async () => {
  resetOutputDir();
  const fetchCalls = [];
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      ELEVENLABS_API_KEY: 'test-elevenlabs-key'
    }
  });
  const service = new ElevenLabsVoiceService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return createOkResponse([1, 2, 3]);
    }
  });

  await service.synthesizeVoice({
    script: 'Authentication test script.',
    voiceId: 'voice-alpha',
    language: 'en-US'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/voice-alpha');
  assert.equal(fetchCalls[0].options.headers['xi-api-key'], 'test-elevenlabs-key');
  assert.equal(fetchCalls[0].options.headers.Accept, 'audio/mpeg');
  resetOutputDir();
});

test('elevenlabs voice service generates audio and registers asset', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      ELEVENLABS_API_KEY: 'test-elevenlabs-key'
    }
  });
  const service = new ElevenLabsVoiceService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async () => createOkResponse([65, 66, 67])
  });

  const output = await service.synthesizeVoice({
    script: 'Successful generation script.',
    voiceId: 'voice-beta',
    language: 'en-US',
    businessId: 'BIZ-001',
    missionId: 'MISSION-001',
    targetDuration: 90
  });

  assert.equal(existsSync(output.audioFile), true);
  assert.equal(readFileSync(output.audioFile, 'utf8'), 'ABC');
  assert.equal(output.estimatedDuration, '90 seconds');

  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetType, 'VOICE_AUDIO');
  assert.equal(assets[0].status, 'GENERATED');
  assert.equal(assets[0].businessId, 'BIZ-001');
  assert.equal(assets[0].missionId, 'MISSION-001');
  assert.equal(assets[0].metadata.provider, 'elevenlabs');
  resetOutputDir();
});

test('elevenlabs voice service defaults to the persistent Atlas audio directory', async () => {
  resetOutputDir();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      ELEVENLABS_API_KEY: 'test-elevenlabs-key'
    }
  });
  const service = new ElevenLabsVoiceService({
    configurationService,
    secretManager,
    fetchImpl: async () => createOkResponse([90, 91])
  });

  const output = await service.synthesizeVoice({
    script: 'Persistent asset path test script.',
    voiceId: 'voice-persistent',
    language: 'en-US'
  });

  assert.equal(output.audioFile.startsWith('/var/lib/atlas/assets/audio/'), true);
  assert.equal(existsSync(output.audioFile), true);
  resetOutputDir();
});

test('elevenlabs voice service retries after rate limit and succeeds', async () => {
  resetOutputDir();
  let attempts = 0;
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      ELEVENLABS_API_KEY: 'test-elevenlabs-key'
    },
    retryPolicy: {
      maxRetries: 1,
      baseDelayMs: 1
    }
  });
  const service = new ElevenLabsVoiceService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    maxRetries: 1,
    retryBaseDelayMs: 1,
    fetchImpl: async () => {
      attempts += 1;

      if (attempts === 1) {
        return createErrorResponse(429, '0');
      }

      return createOkResponse([70, 71]);
    }
  });

  const output = await service.synthesizeVoice({
    script: 'Retry behavior script.',
    voiceId: 'voice-gamma',
    language: 'en-US'
  });

  assert.equal(attempts, 2);
  assert.equal(existsSync(output.audioFile), true);
  assert.equal(readFileSync(output.audioFile, 'utf8'), 'FG');
  resetOutputDir();
});

test('elevenlabs voice service handles timeout/failure gracefully', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      ELEVENLABS_API_KEY: 'test-elevenlabs-key'
    },
    timeoutMs: 1,
    retryPolicy: {
      maxRetries: 1,
      baseDelayMs: 1
    }
  });
  const service = new ElevenLabsVoiceService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    timeoutMs: 1,
    maxRetries: 1,
    retryBaseDelayMs: 1,
    assetRegistry,
    fetchImpl: async () => new Promise(() => {})
  });

  const output = await service.synthesizeVoice({
    script: 'Failure behavior script.',
    voiceId: 'voice-delta',
    language: 'en-US',
    targetDuration: 30
  });

  assert.equal(existsSync(output.audioFile), true);
  assert.equal(output.estimatedDuration, '30 seconds');

  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].status, 'FAILED');
  assert.equal(assets[0].metadata.provider, 'elevenlabs');
  assert.equal(assets[0].metadata.error, 'ELEVENLABS_TIMEOUT');
  resetOutputDir();
});
