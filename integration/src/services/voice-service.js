import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetRegistry } from '../asset-registry.js';

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
    outputDir = '/tmp/atlas/generated-audio',
    timeoutMs = 15000,
    maxRetries = 2,
    retryBaseDelayMs = 250,
    assetRegistry = null,
    fetchImpl = globalThis.fetch,
    workerId = 'VOICE-WORKER-001'
  } = {}) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.outputDir = outputDir;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.assetRegistry = assetRegistry ?? new AssetRegistry();
    this.fetchImpl = fetchImpl;
    this.workerId = workerId;
  }

  async synthesizeVoice(metadata = {}) {
    const normalizedMetadata = this.normalizeMetadata(metadata);

    if (!this.isConfigured()) {
      return this.failGracefully(normalizedMetadata, 'ELEVENLABS_API_KEY is not configured.');
    }

    if (typeof this.fetchImpl !== 'function') {
      return this.failGracefully(normalizedMetadata, 'Fetch implementation unavailable.');
    }

    const endpoint = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(normalizedMetadata.voiceId)}`;
    const requestBody = {
      text: normalizedMetadata.script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: normalizedMetadata.stability,
        similarity_boost: normalizedMetadata.similarityBoost,
        style: normalizedMetadata.style
      }
    };

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      attempt += 1;

      try {
        const response = await this.performRequest({ endpoint, requestBody });

        if (response.ok) {
          const audioFile = this.saveAudioFile(await response.arrayBuffer(), normalizedMetadata);

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
        }

        const retryAfterHeader = this.readRetryAfter(response);
        const retriable = this.isRetriableStatus(response.status);

        if (retriable && attempt <= this.maxRetries + 1) {
          await this.wait(this.computeDelayMs({ attempt, retryAfterHeader }));
          continue;
        }

        return this.failGracefully(
          normalizedMetadata,
          `ElevenLabs request failed with status ${response.status}.`
        );
      } catch (error) {
        if (attempt <= this.maxRetries + 1) {
          await this.wait(this.computeDelayMs({ attempt }));
          continue;
        }

        return this.failGracefully(normalizedMetadata, error.message ?? 'ElevenLabs request failed.');
      }
    }

    return this.failGracefully(normalizedMetadata, 'ElevenLabs request exhausted retries.');
  }

  async performRequest({ endpoint, requestBody }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('ElevenLabs request timed out.');
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.trim().length > 0;
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

  isRetriableStatus(status) {
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }

  readRetryAfter(response) {
    const retryAfterHeader = response.headers?.get?.('retry-after');
    const seconds = Number.parseInt(String(retryAfterHeader ?? ''), 10);

    return Number.isNaN(seconds) ? null : seconds;
  }

  computeDelayMs({ attempt, retryAfterHeader = null }) {
    if (retryAfterHeader !== null) {
      return Math.max(0, retryAfterHeader * 1000);
    }

    return this.retryBaseDelayMs * Math.max(1, attempt);
  }

  wait(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
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
