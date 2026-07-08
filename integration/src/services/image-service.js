import { createSign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetRegistry } from '../asset-registry.js';
import { SecretManager } from '../infrastructure/secret-manager.js';
import { ConfigurationService } from '../infrastructure/configuration-service.js';
import { ProductionAdapter } from '../infrastructure/production-adapter.js';

export class ImageService {
  generateImages() {
    throw new Error('ImageService.generateImages must be implemented by a provider.');
  }
}

export class PlaceholderImageService extends ImageService {
  generateImages(metadata = {}) {
    const normalizedMetadata = {
      script: metadata.script ?? 'Script unavailable',
      sceneDescription: metadata.sceneDescription ?? 'Generic Scene',
      artStyle: metadata.artStyle ?? 'Cinematic Illustration',
      imageCount: metadata.imageCount ?? 3
    };
    const imageCount = this.normalizeImageCount(normalizedMetadata.imageCount);

    return {
      imageFiles: this.buildImageFiles(normalizedMetadata, imageCount),
      generatedScenes: this.buildGeneratedScenes(normalizedMetadata, imageCount)
    };
  }

  normalizeImageCount(imageCount) {
    const count = Number.parseInt(String(imageCount), 10);

    if (Number.isNaN(count)) {
      return 3;
    }

    return Math.max(1, count);
  }

  buildImageFiles(metadata, imageCount) {
    const style = this.slugify(metadata.artStyle);
    const scene = this.fingerprint(metadata.sceneDescription);

    return Array.from({ length: imageCount }, (_, index) => (
      `image-${style}-${scene}-${String(index + 1).padStart(2, '0')}.png`
    ));
  }

  buildGeneratedScenes(metadata, imageCount) {
    return Array.from({ length: imageCount }, (_, index) => (
      `${metadata.sceneDescription} - shot ${index + 1} in ${metadata.artStyle}`
    ));
  }

  slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  fingerprint(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'scene';
  }
}


export class GoogleImagenService extends ImageService {
  constructor({
    apiKey = process.env.GOOGLE_VERTEX_API_KEY ?? null,
    projectId = process.env.GOOGLE_CLOUD_PROJECT ?? null,
    location = process.env.GOOGLE_CLOUD_LOCATION ?? null,
    credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? null,
    baseUrl = 'https://aiplatform.googleapis.com',
    model = 'imagen-3.0-generate-001',
    outputDir = null,
    imageCount = 3,
    timeoutMs = 15000,
    maxRetries = 2,
    retryBaseDelayMs = 250,
    assetRegistry = null,
    fetchImpl = globalThis.fetch,
    workerId = 'IMAGE-WORKER-001',
    configurationService = null,
    secretManager = null,
    logger = null,
    metricsAdapter = null,
    sleep = null
  } = {}) {
    super();
    this.workerId = workerId;
    this.model = model;
    this.assetRegistry = assetRegistry ?? new AssetRegistry();
    this.configurationService = configurationService ?? new ConfigurationService();
    this.outputDir = outputDir ?? this.configurationService.getAssetPath('images') ?? '/var/lib/atlas/assets/images';
    this.secretManager = secretManager ?? this.createDefaultSecretManager({ apiKey, projectId, location, credentialsJson });
    this.configureRuntime({
      baseUrl,
      timeoutMs,
      maxRetries,
      retryBaseDelayMs,
      imageCount
    });
    this.providerAdapter = new GoogleVertexImagenProductionAdapter({
      fetchImpl,
      configurationService: this.configurationService,
      secretManager: this.secretManager,
      logger,
      metricsAdapter,
      sleep: typeof sleep === 'function' ? sleep : undefined,
      model: this.model
    });
  }

  async generateImages(metadata = {}) {
    const normalizedMetadata = this.normalizeMetadata(metadata);

    try {
      const providerResponse = await this.providerAdapter.run({
        operation: 'generate_images',
        metadata: normalizedMetadata
      });
      const imageFiles = this.saveImageFiles(providerResponse.imageBuffers, normalizedMetadata);

      this.registerAssets({
        normalizedMetadata,
        imageFiles,
        status: 'GENERATED',
        provider: 'google-vertex'
      });

      return {
        imageFiles,
        generatedScenes: this.buildGeneratedScenes(normalizedMetadata, imageFiles.length)
      };
    } catch (error) {
      return this.failGracefully(normalizedMetadata, this.buildFailureReason(error));
    }
  }

  createDefaultSecretManager({ apiKey, projectId, location, credentialsJson }) {
    const env = {
      ...process.env
    };

    if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
      env.GOOGLE_VERTEX_API_KEY = apiKey;
    }

    if (typeof projectId === 'string' && projectId.trim().length > 0) {
      env.GOOGLE_CLOUD_PROJECT = projectId;
    }

