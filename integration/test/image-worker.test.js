import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { ImageWorker } from '../src/production/image-worker.js';

test('image worker accepts assignment and applies worker lifecycle', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-IMAGE-001',
    workerId: 'IMAGE-WORKER-001',
    taskId: 'TASK-IMAGE-001',
    result: {
      task: {
        metadata: {
          script: 'A storm breaks over the old lighthouse.',
          sceneDescription: 'Fog around abandoned lighthouse at night',
          artStyle: 'Dark Matte Painting',
          imageCount: 2
        }
      }
    }
  });
  const worker = new ImageWorker();

  await worker.execute(assignment);

  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
});

test('image worker generates deterministic placeholder image output', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-IMAGE-002',
    workerId: 'IMAGE-WORKER-001',
    taskId: 'TASK-IMAGE-002',
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
  const worker = new ImageWorker();

  const output = await worker.execute(assignment);

  assert.deepEqual(output.imageFiles, [
    'image-noir-illustration-narrowhallwa-01.png',
    'image-noir-illustration-narrowhallwa-02.png',
    'image-noir-illustration-narrowhallwa-03.png'
  ]);
  assert.deepEqual(output.generatedScenes, [
    'Narrow hallway with breathing shadows - shot 1 in Noir Illustration',
    'Narrow hallway with breathing shadows - shot 2 in Noir Illustration',
    'Narrow hallway with breathing shadows - shot 3 in Noir Illustration'
  ]);
  assert.equal(output.status, 'COMPLETED');
});

test('image worker reports completion through program manager', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-IMAGE-003',
    workerId: 'IMAGE-WORKER-001',
    taskId: 'TASK-IMAGE-003',
    result: {
      task: {
        metadata: {
          script: 'Cracked mirror reflects a second face.',
          sceneDescription: 'Cracked mirror in candlelit room',
          artStyle: 'Surreal Horror',
          imageCount: 1
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
  const worker = new ImageWorker({ programManager });

  const output = await worker.execute(assignment);

  assert.equal(completionCalls.length, 1);
  assert.equal(completionCalls[0], assignment);
  assert.deepEqual(output.completionReport, {
    assignmentId: 'ASG-IMAGE-003',
    workerId: 'IMAGE-WORKER-001',
    taskId: 'TASK-IMAGE-003',
    completedAt: 'COMPLETED_AT_PLACEHOLDER',
    status: 'COMPLETED'
  });
  assert.deepEqual(assignment.result, output);
});
