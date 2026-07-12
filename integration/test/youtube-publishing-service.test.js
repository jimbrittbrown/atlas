import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { AssetRegistry } from '../src/asset-registry.js';
import { SecretManager } from '../src/infrastructure/secret-manager.js';
import { ConfigurationService } from '../src/infrastructure/configuration-service.js';
import { YouTubePublishingService } from '../src/services/publishing-service.js';

const TEST_OUTPUT_DIR = '/var/lib/atlas/assets/publish-tests';

function resetOutputDir() {
  rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

function createVideoFile() {
  const path = `${TEST_OUTPUT_DIR}/video-test.mp4`;
  writeFileSync(path, Buffer.from('VIDEO_TEST_CONTENT'));
  return path;
}

function createThumbnailFile() {
  const path = `${TEST_OUTPUT_DIR}/thumb-test.png`;
  writeFileSync(path, Buffer.from('THUMB_TEST_CONTENT'));
  return path;
}

function createResponse({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      }
    },
    async json() {
      return json;
    }
  };
}

function createConfiguredServices({ fetchImpl }) {
  const secretManager = new SecretManager({
    environment: 'testing',
    env: {
      YOUTUBE_API_KEY: 'test-api-key',
      YOUTUBE_CLIENT_ID: 'test-client-id',
      YOUTUBE_CLIENT_SECRET: 'test-client-secret',
      YOUTUBE_REFRESH_TOKEN: 'test-refresh-token'
    },
    loadFromEnvFile: false
  });

  const configurationService = new ConfigurationService({
    environment: 'testing',
    secretManager
  });

  const assetRegistry = new AssetRegistry();

  const service = new YouTubePublishingService({
    configurationService,
    secretManager,
    assetRegistry,
    fetchImpl,
    timeoutMs: 100,
    maxRetries: 0,
    retryBaseDelayMs: 1
  });

  return { service, assetRegistry };
}

test('youtube publishing service authenticates, uploads video, uploads thumbnail, and applies private metadata', async () => {
  resetOutputDir();
  const fetchCalls = [];
  const uploadUrl = 'https://upload.youtube.test/resumable-session';
  const { service, assetRegistry } = createConfiguredServices({
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url, options });

      if (url === 'https://oauth2.googleapis.com/token') {
        return createResponse({ json: { access_token: 'youtube-access-token' } });
      }

      if (String(url).includes('/channels?part=id&mine=true')) {
        return createResponse({ json: { items: [{ id: 'channel-001' }] } });
      }

      if (String(url).includes('/videos?uploadType=resumable&part=snippet,status')) {
        return createResponse({ headers: { location: uploadUrl } });
      }

      if (url === uploadUrl) {
        return createResponse({ json: { id: 'yt-video-001' } });
      }

      if (String(url).includes('/thumbnails/set?videoId=yt-video-001')) {
        return createResponse({ json: { kind: 'youtube#thumbnailSetResponse' } });
      }

      throw new Error(`Unhandled fetch URL: ${url}`);
    }
  });

  const videoAsset = createVideoFile();
  const thumbnailAsset = createThumbnailFile();

  const output = await service.preparePublishPackage({
    assignment: { assignmentId: 'ASG-PUBLISH-REAL-006-001' },
    metadata: {
      videoAsset,
      thumbnailAsset,
      title: 'Atlas Production Episode 1',
      description: 'First production publishing worker validation.',
      tags: ['atlas', 'production', 'real-006'],
      categoryId: '22',
      visibility: 'public',
      targetPlatform: 'youtube',
      missionId: 'REAL-006',
      businessId: 'BIZ-REAL-006'
    }
  });

  assert.equal(output.publishStatus, 'PUBLISHED_PRIVATE');
  assert.equal(output.videoId, 'yt-video-001');
  assert.equal(output.publishUrl, 'https://www.youtube.com/watch?v=yt-video-001');
  assert.equal(output.thumbnailStatus, 'UPLOADED');
  assert.equal(output.metadataApplied, true);
  assert.equal(output.visibility, 'private');

  const uploadInitCall = fetchCalls.find(call => String(call.url).includes('/videos?uploadType=resumable&part=snippet,status'));
  assert.equal(Boolean(uploadInitCall), true);
  const uploadInitBody = JSON.parse(uploadInitCall.options.body);
  assert.equal(uploadInitBody.status.privacyStatus, 'private');
  assert.equal(uploadInitBody.snippet.title, 'Atlas Production Episode 1');

  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 2);
  assert.equal(assets[0].assetType, 'VIDEO');
  assert.equal(assets[0].status, 'GENERATED');
  assert.equal(assets[1].assetType, 'THUMBNAIL');
  assert.equal(assets[1].status, 'GENERATED');
});

test('youtube publishing service handles thumbnail upload failure gracefully', async () => {
  resetOutputDir();
  const uploadUrl = 'https://upload.youtube.test/resumable-session-2';
  const { service, assetRegistry } = createConfiguredServices({
    fetchImpl: async (url) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return createResponse({ json: { access_token: 'youtube-access-token' } });
      }

      if (String(url).includes('/channels?part=id&mine=true')) {
        return createResponse({ json: { items: [{ id: 'channel-001' }] } });
      }

      if (String(url).includes('/videos?uploadType=resumable&part=snippet,status')) {
        return createResponse({ headers: { location: uploadUrl } });
      }

      if (url === uploadUrl) {
        return createResponse({ json: { id: 'yt-video-002' } });
      }

      if (String(url).includes('/thumbnails/set?videoId=yt-video-002')) {
        return createResponse({ ok: false, status: 500, json: {} });
      }

      throw new Error(`Unhandled fetch URL: ${url}`);
    }
  });

  const output = await service.preparePublishPackage({
    assignment: { assignmentId: 'ASG-PUBLISH-REAL-006-002' },
    metadata: {
      videoAsset: createVideoFile(),
      thumbnailAsset: createThumbnailFile(),
      title: 'Atlas Production Episode 2',
      description: 'Thumbnail graceful failure path.',
      tags: ['atlas'],
      targetPlatform: 'youtube'
    }
  });

  assert.equal(output.publishStatus, 'PUBLISHED_PRIVATE');
  assert.equal(output.thumbnailStatus, 'FAILED');

  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 2);
  const thumbnailAsset = assets.find(asset => asset.assetType === 'THUMBNAIL');
  assert.equal(thumbnailAsset.status, 'FAILED');
});

test('youtube publishing service normalizes OAuth failures', async () => {
  resetOutputDir();
  const { service, assetRegistry } = createConfiguredServices({
    fetchImpl: async (url) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return createResponse({ ok: false, status: 401, json: { error: 'invalid_grant' } });
      }

      throw new Error(`Unhandled fetch URL: ${url}`);
    }
  });

  const output = await service.preparePublishPackage({
    assignment: { assignmentId: 'ASG-PUBLISH-REAL-006-003' },
    metadata: {
      videoAsset: createVideoFile(),
      title: 'Atlas Production Episode 3',
      description: 'OAuth failure path.',
      targetPlatform: 'youtube'
    }
  });

  assert.equal(output.publishStatus, 'FAILED');
  assert.equal(output.error, 'YOUTUBE_HTTP_401');

  const assets = assetRegistry.listAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetType, 'VIDEO');
  assert.equal(assets[0].status, 'FAILED');
});
