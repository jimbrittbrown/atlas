import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveOfficeDashboard } from '../src/executive/executive-office-dashboard.js';

test('builds executive office dashboard from workflow mission objects', () => {
  const dashboard = new ExecutiveOfficeDashboard();

  const result = dashboard.build({
    workflowResults: [
      {
        mission: { id: 'VM-001', status: 'MISSION_CREATED' },
        decisionPackage: {
          recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION',
          confidence: 84
        },
        review: {
          additionalInvestigationRequired: true,
          updatedRecommendation: 'REQUIRES_ADDITIONAL_INVESTIGATION',
          investigationRequests: [
            { id: 'INVREQ-001' },
            { id: 'INVREQ-002' }
          ]
        }
      },
      {
        mission: { id: 'VM-002', status: 'MISSION_CREATED' },
        decisionPackage: {
          recommendation: 'NOT_READY_FOR_EXECUTIVE_DECISION',
          confidence: 62
        },
        review: {
          additionalInvestigationRequired: false,
          updatedRecommendation: 'NOT_READY_FOR_EXECUTIVE_DECISION',
          investigationRequests: []
        }
      }
    ],
    currentPassingTestCount: 47,
    latestCommit: 'abc1234'
  });

  assert.equal(result.executiveHealth, 'AT_RISK');
  assert.equal(result.activeMissions, 2);
  assert.equal(result.readyForDecision, 1);
  assert.equal(result.awaitingInvestigation, 1);
  assert.equal(result.blockedMissions, 1);
  assert.equal(result.latestRecommendation, 'NOT_READY_FOR_EXECUTIVE_DECISION');
  assert.equal(result.confidence, 62);
  assert.equal(result.outstandingInvestigationRequests, 2);
  assert.equal(result.currentPassingTestCount, 47);
  assert.equal(result.latestCommit, 'abc1234');
});

test('build uses deterministic defaults when no workflow data is provided', () => {
  const dashboard = new ExecutiveOfficeDashboard();

  const result = dashboard.build();

  assert.deepEqual(result, {
    executiveHealth: 'NO_ACTIVE_MISSIONS',
    activeMissions: 0,
    readyForDecision: 0,
    awaitingInvestigation: 0,
    blockedMissions: 0,
    latestRecommendation: 'NO_RECOMMENDATION_AVAILABLE',
    confidence: 0,
    outstandingInvestigationRequests: 0,
    currentPassingTestCount: 0,
    latestCommit: 'LATEST_COMMIT_PLACEHOLDER'
  });
});

test('build tolerates partial workflow objects from existing pipeline shape', () => {
  const dashboard = new ExecutiveOfficeDashboard();

  const result = dashboard.build({
    workflowResults: [
      {
        mission: { id: 'VM-003', status: 'MISSION_CREATED' },
        decisionPackage: {
          recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
          confidence: 80
        }
      }
    ],
    currentPassingTestCount: 48
  });

  assert.equal(result.executiveHealth, 'HEALTHY');
  assert.equal(result.activeMissions, 1);
  assert.equal(result.readyForDecision, 1);
  assert.equal(result.awaitingInvestigation, 0);
  assert.equal(result.blockedMissions, 0);
  assert.equal(result.latestRecommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.confidence, 80);
  assert.equal(result.outstandingInvestigationRequests, 0);
  assert.equal(result.currentPassingTestCount, 48);
  assert.equal(result.latestCommit, 'LATEST_COMMIT_PLACEHOLDER');
});
