import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { AssetRegistry } from '../src/asset-registry.js';
import { GoogleImagenService } from '../src/services/image-service.js';
import { SecretManager } from '../src/infrastructure/secret-manager.js';
import { ConfigurationService } from '../src/infrastructure/configuration-service.js';

const TEST_OUTPUT_DIR = '/var/lib/atlas/assets/images/real-004-tests';

function resetOutputDir() {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
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

function createOkImagenResponse(predictions) {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return { predictions };
    }
  };
}

function createOkGeminiResponse(parts) {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return {
        candidates: [
          {
            content: {
              parts
            }
          }
        ]
      };
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
    async json() {
      return {};
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

test('google image service uses Gemini generateContent by default', async () => {
  resetOutputDir();
  const fetchCalls = [];
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleImagenService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });

      if (fetchCalls.length === 1) {
        return createOkTokenResponse('vertex-access-token');
      }

      return createOkGeminiResponse([
        { text: 'Generated image response' },
        { inlineData: { mimeType: 'image/png', data: Buffer.from('IMAGE-1').toString('base64') } }
      ]);
    }
  });

  await service.generateImages({
    prompt: 'Professional Atlas introduction image',
    sceneDescription: 'Professional Atlas introduction',
    artStyle: 'Editorial Illustration',
    imageCount: 1
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(fetchCalls[1].url, 'https://aiplatform.googleapis.com/v1/projects/atlas-test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent');
  assert.equal(fetchCalls[1].options.headers.Authorization, 'Bearer vertex-access-token');
  resetOutputDir();
});

test('google image service supports legacy Imagen mode through feature flag', async () => {
  resetOutputDir();
  const fetchCalls = [];
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleImagenService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    imageProviderMode: 'imagen',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });

      if (fetchCalls.length === 1) {
        return createOkTokenResponse('vertex-access-token');
      }

      return createOkImagenResponse([
        { bytesBase64Encoded: Buffer.from('IMAGE-LEGACY').toString('base64') }
      ]);
    }
  });

  await service.generateImages({
    prompt: 'Legacy mode prompt',
    sceneDescription: 'Legacy mode scene',
    artStyle: 'Editorial Illustration',
    imageCount: 1
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[1].url, 'https://aiplatform.googleapis.com/v1/projects/atlas-test-project/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict');
  resetOutputDir();
});

test('google imagen service generates image assets and registers them', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
  const { configurationService, secretManager } = createConfiguredServices({
    env: {
      GOOGLE_CLOUD_PROJECT: 'atlas-test-project',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: createServiceAccountJson()
    }
  });
  const service = new GoogleImagenService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      return createOkGeminiResponse([
        { text: 'Generated images' },
        { inlineData: { mimeType: 'image/png', data: Buffer.from('IMAGE-1').toString('base64') } },
        { inlineData: { mimeType: 'image/png', data: Buffer.from('IMAGE-2').toString('base64') } }
      ]);
    }
  });

  const output = await service.generateImages({
    prompt: 'Atlas enterprise overview',
    sceneDescription: 'Atlas enterprise overview',
    artStyle: 'Cinematic Illustration',
    imageCount: 2,
    businessId: 'BIZ-004',
    missionId: 'MISSION-004'
  });

  assert.equal(output.imageFiles.length, 2);
  assert.equal(output.imageFiles.every(file => file.startsWith(TEST_OUTPUT_DIR)), true);
  assert.equal(existsSync(output.imageFiles[0]), true);
  assert.equal(readFileSync(output.imageFiles[0], 'utf8'), 'IMAGE-1');
  assert.equal(existsSync(output.imageFiles[1]), true);
  assert.equal(readFileSync(output.imageFiles[1], 'utf8'), 'IMAGE-2');

  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 2);
  assert.equal(assets.every(asset => asset.assetType === 'IMAGE'), true);
  assert.equal(assets.every(asset => asset.status === 'GENERATED'), true);
  assert.equal(assets.every(asset => asset.metadata.provider === 'google-vertex'), true);
  assert.equal(assets.every(asset => asset.businessId === 'BIZ-004'), true);
  assert.equal(assets.every(asset => asset.missionId === 'MISSION-004'), true);
  resetOutputDir();
});

test('google imagen service retries after rate limit and succeeds', async () => {
  resetOutputDir();
  let imageAttempts = 0;
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
  const service = new GoogleImagenService({
    outputDir: TEST_OUTPUT_DIR,
    configurationService,
    secretManager,
    maxRetries: 1,
    retryBaseDelayMs: 1,
    fetchImpl: async (url) => {
      if (url.includes('/token')) {
        return createOkTokenResponse('vertex-access-token');
      }

      imageAttempts += 1;

      if (imageAttempts === 1) {
        return createErrorResponse(429, '0');
      }

      return createOkGeminiResponse([
        { inlineData: { mimeType: 'image/png', data: Buffer.from('RETRY-IMAGE').toString('base64') } }
      ]);
    }
  });

  const output = await service.generateImages({
    prompt: 'Retry test image',
    sceneDescription: 'Retry test image',
    artStyle: 'Editorial Illustration',
    imageCount: 1
  });

  assert.equal(imageAttempts, 2);
  assert.equal(output.imageFiles.length, 1);
  assert.equal(readFileSync(output.imageFiles[0], 'utf8'), 'RETRY-IMAGE');
  resetOutputDir();
});

test('google imagen service normalizes failure paths', async () => {
  resetOutputDir();
  const assetRegistry = new AssetRegistry();
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
  const service = new GoogleImagenService({
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

      return createErrorResponse(500);
    }
  });

  const output = await service.generateImages({
    prompt: 'Failure path image',
    sceneDescription: 'Failure path image',
    artStyle: 'Editorial Illustration',
    imageCount: 1
  });

  assert.equal(output.imageFiles.length, 1);
  assert.equal(existsSync(output.imageFiles[0]), true);
  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].status, 'FAILED');
  assert.equal(assets[0].metadata.provider, 'google-vertex');
  assert.equal(assets[0].metadata.error, 'GOOGLE_VERTEX_HTTP_500');
  resetOutputDir();
});
