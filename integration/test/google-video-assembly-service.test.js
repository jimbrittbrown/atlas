import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { AssetRegistry } from '../src/asset-registry.js';
import { GoogleVideoAssemblyService } from '../src/services/video-service.js';
import { SecretManager } from '../src/infrastructure/secret-manager.js';
import { ConfigurationService } from '../src/infrastructure/configuration-service.js';

const TEST_OUTPUT_DIR = '/var/lib/atlas/assets/video/real-005-tests';
const TEST_INPUT_DIR = '/tmp/atlas-video-fixtures';
const RETRY_STATE_FILE = join(TEST_INPUT_DIR, 'ffmpeg-attempt-count.txt');
const RETRY_BASE_MP4 = join(TEST_INPUT_DIR, 'retry-base.mp4');
const CAPTURED_ARGS_FILE = join(TEST_INPUT_DIR, 'captured-ffmpeg-args.txt');

function resetOutputDir() {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  rmSync(TEST_INPUT_DIR, { recursive: true, force: true });
}

function createOkTokenResponse(accessToken = 'test-access-token') {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return { access_token: accessToken };
    }
  };
}

function createConfiguredServices({ env = {}, retryPolicy = { maxRetries: 0, baseDelayMs: 1 }, timeoutMs = 100 } = {}) {
  const secretManager = new SecretManager({
    environment: 'testing',
    env,
    loadFromEnvFile: false
  });
  const configurationService = new ConfigurationService({
    environment: 'testing',
    secretManager
  });

  configurationService.registerProviderConfiguration('google-vertex', {
    endpoint: 'https://aiplatform.googleapis.com/v1',
    retryPolicy,
    timeoutMs,
    rateLimit: { requestsPerMinute: 100 },
    requiredSecrets: ['projectId', 'location', 'credentialsJson']
  });

  return {
    secretManager,
    configurationService
  };
}

function createServiceAccountJson() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return JSON.stringify({
    type: 'service_account',
    project_id: 'atlas-test-project',
    private_key_id: 'test-key-id',
    private_key: privateKey,
    client_email: 'atlas-test@atlas-test-project.iam.gserviceaccount.com',
    token_uri: 'https://oauth2.googleapis.com/token'
  });
}

function createVideoSourceFiles() {
  mkdirSync(TEST_INPUT_DIR, { recursive: true });

  const narrationPath = join(TEST_OUTPUT_DIR, 'narration.wav');
  const imageOnePath = join(TEST_INPUT_DIR, 'image-01.png');
  const imageTwoPath = join(TEST_INPUT_DIR, 'image-02.png');

  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

  const audioResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:duration=3',
    '-c:a', 'pcm_s16le',
    narrationPath
  ], { encoding: 'utf8' });

  const firstImageResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=navy:s=640x360:d=1',
    '-frames:v', '1',
    imageOnePath
  ], { encoding: 'utf8' });

  const secondImageResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=teal:s=640x360:d=1',
    '-frames:v', '1',
    imageTwoPath
  ], { encoding: 'utf8' });

  assert.equal(audioResult.status, 0, audioResult.stderr);
  assert.equal(firstImageResult.status, 0, firstImageResult.stderr);
  assert.equal(secondImageResult.status, 0, secondImageResult.stderr);

  return {
    narrationPath,
    imageOnePath,
    imageTwoPath
  };
}

function createRetryWrapper() {
  mkdirSync(TEST_INPUT_DIR, { recursive: true });

  const baseResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=640x360:d=1',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=1',
    '-shortest',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    RETRY_BASE_MP4
  ], { encoding: 'utf8' });

  assert.equal(baseResult.status, 0, baseResult.stderr);

  writeFileSync(RETRY_STATE_FILE, '0');

  const wrapperPath = join(TEST_INPUT_DIR, 'ffmpeg-wrapper.sh');
  writeFileSync(wrapperPath, `#!/usr/bin/env bash
set -euo pipefail
count=$(cat "${RETRY_STATE_FILE}" 2>/dev/null || echo 0)
count=$((count + 1))
printf '%s' "$count" > "${RETRY_STATE_FILE}"
  output_file="\${@: -1}"
if [[ "$count" -lt 2 ]]; then
  exit 0
fi
cp "${RETRY_BASE_MP4}" "$output_file"
`);
  chmodSync(wrapperPath, 0o755);

  return wrapperPath;
}

function createCaptureWrapper() {
  mkdirSync(TEST_INPUT_DIR, { recursive: true });

  const baseResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=640x360:d=1',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=1',
    '-shortest',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    RETRY_BASE_MP4
  ], { encoding: 'utf8' });

  assert.equal(baseResult.status, 0, baseResult.stderr);

  const wrapperPath = join(TEST_INPUT_DIR, 'ffmpeg-capture-wrapper.sh');
  writeFileSync(wrapperPath, `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$*" > "${CAPTURED_ARGS_FILE}"
output_file="\${@: -1}"
cp "${RETRY_BASE_MP4}" "$output_file"
`);
  chmodSync(wrapperPath, 0o755);

  return wrapperPath;
}

test('video assembly accepts narration audio and ordered image sequence', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: 'ffmpeg'
  });

  const output = await service.generateVideo({
    script: 'Atlas is building a durable media engine.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath],
    subtitles: '1\n00:00:00,000 --> 00:00:02,000\nAtlas is building a durable media engine.'
  });

  assert.equal(output.status, 'COMPLETED');
  assert.equal(existsSync(output.videoFile), true);
  assert.equal(output.videoFile.startsWith(TEST_OUTPUT_DIR), true);
  assert.equal(readFileSync(output.videoFile).length > 0, true);
  resetOutputDir();
});

