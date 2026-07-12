import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';

test('customer dashboard fields are projected for projects list', () => {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: new CustomerPortalManager({
      missionControl,
      executivePlanningSystem: planning,
      workforceDirector: missionControl.workforceDirector
    })
  });

  const created = manager.customerPortalManager.submitWebsiteRequest({
    businessName: 'Customer Dashboard Fields',
    businessType: 'Services',
    websiteUrl: 'https://customer-dashboard-fields.example',
    contactName: 'Dashboard Owner',
    email: 'owner@customer-dashboard-fields.example',
    phone: '+1-555-0880',
    targetAudience: 'buyers',
    businessDescription: 'Validate dashboard field projection.',
    goals: ['launch'],
    budget: '$5,000 - $15,000',
    timeline: '6 weeks',
    desiredPages: ['home', 'services', 'contact']
  });

  const response = manager.customerPortalManager.listProjects({ customerId: created.data.customerId });

  assert.equal(response.found, true);
  assert.equal(response.data.projects.length >= 1, true);

  const project = response.data.projects[0];
  assert.equal(Boolean(project.projectStatus), true);
  assert.equal(Boolean(project.submittedDate), true);
  assert.equal(Boolean(project.currentStage), true);
  assert.equal(Array.isArray(project.assignedWorkforce), true);
  assert.equal(Boolean(project.executiveReviewStatus), true);
  assert.equal(typeof project.revisionCount, 'number');
  assert.equal(Array.isArray(project.messages), true);
  assert.equal(Array.isArray(project.downloadDeliverables), true);
});
