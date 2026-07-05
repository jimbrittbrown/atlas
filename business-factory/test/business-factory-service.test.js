import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessFactoryService } from '../src/business-factory-service.js';

test('creates business only from approved opportunity', () => {
  const service = new BusinessFactoryService();

  const business = service.createBusiness({
    approvedOpportunity: { id: 'opp-1', approved: true },
    name: 'Atlas Product A',
    objective: 'Launch repeatable business',
  });

  assert.equal(business.opportunityId, 'opp-1');
  assert.equal(business.state, 'OPPORTUNITY');

  assert.throws(
    () => service.createBusiness({
      approvedOpportunity: { id: 'opp-2', approved: false },
      name: 'Blocked business',
      objective: 'Should fail',
    }),
    /approved opportunity/
  );
});

test('builds and assigns pipeline through worker orchestration', async () => {
  const service = new BusinessFactoryService({
    approvalService: {
      requestApproval: () => ({ id: 'ap-1', status: 'APPROVED' }),
      isAuthorized: () => true,
    },
    capabilityRegistryService: {
      searchCapabilities: () => ({ records: [{ metadata: { name: 'Builder' } }, { metadata: { name: 'Launcher' } }, { metadata: { name: 'Marketer' } }] }),
    },
    workerOrchestrationService: {
      coordinateWorkflow: async () => ({ id: 'exec-1', state: { value: 'COMPLETED' } }),
    },
  });

  const business = service.createBusiness({
    approvedOpportunity: { id: 'opp-3', approved: true },
    name: 'Atlas Product B',
    objective: 'Build and launch',
  });

  const planned = service.buildPipeline({ businessId: business.id });
  assert.equal(planned.state, 'PRODUCTION_PLANNING');

  const assigned = await service.assignPipeline({ businessId: business.id, requestId: 'req-1' });
  assert.equal(assigned.business.state, 'WORKER_ASSIGNMENT');
  assert.equal(assigned.business.assignedWorkflowExecutionId, 'exec-1');
});

test('launches business and returns integrated results', async () => {
  const service = new BusinessFactoryService({
    researchService: {
      createResearchJob: async () => ({ id: 'research-1' }),
      executeResearch: async () => ({ id: 'research-1', report: { summary: 'validated' } }),
    },
    approvalService: {
      requestApproval: () => ({ id: 'ap-2', status: 'APPROVED' }),
      isAuthorized: () => true,
    },
    capabilityRegistryService: {
      searchCapabilities: () => ({ records: [{ metadata: { name: 'Builder' } }, { metadata: { name: 'Launcher' } }, { metadata: { name: 'Marketer' } }] }),
    },
    workerOrchestrationService: {
      coordinateWorkflow: async () => ({ id: 'exec-2', state: { value: 'COMPLETED' } }),
    },
    memoryService: {
      recordWorkflowHistory: () => {},
    },
    metricsService: {
      recordWorkflowCompletion: () => {},
      retrieveMetrics: () => ({ total: 3 }),
    },
    performanceService: {
      recordExecution: () => {},
    },
    controlCenterService: {
      getSystemOverview: () => ({ workflowState: 'COMPLETED' }),
    },
    atlasInstituteService: {
      recordExperiment: () => {},
      recommendImprovements: () => ({ title: 'Recommended Improvements: Business Pipeline' }),
    },
    executiveService: {
      monitor: async () => ({ status: 'ok' }),
    },
  });

  const business = service.createBusiness({
    approvedOpportunity: { id: 'opp-4', approved: true },
    name: 'Atlas Product C',
    objective: 'Production launch',
  });
  service.buildPipeline({ businessId: business.id });

  const launched = await service.launchBusiness({ businessId: business.id, requestId: 'req-2' });
  assert.equal(launched.business.state, 'COMPLETED');
  assert.equal(launched.assignment.execution.id, 'exec-2');
  assert.equal(launched.visibility.workflowState, 'COMPLETED');
});

test('pauses, resumes, archives, and reports metrics/history', () => {
  const service = new BusinessFactoryService({
    metricsService: {
      retrieveMetrics: () => ({ total: 1 }),
    },
  });

  const business = service.createBusiness({
    approvedOpportunity: { id: 'opp-5', approved: true },
    name: 'Atlas Product D',
    objective: 'Status operations',
  });

  const paused = service.pauseBusiness({ businessId: business.id, reason: 'manual pause' });
  assert.equal(paused.state, 'PAUSED');

  const resumed = service.resumeBusiness({ businessId: business.id });
  assert.equal(resumed.state, 'PRODUCTION_PLANNING');

  const archived = service.archiveBusiness({ businessId: business.id, reason: 'completed lifecycle' });
  assert.equal(archived.state, 'ARCHIVED');

  const metrics = service.getFactoryMetrics();
  assert.equal(metrics.total, 1);
  assert.equal(metrics.archived, 1);
  assert.equal(metrics.serviceMetricCount, 1);

  const history = service.getProductionHistory();
  assert.equal(history.repository.length > 0, true);
  assert.equal(history.logs.length > 0, true);
});