test('video assembly registers video asset and stores MP4 in persistent directory', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: 'ffmpeg'
  });

  const output = await service.generateVideo({
    script: 'Atlas is building a durable media engine.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath]
  });

  assert.equal(output.status, 'COMPLETED');
  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetType, 'VIDEO');
  assert.equal(assets[0].status, 'GENERATED');
  assert.equal(assets[0].metadata.provider, 'google-vertex');
  assert.equal(assets[0].metadata.videoFile, output.videoFile);
  assert.equal(existsSync(output.videoFile), true);
  resetOutputDir();
});

test('video assembly retries after rate limit and succeeds', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const retryWrapper = createRetryWrapper();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    },
    retryPolicy: {
      maxRetries: 1,
      baseDelayMs: 1
    }
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    maxRetries: 1,
    retryBaseDelayMs: 1,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: retryWrapper
  });

  const output = await service.generateVideo({
    script: 'Atlas is building a durable media engine.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath]
  });

  assert.equal(output.status, 'COMPLETED');
  assert.equal(existsSync(output.videoFile), true);
  resetOutputDir();
});

test('video assembly normalizes failure paths', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    },
    retryPolicy: {
      maxRetries: 0,
      baseDelayMs: 1
    },
    timeoutMs: 1
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    timeoutMs: 1,
    maxRetries: 0,
    retryBaseDelayMs: 1,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: false, status: 500, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: '/nonexistent/ffmpeg'
  });

  const output = await service.generateVideo({
    script: 'Atlas is building a durable media engine.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath]
  });

  assert.equal(output.status, 'BLOCKED');
  assert.equal(existsSync(output.videoFile), true);
  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].status, 'FAILED');
  assert.equal(assets[0].metadata.provider, 'google-vertex');
  assert.equal(assets[0].metadata.error, 'GOOGLE_VERTEX_HTTP_500');
  resetOutputDir();
});

test('video assembly emits transition filtergraph only for cinematic profile with transitions flag', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const captureWrapper = createCaptureWrapper();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: captureWrapper
  });

  const legacyOutput = await service.generateVideo({
    script: 'Atlas profile parity baseline.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath]
  });
  assert.equal(legacyOutput.status, 'COMPLETED');
  const legacyArgs = readFileSync(CAPTURED_ARGS_FILE, 'utf8');
  assert.equal(legacyArgs.includes('xfade='), false);

  const cinematicOutput = await service.generateVideo({
    script: 'Atlas profile transition variant.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath],
    productionProfileId: 'cinematic_horror_landscape_v1',
    featureFlags: {
      transitions: true
    }
  });
  assert.equal(cinematicOutput.status, 'COMPLETED');
  const cinematicArgs = readFileSync(CAPTURED_ARGS_FILE, 'utf8');
  assert.equal(cinematicArgs.includes('xfade=transition=fade'), true);

  resetOutputDir();
});

test('video assembly guards transition duration for short scenes', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const captureWrapper = createCaptureWrapper();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: captureWrapper
  });

  const output = await service.generateVideo({
    script: 'Atlas short scene transition guard.',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath],
    productionProfileId: 'cinematic_horror_landscape_v1',
    featureFlags: {
      transitions: true
    },
    compositionPolicy: {
      transitions: {
        defaultDurationSeconds: 5
      }
    },
    timeline: {
      narrationDurationSeconds: 2
    }
  });

  assert.equal(output.status, 'COMPLETED');
  const capturedArgs = readFileSync(CAPTURED_ARGS_FILE, 'utf8');
  assert.equal(capturedArgs.includes('xfade=transition=fade'), true);
  assert.equal(capturedArgs.includes('duration=5'), false);
  const durationMatch = capturedArgs.match(/duration=(\d+(?:\.\d+)?)/);
  assert.equal(Boolean(durationMatch), true);
  assert.equal(Number(durationMatch[1]) < 1, true);

  resetOutputDir();
});

test('media engine diagnostics report xfade path usage only when transitions are enabled', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { narrationPath, imageOnePath, imageTwoPath } = createVideoSourceFiles();
  const captureWrapper = createCaptureWrapper();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleVideoAssemblyService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return {}; } };
    },
    ffmpegPath: captureWrapper
  });

  await service.mediaEngineService.initialize();

  const legacyRequest = service.compatibilityAdapter.toMediaRenderRequest(service.normalizeMetadata({
    script: 'Legacy diagnostics render',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath]
  }));

  const legacyExecution = await service.mediaEngineService.execute(legacyRequest, {
    executor: async (executionRequest) => service.generateVideoWithLegacyPipeline(executionRequest.metadata)
  });

  assert.equal(legacyExecution.renderResult.diagnostics.rendererDiagnostics.xfadePathUsed, false);
  assert.equal(legacyExecution.renderResult.diagnostics.rendererDiagnostics.transitionCount, 0);

  const cinematicRequest = service.compatibilityAdapter.toMediaRenderRequest(service.normalizeMetadata({
    script: 'Cinematic diagnostics render',
    voiceOutput: narrationPath,
    imageOutputs: [imageOnePath, imageTwoPath],
    productionProfileId: 'cinematic_horror_landscape_v1',
    featureFlags: {
      transitions: true
    }
  }));

  const cinematicExecution = await service.mediaEngineService.execute(cinematicRequest, {
    executor: async (executionRequest) => service.generateVideoWithLegacyPipeline(executionRequest.metadata)
  });

  assert.equal(cinematicExecution.renderResult.diagnostics.rendererDiagnostics.xfadePathUsed, true);
  assert.equal(cinematicExecution.renderResult.diagnostics.rendererDiagnostics.transitionCount > 0, true);
  resetOutputDir();
});
