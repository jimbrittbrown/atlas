import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessEvaluationApplication } from '../src/executive/business-evaluation-application.js';

test('business request becomes executive mission request', async () => {
  let receivedMissionRequest = null;
  const application = new BusinessEvaluationApplication({
    executiveWorkflowCoordinator: {
      runExecutiveMission: async missionRequest => {
        receivedMissionRequest = missionRequest;

        return {
          decisionPackage: {
            recommendation: 'READY_FOR_EXECUTIVE_REVIEW'
          }
        };
      }
    }
  });

  await application.evaluateBusinessOpportunity({
    id: 'BO-001',
    businessOpportunity: 'Launch AI Horror Shorts business',
    ceoQuestions: ['What is the recommendation?']
  });

  assert.deepEqual(receivedMissionRequest, {
    id: 'BO-001',
    objective: 'Launch AI Horror Shorts business',
    ceoQuestions: ['What is the recommendation?']
  });
});

test('business evaluation executes executive workflow', async () => {
  let executionCount = 0;
  const application = new BusinessEvaluationApplication({
    executiveWorkflowCoordinator: {
      runExecutiveMission: async () => {
        executionCount += 1;

        return {
          decisionPackage: {
            recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION'
          }
        };
      }
    }
  });

  await application.evaluateBusinessOpportunity({
    id: 'BO-002',
    objective: 'Assess YouTube automation business'
  });

  assert.equal(executionCount, 1);
});

test('business evaluation returns executive decision package', async () => {
  const expectedDecisionPackage = {
    recommendation: 'NOT_READY_FOR_EXECUTIVE_DECISION',
    confidence: 57,
    authorityRequired: 'CEO Strategic Approval Required Before Proceeding'
  };
  const application = new BusinessEvaluationApplication({
    executiveWorkflowCoordinator: {
      runExecutiveMission: async () => ({
        mission: { id: 'BO-003' },
        review: { additionalInvestigationRequired: true },
        decisionPackage: expectedDecisionPackage
      })
    }
  });

  const result = await application.evaluateBusinessOpportunity({
    id: 'BO-003',
    objective: 'Assess B2B AI studio opportunity'
  });

  assert.deepEqual(result, expectedDecisionPackage);
});
