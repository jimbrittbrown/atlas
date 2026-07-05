import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationLogger } from '../src/integration-logger.js';
import { ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBridge } from '../src/executive-research-memory-metrics-performance-approval-registry-worker-control-center-institute-bridge.js';

test('captures and synthesizes institutional learning from successful workflow', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBridge({
    controlCenterBridge: {
      execute: async () => ({
        workflowId: 'wf-1800',
        execution: { id: 'exec-1800', state: { value: 'COMPLETED' }, executed: true },
        controlCenter: { overview: { workflowState: 'COMPLETED' } },
      }),
    },
    atlasInstituteAdapter: {
      captureLearningFromWorkflow: () => [{ id: 'knowledge-1' }, { id: 'knowledge-2' }],
      generateOrganizationalLearning: () => ({
        playbook: { title: 'Playbook: AI Product Marketing' },
        bestPractices: { title: 'Current Best Practices: AI Product Marketing' },
        improvements: { title: 'Recommended Improvements: Release Management' },
        summary: { total: 2 },
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1800', objective: 'Build reusable guidance', context: {} });
  assert.equal(result.atlasInstitute.capturedKnowledge.length, 2);
  assert.equal(result.atlasInstitute.learning.bestPractices.title, 'Current Best Practices: AI Product Marketing');
});

test('captures institutional learning from blocked execution outcomes', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBridge({
    controlCenterBridge: {
      execute: async () => ({
        workflowId: 'wf-1801',
        execution: { executed: false, reason: 'Authorization not granted' },
        controlCenter: { alerts: { alerts: [{ source: 'approval-service', status: 'REJECTED' }] } },
      }),
    },
    atlasInstituteAdapter: {
      captureLearningFromWorkflow: () => [{ id: 'knowledge-blocked' }],
      generateOrganizationalLearning: () => ({
        playbook: { title: 'Playbook: Governance' },
        bestPractices: { title: 'Current Best Practices: Governance' },
        improvements: { title: 'Recommended Improvements: Governance' },
        summary: { total: 1 },
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1801', objective: 'Learn from rejection', context: {} });
  assert.equal(result.execution.executed, false);
  assert.equal(result.atlasInstitute.capturedKnowledge.length, 1);
});
