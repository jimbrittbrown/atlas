import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasSalesEngine } from '../src/executive/sales-engine.js';
import {
  AtlasSalesEngineCapabilities,
  AtlasSalesEnginePipelineStages
} from '../src/executive/sales-engine-contracts.js';
import { AtlasSalesEngineDashboardModel } from '../src/executive/sales-engine-dashboard-model.js';

test('sales engine builds permanent department package', () => {
  const engine = new AtlasSalesEngine();

  const result = engine.buildDepartment({
    departmentName: 'Atlas Sales Engine v1',
    operatingCompany: 'Atlas Web',
    ceoObjective: 'Acquire customers.'
  });

  assert.equal(result.salesEngineArchitecture.reusableByAllCompanies, true);
  assert.deepEqual(result.salesEngineArchitecture.capabilities, AtlasSalesEngineCapabilities);
  assert.equal(Array.isArray(result.departmentResponsibilities), true);
  assert.equal(Array.isArray(result.pipeline), true);
  assert.equal(Array.isArray(result.requiredArtifacts), true);
  assert.equal(Array.isArray(result.executiveWorkflow), true);
});

test('sales engine pipeline matches canonical mission pipeline', () => {
  const engine = new AtlasSalesEngine();

  const result = engine.buildDepartment({
    departmentName: 'Atlas Sales Engine v1',
    operatingCompany: 'Atlas Web',
    ceoObjective: 'Acquire customers.'
  });

  assert.deepEqual(result.pipeline.map(item => item.stage), AtlasSalesEnginePipelineStages);
});

test('sales engine dashboard projects executive signal', () => {
  const engine = new AtlasSalesEngine();
  const dashboard = new AtlasSalesEngineDashboardModel();

  const packageResult = engine.buildDepartment({
    departmentName: 'Atlas Sales Engine v1',
    operatingCompany: 'Atlas Web',
    ceoObjective: 'Acquire customers.'
  });

  const projected = dashboard.build({
    salesEnginePackage: packageResult,
    snapshot: {
      forecastRevenue: 12000,
      collectedRevenue: 4000,
      closedWon: 4,
      closedLost: 4,
      proposalCount: 10,
      satisfactionScore: 8.4,
      referralCount: 1,
      repeatBusinessCount: 1
    }
  });

  assert.equal(projected.pipelineStageCount, AtlasSalesEnginePipelineStages.length);
  assert.equal(projected.executiveSignal, 'HEALTHY');
  assert.equal(typeof projected.revenueSummary.winRate, 'number');
});
