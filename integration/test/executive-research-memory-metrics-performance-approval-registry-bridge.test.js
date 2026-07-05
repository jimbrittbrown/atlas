import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistryService } from '../../registry/src/capability-registry-service.js';
import { CapabilityRegistryAdapter } from '../src/capability-registry-adapter.js';
import { IntegrationLogger } from '../src/integration-logger.js';
import { ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryBridge } from '../src/executive-research-memory-metrics-performance-approval-registry-bridge.js';

test('synchronizes core capabilities after governance bridge execution', async () => {
  const registryService = new CapabilityRegistryService();
  const registryAdapter = new CapabilityRegistryAdapter(registryService);
  const logger = new IntegrationLogger();

  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryBridge({
    governanceBridge: {
      execute: async () => ({
        workflowId: 'wf-1200',
        status: 'completed',
        authorization: { authorized: true, status: 'APPROVED' },
      }),
    },
    capabilityRegistryAdapter: registryAdapter,
    logger,
  });

  const result = await bridge.execute({ id: 'req-1200', context: { commitHash: 'fcd929e', testStatus: 'PASS' } });

  assert.equal(result.registry.synchronized, true);
  assert.equal(result.registry.total, 6);
  assert.equal(registryService.listCapabilities().length, 6);
});

test('updates existing capability entries when syncing repeatedly', async () => {
  const registryService = new CapabilityRegistryService();
  const registryAdapter = new CapabilityRegistryAdapter(registryService);

  const bridge = new ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryBridge({
    governanceBridge: {
      execute: async () => ({ workflowId: 'wf-1201', authorization: { authorized: true, status: 'APPROVED' } }),
    },
    capabilityRegistryAdapter: registryAdapter,
    logger: new IntegrationLogger(),
  });

  await bridge.execute({ id: 'req-1201', context: { commitHash: 'first', testStatus: 'PASS' } });
  await bridge.execute({ id: 'req-1201', context: { commitHash: 'second', testStatus: 'PASS' } });

  const executive = registryService.getCapability('Executive Service');
  assert.equal(executive.metadata.commitHash, 'second');
  assert.equal(registryService.listCapabilities().length, 6);
});
