import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkforceDirector } from '../src/executive/workforce-director.js';
import { WorkforceRegistry } from '../src/executive/workforce-registry.js';
import { createDefaultWebsiteWorkforceRoster } from '../src/executive/website-workforce-roster.js';
import { WorkerStatuses } from '../src/executive/workforce-director-contracts.js';

test('workforce registry initializes required worker profile set', () => {
  const registry = new WorkforceRegistry({ initialWorkers: createDefaultWebsiteWorkforceRoster() });
  const workers = registry.listWorkers();

  assert.equal(workers.length, 7);
  assert.equal(workers.some((worker) => worker.workerName === 'Company Research Specialist'), true);
  assert.equal(workers.every((worker) => worker.status === WorkerStatuses.IDLE), true);
});

test('workforce director plans website build assignments and reports dashboard', () => {
  const director = new WorkforceDirector();

  const plan = director.planMissionAssignments({
    missionId: 'mis_test_001',
    missionType: 'WEBSITE_BUILD'
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.stageAssignments.length > 0, true);

  const dashboard = director.buildDashboard();
  assert.equal(dashboard.idleWorkers, 7);
  assert.equal(dashboard.activeWorkers, 0);
  assert.equal(dashboard.workerUtilization, 0);
  assert.equal(Object.keys(dashboard.missionAssignments).includes('mis_test_001'), true);
});

test('workforce director detects unavailable specialists and blocks plan', () => {
  const director = new WorkforceDirector();
  const researchWorker = director.listWorkers().find((worker) => worker.workerName === 'Company Research Specialist');

  director.markWorkerOffline(researchWorker.workerId);

  const plan = director.planMissionAssignments({
    missionId: 'mis_test_002',
    missionType: 'WEBSITE_BUILD'
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.unavailable.some((item) => item.specialty === 'COMPANY_RESEARCH_SPECIALIST'), true);
});

test('workforce director supports failure handling and reassignment', () => {
  const director = new WorkforceDirector({
    workforceRegistry: new WorkforceRegistry({
      initialWorkers: [
        {
          workerName: 'Framer Production Specialist A',
          division: 'WEBSITE_DIVISION',
          specialty: 'FRAMER_PRODUCTION_SPECIALIST',
          capabilities: ['WEBSITE_PRODUCTION_CUSTOMIZATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Framer Production Specialist B',
          division: 'WEBSITE_DIVISION',
          specialty: 'FRAMER_PRODUCTION_SPECIALIST',
          capabilities: ['WEBSITE_PRODUCTION_CUSTOMIZATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Company Research Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'COMPANY_RESEARCH_SPECIALIST',
          capabilities: ['COMPANY_RESEARCH'],
          status: 'IDLE'
        },
        {
          workerName: 'Brand Strategy Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'BRAND_STRATEGY_SPECIALIST',
          capabilities: ['BRAND_PACKAGE_GENERATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Messaging Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'MESSAGING_SPECIALIST',
          capabilities: ['BRAND_PACKAGE_GENERATION'],
          status: 'IDLE'
        },
        {
          workerName: 'Website Architect',
          division: 'WEBSITE_DIVISION',
          specialty: 'WEBSITE_ARCHITECT',
          capabilities: ['TEMPLATE_SELECTION', 'CUSTOMIZATION_PACKAGE_GENERATION'],
          status: 'IDLE'
        },
        {
          workerName: 'QA Specialist',
          division: 'WEBSITE_DIVISION',
          specialty: 'QA_SPECIALIST',
          capabilities: ['SANDBOX_PROJECT_UPSERT'],
          status: 'IDLE'
        }
      ]
    })
  });

  director.planMissionAssignments({ missionId: 'mis_test_003', missionType: 'WEBSITE_BUILD' });
  director.markStageStarted({ missionId: 'mis_test_003', stageId: 'WEBSITE_PRODUCTION_CUSTOMIZATION' });

  const beforeFailureWorker = director
    .listWorkers()
    .find((worker) => worker.currentMission === 'mis_test_003' && worker.currentStage === 'WEBSITE_PRODUCTION_CUSTOMIZATION');

  const failureResult = director.handleStageFailure({
    missionId: 'mis_test_003',
    stageId: 'WEBSITE_PRODUCTION_CUSTOMIZATION',
    missionType: 'WEBSITE_BUILD',
    errorMessage: 'Provider timeout'
  });

  assert.equal(failureResult.recovered, true);

  director.markStageStarted({ missionId: 'mis_test_003', stageId: 'WEBSITE_PRODUCTION_CUSTOMIZATION' });
  const afterFailureWorker = director
    .listWorkers()
    .find((worker) => worker.currentMission === 'mis_test_003' && worker.currentStage === 'WEBSITE_PRODUCTION_CUSTOMIZATION');

  assert.equal(Boolean(beforeFailureWorker), true);
  assert.equal(Boolean(afterFailureWorker), true);
});
