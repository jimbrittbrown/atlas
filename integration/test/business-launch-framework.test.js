import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessLaunchFramework } from '../src/executive/business-launch-framework.js';
import {
  BusinessLaunchPipelineStages,
  validateBusinessLaunchPackage
} from '../src/executive/business-launch-framework-contracts.js';
import { BusinessLaunchFrameworkDashboard } from '../src/executive/business-launch-framework-dashboard.js';

function createInput({ workforce = [] } = {}) {
  return {
    approvedBusinessRecommendation: {
      businessName: 'Reusable Business',
      businessDescription: 'Reusable business description',
      businessMission: 'Execute reusable launch blueprint.',
      targetCustomer: 'SMB operators',
      valueProposition: 'Faster measurable outcomes.',
      revenueModel: 'Recurring + project-based',
      pricingStrategy: 'Tiered pricing'
    },
    ceoObjectives: [
      'Generate reliable cash flow quickly.',
      'Strengthen Atlas capabilities.'
    ],
    availableWorkforce: workforce,
    availableBudget: {
      allocatedBudget: 15000,
      maxBudget: 30000,
      budgetStatus: 'APPROVED'
    },
    currentAtlasAssets: ['Opportunity Engine', 'Workforce Registry']
  };
}

test('framework generates launch package with all required sections', () => {
  const framework = new BusinessLaunchFramework();

  const result = framework.generate(createInput());
  const validation = validateBusinessLaunchPackage(result.launchPackage);

  assert.equal(validation.isValid, true);
  assert.equal(result.launchPackageSchema.sectionCount, 20);
  assert.equal(result.pipeline.length, 9);
});

test('framework preserves permanent pipeline stage sequence', () => {
  const framework = new BusinessLaunchFramework();

  const result = framework.generate(createInput());
  const stages = result.pipeline.map(item => item.stage);

  assert.deepEqual(stages, BusinessLaunchPipelineStages);
});

test('framework assigns specialists from workforce registry candidates', () => {
  const framework = new BusinessLaunchFramework();

  const workforce = [
    { workerId: 'W1', name: 'Research A', role: 'Market Research Specialist', standingScore: 9.2 },
    { workerId: 'W2', name: 'Automation A', role: 'Automation Architect', standingScore: 8.8 },
    { workerId: 'W3', name: 'Analytics A', role: 'Analytics Specialist', standingScore: 9.1 }
  ];

  const result = framework.generate(createInput({ workforce }));
  const assignments = result.launchPackage.requiredAISpecialists.assignments;

  assert.equal(Array.isArray(assignments), true);
  assert.equal(assignments.length, 6);
  assert.equal(assignments.some(item => item.assignmentStatus === 'ASSIGNED'), true);
  assert.equal(assignments.some(item => item.assignmentStatus === 'UNFILLED'), true);
});

test('dashboard projection reports executive health and readiness', () => {
  const framework = new BusinessLaunchFramework();
  const dashboardModel = new BusinessLaunchFrameworkDashboard();

  const result = framework.generate(createInput());
  const dashboard = dashboardModel.project({ frameworkResult: result });

  assert.equal(typeof dashboard.executiveHealth, 'string');
  assert.equal(typeof dashboard.launchStatus, 'string');
  assert.equal(typeof dashboard.executiveDecisionSignal, 'string');
  assert.equal(typeof dashboard.workforceReadiness.requiredRoles, 'number');
});
