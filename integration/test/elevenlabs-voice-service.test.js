import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { AssetRegistry } from '../src/asset-registry.js';
import { ElevenLabsVoiceService } from '../src/services/voice-service.js';

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

test('elevenlabs voice service sends authentication header', async () => {
  resetOutputDir();
  const fetchCalls = [];
  const service = new ElevenLabsVoiceService({
    apiKey: 'test-elevenlabs-key',
    outputDir: TEST_OUTPUT_DIR,
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
  const service = new ElevenLabsVoiceService({
    apiKey: 'test-elevenlabs-key',
    outputDir: TEST_OUTPUT_DIR,
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

test('elevenlabs voice service retries after rate limit and succeeds', async () => {
  resetOutputDir();
  let attempts = 0;
  const service = new ElevenLabsVoiceService({
    apiKey: 'test-elevenlabs-key',
    outputDir: TEST_OUTPUT_DIR,
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
  const service = new ElevenLabsVoiceService({
    apiKey: 'test-elevenlabs-key',
    outputDir: TEST_OUTPUT_DIR,
    timeoutMs: 1,
    maxRetries: 1,
    retryBaseDelayMs: 1,
    assetRegistry,
    fetchImpl: async (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new Error('AbortError'));
      });
    })
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
  assert.equal(typeof assets[0].metadata.error, 'string');
  resetOutputDir();
});
