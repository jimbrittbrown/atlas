import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { PublishingWorker } from '../src/production/publishing-worker.js';
import { PlaceholderPublishingService } from '../src/services/publishing-service.js';

test('publishing worker accepts assignment and applies worker lifecycle', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-PUBLISH-001',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-PUBLISH-001',
    result: {
      task: {
        metadata: {
          videoAsset: 'ASSET-VIDEO-001',
          thumbnailAsset: 'ASSET-THUMB-001',
          title: 'The Haunted Archive - Episode 1',
          description: 'A late-night investigation into an abandoned archive.',
          tags: ['horror', 'shorts', 'atlas'],
          targetPlatform: 'youtube',
          scheduledPublishTime: '2026-07-09T18:00:00Z'
        }
      }
    }
  });
  const worker = new PublishingWorker({
    publishingService: new PlaceholderPublishingService()
  });

  await worker.execute(assignment);

  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
});

test('publishing worker validates required publishing assets', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-PUBLISH-002',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-PUBLISH-002',
    result: {
      task: {
        metadata: {
          videoAsset: '',
          thumbnailAsset: '',
          title: 'Broken publish package',
          description: 'Assets are missing and should block publishing.',
          tags: ['horror'],
          targetPlatform: 'youtube',
          scheduledPublishTime: '2026-07-10T18:00:00Z'
        }
      }
    }
  });
  const worker = new PublishingWorker({
    publishingService: new PlaceholderPublishingService()
  });

  const output = await worker.execute(assignment);

  assert.equal(output.publishStatus, 'BLOCKED_MISSING_ASSETS');
  assert.equal(output.publishUrl, null);
  assert.equal(assignment.status, 'BLOCKED');
});

test('publishing worker generates deterministic publish package output', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-PUBLISH-003',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-PUBLISH-003',
    result: {
      task: {
        metadata: {
          videoAsset: 'ASSET-VIDEO-003',
          thumbnailAsset: 'ASSET-THUMB-003',
          title: 'The Bell Tower Signal',
          description: 'Signal interruptions escalate into a supernatural event.',
          tags: ['horror', 'signal', 'shorts'],
          targetPlatform: 'youtube-shorts',
          scheduledPublishTime: '2026-07-11T20:30:00Z'
        }
      }
    }
  });
  const worker = new PublishingWorker({
    publishingService: new PlaceholderPublishingService()
  });

  const output = await worker.execute(assignment);

  assert.equal(output.publishId, 'PUBLISH-ASG-PUBLISH-003');
  assert.equal(output.platform, 'youtube-shorts');
  assert.equal(output.publishStatus, 'SCHEDULED');
  assert.equal(output.publishUrl, 'https://publish.placeholder/youtube-shorts/publish-asg-publish-003');
});

test('publishing worker reports completion through program manager', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-PUBLISH-004',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-PUBLISH-004',
    result: {
      task: {
        metadata: {
          videoAsset: 'ASSET-VIDEO-004',
          thumbnailAsset: 'ASSET-THUMB-004',
          title: 'Doorway Under the Station',
          description: 'A hidden doorway opens under a closed station.',
          tags: ['horror', 'station'],
          targetPlatform: 'youtube',
          scheduledPublishTime: '2026-07-12T21:00:00Z'
        }
      }
    }
  });
  const completionCalls = [];
  const programManager = {
    receiveCompletion(completedAssignment) {
      completionCalls.push(completedAssignment);
      return {
        completionPercentage: 100,
        executiveStatus: 'COMPLETE'
      };
    }
  };
  const worker = new PublishingWorker({
    programManager,
    publishingService: new PlaceholderPublishingService()
  });

  const output = await worker.execute(assignment);

  assert.equal(completionCalls.length, 1);
  assert.equal(completionCalls[0], assignment);
  assert.deepEqual(output.completionReport, {
    assignmentId: 'ASG-PUBLISH-004',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-PUBLISH-004',
    completedAt: 'COMPLETED_AT_PLACEHOLDER',
    status: 'COMPLETED'
  });
  assert.deepEqual(assignment.result, output);
});

test('publishing worker blocks assignment when provider publish fails', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-PUBLISH-005',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-PUBLISH-005',
    result: {
      task: {
        metadata: {
          videoAsset: 'video.mp4',
          thumbnailAsset: 'thumb.png',
          title: 'Publishing failure path',
          description: 'Provider publish failure should block mission flow.',
          tags: ['atlas'],
          targetPlatform: 'youtube'
        }
      }
    }
  });
  const worker = new PublishingWorker({
    publishingService: {
      validatePublishRequest() {
        return {
          isValid: true,
          missingFields: [],
          checkedFields: {
            videoAsset: true,
            title: true,
            description: true,
            targetPlatform: true
          }
        };
      },
      async preparePublishPackage() {
        return {
          publishId: 'PUBLISH-ASG-PUBLISH-005',
          platform: 'youtube',
          publishStatus: 'FAILED',
          publishUrl: null,
          error: 'YOUTUBE_HTTP_500'
        };
      },
      buildPublishId(currentAssignment) {
        return `PUBLISH-${currentAssignment.assignmentId}`;
      }
    }
  });

  const output = await worker.execute(assignment);

  assert.equal(output.publishStatus, 'FAILED');
  assert.equal(output.error, 'YOUTUBE_HTTP_500');
  assert.equal(assignment.status, 'BLOCKED');
});
