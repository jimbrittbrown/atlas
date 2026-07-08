import { WorkerAssignment } from '../worker-assignment.js';

export class YouTubeScriptWorker {
  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('YouTubeScriptWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = this.extractMetadata(task);
    const scriptTitle = `${metadata.style} ${metadata.topic} for ${metadata.audience}`;
    const script = this.buildScript(metadata);
    const estimatedDuration = this.estimateDuration(metadata.targetLength);
    const completionReport = {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      status: 'COMPLETED'
    };

    const result = {
      scriptTitle,
      script,
      estimatedDuration,
      status: 'COMPLETED',
      completionReport
    };

    assignment.complete(result, completionReport.completedAt);

    return result;
  }

  extractMetadata(task) {
    const metadata = task.metadata ?? {};

    return {
      topic: metadata.topic ?? task.topic ?? 'Unknown Topic',
      audience: metadata.audience ?? task.audience ?? 'General Audience',
      targetLength: metadata.targetLength ?? task.targetLength ?? 900,
      style: metadata.style ?? task.style ?? 'Cinematic Horror'
    };
  }

  buildScript(metadata) {
    return [
      `Opening Hook: Tonight, ${metadata.audience} enters ${metadata.topic}.`,
      `Act I: Establish a ${metadata.style} atmosphere and isolate the protagonist.`,
      `Act II: Escalate dread with irreversible clues tied to ${metadata.topic}.`,
      `Act III: Deliver a final twist that rewards attentive viewers and sets sequel potential.`,
      'Call to Action: Ask viewers to subscribe for the next episode.'
    ].join(' ');
  }

  estimateDuration(targetLength) {
    const words = Number.parseInt(String(targetLength), 10);
    const normalizedWords = Number.isNaN(words) ? 900 : words;

    return `${Math.max(1, Math.ceil(normalizedWords / 150))} minutes`;
  }
}
