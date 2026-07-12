import { existsSync, readFileSync } from 'node:fs';
import { AssetRegistry } from '../asset-registry.js';
import { SecretManager } from '../infrastructure/secret-manager.js';
import { ConfigurationService } from '../infrastructure/configuration-service.js';
import { ProductionAdapter } from '../infrastructure/production-adapter.js';

export class PublishingService {
  validatePublishRequest() {
    throw new Error('PublishingService.validatePublishRequest must be implemented by a provider.');
  }

  preparePublishPackage() {
    throw new Error('PublishingService.preparePublishPackage must be implemented by a provider.');
  }
}

export class PlaceholderPublishingService extends PublishingService {
  validatePublishRequest(metadata = {}) {
    const checks = {
      videoAsset: this.isNonEmptyString(metadata.videoAsset),
      thumbnailAsset: this.isNonEmptyString(metadata.thumbnailAsset),
      title: this.isNonEmptyString(metadata.title),
      description: this.isNonEmptyString(metadata.description),
      targetPlatform: this.isNonEmptyString(metadata.targetPlatform)
    };

    const missingFields = Object.entries(checks)
      .filter(([, present]) => present === false)
      .map(([field]) => field);

    return {
      isValid: missingFields.length === 0,
      missingFields,
      checkedFields: checks
    };
  }

  preparePublishPackage({ assignment, metadata = {} }) {
    return {
      publishId: this.buildPublishId(assignment),
      platform: metadata.targetPlatform,
      publishStatus: 'SCHEDULED',
      publishUrl: this.buildPublishUrl(metadata.targetPlatform, assignment)
    };
  }

  buildPublishId(assignment) {
    return `PUBLISH-${String(assignment.assignmentId).toUpperCase()}`;
  }

