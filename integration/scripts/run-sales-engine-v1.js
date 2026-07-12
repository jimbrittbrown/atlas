import { mkdirSync, writeFileSync } from 'node:fs';
import { AtlasSalesEngine } from '../src/executive/sales-engine.js';
import { AtlasSalesEngineDashboardModel } from '../src/executive/sales-engine-dashboard-model.js';

function run() {
  const salesEngine = new AtlasSalesEngine();

  const salesEnginePackage = salesEngine.buildDepartment({
    departmentName: 'Atlas Sales Engine v1',
    operatingCompany: 'Atlas Web',
    ceoObjective: 'Acquire customers, convert prospects, track revenue, and improve sales performance.',
    availableWorkforce: [],
    benchmarkSignals: {
      policy: 'Use specialist benchmarking before assigning external execution providers.'
    },
    opportunityContext: {
      source: 'Atlas Web first-customer mission'
    }
  });

  const dashboardModel = new AtlasSalesEngineDashboardModel();
  const dashboardProjection = dashboardModel.build({
    salesEnginePackage,
    snapshot: {
      forecastRevenue: 0,
      collectedRevenue: 0,
      closedWon: 0,
      closedLost: 0,
      proposalCount: 0,
      satisfactionScore: 0,
      referralCount: 0,
      repeatBusinessCount: 0
    }
  });

  const output = {
    packageName: 'Atlas Sales Engine Department Package',
    version: '1.0.0',
    salesEngineArchitecture: salesEnginePackage.salesEngineArchitecture,
    departmentResponsibilities: salesEnginePackage.departmentResponsibilities,
    pipeline: salesEnginePackage.pipeline,
    requiredArtifacts: salesEnginePackage.requiredArtifacts,
    dashboardModel: salesEnginePackage.dashboardModel,
    executiveWorkflow: salesEnginePackage.executiveWorkflow,
    dashboardProjection
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/atlas-sales-engine-v1.json', `${JSON.stringify(output, null, 2)}\n`);

  console.log('WROTE=/root/atlas/review/atlas-sales-engine-v1.json');
  console.log(`PIPELINE_STAGES=${output.pipeline.length}`);
  console.log(`CAPABILITIES=${output.salesEngineArchitecture.capabilities.length}`);
}

run();
