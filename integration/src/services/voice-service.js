import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetRegistry } from '../asset-registry.js';
import { SecretManager } from '../infrastructure/secret-manager.js';
import { ConfigurationService } from '../infrastructure/configuration-service.js';
import { ProductionAdapter } from '../infrastructure/production-adapter.js';

export class VoiceService {
  async synthesizeVoice() {
    throw new Error('VoiceService.synthesizeVoice must be implemented by a provider.');
  }
}

export class PlaceholderVoiceService extends VoiceService {
  async synthesizeVoice(metadata = {}) {
    const normalizedMetadata = {
      script: metadata.script ?? 'Script unavailable',
      voiceStyle: metadata.voiceStyle ?? 'Neutral Narration',
      language: metadata.language ?? 'en-US',
      targetDuration: metadata.targetDuration ?? 60
    };

    return {
      audioFile: this.buildAudioFileName(normalizedMetadata),
      estimatedDuration: this.estimateDuration(normalizedMetadata.targetDuration)
    };
  }

  buildAudioFileName(metadata) {
    const normalizedStyle = this.slugify(metadata.voiceStyle);
    const normalizedLanguage = this.slugify(metadata.language);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `voice-${normalizedStyle}-${normalizedLanguage}-${scriptFingerprint}.wav`;
  }

  estimateDuration(targetDuration) {
    const seconds = Number.parseInt(String(targetDuration), 10);
    const normalizedSeconds = Number.isNaN(seconds) ? 60 : Math.max(1, seconds);

    return `${normalizedSeconds} seconds`;
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
      .slice(0, 12) || 'noscript';
  }
}

export class ElevenLabsVoiceService extends VoiceService {
  constructor({
    apiKey = process.env.ELEVENLABS_API_KEY ?? null,
    baseUrl = 'https://api.elevenlabs.io',
    outputDir = null,
    timeoutMs = 15000,
    maxRetries = 2,
    retryBaseDelayMs = 250,
    assetRegistry = null,
    fetchImpl = globalThis.fetch,
    workerId = 'VOICE-WORKER-001',
    configurationService = null,
    secretManager = null,
    logger = null,
    metricsAdapter = null,
    sleep = null
  } = {}) {
    super();
    this.assetRegistry = assetRegistry ?? new AssetRegistry();
    this.workerId = workerId;
    this.configurationService = configurationService ?? new ConfigurationService();
    this.outputDir = outputDir ?? this.configurationService.getAssetPath('audio') ?? '/var/lib/atlas/assets/audio';
    this.secretManager = secretManager
      ?? this.createDefaultSecretManager({ apiKey });
    this.configureRuntime({
      baseUrl,
      timeoutMs,
      maxRetries,
      retryBaseDelayMs
    });
    this.providerAdapter = new ElevenLabsProductionAdapter({
      fetchImpl,
      configurationService: this.configurationService,
      secretManager: this.secretManager,
      logger,
      metricsAdapter,
      sleep: typeof sleep === 'function' ? sleep : undefined
    });
  }

  async synthesizeVoice(metadata = {}) {
    const normalizedMetadata = this.normalizeMetadata(metadata);
    try {
      const providerResponse = await this.providerAdapter.run({
        operation: 'synthesize_voice',
        metadata: normalizedMetadata
      });
      const audioFile = this.saveAudioFile(providerResponse.audioBytes, normalizedMetadata);

      this.registerAsset({
        normalizedMetadata,
        audioFile,
        status: 'GENERATED',
        provider: 'elevenlabs'
      });

      return {
        audioFile,
        estimatedDuration: this.estimateDuration(normalizedMetadata.targetDuration)
      };
    } catch (error) {
      return this.failGracefully(normalizedMetadata, this.buildFailureReason(error));
    }
  }

  createDefaultSecretManager({ apiKey }) {
    if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
      return new SecretManager({
        environment: this.configurationService.getEnvironment(),
        env: {
          ...process.env,
          ELEVENLABS_API_KEY: apiKey
        },
        loadFromEnvFile: false
      });
    }