  buildPublishUrl(targetPlatform, assignment) {
    return `https://publish.placeholder/${this.slugify(targetPlatform)}/${this.buildPublishId(assignment).toLowerCase()}`;
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export class YouTubePublishingService extends PublishingService {
  constructor({
    apiKey = process.env.YOUTUBE_API_KEY ?? null,
    clientId = process.env.YOUTUBE_CLIENT_ID ?? null,
    clientSecret = process.env.YOUTUBE_CLIENT_SECRET ?? null,
    refreshToken = process.env.YOUTUBE_REFRESH_TOKEN ?? null,
    baseUrl = 'https://www.googleapis.com/youtube/v3',
    uploadBaseUrl = 'https://www.googleapis.com/upload/youtube/v3',
    timeoutMs = 15000,
    maxRetries = 2,
    retryBaseDelayMs = 250,
    assetRegistry = null,
    fetchImpl = globalThis.fetch,
    workerId = 'PUBLISHING-WORKER-001',
    configurationService = null,
    secretManager = null,
    logger = null,
    metricsAdapter = null,
    sleep = null
  } = {}) {
    super();
    this.workerId = workerId;
    this.assetRegistry = assetRegistry ?? new AssetRegistry();
    this.configurationService = configurationService ?? new ConfigurationService();
    this.secretManager = secretManager ?? this.createDefaultSecretManager({ apiKey, clientId, clientSecret, refreshToken });
    this.configureRuntime({ baseUrl, timeoutMs, maxRetries, retryBaseDelayMs });
    this.providerAdapter = new YouTubePublishingProductionAdapter({
      fetchImpl,
      uploadBaseUrl,
      configurationService: this.configurationService,
      secretManager: this.secretManager,
      logger,
      metricsAdapter,
      sleep: typeof sleep === 'function' ? sleep : undefined
    });
  }

  createDefaultSecretManager({ apiKey, clientId, clientSecret, refreshToken }) {
    const env = {
      ...process.env
    };

    if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
      env.YOUTUBE_API_KEY = apiKey;
    }

    if (typeof clientId === 'string' && clientId.trim().length > 0) {
      env.YOUTUBE_CLIENT_ID = clientId;
    }

    if (typeof clientSecret === 'string' && clientSecret.trim().length > 0) {
      env.YOUTUBE_CLIENT_SECRET = clientSecret;
    }

    if (typeof refreshToken === 'string' && refreshToken.trim().length > 0) {
      env.YOUTUBE_REFRESH_TOKEN = refreshToken;
    }

    return this.configurationService.secretManager ?? new SecretManager({
      environment: this.configurationService.getEnvironment(),
      env,
      loadFromEnvFile: false
    });
  }

  configureRuntime({ baseUrl, timeoutMs, maxRetries, retryBaseDelayMs }) {
    this.configurationService.registerProviderConfiguration('youtube', {
      endpoint: String(baseUrl).replace(/\/+$/, ''),
      retryPolicy: {
        maxRetries,
        baseDelayMs: retryBaseDelayMs
      },
      timeoutMs,
      rateLimit: this.configurationService.getProviderRateLimit('youtube') ?? { requestsPerMinute: 60 },
      requiredSecrets: ['apiKey', 'clientId', 'clientSecret', 'refreshToken']
    });
  }

  validatePublishRequest(metadata = {}) {
    const checks = {
      videoAsset: this.isApprovedVideoAsset(metadata.videoAsset),
      title: this.isNonEmptyString(metadata.title),
      description: this.isNonEmptyString(metadata.description),
      targetPlatform: this.isNonEmptyString(metadata.targetPlatform)
    };

    const missingFields = Object.entries(checks)
      .filter(([, present]) => present === false)
      .map(([field]) => field);

    return {
      isValid: missingFields.length === 0,
      missingFields,
      checkedFields: {
        ...checks,
        thumbnailAsset: this.isNonEmptyString(metadata.thumbnailAsset)
          ? this.isApprovedThumbnailAsset(metadata.thumbnailAsset)
          : true
      }
    };
  }

  isApprovedVideoAsset(value) {
    if (!this.isReadableFile(value)) {
      return false;
    }

    const normalizedPath = String(value).toLowerCase();
    const blockedSegments = ['/probe/', '/test/', '/fixture/', '/placeholder/'];

    return normalizedPath.endsWith('.mp4') && !blockedSegments.some(segment => normalizedPath.includes(segment));
  }

  isApprovedThumbnailAsset(value) {
    if (!this.isReadableFile(value)) {
      return false;
    }

    const normalizedPath = String(value).toLowerCase();
    const blockedSegments = ['/probe/', '/test/', '/fixture/', '/placeholder/'];

    return !blockedSegments.some(segment => normalizedPath.includes(segment));
  }

  async preparePublishPackage({ assignment, metadata = {} }) {
    const normalizedMetadata = this.normalizeMetadata(metadata);

    try {
      const providerResponse = await this.providerAdapter.run({
        operation: 'publish_video',
        metadata: normalizedMetadata
      });

      const publishPackage = {
        publishId: this.buildPublishId(assignment),
        platform: normalizedMetadata.targetPlatform,
        publishStatus: providerResponse.publishStatus,
        publishUrl: providerResponse.publishUrl,
        videoId: providerResponse.videoId,
        visibility: providerResponse.visibility,
        thumbnailStatus: providerResponse.thumbnailStatus,
        metadataApplied: providerResponse.metadataApplied,
        connectionValidated: providerResponse.connectionValidated
      };

      this.registerAssets({ normalizedMetadata, publishPackage, error: null });

      return publishPackage;
    } catch (error) {
      const reason = this.buildFailureReason(error);
      const errorDetails = this.buildFailureDetails(error);
      const failedPublishPackage = {
        publishId: this.buildPublishId(assignment),
        platform: normalizedMetadata.targetPlatform,
        publishStatus: 'FAILED',
        publishUrl: null,
        videoId: null,
        visibility: normalizedMetadata.visibility,
        thumbnailStatus: normalizedMetadata.thumbnailAsset ? 'FAILED' : 'SKIPPED',
        metadataApplied: false,
        connectionValidated: false,
        error: reason,
        errorDetails
      };

      this.registerAssets({ normalizedMetadata, publishPackage: failedPublishPackage, error: reason, errorDetails });

      return failedPublishPackage;
    }
  }

  normalizeMetadata(metadata) {
    return {
      videoAsset: metadata.videoAsset ?? null,
      thumbnailAsset: metadata.thumbnailAsset ?? null,
      title: metadata.title ?? null,
      description: metadata.description ?? null,
      tags: Array.isArray(metadata.tags) ? [...metadata.tags] : [],
      categoryId: metadata.categoryId ?? '22',
      targetPlatform: metadata.targetPlatform ?? 'youtube',
      visibility: 'private',
      publishTime: metadata.publishTime ?? metadata.scheduledPublishTime ?? null,
      businessId: metadata.businessId ?? 'BUSINESS_ID_PLACEHOLDER',
      missionId: metadata.missionId ?? 'MISSION_ID_PLACEHOLDER'
    };
  }

  registerAssets({ normalizedMetadata, publishPackage, error = null, errorDetails = null }) {
    this.assetRegistry.registerAsset({
      assetType: 'PUBLISHED_VIDEO',
      businessId: normalizedMetadata.businessId,
      missionId: normalizedMetadata.missionId,
      workerId: this.workerId,
      status: publishPackage.publishStatus === 'PUBLISHED_PRIVATE' ? 'GENERATED' : 'FAILED',
      metadata: {
        provider: 'youtube',
        sourceVideoAsset: normalizedMetadata.videoAsset,
        publishId: publishPackage.publishId,
        publishUrl: publishPackage.publishUrl,
        videoId: publishPackage.videoId,
        visibility: publishPackage.visibility,
        thumbnailStatus: publishPackage.thumbnailStatus,
        metadataApplied: publishPackage.metadataApplied,
        error,
        errorDetails,
        thumbnailErrorDetails: publishPackage.thumbnailErrorDetails ?? null
      }
    });

    if (!this.isNonEmptyString(normalizedMetadata.thumbnailAsset)) {
      return;
    }

    this.assetRegistry.registerAsset({
      assetType: 'PUBLISH_THUMBNAIL',
      businessId: normalizedMetadata.businessId,
      missionId: normalizedMetadata.missionId,
      workerId: this.workerId,
      status: publishPackage.thumbnailStatus === 'UPLOADED' ? 'GENERATED' : 'FAILED',
      metadata: {
        provider: 'youtube',
        sourceThumbnailAsset: normalizedMetadata.thumbnailAsset,
        publishId: publishPackage.publishId,
        videoId: publishPackage.videoId,
        thumbnailStatus: publishPackage.thumbnailStatus,
        error: publishPackage.thumbnailStatus === 'UPLOADED' ? null : error,
        thumbnailErrorDetails: publishPackage.thumbnailErrorDetails ?? null
      }
    });
  }

  buildFailureDetails(error) {
    if (error?.name === 'ProductionAdapterError') {
      return {
        status: error.details?.status ?? null,
        code: error.details?.code ?? null,
        message: error.details?.message ?? null,
        providerError: error.details?.providerError ?? null,
        providerResponseJson: error.details?.providerResponseJson ?? null,
        providerResponseBody: error.details?.providerResponseBody ?? null
      };
    }

    const status = Number.parseInt(String(error?.status ?? error?.statusCode ?? ''), 10);

    return {
      status: Number.isInteger(status) ? status : null,
      code: null,
      message: error?.message ?? null,
      providerError: error?.providerError ?? null,
      providerResponseJson: error?.providerResponseJson ?? null,
      providerResponseBody: error?.providerResponseBody ?? null
    };
  }

  buildFailureReason(error) {
    if (error?.name === 'ProductionAdapterError') {
      const code = String(error.details?.code ?? 'UNKNOWN_ERROR')
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_');

      return `YOUTUBE_${code}`;
    }

    const status = Number.parseInt(String(error?.status ?? error?.statusCode ?? ''), 10);

    if (Number.isInteger(status) && status >= 400) {
      return `YOUTUBE_HTTP_${status}`;
    }

    return 'YOUTUBE_PROVIDER_FAILURE';
  }

  buildPublishId(assignment) {
    return `PUBLISH-${String(assignment.assignmentId).toUpperCase()}`;
  }

  isReadableFile(value) {
    return this.isNonEmptyString(value) && existsSync(value);
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }
}

class YouTubePublishingProductionAdapter extends ProductionAdapter {
  constructor({ fetchImpl = globalThis.fetch, uploadBaseUrl = 'https://www.googleapis.com/upload/youtube/v3', ...options } = {}) {
    super({
      providerId: 'youtube',
      ...options
    });
    this.fetchImpl = fetchImpl;
    this.uploadBaseUrl = String(uploadBaseUrl).replace(/\/+$/, '');
    this.accessToken = null;
    this.connectionValidated = false;
  }

