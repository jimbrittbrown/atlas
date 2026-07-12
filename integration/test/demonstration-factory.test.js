import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasWebDemonstrationFactory } from '../src/executive/demonstration-factory.js';
import {
  DemonstrationFactoryWorkflowStages,
  DemonstrationProjectTypes
} from '../src/executive/demonstration-factory-contracts.js';

test('demonstration factory builds required package', () => {
  const factory = new AtlasWebDemonstrationFactory();

  const result = factory.buildFactory({
    factoryName: 'Atlas Web Demonstration Factory v1',
    operatingCompany: 'Atlas Web',
    ceoObjective: 'Increase qualified leads and booked jobs through demonstration assets.'
  });

  assert.equal(result.architecture.factoryName, 'Atlas Web Demonstration Factory v1');
  assert.equal(result.architecture.operatingCompany, 'Atlas Web');
  assert.deepEqual(result.architecture.projectTypes.map(item => item.type), DemonstrationProjectTypes);
  assert.equal(Array.isArray(result.requiredSpecialists), true);
  assert.equal(Array.isArray(result.artifacts), true);
  assert.equal(Array.isArray(result.executiveReviewProcess), true);
  assert.equal(typeof result.futureIntegrationWithSalesEngine, 'object');
});

test('demonstration workflow matches canonical stages', () => {
  const factory = new AtlasWebDemonstrationFactory();
  const result = factory.buildFactory();

  assert.deepEqual(result.workflow.map(item => item.stage), DemonstrationFactoryWorkflowStages);
});

test('demonstration factory enforces no outreach controls', () => {
  const factory = new AtlasWebDemonstrationFactory();
  const result = factory.buildFactory();

  assert.equal(result.controls.mandatoryDisclaimer, 'Prepared by Atlas as a demonstration of our recommended improvements.');
  assert.equal(result.futureIntegrationWithSalesEngine.restrictions.includes('No outreach executed by Demonstration Factory.'), true);
});
