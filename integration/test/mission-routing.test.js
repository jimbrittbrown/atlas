import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';

function createSystem() {
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

  return { missionControl, planning, manager };
}

test('customer portal routing persists WEBSITE_BUILD mission records', () => {
  const { manager, missionControl } = createSystem();

  const created = manager.customerPortalManager.submitWebsiteRequest({
    businessName: 'Routing Verification Co',
    businessType: 'Local Services',
    websiteUrl: 'https://routing-verification.example',
    contactName: 'Alex Routing',
    email: 'alex@routing-verification.example',
    phone: '+1-555-0771',
    targetAudience: 'Homeowners',
    businessDescription: 'Verify mission routing and persistence.',
    goals: ['Launch website'],
    budget: '$7,000 - $12,000',
    timeline: '5 weeks',
    desiredPages: ['home', 'services', 'contact']
  });

  assert.equal(created.accepted, true);
  const mission = missionControl.missionRegistry.getMissionById(created.data.missionId);
  assert.equal(Boolean(mission), true);
  assert.equal(mission.missionType, 'WEBSITE_BUILD');
  assert.equal(mission.portalRequestId.startsWith('cpr_'), true);
});

test('revision requests maintain revision history', () => {
  const { manager } = createSystem();

  const created = manager.customerPortalManager.submitWebsiteRequest({
    businessName: 'Revision History Co',
    businessType: 'Consulting',
    websiteUrl: 'https://revision-history.example',
    contactName: 'Pat Revision',
    email: 'pat@revision-history.example',
    phone: '+1-555-0772',
    targetAudience: 'Business owners',
    businessDescription: 'Verify revision lineage.',
    goals: ['Launch site and revise'],
    budget: '$12,000 - $30,000',
    timeline: '10 weeks',
    desiredPages: ['home', 'about', 'contact']
  });

  const revision = manager.customerPortalManager.requestRevision({
    customerId: created.data.customerId,
    missionId: created.data.missionId,
    reason: 'Adjust palette',
    requestedBy: 'customer'
  });

  assert.equal(revision.accepted, true);
  assert.equal(revision.data.revisionCount, 1);

  const second = manager.customerPortalManager.requestRevision({
    customerId: created.data.customerId,
    missionId: created.data.missionId,
    reason: 'Add new section',
    requestedBy: 'customer'
  });

  assert.equal(second.accepted, true);
  assert.equal(second.data.revisionCount, 2);
});

test('downloads endpoint returns deliverable references', () => {
  const { manager } = createSystem();

  const created = manager.customerPortalManager.submitWebsiteRequest({
    businessName: 'Download Package Co',
    businessType: 'Education',
    websiteUrl: 'https://download-package.example',
    contactName: 'Sam Downloads',
    email: 'sam@download-package.example',
    phone: '+1-555-0773',
    targetAudience: 'Learners',
    businessDescription: 'Verify customer deliverable references.',
    goals: ['Package delivery'],
    budget: '$9,000 - $18,000',
    timeline: '7 weeks',
    desiredPages: ['home', 'programs', 'contact']
  });

  const downloads = manager.customerPortalManager.getDownloads({
    customerId: created.data.customerId,
    projectId: created.data.missionId
  });

  assert.equal(downloads.found, true);
  assert.equal(downloads.data.downloads.length, 5);
});
