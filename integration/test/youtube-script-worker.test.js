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
  assert.equal(typeof output.script, 'string');
  assert.equal(output.script.length > 0, true);
  assert.equal(output.script.includes('Beat 1:'), false);
  assert.equal(output.script.includes('BEAT-001'), false);
  assert.equal(output.script.includes('producer brief'), false);
  assert.equal(output.script.includes('storytelling plan'), false);
  assert.equal(output.estimatedDuration, '8 minutes');
  assert.equal(output.status, 'COMPLETED');
});

test('worker uses documentary reasoning guidance and keeps planning language internal', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-YT-004',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    taskId: 'TASK-YT-004',
    result: {
      task: {
        metadata: {
          topic: 'Financial Crisis Documentary',
          audience: 'General Audience',
          targetLength: 900,
          style: 'Investigative Documentary',
          producerBrief: {
            documentaryObjective: 'Explain systemic failures and policy consequences.',
            desiredEmotionalJourney: 'intrigue, concern, urgency, sober reflection'
          },
          researchPackage: {
            centralQuestion: 'Why did warnings fail to prevent collapse?',
            editorialResearchBrief: [
              'Editorial Research Brief',
              '',
              'Senior Executive Research Director:',
              '',
              '1. What story are we really telling? We are telling a story about systems drifting into danger while everyone sounds rational.',
              '2. Why is this story worth six minutes of someone\'s life? Because the pattern is still alive in present-day decision-making.',
              '3. What should the audience believe at the beginning? They should think this was an isolated crisis that belongs to the past.',
              '4. What should they realize halfway through? They should realize the collapse was a chain reaction, not a single accident.',
              '5. What should completely change their understanding? They should move from event-thinking to system-thinking.',
              '6. What emotional journey should they experience? Move from curiosity to tension to sober urgency.',
              '7. What single idea must never be lost while writing? Incentives that reward denial can overpower intelligence.',
              '8. What mistake would ruin this documentary? Turning it into a timeline recital would ruin it.',
              '9. What should the writer avoid? Avoid false certainty, technical grandstanding, and easy villains.',
              '10. What should the audience still be thinking about after the credits? If the same pressures appear again, what are we refusing to see?'
            ].join('\n'),
            topOpeningCandidates: [
              { findingText: 'In 2008, liquidity vanished faster than regulators could map the risk.' }
            ],
            highestStoryValueFacts: [
              { findingText: 'Short-term funding markets froze within days, forcing emergency interventions.' }
            ],
            evidenceReasoningMatrix: {
              'VERIFIED FACT': [
                { statement: 'Liquidity vanished faster than regulators could map the risk.' }
              ],
              'SUPPORTED INTERPRETATION': [
                { statement: 'The evidence supports the interpretation that incentives rewarded short-term stability over long-term resilience.' }
              ],
              'COMPETING INTERPRETATIONS': [
                { statement: 'A competing interpretation argues this was primarily a legal-constraint failure, not a supervisory-blind-spot failure.' }
              ],
              'OPEN QUESTION': [
                { question: 'Which unresolved leverage channels still threaten systemic stability?' }
              ]
            },
            documentaryJudgmentBriefing: {
              mostSurprisingFact: { findingText: 'The institutions with the most sophisticated models misread correlated risk.' },
              misconceptionToCorrect: { viewpointSummary: 'The crisis was not a single-bank event; it was a system-wide design failure.' },
              endingFacts: [
                { findingText: 'Post-crisis reforms improved transparency, but unresolved leverage migrated elsewhere.' }
              ],
              unansweredQuestionToKeepViewersWatching: 'If leverage migrated, where is the next fault line?' 
            }
          },
          storytellingPlan: {
            narrativeBeats: [
              {
                beatId: 'BEAT-001',
                beatObjective: 'Open with consequence.',
                narrationObjective: 'Introduce the core mystery.',
                supportingResearchFacts: [
                  { findingText: 'Funding stress reached multiple markets in the same week.' }
                ],
                transitionIntoNextBeat: 'Bridge from BEAT-001 into BEAT-002 by escalating unanswered implications.'
              }
            ]
          }
        }
      }
    }
  });

  const worker = new YouTubeScriptWorker();
  const output = await worker.execute(assignment);

  assert.equal(typeof output.script, 'string');
  assert.equal(output.script.includes('When Lehman Brothers collapsed'), true);
  assert.equal(output.script.includes('The deeper investigators looked'), true);
  assert.equal(output.script.includes('What the record clearly establishes is this:'), false);
  assert.equal(output.script.includes('A reasonable interpretation of that evidence is this:'), false);
  assert.equal(output.script.includes('Another interpretation remains in active dispute:'), false);
  assert.equal(output.script.includes('In 2008, liquidity vanished faster than regulators could map the risk.'), false);
  assert.equal(output.script.toLowerCase().includes('the audience should'), false);
  assert.equal(output.script.toLowerCase().includes('emotional journey'), false);
  assert.equal(output.script.includes('BEAT-001'), false);
  assert.equal(output.script.includes('narration objective'), false);
  assert.equal(output.script.includes('producer brief'), false);
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

test('worker applies writer room revision requests to prior draft', async () => {
  const assignment = new WorkerAssignment({
    assignmentId: 'ASG-YT-005',
    workerId: 'YOUTUBE-SCRIPT-WORKER-001',
    taskId: 'TASK-YT-005',
    result: {
      task: {
        metadata: {
          topic: 'Financial Crisis Documentary',
          audience: 'General Audience',
          targetLength: 900,
          style: 'Investigative Documentary',
          previousDraft: [
            'When Lehman Brothers collapsed, the audience should recognize how fragile the system had become.',
            'Inside boardrooms, executives defended positions they called temporary.'
          ].join('\n\n'),
          revisionRequests: [
            {
              requestId: 'REV-001',
              issueType: 'production-note-language',
              paragraphIndex: 1,
              priority: 'HIGH',
              reason: 'Directive language breaks narrator voice.',
              request: 'Rewrite sentence in documentary narration voice.'
            }
          ]
        }
      }
    }
  });

  const worker = new YouTubeScriptWorker();
  const output = await worker.execute(assignment);

  assert.equal(typeof output.script, 'string');
  assert.equal(output.script.toLowerCase().includes('the audience should'), false);
  assert.equal(output.script.includes('Inside boardrooms, executives defended positions they called temporary.'), true);
});
