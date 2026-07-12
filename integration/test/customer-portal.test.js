import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';

test('customer portal manager creates request and dashboard projection', () => {
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

  const result = manager.customerPortalManager.submitWebsiteRequest({
    businessName: 'Customer Portal Foundation',
    businessType: 'Professional Services',
    websiteUrl: 'https://customer-portal-foundation.example',
    contactName: 'Portal Owner',
    email: 'owner@customer-portal-foundation.example',
    phone: '+1-555-0660',
    targetAudience: 'Prospects',
    businessDescription: 'Validate customer portal production foundation.',
    goals: ['Launch website intake'],
    budget: '$10,000 - $25,000',
    timeline: '8 weeks',
    desiredPages: ['home', 'services', 'contact']
  });

  assert.equal(result.accepted, true);

  const projection = manager.customerPortalManager.getDashboardProjection();
  assert.equal(projection.totalRequests >= 1, true);
  assert.equal(projection.totalAccounts >= 1, true);
  assert.equal(projection.activeSessions >= 1, true);
});
