import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerAssignment } from '../src/worker-assignment.js';
import { ScreenplayComposerWorker } from '../src/production/screenplay-composer-worker.js';
import { LanguageRealizationValidator } from '../src/production/language-realization-validator.js';

test('screenplay composer removes planning leakage in initial composition', async () => {
  const worker = new ScreenplayComposerWorker();
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-SC-001',
    workerId: 'SCREENPLAY-COMPOSER-001',
    taskId: 'TASK-SCREENPLAY-COMPOSITION',
    result: {
      task: {
        metadata: {
          planningScript: [
            'Inside boardrooms, executives defended positions they called temporary.',
            'Show who acted, what decision was made, and who absorbed the consequence.',
            'The tone remains urgency and sober reflection.'
          ].join(' '),
          researchPackage: {
            highestStoryValueFacts: [
              { findingText: 'Inside boardrooms, executives defended positions they called temporary.' }
            ]
          }
        }
      }
    }
  });

  const output = await worker.execute(assignment);

  assert.equal(typeof output.script, 'string');
  assert.equal(/show who acted/i.test(output.script), false);
  assert.equal(/the tone remains/i.test(output.script), false);
  assert.equal(output.script.includes('Inside boardrooms, executives defended positions they called temporary.'), true);
});

test('screenplay composer handles revision pass with rewrite mode', async () => {
  const worker = new ScreenplayComposerWorker();
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-SC-002',
    workerId: 'SCREENPLAY-COMPOSER-001',
    taskId: 'TASK-SCREENPLAY-REVISION-1',
    result: {
      task: {
        metadata: {
          previousComposedScript: [
            'From 2000 to 2029, the names changed and pressure kept returning.',
            'The audience should keep asking whether the same pattern is here today.'
          ].join('\n\n'),
          revisionRequests: [
            {
              requestId: 'REV-001',
              issueType: 'production-note-language',
              paragraphIndex: 2
            }
          ],
          writerResponses: [
            {
              requestId: 'REV-001',
              revisionMode: 'REWRITE',
              decision: 'accept'
            }
          ],
          researchPackage: {
            highestStoryValueFacts: [
              { findingText: 'From 2000 to 2029, the names changed and pressure kept returning.' }
            ]
          }
        }
      }
    }
  });

  const output = await worker.execute(assignment);

  assert.equal(typeof output.script, 'string');
  assert.equal(/the audience should/i.test(output.script), false);
  assert.equal(/keep narration/i.test(output.script), false);
});

test('language realization validator flags prohibited planning language', () => {
  const validator = new LanguageRealizationValidator();
  const result = validator.validate({
    script: 'The purpose is to keep narration in voice. The tone remains urgent.',
    researchPackage: {
      highestStoryValueFacts: [{ findingText: 'Lehman Brothers collapsed in 2008.' }]
    }
  });

  assert.equal(result.passed, false);
  assert.equal(Array.isArray(result.issues), true);
  assert.equal(result.issues.length > 0, true);
  assert.equal(result.checks.noProhibitedLanguage, false);
});