  async authenticate({ configuration, secrets }) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch implementation unavailable.');
    }

    const clientId = secrets.configuredSecrets.clientId?.value;
    const clientSecret = secrets.configuredSecrets.clientSecret?.value;
    const refreshToken = secrets.configuredSecrets.refreshToken?.value;

    this.accessToken = await this.exchangeAccessToken({ clientId, clientSecret, refreshToken });
    this.connectionValidated = await this.validateConnection({
      endpoint: configuration.endpoint,
      accessToken: this.accessToken,
      apiKey: secrets.configuredSecrets.apiKey?.value
    });

    return {
      authenticated: true,
      connectionValidated: this.connectionValidated
    };
  }

  async execute({ request, configuration }) {
    const metadata = request.metadata ?? {};

    if (typeof this.accessToken !== 'string' || this.accessToken.trim().length === 0) {
      throw new Error('YouTube authentication failed.');
    }

    const initializeResponse = await this.initializeResumableUpload({ metadata });
    const uploadUrl = initializeResponse.headers.get('location');

    if (typeof uploadUrl !== 'string' || uploadUrl.trim().length === 0) {
      const failure = new Error('YouTube upload initialization did not return a resumable location URL.');
      failure.status = 502;
      throw failure;
    }

    this.logEvent('info', 'youtube_upload_progress', {
      providerId: this.providerId,
      operation: 'publish_video',
      progressPercentage: 0
    });

    const videoBuffer = readFileSync(metadata.videoAsset);
    const uploadResponse = await this.fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBuffer.length)
      },
      body: videoBuffer
    });

    if (!uploadResponse?.ok) {
      const payload = await this.readErrorPayload(uploadResponse);
      const failure = new Error(`YouTube upload failed with status ${uploadResponse?.status ?? 'UNKNOWN'}.`);
      failure.status = payload.status;
      failure.retryAfter = uploadResponse?.headers?.get?.('retry-after') ?? null;
      failure.providerResponseBody = payload.body;
      failure.providerResponseJson = payload.json;
      failure.providerError = payload.error;

      this.logEvent('error', 'youtube_http_error', {
        providerId: this.providerId,
        operation: 'upload_video',
        status: payload.status,
        providerError: payload.error,
        providerResponseBody: payload.body
      });
      throw failure;
    }

    this.logEvent('info', 'youtube_upload_progress', {
      providerId: this.providerId,
      operation: 'publish_video',
      progressPercentage: 100,
      uploadedBytes: videoBuffer.length
    });

    const uploadPayload = await uploadResponse.json();
    const videoId = uploadPayload?.id;

    if (typeof videoId !== 'string' || videoId.trim().length === 0) {
      const failure = new Error('YouTube upload response did not include a video ID.');
      failure.status = 502;
      throw failure;
    }

    const thumbnailResult = await this.uploadThumbnail({ videoId, thumbnailAsset: metadata.thumbnailAsset });
    const thumbnailStatus = typeof thumbnailResult === 'string'
      ? thumbnailResult
      : thumbnailResult?.thumbnailStatus ?? 'FAILED';
    const thumbnailErrorDetails = typeof thumbnailResult === 'string'
      ? null
      : thumbnailResult?.thumbnailErrorDetails ?? null;

    return {
      publishStatus: 'PUBLISHED_PRIVATE',
      publishUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      visibility: 'private',
      thumbnailStatus,
      thumbnailErrorDetails,
      metadataApplied: true,
      connectionValidated: this.connectionValidated
    };
  }

  normalizeResponse(rawResponse) {
    return {
      publishStatus: rawResponse.publishStatus,
      publishUrl: rawResponse.publishUrl,
      videoId: rawResponse.videoId,
      visibility: rawResponse.visibility,
      thumbnailStatus: rawResponse.thumbnailStatus,
      thumbnailErrorDetails: rawResponse.thumbnailErrorDetails ?? null,
      metadataApplied: rawResponse.metadataApplied,
      connectionValidated: rawResponse.connectionValidated
    };
  }

  async readErrorPayload(response) {
    const body = await response.text();
    let parsed = null;

    try {
      parsed = body.length > 0 ? JSON.parse(body) : null;
    } catch {
      parsed = null;
    }

    return {
      status: Number.parseInt(String(response?.status ?? 500), 10),
      body,
      json: parsed,
      error: parsed?.error ?? null
    };
  }

  async exchangeAccessToken({ clientId, clientSecret, refreshToken }) {
    const tokenResponse = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: String(clientId ?? ''),
        client_secret: String(clientSecret ?? ''),
        refresh_token: String(refreshToken ?? ''),
        grant_type: 'refresh_token'
      }).toString()
    });

    if (!tokenResponse?.ok) {
      const failure = new Error(`YouTube authentication failed with status ${tokenResponse?.status ?? 'UNKNOWN'}.`);
      failure.status = Number.parseInt(String(tokenResponse?.status ?? 500), 10);
      failure.retryAfter = tokenResponse?.headers?.get?.('retry-after') ?? null;
      throw failure;
    }

    const tokenPayload = await tokenResponse.json();
    const accessToken = tokenPayload?.access_token;

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new Error('YouTube authentication failed.');
    }

    return accessToken;
  }

  async validateConnection({ endpoint, accessToken, apiKey }) {
    const url = `${String(endpoint).replace(/\/+$/, '')}/channels?part=id&mine=true&maxResults=1&key=${encodeURIComponent(String(apiKey ?? ''))}`;
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response?.ok) {
      const payload = await this.readErrorPayload(response);
      const failure = new Error(`YouTube connection validation failed with status ${response?.status ?? 'UNKNOWN'}.`);
      failure.status = payload.status;
      failure.retryAfter = response?.headers?.get?.('retry-after') ?? null;
      failure.providerResponseBody = payload.body;
      failure.providerResponseJson = payload.json;
      failure.providerError = payload.error;

      this.logEvent('error', 'youtube_http_error', {
        providerId: this.providerId,
        operation: 'validate_connection',
        status: payload.status,
        providerError: payload.error,
        providerResponseBody: payload.body
      });
      throw failure;
    }

    return true;
  }

  async initializeResumableUpload({ metadata }) {
    const requestBody = {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        categoryId: String(metadata.categoryId ?? '22')
      },
      status: {
        privacyStatus: 'private'
      }
    };

    const publishAt = this.resolveScheduledPublishAt(metadata);
    if (publishAt) {
      requestBody.status.publishAt = publishAt;
    }

    const response = await this.fetchImpl(`${this.uploadBaseUrl}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response?.ok) {
      const payload = await this.readErrorPayload(response);
      const failure = new Error(`YouTube upload initialization failed with status ${response?.status ?? 'UNKNOWN'}.`);
      failure.status = payload.status;
      failure.retryAfter = response?.headers?.get?.('retry-after') ?? null;
      failure.providerResponseBody = payload.body;
      failure.providerResponseJson = payload.json;
      failure.providerError = payload.error;

      this.logEvent('error', 'youtube_http_error', {
        providerId: this.providerId,
        operation: 'initialize_resumable_upload',
        status: payload.status,
        providerError: payload.error,
        providerResponseBody: payload.body
      });
      throw failure;
    }

    return response;
  }

  resolveScheduledPublishAt(metadata = {}) {
    if (String(metadata?.visibility ?? '').toLowerCase() !== 'private') {
      return null;
    }

    // Only treat explicitly requested publishTime as a schedule candidate.
    const requestedPublishTime = metadata?.publishTime;
    if (typeof requestedPublishTime !== 'string' || requestedPublishTime.trim().length === 0) {
      return null;
    }

    const parsed = new Date(requestedPublishTime);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    if (parsed.getTime() <= Date.now()) {
      return null;
    }

    return parsed.toISOString();
  }

  async uploadThumbnail({ videoId, thumbnailAsset }) {
    if (typeof thumbnailAsset !== 'string' || thumbnailAsset.trim().length === 0 || !existsSync(thumbnailAsset)) {
      return 'SKIPPED';
    }

    try {
      const thumbnailBuffer = readFileSync(thumbnailAsset);
      const response = await this.fetchImpl(`${this.uploadBaseUrl}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'image/png'
        },
        body: thumbnailBuffer
      });

      if (!response?.ok) {
        const payload = await this.readErrorPayload(response);
        this.logEvent('error', 'youtube_thumbnail_upload_failure', {
          providerId: this.providerId,
          operation: 'publish_video',
          videoId,
          status: payload.status,
          providerError: payload.error,
          providerResponseBody: payload.body
        });
        return {
          thumbnailStatus: 'FAILED',
          thumbnailErrorDetails: {
            status: payload.status,
            providerError: payload.error,
            providerResponseJson: payload.json,
            providerResponseBody: payload.body
          }
        };
      }

      return {
        thumbnailStatus: 'UPLOADED',
        thumbnailErrorDetails: null
      };
    } catch (_error) {
      this.logEvent('error', 'youtube_thumbnail_upload_failure', {
        providerId: this.providerId,
        operation: 'publish_video',
        videoId,
        status: 'EXCEPTION'
      });
      return {
        thumbnailStatus: 'FAILED',
        thumbnailErrorDetails: {
          status: null,
          providerError: null,
          providerResponseJson: null,
          providerResponseBody: null,
          message: 'THUMBNAIL_UPLOAD_EXCEPTION'
        }
      };
    }
  }
}