    if (typeof location === 'string' && location.trim().length > 0) {
      env.GOOGLE_CLOUD_LOCATION = location;
    }

    if (typeof credentialsJson === 'string' && credentialsJson.trim().length > 0) {
      env.GOOGLE_APPLICATION_CREDENTIALS_JSON = credentialsJson;
    }

    return this.configurationService.secretManager ?? new SecretManager({
      environment: this.configurationService.getEnvironment(),
      env,
      loadFromEnvFile: false
    });
  }

  configureRuntime({ baseUrl, timeoutMs, maxRetries, retryBaseDelayMs, imageCount }) {
    this.imageCount = this.normalizeImageCount(imageCount);
    this.configurationService.registerProviderConfiguration('google-vertex', {
      endpoint: `${String(baseUrl).replace(/\/+$/, '')}/v1`,
      retryPolicy: {
        maxRetries,
        baseDelayMs: retryBaseDelayMs
      },
      timeoutMs,
      rateLimit: this.configurationService.getProviderRateLimit('google-vertex') ?? { requestsPerMinute: 120 },
      requiredSecrets: ['projectId', 'location', 'credentialsJson']
    });
  }

  normalizeMetadata(metadata) {
    return {
      prompt: metadata.prompt ?? metadata.sceneDescription ?? 'Generic Scene',
      sceneDescription: metadata.sceneDescription ?? metadata.prompt ?? 'Generic Scene',
      artStyle: metadata.artStyle ?? 'Cinematic Illustration',
      imageCount: this.normalizeImageCount(metadata.imageCount ?? this.imageCount),
      businessId: metadata.businessId ?? 'BUSINESS_ID_PLACEHOLDER',
      missionId: metadata.missionId ?? 'MISSION_ID_PLACEHOLDER',
      aspectRatio: metadata.aspectRatio ?? '1:1',
      negativePrompt: metadata.negativePrompt ?? '',
      projectId: metadata.projectId ?? null,
      location: metadata.location ?? null
    };
  }

  normalizeImageCount(imageCount) {
    const count = Number.parseInt(String(imageCount), 10);

    if (Number.isNaN(count)) {
      return 3;
    }

    return Math.max(1, count);
  }

  buildFailureReason(error) {
    if (error?.name === 'ProductionAdapterError') {
      const code = String(error.details?.code ?? 'UNKNOWN_ERROR')
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_');

      return `GOOGLE_VERTEX_${code}`;
    }

    return 'GOOGLE_VERTEX_PROVIDER_FAILURE';
  }

  saveImageFiles(imageBuffers, metadata) {
    if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) {
      return this.saveFailurePlaceholderImages(metadata);
    }

    mkdirSync(this.outputDir, { recursive: true });

    return imageBuffers.map((imageBuffer, index) => {
      const fileName = this.buildImageFileName(metadata, index);
      const filePath = join(this.outputDir, fileName);
      writeFileSync(filePath, Buffer.from(imageBuffer));

      return filePath;
    });
  }

  saveFailurePlaceholderImages(metadata) {
    mkdirSync(this.outputDir, { recursive: true });

    return Array.from({ length: metadata.imageCount }, (_, index) => {
      const fileName = this.buildFailureFileName(metadata, index);
      const filePath = join(this.outputDir, fileName);
      writeFileSync(filePath, Buffer.from('GOOGLE_VERTEX_IMAGE_GENERATION_FAILED_PLACEHOLDER'));

      return filePath;
    });
  }

  buildImageFileName(metadata, index) {
    const style = this.slugify(metadata.artStyle);
    const promptFingerprint = this.fingerprint(metadata.prompt);

    return `image-${style}-${promptFingerprint}-${String(index + 1).padStart(2, '0')}.png`;
  }

  buildFailureFileName(metadata, index) {
    const style = this.slugify(metadata.artStyle);
    const promptFingerprint = this.fingerprint(metadata.prompt);

    return `image-failed-${style}-${promptFingerprint}-${String(index + 1).padStart(2, '0')}.png`;
  }

  buildGeneratedScenes(metadata, imageCount) {
    return Array.from({ length: imageCount }, (_, index) => (
      `${metadata.sceneDescription} - shot ${index + 1} in ${metadata.artStyle}`
    ));
  }

  registerAssets({ normalizedMetadata, imageFiles, status, provider, error = null }) {
    imageFiles.forEach((imageFile, index) => {
      this.assetRegistry.registerAsset({
        assetType: 'IMAGE',
        businessId: normalizedMetadata.businessId,
        missionId: normalizedMetadata.missionId,
        workerId: this.workerId,
        status,
        metadata: {
          provider,
          model: this.model,
          imageFile,
          imageIndex: index + 1,
          prompt: normalizedMetadata.prompt,
          artStyle: normalizedMetadata.artStyle,
          error
        }
      });
    });
  }

  failGracefully(normalizedMetadata, reason) {
    const imageFiles = this.saveFailurePlaceholderImages(normalizedMetadata);

    this.registerAssets({
      normalizedMetadata,
      imageFiles,
      status: 'FAILED',
      provider: 'google-vertex',
      error: reason
    });

    return {
      imageFiles,
      generatedScenes: this.buildGeneratedScenes(normalizedMetadata, imageFiles.length)
    };
  }

  slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  fingerprint(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'scene';
  }
}

