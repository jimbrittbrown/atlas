import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { VideoWorker } from '../src/production/video-worker.js';

test('video worker accepts assignment and applies worker lifecycle', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VIDEO-001',
    workerId: 'VIDEO-WORKER-001',
    taskId: 'TASK-VIDEO-001',
    result: {
      task: {
        metadata: {
          script: 'A shadow moves across the corridor while the radio crackles.',
          voiceOutput: 'voice-cinematic-horror-en-us-ashadowmove.wav',
          imageOutputs: ['image-dark-matte-corridor-01.png'],
          targetFormat: 'mp4',
          targetResolution: '1920x1080'
        }
      }
    }
  });
  const worker = new VideoWorker();

  await worker.execute(assignment);

  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
});

test('video worker validates required inputs before assembly', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VIDEO-002',
    workerId: 'VIDEO-WORKER-001',
    taskId: 'TASK-VIDEO-002',
    result: {
      task: {
        metadata: {
          script: 'The lights flicker and then fail.',
          voiceOutput: '',
          imageOutputs: [],
          targetFormat: 'mp4',
          targetResolution: '1920x1080'
        }
      }
    }
  });
  const worker = new VideoWorker();

  const output = await worker.execute(assignment);

  assert.equal(output.status, 'BLOCKED');
  assert.equal(output.validation.isValid, false);
  assert.deepEqual(output.validation.missingInputs, ['voiceOutput', 'imageOutputs']);
  assert.equal(assignment.status, 'BLOCKED');
});

test('video worker assembles deterministic video package output', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VIDEO-003',
    workerId: 'VIDEO-WORKER-001',
    taskId: 'TASK-VIDEO-003',
    result: {
      task: {
        metadata: {
          script: 'An old tape recorder whispers names no one remembers.',
          voiceOutput: 'voice-neutral-narration-en-us-anoldtaperec.wav',
          imageOutputs: [
            'image-noir-illustration-tape-01.png',
            'image-noir-illustration-tape-02.png'
          ],
          targetFormat: 'mp4',
          targetResolution: '1080x1920'
        }
      }
    }
  });
  const worker = new VideoWorker();

  const output = await worker.execute(assignment);

  assert.equal(output.videoFile, 'video-1080x1920-anoldtaperec.mp4');
  assert.equal(output.duration, '4 seconds');
  assert.equal(output.validation.isValid, true);
  assert.equal(output.status, 'COMPLETED');
});

test('video worker reports completion through program manager', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VIDEO-004',
    workerId: 'VIDEO-WORKER-001',
    taskId: 'TASK-VIDEO-004',
    result: {
      task: {
        metadata: {
          script: 'The mirror cracks before the scream arrives.',
          voiceOutput: 'voice-whisper-narration-en-gb-mirrorcracks.wav',
          imageOutputs: ['image-surreal-horror-mirror-01.png'],
          targetFormat: 'mov',
          targetResolution: '1920x1080'
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
  const worker = new VideoWorker({ programManager });

  const output = await worker.execute(assignment);

  assert.equal(completionCalls.length, 1);
  assert.equal(completionCalls[0], assignment);
  assert.deepEqual(output.completionReport, {
    assignmentId: 'ASG-VIDEO-004',
    workerId: 'VIDEO-WORKER-001',
    taskId: 'TASK-VIDEO-004',
    completedAt: 'COMPLETED_AT_PLACEHOLDER',
    status: 'COMPLETED'
  });
  assert.deepEqual(assignment.result, output);
});