    return this.configurationService.secretManager ?? new SecretManager({
      environment: this.configurationService.getEnvironment()
    });
  }

  configureRuntime({ baseUrl, timeoutMs, maxRetries, retryBaseDelayMs }) {
    this.configurationService.registerProviderConfiguration('elevenlabs', {
      endpoint: `${baseUrl.replace(/\/+$/, '')}/v1/text-to-speech`,
      retryPolicy: {
        maxRetries,
        baseDelayMs: retryBaseDelayMs
      },
      timeoutMs,
      rateLimit: this.configurationService.getProviderRateLimit('elevenlabs') ?? { requestsPerMinute: 120 },
      requiredSecrets: ['apiKey']
    });
  }

  buildFailureReason(error) {
    if (error?.name === 'ProductionAdapterError') {
      const code = String(error.details?.code ?? 'UNKNOWN_ERROR')
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_');

      return `ELEVENLABS_${code}`;
    }

    return 'ELEVENLABS_PROVIDER_FAILURE';
  }

  normalizeMetadata(metadata) {
    return {
      script: metadata.script ?? 'Script unavailable',
      voiceId: metadata.voiceId ?? 'EXAVITQu4vr4xnSDxMaL',
      language: metadata.language ?? 'en-US',
      style: this.normalizeUnitInterval(metadata.style ?? metadata.voiceStyle ?? 0.5),
      stability: this.normalizeUnitInterval(metadata.stability ?? 0.5),
      similarityBoost: this.normalizeUnitInterval(metadata.similarityBoost ?? 0.75),
      targetDuration: metadata.targetDuration ?? 60,
      businessId: metadata.businessId ?? 'BUSINESS_ID_PLACEHOLDER',
      missionId: metadata.missionId ?? 'MISSION_ID_PLACEHOLDER'
    };
  }

  normalizeUnitInterval(value) {
    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
      return 0.5;
    }

    return Math.max(0, Math.min(1, numberValue));
  }

  saveAudioFile(arrayBuffer, metadata) {
    mkdirSync(this.outputDir, { recursive: true });

    const fileName = this.buildAudioFileName(metadata);
    const filePath = join(this.outputDir, fileName);
    writeFileSync(filePath, Buffer.from(arrayBuffer));

    return filePath;
  }

  buildAudioFileName(metadata) {
    const language = this.slugify(metadata.language);
    const voiceId = this.slugify(metadata.voiceId);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `voice-${voiceId}-${language}-${scriptFingerprint}.mp3`;
  }

  estimateDuration(targetDuration) {
    const seconds = Number.parseInt(String(targetDuration), 10);
    const normalizedSeconds = Number.isNaN(seconds) ? 60 : Math.max(1, seconds);

    return `${normalizedSeconds} seconds`;
  }

  registerAsset({ normalizedMetadata, audioFile, status, provider, error = null }) {
    this.assetRegistry.registerAsset({
      assetType: 'VOICE_AUDIO',
      businessId: normalizedMetadata.businessId,
      missionId: normalizedMetadata.missionId,
      workerId: this.workerId,
      status,
      metadata: {
        provider,
        language: normalizedMetadata.language,
        voiceId: normalizedMetadata.voiceId,
        audioFile,
        error
      }
    });
  }

  failGracefully(normalizedMetadata, reason) {
    const audioFile = this.saveFailurePlaceholder(normalizedMetadata);

    this.registerAsset({
      normalizedMetadata,
      audioFile,
      status: 'FAILED',
      provider: 'elevenlabs',
      error: reason
    });

    return {
      audioFile,
      estimatedDuration: this.estimateDuration(normalizedMetadata.targetDuration)
    };
  }

  saveFailurePlaceholder(metadata) {
    mkdirSync(this.outputDir, { recursive: true });

    const fileName = this.buildFailureFileName(metadata);
    const filePath = join(this.outputDir, fileName);
    writeFileSync(filePath, Buffer.from('VOICE_GENERATION_FAILED_PLACEHOLDER'));

    return filePath;
  }

  buildFailureFileName(metadata) {
    const language = this.slugify(metadata.language);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `voice-failed-${language}-${scriptFingerprint}.txt`;
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
      .slice(0, 12) || 'noscript';
  }
}

class ElevenLabsProductionAdapter extends ProductionAdapter {
  constructor({ fetchImpl = globalThis.fetch, ...options } = {}) {
    super({
      providerId: 'elevenlabs',
      ...options
    });
    this.fetchImpl = fetchImpl;
  }

  async authenticate({ secrets }) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch implementation unavailable.');
    }

    const apiKey = secrets.configuredSecrets.apiKey?.value;

    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error('ElevenLabs authentication failed.');
    }

    return {
      authenticated: true
    };
  }

  async execute({ request, configuration, secrets }) {
    const metadata = request.metadata ?? {};
    const endpoint = `${this.normalizeEndpoint(configuration.endpoint)}/${encodeURIComponent(metadata.voiceId)}`;
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': secrets.configuredSecrets.apiKey.value
      },
      body: JSON.stringify({
        text: metadata.script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: metadata.stability,
          similarity_boost: metadata.similarityBoost,
          style: metadata.style
        }
      })
    });

    if (!response?.ok) {
      const failure = new Error(`ElevenLabs request failed with status ${response?.status ?? 'UNKNOWN'}.`);
      failure.status = Number.parseInt(String(response?.status ?? 500), 10);
      failure.retryAfter = response?.headers?.get?.('retry-after') ?? null;
      throw failure;
    }

    return {
      audioBuffer: Buffer.from(await response.arrayBuffer())
    };
  }

  normalizeResponse(rawResponse) {
    return {
      audioBytes: rawResponse.audioBuffer
    };
  }

  normalizeEndpoint(endpoint) {
    return String(endpoint ?? '').replace(/\/+$/, '');
  }
}
