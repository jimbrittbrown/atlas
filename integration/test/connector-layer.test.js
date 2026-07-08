import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { VoiceWorker } from '../src/production/voice-worker.js';
import { ImageWorker } from '../src/production/image-worker.js';
import { PublishingWorker } from '../src/production/publishing-worker.js';
import { PlaceholderVoiceService } from '../src/services/voice-service.js';
import { PlaceholderImageService } from '../src/services/image-service.js';
import { PlaceholderPublishingService } from '../src/services/publishing-service.js';

test('workers call service interfaces for production operations', async () => {
  const calls = [];
  const voiceService = {
    synthesizeVoice(metadata) {
      calls.push({ type: 'voice', metadata });
      return {
        audioFile: 'voice-service-output.wav',
        estimatedDuration: '42 seconds'
      };
    }
  };
  const imageService = {
    generateImages(metadata) {
      calls.push({ type: 'image', metadata });
      return {
        imageFiles: ['image-service-01.png'],
        generatedScenes: ['Scene 1 from image service']
      };
    }
  };
  const publishingService = {
    validatePublishRequest(metadata) {
      calls.push({ type: 'publish-validate', metadata });
      return {
        isValid: true,
        missingFields: [],
        checkedFields: {
          videoAsset: true,
          thumbnailAsset: true,
          title: true,
          description: true,
          targetPlatform: true
        }
      };
    },
    preparePublishPackage({ assignment, metadata }) {
      calls.push({ type: 'publish-prepare', assignmentId: assignment.assignmentId, metadata });
      return {
        publishId: `PUBLISH-${assignment.assignmentId}`,
        platform: metadata.targetPlatform,
        publishStatus: 'SCHEDULED',
        publishUrl: 'https://publish.placeholder/test/publish-asg'
      };
    },
    buildPublishId(assignment) {
      return `PUBLISH-${assignment.assignmentId}`;
    }
  };

  const voiceWorker = new VoiceWorker({ voiceService });
  const imageWorker = new ImageWorker({ imageService });
  const publishingWorker = new PublishingWorker({ publishingService });

  const voiceAssignment = new WorkerAssignment({
    assignmentId: 'ASG-INFRA-VOICE',
    workerId: 'VOICE-WORKER-001',
    taskId: 'TASK-INFRA-VOICE',
    result: {
      task: {
        metadata: {
          script: 'Script body',
          voiceStyle: 'Narration',
          language: 'en-US',
          targetDuration: 42
        }
      }
    }
  });
  const imageAssignment = new WorkerAssignment({
    assignmentId: 'ASG-INFRA-IMAGE',
    workerId: 'IMAGE-WORKER-001',
    taskId: 'TASK-INFRA-IMAGE',
    result: {
      task: {
        metadata: {
          script: 'Script body',
          sceneDescription: 'Main scene',
          artStyle: 'Noir',
          imageCount: 1
        }
      }
    }
  });
  const publishingAssignment = new WorkerAssignment({
    assignmentId: 'ASG-INFRA-PUBLISH',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-INFRA-PUBLISH',
    result: {
      task: {
        metadata: {
          videoAsset: 'video.mp4',
          thumbnailAsset: 'thumb.png',
          title: 'Title',
          description: 'Description',
          tags: ['atlas'],
          targetPlatform: 'youtube',
          scheduledPublishTime: '2026-07-08T20:00:00Z'
        }
      }
    }
  });

  const voiceResult = await voiceWorker.execute(voiceAssignment);
  const imageResult = await imageWorker.execute(imageAssignment);
  const publishingResult = await publishingWorker.execute(publishingAssignment);

  assert.equal(voiceResult.audioFile, 'voice-service-output.wav');
  assert.equal(imageResult.imageFiles[0], 'image-service-01.png');
  assert.equal(publishingResult.publishStatus, 'SCHEDULED');
  assert.deepEqual(calls.map(call => call.type), [
    'voice',
    'image',
    'publish-validate',
    'publish-prepare'
  ]);
});

test('placeholder services preserve deterministic worker behavior', async () => {
  const voiceWorker = new VoiceWorker({ voiceService: new PlaceholderVoiceService() });
  const imageWorker = new ImageWorker({ imageService: new PlaceholderImageService() });
  const publishingWorker = new PublishingWorker({ publishingService: new PlaceholderPublishingService() });

  const voiceAssignment = new WorkerAssignment({
    assignmentId: 'ASG-INFRA-001',
    workerId: 'VOICE-WORKER-001',
    taskId: 'TASK-INFRA-001',
    result: {
      task: {
        metadata: {
          script: 'The hallway lights flickered at midnight.',
          voiceStyle: 'Whisper Narration',
          language: 'en-GB',
          targetDuration: 90
        }
      }
    }
  });
  const imageAssignment = new WorkerAssignment({
    assignmentId: 'ASG-INFRA-002',
    workerId: 'IMAGE-WORKER-001',
    taskId: 'TASK-INFRA-002',
    result: {
      task: {
        metadata: {
          script: 'The hallway narrows as shadows breathe.',
          sceneDescription: 'Narrow hallway with breathing shadows',
          artStyle: 'Noir Illustration',
          imageCount: 3
        }
      }
    }
  });
  const publishingAssignment = new WorkerAssignment({
    assignmentId: 'ASG-INFRA-003',
    workerId: 'PUBLISHING-WORKER-001',
    taskId: 'TASK-INFRA-003',
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

  const voiceOutput = await voiceWorker.execute(voiceAssignment);
  const imageOutput = await imageWorker.execute(imageAssignment);
  const publishingOutput = await publishingWorker.execute(publishingAssignment);

  assert.equal(voiceOutput.audioFile, 'voice-whisper-narration-en-gb-thehallwayli.wav');
  assert.equal(voiceOutput.estimatedDuration, '90 seconds');
  assert.deepEqual(imageOutput.imageFiles, [
    'image-noir-illustration-narrowhallwa-01.png',
    'image-noir-illustration-narrowhallwa-02.png',
    'image-noir-illustration-narrowhallwa-03.png'
  ]);
  assert.equal(publishingOutput.publishId, 'PUBLISH-ASG-INFRA-003');
  assert.equal(publishingOutput.publishStatus, 'SCHEDULED');
  assert.equal(publishingOutput.publishUrl, 'https://publish.placeholder/youtube-shorts/publish-asg-infra-003');
});
