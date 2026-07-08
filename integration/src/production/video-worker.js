import { WorkerAssignment } from '../worker-assignment.js';

export class VideoWorker {
  constructor({ programManager = null } = {}) {
    this.programManager = programManager;
  }

  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('VideoWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = this.extractMetadata(task);
    const validation = this.validateInputs(metadata);

    if (!validation.isValid) {
      const blockedCompletionReport = this.buildCompletionReport(assignment, 'BLOCKED');
      const blockedResult = {
        videoFile: null,
        duration: '0 seconds',
        validation,
        status: 'BLOCKED',
        completionReport: blockedCompletionReport
      };

      assignment.block(blockedResult, blockedCompletionReport.completedAt);
      this.reportCompletion(assignment);

      return blockedResult;
    }

    const completionReport = this.buildCompletionReport(assignment, 'COMPLETED');
    const result = {
      videoFile: this.buildVideoFileName(metadata),
      duration: this.estimateDuration(metadata.script),
      validation,
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
      script: metadata.script ?? task.script ?? null,
      voiceOutput: metadata.voiceOutput ?? task.voiceOutput ?? null,
      imageOutputs: metadata.imageOutputs ?? task.imageOutputs ?? null,
      targetFormat: metadata.targetFormat ?? task.targetFormat ?? 'mp4',
      targetResolution: metadata.targetResolution ?? task.targetResolution ?? '1920x1080'
    };
  }

  validateInputs(metadata) {
    const checks = {
      script: this.isNonEmptyString(metadata.script),
      voiceOutput: this.isNonEmptyString(metadata.voiceOutput),
      imageOutputs: Array.isArray(metadata.imageOutputs) && metadata.imageOutputs.length > 0,
      targetFormat: this.isNonEmptyString(metadata.targetFormat),
      targetResolution: this.isNonEmptyString(metadata.targetResolution)
    };
    const missingInputs = Object.entries(checks)
      .filter(([, isPresent]) => !isPresent)
      .map(([name]) => name);

    return {
      isValid: missingInputs.length === 0,
      missingInputs,
      checkedInputs: checks
    };
  }

  buildVideoFileName(metadata) {
    const format = this.slugify(metadata.targetFormat);
    const resolution = this.slugify(metadata.targetResolution);
    const scriptFingerprint = this.fingerprint(metadata.script);

    return `video-${resolution}-${scriptFingerprint}.${format}`;
  }

  estimateDuration(script) {
    const words = String(script)
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const seconds = Math.max(1, Math.ceil(words / 2.5));

    return `${seconds} seconds`;
  }

  buildCompletionReport(assignment, status) {
    return {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      status
    };
  }

  reportCompletion(assignment) {
    if (typeof this.programManager?.receiveCompletion === 'function') {
      this.programManager.receiveCompletion(assignment);
    }
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

  fingerprint(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'noscript';
  }
}
