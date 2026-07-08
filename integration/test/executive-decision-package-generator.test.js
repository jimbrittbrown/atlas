import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveDecisionPackageGenerator } from '../src/executive/executive-decision-package-generator.js';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';

test('generates executive decision package from mission reasoning artifacts', () => {
  const generator = new ExecutiveDecisionPackageGenerator();

  const decisionPackage = generator.generate({
    mission: { id: 'M-001', decisionClass: 'Strategic' },
    findings: [{ id: 'F-001', statement: 'All providers completed successfully.' }],
    beliefs: [{ id: 'B-001', statement: 'Execution path is viable.', confidence: 0.8 }],
    importance: [{ id: 'B-001', importance: 'high' }],
    decisionReadiness: {
      status: 'READY_WITH_CONDITIONS',
      rationale: 'High-importance beliefs require review.',
      missingEvidence: [],
      criticalUnknowns: ['High-importance belief review is required before final recommendation.']
    },
    executiveTensions: [{ id: 'T-001', title: 'Executive Review Required' }],
    synthesis: { executiveSummary: 'Synthesis not yet implemented.' }
  });

  assert.equal(decisionPackage.recommendation, 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION');
  assert.equal(decisionPackage.confidence, 80);
  assert.equal(decisionPackage.authorityRequired, 'CEO Strategic Approval Required Before Proceeding');
  assert.equal(decisionPackage.executiveSummary, 'Synthesis not yet implemented.');
});

test('generated decision package includes required executive fields', () => {
  const generator = new ExecutiveDecisionPackageGenerator();
  const decisionPackage = generator.generate({
    mission: { id: 'M-002' },
    findings: [],
    beliefs: [],
    importance: [],
    decisionReadiness: {
      status: 'NOT_READY',
      rationale: 'Insufficient evidence.',
      missingEvidence: ['findings'],
      criticalUnknowns: ['Evidence missing.']
    },
    executiveTensions: [],
    synthesis: { executiveSummary: 'Synthesis not yet implemented.' }
  });

  assert.equal(typeof decisionPackage.executiveSummary, 'string');
  assert.equal(typeof decisionPackage.recommendation, 'string');
  assert.equal(typeof decisionPackage.confidence, 'number');
  assert.equal(typeof decisionPackage.decisionReadiness, 'object');
  assert.equal(Array.isArray(decisionPackage.findings), true);
  assert.equal(Array.isArray(decisionPackage.beliefs), true);
  assert.equal(Array.isArray(decisionPackage.importance), true);
  assert.equal(Array.isArray(decisionPackage.executiveTensions), true);
  assert.equal(typeof decisionPackage.synthesis, 'object');
  assert.equal(typeof decisionPackage.authorityRequired, 'string');
});

test('decision package includes traceability metadata from recommendation to evidence', () => {
  const generator = new ExecutiveDecisionPackageGenerator();
  const decisionPackage = generator.generate({
    mission: { id: 'M-TRACE-001', decisionClass: 'Strategic' },
    findings: [
      {
        id: 'F-TRACE-001',
        statement: 'Provider evidence supports launch viability.',
        supportingEvidence: [
          {
            provider: 'OpenAI',
            requestId: 'REQ-TRACE-001',
            sourceResponse: { summary: 'Demand indicators are positive.' }
          }
        ]
      }
    ],
    beliefs: [
      {
        id: 'B-TRACE-001',
        statement: 'Launch viability is supported by provider evidence.',
        confidence: 0.9,
        supportingFindings: ['F-TRACE-001']
      }
    ],
    importance: [{ id: 'B-TRACE-001', importance: 'high' }],
    decisionReadiness: {
      status: 'READY_WITH_CONDITIONS',
      rationale: 'Needs executive review.',
      missingEvidence: [],
      criticalUnknowns: []
    },
    executiveTensions: [],
    synthesis: { executiveSummary: 'Trace summary.' }
  });

  assert.equal(typeof decisionPackage.traceability, 'object');
  assert.equal(decisionPackage.traceability.recommendation, 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION');
  assert.equal(Array.isArray(decisionPackage.traceability.recommendationToBeliefs), true);
  assert.equal(decisionPackage.traceability.recommendationToBeliefs.length, 1);
  assert.equal(decisionPackage.traceability.recommendationToBeliefs[0].beliefId, 'B-TRACE-001');
  assert.equal(decisionPackage.traceability.recommendationToBeliefs[0].supportingFindings[0].findingId, 'F-TRACE-001');
  assert.equal(
    decisionPackage.traceability.recommendationToBeliefs[0].supportingFindings[0].evidence[0].provider,
    'OpenAI'
  );
  assert.equal(
    decisionPackage.traceability.recommendationToBeliefs[0].supportingFindings[0].evidence[0].requestId,
    'REQ-TRACE-001'
  );
});

test('existing validation mission pipeline remains intact', async () => {
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
    id: 'VM-PIPE-001',
    objective: 'Validate pipeline integrity'
  });

  assert.equal(result.mission.id, 'VM-PIPE-001');
  assert.equal(result.investigations.length, 6);
  assert.equal(result.readiness.status, 'READY');
  assert.equal(result.recommendation, 'READY_FOR_EXECUTIVE_REVIEW');
  assert.equal(result.authorityRequired, 'CEO Strategic Approval');
});