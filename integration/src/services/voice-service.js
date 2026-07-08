export class VoiceService {
  synthesizeVoice() {
    throw new Error('VoiceService.synthesizeVoice must be implemented by a provider.');
  }
}

export class PlaceholderVoiceService extends VoiceService {
  synthesizeVoice(metadata = {}) {
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
