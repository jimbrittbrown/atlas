import { mkdirSync, writeFileSync } from 'node:fs';
import { AtlasWebDemonstrationFactory } from '../src/executive/demonstration-factory.js';

function run() {
  const factory = new AtlasWebDemonstrationFactory();

  const packageResult = factory.buildFactory({
    factoryName: 'Atlas Web Demonstration Factory v1',
    operatingCompany: 'Atlas Web',
    ceoObjective: 'Produce executive-quality demonstration websites before sale requests to maximize probability of Customer #1.'
  });

  const output = {
    packageName: 'Atlas Executive OS Mission 002 Demonstration Factory Package',
    missionId: 'MISSION_002_BUILD_ATLAS_WEB_DEMONSTRATION_FACTORY',
    version: '1.0.0',
    architecture: packageResult.architecture,
    workflow: packageResult.workflow,
    requiredSpecialists: packageResult.requiredSpecialists,
    artifacts: packageResult.artifacts,
    executiveReviewProcess: packageResult.executiveReviewProcess,
    futureIntegrationWithSalesEngine: packageResult.futureIntegrationWithSalesEngine,
    controls: packageResult.controls,
    missionGuardrails: {
      outreachEnabled: false,
      publishingEnabled: false,
      prospectContactEnabled: false
    },
    generatedAt: new Date().toISOString()
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync('/root/atlas/review/mission-002-demonstration-factory-package.json', `${JSON.stringify(output, null, 2)}\n`);

  console.log('WROTE=/root/atlas/review/mission-002-demonstration-factory-package.json');
  console.log(`WORKFLOW_STAGES=${output.workflow.length}`);
  console.log(`SPECIALISTS=${output.requiredSpecialists.length}`);
  console.log(`ARTIFACTS=${output.artifacts.length}`);
}

run();
