import { WorkerAssignment } from '../worker-assignment.js';

export class ImageWorker {
  constructor({ programManager = null } = {}) {
    this.programManager = programManager;
  }

  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('ImageWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = this.extractMetadata(task);
    const imageCount = this.normalizeImageCount(metadata.imageCount);
    const completionReport = {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      status: 'COMPLETED'
    };

    const result = {
      imageFiles: this.buildImageFiles(metadata, imageCount),
      generatedScenes: this.buildGeneratedScenes(metadata, imageCount),
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
      sceneDescription: metadata.sceneDescription ?? task.sceneDescription ?? 'Generic Scene',
      artStyle: metadata.artStyle ?? task.artStyle ?? 'Cinematic Illustration',
      imageCount: metadata.imageCount ?? task.imageCount ?? 3
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

  fingerprint(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'scene';
  }
}
