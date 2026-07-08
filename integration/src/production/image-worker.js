import { WorkerAssignment } from '../worker-assignment.js';
import { PlaceholderImageService } from '../services/image-service.js';

export class ImageWorker {
  constructor({ programManager = null, imageService = null } = {}) {
    this.programManager = programManager;
    this.imageService = imageService ?? new PlaceholderImageService();
  }

  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('ImageWorker requires a WorkerAssignment instance.');
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
    const imageOutput = this.imageService.generateImages(metadata);

    const result = {
      imageFiles: imageOutput.imageFiles,
      generatedScenes: imageOutput.generatedScenes,
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

  reportCompletion(assignment) {
    if (typeof this.programManager?.receiveCompletion === 'function') {
      this.programManager.receiveCompletion(assignment);
    }
  }
}
