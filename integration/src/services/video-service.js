import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { AssetRegistry } from '../asset-registry.js';
import { SecretManager } from '../infrastructure/secret-manager.js';
import { ConfigurationService } from '../infrastructure/configuration-service.js';
import { ProductionAdapter } from '../infrastructure/production-adapter.js';

export class VideoService {
  generateVideo() {
    throw new Error('VideoService.generateVideo must be implemented by a provider.');
  }
}

export class PlaceholderVideoService extends VideoService {
  generateVideo(metadata = {}) {
    const normalizedMetadata = {
      script: metadata.script ?? 'Script unavailable',
      voiceOutput: metadata.voiceOutput ?? 'voice-output-placeholder.wav',
      imageOutputs: Array.isArray(metadata.imageOutputs) ? [...metadata.imageOutputs] : [],
      subtitles: metadata.subtitles ?? null,
      targetFormat: metadata.targetFormat ?? 'mp4',
      targetResolution: metadata.targetResolution ?? '1920x1080'
    };

    return {
      videoFile: this.buildVideoFileName(normalizedMetadata),
      duration: this.estimateDuration(normalizedMetadata.script),
      status: 'COMPLETED'
    };
  }

  buildVideoFileName(metadata) {
    const resolution = this.slugify(metadata.targetResolution);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `video-${resolution}-${scriptFingerprint}.mp4`;
  }

  estimateDuration(script) {
    const words = String(script)
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const seconds = Math.max(1, Math.ceil(words / 2.5));

    return `${seconds} seconds`;
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
      .slice(0, 12) || 'noscript';
  }
}

export class GoogleVideoAssemblyService extends VideoService {
  constructor({
    apiKey = process.env.GOOGLE_VERTEX_API_KEY ?? null,
    projectId = process.env.GOOGLE_CLOUD_PROJECT ?? null,
    location = process.env.GOOGLE_CLOUD_LOCATION ?? null,
    credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? null,
    baseUrl = 'https://aiplatform.googleapis.com',
    outputDir = null,
    timeoutMs = 15000,
    maxRetries = 2,
    retryBaseDelayMs = 250,
    assetRegistry = null,
    fetchImpl = globalThis.fetch,
    workerId = 'VIDEO-WORKER-001',
    configurationService = null,
    secretManager = null,
    logger = null,
    metricsAdapter = null,
    sleep = null,
    ffmpegPath = 'ffmpeg'
  } = {}) {
    super();
    this.workerId = workerId;
    this.assetRegistry = assetRegistry ?? new AssetRegistry();
    this.configurationService = configurationService ?? new ConfigurationService();
    this.outputDir = outputDir ?? this.configurationService.getAssetPath('video') ?? '/var/lib/atlas/assets/video';
    this.ffmpegPath = ffmpegPath;
    this.secretManager = secretManager ?? this.createDefaultSecretManager({ apiKey, projectId, location, credentialsJson });
    this.configureRuntime({ baseUrl, timeoutMs, maxRetries, retryBaseDelayMs });
    this.providerAdapter = new GoogleVideoAssemblyProductionAdapter({
      fetchImpl,
      configurationService: this.configurationService,
      secretManager: this.secretManager,
      logger,
      metricsAdapter,
      sleep: typeof sleep === 'function' ? sleep : undefined,
      ffmpegPath: this.ffmpegPath,
      outputDir: this.outputDir,
      workerId: this.workerId
    });
  }

