import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';
import { WebsitePublishReleaseManager } from '../src/executive/website-publish-release-manager.js';
import {
  WebsiteProviderAdapterRegistry,
  SpecialistWebsiteProviderAdapter
} from '../src/executive/website-provider-adapters.js';
import { WebsitePublishChecklistItems } from '../src/executive/website-publish-release-contracts.js';

class PublishReadyAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'WS3 Milestone Adapter', type: 'FRAMER' });
  }

  async publishWebsite({ generatedWebsite } = {}) {
    return {
      websiteId: generatedWebsite?.websiteId ?? 'milestone-site',
      status: 'PUBLISHED',
      publishedUrl: 'https://milestone-live.example'
    };
  }
}

function buildChecklist() {
  return WebsitePublishChecklistItems.map((itemId) => ({
    itemId,
    status: 'COMPLETED',
    completedBy: 'qa',
    completedAt: new Date().toISOString()
  }));
}

test('WS-3 customer portal project exposes guarded publish milestones', async () => {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const customer = missionControl.customerRegistry.createCustomer({
    companyName: 'Publish Milestone Co',
    contactName: 'Owner',
    email: 'owner@publish-milestones.example',
    phone: '+1-555-3000',
    website: 'https://publish-milestones.example',
    industry: 'Services'
  }).customer;

  const mission = missionControl.missionRegistry.createMission({
    customerId: customer.customerId,
    missionType: 'WEBSITE_BUILD',
    currentStage: 'PRODUCTION_STARTED',
    progress: 85
  });

  const registry = new WebsiteProviderAdapterRegistry()
    .register({ adapterType: 'FRAMER', adapter: new PublishReadyAdapter() })
    .register({ adapterType: 'OTHER', adapter: new SpecialistWebsiteProviderAdapter() });

  const publishManager = new WebsitePublishReleaseManager({
    missionControl,
    executivePlanningSystem: planning,
    providerAdapterRegistry: registry
  });

  const portal = new CustomerPortalManager({
    missionControl,
    executivePlanningSystem: planning,
    websitePublishReleaseManager: publishManager
  });

  const releaseCreated = publishManager.createRelease({
    projectId: mission.missionId,
    missionId: mission.missionId,
    customerId: customer.customerId,
    businessId: 'biz_milestones',
    websiteBuildReference: 'build_milestones',
    artifactReference: 'artifact_milestones',
    targetProvider: 'FRAMER',
    deploymentTarget: 'PRODUCTION',
    qaReference: 'qa_milestones',
    paymentReference: 'pay_milestones',
    rollbackReference: 'rollback_milestones'
  });
  assert.equal(releaseCreated.accepted, true);

  const releaseId = releaseCreated.data.release.releaseId;
  publishManager.saveChecklist({ releaseId, items: buildChecklist(), updatedBy: 'qa' });
  publishManager.recordCustomerGoLiveApproval({
    releaseId,
    projectId: mission.missionId,
    customerId: customer.customerId,
    approvedBy: 'owner',
    approved: true
  });
  publishManager.recordCeoPublishApproval({
    releaseId,
    approvedBy: 'ceo',
    approved: true
  });

  const publish = await publishManager.executePublish({
    releaseId,
    idempotencyKey: 'idem-milestone-1',
    requestedBy: 'ops'
  });
  assert.equal(publish.accepted, true);

  const list = portal.listProjects({ customerId: customer.customerId });
  assert.equal(list.found, true);
  assert.equal(list.data.projects.length, 1);

  const project = list.data.projects[0];
  assert.equal(project.publishing.status, 'PUBLISHED');
  assert.equal(project.paymentSummary.milestones.customerGoLiveApproved, true);
  assert.equal(project.paymentSummary.milestones.ceoPublishApproved, true);
  assert.equal(project.paymentSummary.milestones.websitePublished, true);
  assert.equal(project.timeline.some((item) => item.event === 'CUSTOMER_GO_LIVE_APPROVED'), true);
  assert.equal(project.timeline.some((item) => item.event === 'CEO_PUBLISH_APPROVED'), true);
  assert.equal(project.timeline.some((item) => item.event === 'WEBSITE_PUBLISHED'), true);

  const rollback = await publishManager.executeRollback({
    releaseId,
    requestedBy: 'ops',
    reason: 'monitoring-anomaly'
  });
  assert.equal(rollback.accepted, true);

  const updated = portal.getProject({ customerId: customer.customerId, projectId: mission.missionId });
  assert.equal(updated.found, true);
  assert.equal(updated.data.paymentSummary.milestones.websiteRolledBack, true);
  assert.equal(updated.data.timeline.some((item) => item.event === 'WEBSITE_ROLLED_BACK'), true);
});
