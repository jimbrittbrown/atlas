import { WorkerAssignment } from '../worker-assignment.js';

export class VoiceWorker {
  constructor({ programManager = null } = {}) {
    this.programManager = programManager;
  }

  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('VoiceWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = this.extractMetadata(task);
    const completionReport = {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      status: 'COMPLETED'
    };

    const result = {
      audioFile: this.buildAudioFileName(metadata),
      estimatedDuration: this.estimateDuration(metadata.targetDuration),
      status: 'COMPLETED',
      completionReport
    };

    assignment.complete(result, completionReport.completedAt);
    this.reportCompletion(assignment);

    return result;
  }

  extractMetadata(task) {
    const metadata = task.metadata ?? {};

    return {
      script: metadata.script ?? task.script ?? 'Script unavailable',
      voiceStyle: metadata.voiceStyle ?? task.voiceStyle ?? 'Neutral Narration',
      language: metadata.language ?? task.language ?? 'en-US',
      targetDuration: metadata.targetDuration ?? task.targetDuration ?? 60
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

  reportCompletion(assignment) {
    if (typeof this.programManager?.receiveCompletion === 'function') {
      this.programManager.receiveCompletion(assignment);
    }
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