  async generateVideo(metadata = {}) {
    const normalizedMetadata = this.normalizeMetadata(metadata);

    try {
      const providerResponse = await this.providerAdapter.run({
        operation: 'generate_video',
        metadata: normalizedMetadata
      });
      const videoFile = this.saveVideoFile(providerResponse.videoFilePath, normalizedMetadata);

      this.registerAsset({
        normalizedMetadata,
        videoFile,
        status: 'GENERATED',
        provider: 'google-vertex'
      });

      return {
        videoFile,
        duration: this.estimateDuration(normalizedMetadata.script),
        validation: normalizedMetadata.validation,
        status: 'COMPLETED'
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

  configureRuntime({ baseUrl, timeoutMs, maxRetries, retryBaseDelayMs }) {
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
      script: metadata.script ?? 'Script unavailable',
      voiceOutput: metadata.voiceOutput ?? null,
      imageOutputs: Array.isArray(metadata.imageOutputs) ? [...metadata.imageOutputs] : [],
      subtitles: metadata.subtitles ?? null,
      targetFormat: metadata.targetFormat ?? 'mp4',
      targetResolution: metadata.targetResolution ?? '1920x1080',
      businessId: metadata.businessId ?? 'BUSINESS_ID_PLACEHOLDER',
      missionId: metadata.missionId ?? 'MISSION_ID_PLACEHOLDER'
    };
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

  saveVideoFile(sourcePath, metadata) {
    mkdirSync(this.outputDir, { recursive: true });

    const fileName = this.buildVideoFileName(metadata);
    const destinationPath = join(this.outputDir, fileName);
    writeFileSync(destinationPath, readFileSync(sourcePath));

    return destinationPath;
  }

  saveFailurePlaceholder(metadata) {
    mkdirSync(this.outputDir, { recursive: true });

    const fileName = this.buildFailureFileName(metadata);
    const destinationPath = join(this.outputDir, fileName);
    writeFileSync(destinationPath, Buffer.from('GOOGLE_VERTEX_VIDEO_GENERATION_FAILED_PLACEHOLDER'));

    return destinationPath;
  }

  buildVideoFileName(metadata) {
    const resolution = this.slugify(metadata.targetResolution);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `video-${resolution}-${scriptFingerprint}.mp4`;
  }

  buildFailureFileName(metadata) {
    const resolution = this.slugify(metadata.targetResolution);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `video-failed-${resolution}-${scriptFingerprint}.txt`;
  }

  estimateDuration(script) {
    const words = String(script)
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const seconds = Math.max(1, Math.ceil(words / 2.5));

    return `${seconds} seconds`;
  }

  registerAsset({ normalizedMetadata, videoFile, status, provider, error = null }) {
    this.assetRegistry.registerAsset({
      assetType: 'VIDEO',
      businessId: normalizedMetadata.businessId,
      missionId: normalizedMetadata.missionId,
      workerId: this.workerId,
      status,
      metadata: {
        provider,
        videoFile,
        error
      }
    });
  }

  failGracefully(normalizedMetadata, reason) {
    const videoFile = this.saveFailurePlaceholder(normalizedMetadata);

    this.registerAsset({
      normalizedMetadata,
      videoFile,
      status: 'FAILED',
      provider: 'google-vertex',
      error: reason
    });

    return {
      videoFile,
      duration: this.estimateDuration(normalizedMetadata.script),
      validation: {
        isValid: false,
        missingInputs: [],
        checkedInputs: {}
      },
      status: 'BLOCKED'
    };
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
      .slice(0, 12) || 'noscript';
  }
}

class GoogleVideoAssemblyProductionAdapter extends ProductionAdapter {
  constructor({ fetchImpl = globalThis.fetch, ffmpegPath = 'ffmpeg', outputDir = '/var/lib/atlas/assets/video', workerId = 'VIDEO-WORKER-001', ...options } = {}) {
    super({
      providerId: 'google-vertex',
      ...options
    });
    this.fetchImpl = fetchImpl;
    this.ffmpegPath = ffmpegPath;
    this.outputDir = outputDir;
    this.workerId = workerId;
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
    const accessToken = this.accessToken;

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new Error('Google Vertex AI authentication failed.');
    }

    const narrationFile = metadata.voiceOutput;
    const imageFiles = Array.isArray(metadata.imageOutputs) ? metadata.imageOutputs : [];

    if (typeof narrationFile !== 'string' || narrationFile.trim().length === 0) {
      throw new Error('Google Vertex AI video assembly failed.');
    }

    if (imageFiles.length === 0) {
      throw new Error('Google Vertex AI video assembly failed.');
    }

    const subtitlesFile = this.createSubtitlesFile(metadata);
    const workingDirectory = this.createWorkingDirectory(metadata);
    const outputFile = join(this.outputDir, this.buildVideoFileName(metadata));
    const filterComplex = this.buildFilterComplex(imageFiles.length, metadata.targetResolution);
    const concatInputs = imageFiles.flatMap(imageFile => ['-loop', '1', '-t', '2', '-i', imageFile]);
    const subtitleArguments = subtitlesFile ? ['-i', subtitlesFile] : [];
    const subtitleMapping = subtitlesFile ? ['-c:s', 'mov_text', '-map', `${imageFiles.length + 1}:s?`] : [];

    const command = [
      '-y',
      '-i', narrationFile,
      ...concatInputs,
      ...subtitleArguments,
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', '0:a',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      ...(subtitlesFile ? subtitleMapping : []),
      '-shortest',
      '-pix_fmt', 'yuv420p',
      outputFile
    ];

    const ffmpegResult = spawnSync(this.ffmpegPath, command, {
      cwd: workingDirectory,
      encoding: 'utf8'
    });

    if (ffmpegResult.status !== 0) {
      const failure = new Error(`Google Vertex AI video assembly failed with status ${ffmpegResult.status ?? 'UNKNOWN'}.`);
      failure.status = Number.parseInt(String(ffmpegResult.status ?? 500), 10);
      failure.retryAfter = null;
      failure.stderr = ffmpegResult.stderr ?? '';
      throw failure;
    }

    if (!existsSync(outputFile)) {
      const failure = new Error('Google Vertex AI video assembly failed.');
      failure.status = 500;
      throw failure;
    }

    if (subtitlesFile && existsSync(subtitlesFile)) {
      rmSync(subtitlesFile, { force: true });
    }

    rmSync(workingDirectory, { recursive: true, force: true });

    return {
      videoFilePath: outputFile
    };
  }

  normalizeResponse(rawResponse) {
    return {
      videoFilePath: rawResponse.videoFilePath
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

  createWorkingDirectory(metadata) {
    const workDir = join(this.outputDir, `.work-${this.slugify(metadata.missionId)}-${this.fingerprint(metadata.script)}`);
    mkdirSync(workDir, { recursive: true });
    return workDir;
  }

  createSubtitlesFile(metadata) {
    if (typeof metadata.subtitles !== 'string' || metadata.subtitles.trim().length === 0) {
      return null;
    }

    const subtitlesPath = join(this.outputDir, `${this.buildVideoFileName(metadata).replace('.mp4', '')}.srt`);
    writeFileSync(subtitlesPath, metadata.subtitles);
    return subtitlesPath;
  }

  buildFilterComplex(imageCount, targetResolution) {
    const scale = this.normalizeResolution(targetResolution);
    const scaledVideos = Array.from({ length: imageCount }, (_, index) => `[${index + 1}:v]scale=${scale}:force_original_aspect_ratio=decrease,pad=${scale}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${index}]`);
    const concatInputs = Array.from({ length: imageCount }, (_, index) => `[v${index}]`).join('');

    return `${scaledVideos.join(';')};${concatInputs}concat=n=${imageCount}:v=1:a=0[v]`;
  }

  normalizeResolution(value) {
    return String(value ?? '1920x1080').replace('x', ':');
  }

  buildVideoFileName(metadata) {
    const resolution = String(metadata.targetResolution ?? '1920x1080').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const scriptFingerprint = String(metadata.script ?? 'noscript').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'noscript';
    return `video-${resolution}-${scriptFingerprint}.mp4`;
  }

  slugify(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  fingerprint(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'noscript';
  }
}
