import test from 'node:test';
import assert from 'node:assert/strict';
import { IntegrationLogger } from '../src/integration-logger.js';
import { ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBusinessFactoryBridge } from '../src/executive-research-memory-metrics-performance-approval-registry-worker-control-center-institute-business-factory-bridge.js';

test('runs business factory production pipeline after institute synthesis', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBusinessFactoryBridge({
    instituteBridge: {
      execute: async () => ({
        workflowId: 'wf-1900',
        atlasInstitute: { learning: { summary: { total: 3 } } },
      }),
    },
    businessFactoryAdapter: {
      runProductionPipeline: async () => ({
        business: { id: 'business-1', state: 'COMPLETED' },
        factoryMetrics: { total: 1, completed: 1 },
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1900', objective: 'Launch business', context: { businessName: 'Atlas One' } });
  assert.equal(result.businessFactory.business.id, 'business-1');
  assert.equal(result.businessFactory.factoryMetrics.completed, 1);
});

test('preserves upstream result fields when production pipeline is attached', async () => {
  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryWorkerControlCenterInstituteBusinessFactoryBridge({
    instituteBridge: {
      execute: async () => ({
        workflowId: 'wf-1901',
        execution: { state: { value: 'COMPLETED' } },
        atlasInstitute: { capturedKnowledge: [{ id: 'k1' }] },
      }),
    },
    businessFactoryAdapter: {
      runProductionPipeline: async () => ({
        business: { id: 'business-2', state: 'COMPLETED' },
        factoryMetrics: { total: 2, completed: 2 },
      }),
    },
    logger: new IntegrationLogger(),
  });

  const result = await bridge.execute({ id: 'req-1901', objective: 'Scale business', context: {} });
  assert.equal(result.workflowId, 'wf-1901');
  assert.equal(result.atlasInstitute.capturedKnowledge.length, 1);
  assert.equal(result.businessFactory.business.state, 'COMPLETED');
});
