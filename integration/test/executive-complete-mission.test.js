import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveWorkflowCoordinator } from '../src/executive-workflow-coordinator.js';

test('executes complete executive mission and routes decision package through review', async () => {
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
            findings: [{ id: `finding-${investigation.id}`, statement: `Finding for ${investigation.name}` }],
            beliefs: [{ id: `belief-${investigation.id}`, statement: `Belief for ${investigation.name}`, confidence: 0.8 }],
            importance: [{ id: `belief-${investigation.id}`, importance: 'high' }],
            decisionReadiness: {
              status: 'READY_WITH_CONDITIONS',
              rationale: 'Evidence is sufficient with conditions.',
              missingEvidence: [],
              criticalUnknowns: ['Executive confirmation required.']
            },
            executiveTensions: [{ id: `tension-${investigation.id}`, title: 'Executive Review Required' }],
            synthesis: {
              executiveSummary: 'Synthesis not yet implemented.',
              findings: [],
              conflicts: [],
              recommendations: []
            }
          }
        }
      }))
    }
  });

  const result = await coordinator.runExecutiveMission({
    id: 'VM-001',
    objective: 'Should Atlas launch the AI Horror Shorts business?',
    ceoQuestions: [
      'What is the recommendation?',
      'What legal precedent applies to this decision?'
    ]
  });

  assert.equal(result.mission.id, 'VM-001');
  assert.equal(result.investigations.length, 6);
  assert.equal(result.decisionPackage.recommendation, 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION');
  assert.equal(Array.isArray(result.decisionPackage.findings), true);
  assert.equal(Array.isArray(result.decisionPackage.beliefs), true);
  assert.equal(Array.isArray(result.decisionPackage.importance), true);
  assert.equal(typeof result.decisionPackage.decisionReadiness, 'object');
  assert.equal(Array.isArray(result.decisionPackage.executiveTensions), true);
  assert.equal(typeof result.decisionPackage.synthesis, 'object');
  assert.equal(typeof result.decisionPackage.authorityRequired, 'string');

  assert.equal(Array.isArray(result.review.responses), true);
  assert.equal(result.review.additionalInvestigationRequired, true);
  assert.equal(result.review.investigationRequests.length, 1);

  const messages = logger.entries.map(entry => entry.message);
  assert.deepEqual(messages, [
    'EXECUTIVE MISSION RECEIVED',
    'MISSION DEFINED',
    'INVESTIGATIONS PLANNED',
    'INVESTIGATIONS COMPLETED',
    'EXECUTIVE DECISION PACKAGE GENERATED',
    'EXECUTIVE REVIEW COMPLETED'
  ]);
});