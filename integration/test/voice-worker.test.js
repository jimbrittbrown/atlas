import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { VoiceWorker } from '../src/production/voice-worker.js';

test('voice worker accepts assignment and applies worker lifecycle', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VOICE-001',
    workerId: 'VOICE-WORKER-001',
    taskId: 'TASK-VOICE-001',
    result: {
      task: {
        metadata: {
          script: 'Welcome to tonight\'s ghost story.',
          voiceStyle: 'Cinematic Horror',
          language: 'en-US',
          targetDuration: 75
        }
      }
    }
  });
  const worker = new VoiceWorker();

  await worker.execute(assignment);

  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
});

test('voice worker generates deterministic placeholder audio output', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VOICE-002',
    workerId: 'VOICE-WORKER-001',
    taskId: 'TASK-VOICE-002',
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
  const worker = new VoiceWorker();

  const output = await worker.execute(assignment);

  assert.equal(output.audioFile, 'voice-whisper-narration-en-gb-thehallwayli.wav');
  assert.equal(output.estimatedDuration, '90 seconds');
  assert.equal(output.status, 'COMPLETED');
});

test('voice worker reports completion through program manager', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-VOICE-003',
    workerId: 'VOICE-WORKER-001',
    taskId: 'TASK-VOICE-003',
    result: {
      task: {
        metadata: {
          script: 'Do not look behind the door.',
          voiceStyle: 'Neutral Narration',
          language: 'es-ES',
          targetDuration: 45
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
  const worker = new VoiceWorker({ programManager });

  const output = await worker.execute(assignment);

  assert.equal(completionCalls.length, 1);
  assert.equal(completionCalls[0], assignment);
  assert.deepEqual(output.completionReport, {
    assignmentId: 'ASG-VOICE-003',
    workerId: 'VOICE-WORKER-001',
    taskId: 'TASK-VOICE-003',
    completedAt: 'COMPLETED_AT_PLACEHOLDER',
    status: 'COMPLETED'
  });
  assert.deepEqual(assignment.result, output);
});
