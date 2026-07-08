import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveBriefingEngine } from '../src/executive/executive-briefing-engine.js';

test('briefing generated from enterprise state', () => {
  const engine = new ExecutiveBriefingEngine();

  const result = engine.build({
    enterpriseState: {
      enterpriseHealth: 'UNKNOWN',
      activeMissions: [
        { id: 'M-001', title: 'Launch Voice Provider Evaluation', status: 'IN_PROGRESS' },
        { id: 'M-002', title: 'Prepare Publishing Rollout', status: 'PENDING' }
      ],
      outstandingDecisions: [
        { id: 'D-001', title: 'Approve new voice provider', owner: 'CEO' }
      ],
      recentCompletions: [
        { id: 'C-001', title: 'Quality review completed' }
      ]
    }
  });

  assert.equal(result.executiveHealth, 'ATTENTION_REQUIRED');
  assert.equal(result.activeMissions, 2);
  assert.equal(result.completedWork, 1);
  assert.equal(Array.isArray(result.currentRisks), true);
  assert.equal(typeof result.executiveSummary, 'string');
});

test('outstanding decisions are summarized in briefing', () => {
  const engine = new ExecutiveBriefingEngine();

  const result = engine.build({
    outstandingDecisions: [
      { id: 'D-100', title: 'Select external voice provider', owner: 'CEO', status: 'PENDING' },
      { id: 'D-101', question: 'Which publishing path is approved?', owner: 'Executive Office' }
    ]
  });

  assert.deepEqual(result.outstandingDecisions, [
    {
      decisionId: 'D-100',
      title: 'Select external voice provider',
      status: 'PENDING',
      owner: 'CEO'
    },
    {
      decisionId: 'D-101',
      title: 'Which publishing path is approved?',
      status: 'PENDING',
      owner: 'Executive Office'
    }
  ]);
  assert.equal(result.currentRisks[0].code, 'OUTSTANDING_DECISIONS');
});

test('briefing recommends next action deterministically', () => {
  const engine = new ExecutiveBriefingEngine();

  const result = engine.build({
    activeMissions: [
      { id: 'M-200', title: 'Complete mission handoff', status: 'IN_PROGRESS' }
    ],
    recentCompletions: [
      { id: 'C-200', title: 'Mission runner completed' }
    ]
  });

  assert.equal(result.recommendedNextAction, 'Continue executing active missions and monitor completion milestones.');
  assert.equal(result.executiveHealth, 'HEALTHY');
});
