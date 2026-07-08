import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { YouTubeScriptWorker } from '../src/production/youtube-script-worker.js';

test('worker accepts assignment and applies worker lifecycle', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-YT-001',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    taskId: 'TASK-YT-001',
    result: {
      task: {
        metadata: {
          topic: 'Abandoned Children\'s Theme Park',
          audience: 'Teen Horror Fans',
          targetLength: 900,
          style: 'Psychological Horror'
        }
      }
    }
  });
  const worker = new YouTubeScriptWorker();

  await worker.execute(assignment);

  assert.equal(assignment.status, 'COMPLETED');
  assert.equal(assignment.startedAt, 'STARTED_AT_PLACEHOLDER');
  assert.equal(assignment.completedAt, 'COMPLETED_AT_PLACEHOLDER');
});

test('worker generates deterministic script output from task metadata', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-YT-002',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    taskId: 'TASK-YT-002',
    result: {
      task: {
        metadata: {
          topic: 'Possessed VHS Tape',
          audience: 'Late-night Horror Audience',
          targetLength: 1200,
          style: 'Found Footage'
        }
      }
    }
  });
  const worker = new YouTubeScriptWorker();

  const output = await worker.execute(assignment);

  assert.equal(output.scriptTitle, 'Found Footage Possessed VHS Tape for Late-night Horror Audience');
  assert.match(output.script, /Opening Hook:/);
  assert.match(output.script, /Act I:/);
  assert.match(output.script, /Act II:/);
  assert.match(output.script, /Act III:/);
  assert.equal(output.estimatedDuration, '8 minutes');
  assert.equal(output.status, 'COMPLETED');
});

test('worker reports completion details in completionReport', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-YT-003',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    taskId: 'TASK-YT-003',
    result: {
      task: {
        metadata: {
          topic: 'Shadow in the Nursery',
          audience: 'Short-form Horror Viewers',
          targetLength: 600,
          style: 'Cinematic Horror'
        }
      }
    }
  });
  const worker = new YouTubeScriptWorker();

  const output = await worker.execute(assignment);

  assert.deepEqual(output.completionReport, {
    assignmentId: 'ASG-YT-003',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    taskId: 'TASK-YT-003',
    completedAt: 'COMPLETED_AT_PLACEHOLDER',
    status: 'COMPLETED'
  });
  assert.deepEqual(assignment.result, output);
});
