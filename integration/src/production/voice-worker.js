import { WorkerAssignment } from '../worker-assignment.js';
import { PlaceholderVoiceService } from '../services/voice-service.js';

export class VoiceWorker {
  constructor({ programManager = null, voiceService = null } = {}) {
    this.programManager = programManager;
    this.voiceService = voiceService ?? new PlaceholderVoiceService();
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
    const voiceOutput = this.voiceService.synthesizeVoice(metadata);

    const result = {
      audioFile: voiceOutput.audioFile,
      estimatedDuration: voiceOutput.estimatedDuration,
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

  reportCompletion(assignment) {
    if (typeof this.programManager?.receiveCompletion === 'function') {
      this.programManager.receiveCompletion(assignment);
    }
  }
}
