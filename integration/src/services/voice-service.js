import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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

    if (String(normalizedMetadata.script ?? '').length > 10000) {
      return this.synthesizeLongFormVoice(normalizedMetadata);
    }

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

  async synthesizeLongFormVoice(normalizedMetadata) {
    const scriptChunks = this.splitScriptIntoChunks(String(normalizedMetadata.script ?? ''), 9000);

    if (scriptChunks.length === 0) {
      return this.failGracefully(normalizedMetadata, 'ELEVENLABS_PROVIDER_FAILURE');
    }

    const tempDir = mkdtempSync(join(this.outputDir, 'elevenlabs-chunks-'));
    const chunkFiles = [];

    try {
      for (const [index, chunk] of scriptChunks.entries()) {
        const providerResponse = await this.providerAdapter.run({
          operation: 'synthesize_voice',
          metadata: {
            ...normalizedMetadata,
            script: chunk,
            targetDuration: Math.max(1, Math.ceil(Number.parseInt(String(normalizedMetadata.targetDuration ?? 60), 10) / scriptChunks.length))
          }
        });

        const chunkFile = join(tempDir, `chunk-${String(index + 1).padStart(3, '0')}.mp3`);
        writeFileSync(chunkFile, Buffer.from(providerResponse.audioBytes));
        chunkFiles.push(chunkFile);
      }

      const finalAudioFile = this.buildAudioFilePath(normalizedMetadata);
      this.concatAudioFiles(chunkFiles, finalAudioFile);

      this.registerAsset({
        normalizedMetadata,
        audioFile: finalAudioFile,
        status: 'GENERATED',
        provider: 'elevenlabs'
      });

      return {
        audioFile: finalAudioFile,
        estimatedDuration: this.estimateDuration(normalizedMetadata.targetDuration)
      };
    } catch (error) {
      return this.failGracefully(normalizedMetadata, this.buildFailureReason(error));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
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

    const filePath = this.buildAudioFilePath(metadata);
    writeFileSync(filePath, Buffer.from(arrayBuffer));

    return filePath;
  }

  buildAudioFilePath(metadata) {
    const fileName = this.buildAudioFileName(metadata);

    return join(this.outputDir, fileName);
  }

  splitScriptIntoChunks(script, maxChunkLength = 9000) {
    const normalizedScript = String(script ?? '').trim();

    if (normalizedScript.length === 0) {
      return [];
    }

    const sentences = normalizedScript
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);

    const chunks = [];
    let currentChunk = '';

    const pushChunk = chunk => {
      const trimmed = String(chunk ?? '').trim();
      if (trimmed.length > 0) {
        chunks.push(trimmed);
      }
    };

    const appendWithWordFallback = sentence => {
      const words = sentence.split(/\s+/).filter(Boolean);
      let working = '';

      for (const word of words) {
        const next = working.length === 0 ? word : `${working} ${word}`;

        if (next.length > maxChunkLength) {
          pushChunk(working);
          working = word;
          continue;
        }

        working = next;
      }

      pushChunk(working);
    };

    for (const sentence of sentences) {
      if (sentence.length > maxChunkLength) {
        if (currentChunk.length > 0) {
          pushChunk(currentChunk);
          currentChunk = '';
        }

        appendWithWordFallback(sentence);
        continue;
      }

      const candidate = currentChunk.length === 0 ? sentence : `${currentChunk} ${sentence}`;

      if (candidate.length > maxChunkLength) {
        pushChunk(currentChunk);
        currentChunk = sentence;
        continue;
      }

      currentChunk = candidate;
    }

    pushChunk(currentChunk);

    return chunks;
  }

  concatAudioFiles(audioFiles, outputFile) {
    const listFile = join(tmpdir(), `atlas-elevenlabs-concat-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
    const escapedEntries = audioFiles.map(filePath => `file '${String(filePath).replace(/'/g, "'\\''")}'`).join('\n');
    writeFileSync(listFile, escapedEntries);

    try {
      const concatResult = spawnSync('ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        outputFile
      ], { encoding: 'utf8' });

      if (concatResult.status !== 0) {
        throw new Error(concatResult.stderr ?? concatResult.stdout ?? 'Audio concatenation failed.');
      }
    } finally {
      rmSync(listFile, { force: true });
    }
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
      status: 'GENERATED',
      provider: 'local-fallback',
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

    const targetSeconds = Number.parseInt(String(metadata?.targetDuration ?? 60), 10);
    const normalizedSeconds = Number.isNaN(targetSeconds) ? 60 : Math.max(1, targetSeconds);
    const ffmpegResult = spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', String(normalizedSeconds),
      '-c:a', 'pcm_s16le',
      filePath
    ], { encoding: 'utf8' });

    if (ffmpegResult.status !== 0) {
      writeFileSync(filePath, this.buildSilentWavBuffer(normalizedSeconds));
    }

    return filePath;
  }

  buildFailureFileName(metadata) {
    const language = this.slugify(metadata.language);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `voice-fallback-${language}-${scriptFingerprint}.wav`;
  }

  buildSilentWavBuffer(durationSeconds) {
    const sampleRate = 44100;
    const channels = 2;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
    const dataSize = frameCount * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);

    return buffer;
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
