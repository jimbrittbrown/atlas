import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveReviewEngine } from '../src/executive/executive-review-engine.js';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';

test('answers CEO questions from existing decision package evidence', () => {
  const engine = new ExecutiveReviewEngine();
  const decisionPackage = {
    executiveSummary: 'Synthesis not yet implemented.',
    recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
    confidence: 82,
    decisionReadiness: { status: 'READY', rationale: 'sufficient', missingEvidence: [], criticalUnknowns: [] },
    findings: [{ id: 'F-001' }],
    beliefs: [],
    importance: [],
    executiveTensions: [],
    synthesis: {},
    authorityRequired: 'CEO Strategic Approval'
  };

  const result = engine.review(decisionPackage, [
    'What is the recommendation?',
    'What confidence supports this decision?',
    'What authority is required?'
  ]);

  assert.equal(result.additionalInvestigationRequired, false);
  assert.equal(result.investigationRequests.length, 0);
  assert.equal(result.updatedRecommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.responses[0].answer, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.responses[1].answer, 82);
  assert.equal(result.responses[2].answer, 'CEO Strategic Approval');
});

test('unknown CEO questions generate investigation requests', () => {
  const engine = new ExecutiveReviewEngine();
  const decisionPackage = {
    executiveSummary: 'Synthesis not yet implemented.',
    recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
    confidence: 82,
    decisionReadiness: { status: 'READY', rationale: 'sufficient', missingEvidence: [], criticalUnknowns: [] },
    findings: [{ id: 'F-001' }],
    beliefs: [],
    importance: [],
    executiveTensions: [],
    synthesis: {},
    authorityRequired: 'CEO Strategic Approval'
  };

  const result = engine.review(decisionPackage, [
    'What legal precedent applies to this decision?'
  ]);

  assert.equal(result.additionalInvestigationRequired, true);
  assert.equal(result.updatedRecommendation, 'REQUIRES_ADDITIONAL_INVESTIGATION');
  assert.equal(result.investigationRequests.length, 1);
  assert.equal(result.investigationRequests[0].id, 'INVREQ-001');
  assert.equal(result.investigationRequests[0].objective, 'What legal precedent applies to this decision?');
  assert.equal(result.responses[0].answer, null);
});

test('answers why Atlas believes this using traceability chain', () => {
  const engine = new ExecutiveReviewEngine();
  const decisionPackage = {
    executiveSummary: 'Evidence supports recommendation.',
    recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION',
    confidence: 90,
    decisionReadiness: { status: 'READY_WITH_CONDITIONS', rationale: 'review needed', missingEvidence: [], criticalUnknowns: [] },
    findings: [
      {
        id: 'F-TRACE-001',
        statement: 'Demand indicators are positive.',
        supportingEvidence: [
          {
            provider: 'Perplexity',
            requestId: 'REQ-TRACE-009',
            sourceResponse: { summary: 'Positive trend detected.' }
          }
        ]
      }
    ],
    beliefs: [
      {
        id: 'B-TRACE-001',
        statement: 'Atlas has a viable launch signal.',
        confidence: 0.9,
        supportingFindings: ['F-TRACE-001']
      }
    ],
    importance: [{ id: 'B-TRACE-001', importance: 'high' }],
    executiveTensions: [],
    synthesis: {},
    traceability: {
      recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION',
      recommendationToBeliefs: [
        {
          beliefId: 'B-TRACE-001',
          statement: 'Atlas has a viable launch signal.',
          confidence: 0.9,
          supportingFindings: [
            {
              findingId: 'F-TRACE-001',
              statement: 'Demand indicators are positive.',
              evidence: [
                {
                  provider: 'Perplexity',
                  requestId: 'REQ-TRACE-009',
                  sourceResponse: { summary: 'Positive trend detected.' }
                }
              ]
            }
          ]
        }
      ]
    },
    authorityRequired: 'CEO Strategic Approval Required Before Proceeding'
  };

  const result = engine.review(decisionPackage, ['Show me why Atlas believes this.']);

  assert.equal(result.additionalInvestigationRequired, false);
  assert.equal(result.responses.length, 1);
  assert.match(result.responses[0].answer, /Recommendation REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION/);
  assert.match(result.responses[0].answer, /Belief B-TRACE-001/);
  assert.match(result.responses[0].answer, /Finding F-TRACE-001/);
  assert.match(result.responses[0].answer, /Provider Perplexity/);
  assert.match(result.responses[0].answer, /request REQ-TRACE-009/);
});

test('existing pipeline remains intact', async () => {
  const logger = { entries: [], log(entry) { this.entries.push(entry); } };
  const coordinator = new ExecutiveWorkflowCoordinator({
    executiveService: { handleRequest: async () => ({ workflowId: 'unused' }) },
    bridge: { execute: async () => ({ status: 'unused' }) },
    logger,
    investigationManager: {
      executeInvestigations: async investigations => investigations.map(investigation => ({
        investigationId: investigation.id,
        investigationName: investigation.name,
        research: {
          report: {
            confidence: 0.8,
            executiveSummary: `Completed: ${investigation.name}`
          }
        }
      }))
    }
  });

  const result = await coordinator.runValidationMission({
    id: 'VM-PIPE-002',
    objective: 'Validate review engine did not break pipeline'
  });

  assert.equal(result.mission.id, 'VM-PIPE-002');
  assert.equal(result.investigations.length, 6);
  assert.equal(result.readiness.status, 'READY');
  assert.equal(result.recommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.authorityRequired, 'CEO Strategic Approval');
});