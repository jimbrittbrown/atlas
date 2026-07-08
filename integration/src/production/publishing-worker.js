import { WorkerAssignment } from '../worker-assignment.js';
import { PlaceholderPublishingService } from '../services/publishing-service.js';

export class PublishingWorker {
  constructor({ programManager = null, publishingService = null } = {}) {
    this.programManager = programManager;
    this.publishingService = publishingService ?? new PlaceholderPublishingService();
  }

  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('PublishingWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = this.extractMetadata(task);
    const validation = this.publishingService.validatePublishRequest(metadata);

    if (!validation.isValid) {
      const completionReport = this.buildCompletionReport(assignment, 'BLOCKED');
      const blockedResult = {
        publishId: this.publishingService.buildPublishId(assignment),
        platform: metadata.targetPlatform,
        publishStatus: 'BLOCKED_MISSING_ASSETS',
        publishUrl: null,
        completionReport
      };

      assignment.block(blockedResult, completionReport.completedAt);
      this.reportCompletion(assignment);

      return blockedResult;
    }

    const completionReport = this.buildCompletionReport(assignment, 'COMPLETED');
    const publishPackage = this.publishingService.preparePublishPackage({ assignment, metadata });
    const result = {
      publishId: publishPackage.publishId,
      platform: publishPackage.platform,
      publishStatus: publishPackage.publishStatus,
      publishUrl: publishPackage.publishUrl,
      completionReport
    };

    assignment.complete(result, completionReport.completedAt);
    this.reportCompletion(assignment);

    return result;
  }

  extractMetadata(task) {
    const metadata = task.metadata ?? {};

    return {
      videoAsset: metadata.videoAsset ?? task.videoAsset ?? null,
      thumbnailAsset: metadata.thumbnailAsset ?? task.thumbnailAsset ?? null,
      title: metadata.title ?? task.title ?? null,
      description: metadata.description ?? task.description ?? null,
      tags: Array.isArray(metadata.tags ?? task.tags) ? [...(metadata.tags ?? task.tags)] : [],
      targetPlatform: metadata.targetPlatform ?? task.targetPlatform ?? 'youtube',
      scheduledPublishTime: metadata.scheduledPublishTime ?? task.scheduledPublishTime ?? 'SCHEDULED_PUBLISH_TIME_PLACEHOLDER'
    };
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
}