class GoogleVertexImagenProductionAdapter extends ProductionAdapter {
  constructor({ fetchImpl = globalThis.fetch, model = 'imagen-3.0-generate-001', ...options } = {}) {
    super({
      providerId: 'google-vertex',
      ...options
    });
    this.fetchImpl = fetchImpl;
    this.model = model;
    this.accessToken = null;
    this.credentials = null;
  }

  async authenticate({ secrets }) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch implementation unavailable.');
    }

    const credentialsJson = secrets.configuredSecrets.credentialsJson?.value;

    if (typeof credentialsJson !== 'string' || credentialsJson.trim().length === 0) {
      throw new Error('Google Vertex AI authentication failed.');
    }

    this.credentials = this.parseCredentials(credentialsJson);
    this.accessToken = await this.exchangeAccessToken(this.credentials);

    return {
      authenticated: true
    };
  }

  async execute({ request, configuration, secrets }) {
    const metadata = request.metadata ?? {};
    const projectId = secrets.configuredSecrets.projectId?.value;
    const location = secrets.configuredSecrets.location?.value;
    const accessToken = this.accessToken;

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new Error('Google Vertex AI authentication failed.');
    }

    const endpoint = `${this.normalizeBaseUrl(configuration.endpoint)}/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(this.model)}:predict`;
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: metadata.prompt,
            negativePrompt: metadata.negativePrompt,
            aspectRatio: metadata.aspectRatio
          }
        ],
        parameters: {
          sampleCount: metadata.imageCount
        }
      })
    });

    if (!response?.ok) {
      const failure = new Error(`Google Vertex AI request failed with status ${response?.status ?? 'UNKNOWN'}.`);
      failure.status = Number.parseInt(String(response?.status ?? 500), 10);
      failure.retryAfter = response?.headers?.get?.('retry-after') ?? null;
      throw failure;
    }

    const payload = await response.json();
    const imageBuffers = this.extractImageBuffers(payload);

    if (imageBuffers.length === 0) {
      const failure = new Error('Google Vertex AI returned no image bytes.');
      failure.status = 502;
      throw failure;
    }

    return {
      imageBuffers
    };
  }

  normalizeResponse(rawResponse) {
    return {
      imageBuffers: rawResponse.imageBuffers ?? []
    };
  }

  parseCredentials(credentialsJson) {
    try {
      return JSON.parse(credentialsJson);
    } catch (_error) {
      throw new Error('Google Vertex AI authentication failed.');
    }
  }

  async exchangeAccessToken(credentials) {
    const tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
    const assertion = this.buildAssertion(credentials, tokenUri);
    const response = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });

    if (!response?.ok) {
      const failure = new Error(`Google Vertex AI authentication failed with status ${response?.status ?? 'UNKNOWN'}.`);
      failure.status = Number.parseInt(String(response?.status ?? 500), 10);
      failure.retryAfter = response?.headers?.get?.('retry-after') ?? null;
      throw failure;
    }

    const payload = await response.json();
    const accessToken = payload.access_token;

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new Error('Google Vertex AI authentication failed.');
    }

    return accessToken;
  }

  buildAssertion(credentials, tokenUri) {
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    if (credentials.private_key_id) {
      header.kid = credentials.private_key_id;
    }

    const payload = {
      iss: credentials.client_email,
      sub: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUri,
      iat: now,
      exp: now + 3600
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${encodedHeader}.${encodedPayload}`);
    signer.end();
    const signature = signer.sign(credentials.private_key).toString('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  extractImageBuffers(payload) {
    const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];

    return predictions
      .map(prediction => this.extractImageBuffer(prediction))
      .filter(buffer => Buffer.isBuffer(buffer) && buffer.length > 0);
  }

  extractImageBuffer(prediction) {
    const base64Value = prediction?.bytesBase64Encoded
      ?? prediction?.imageBytes
      ?? prediction?.image?.bytesBase64Encoded
      ?? prediction?.image?.imageBytes
      ?? prediction?.base64
      ?? prediction?.data
      ?? null;

    if (typeof base64Value !== 'string' || base64Value.trim().length === 0) {
      return null;
    }

    return Buffer.from(base64Value, 'base64');
  }

  normalizeBaseUrl(endpoint) {
    return String(endpoint ?? '').replace(/\/+$/, '');
  }
}
