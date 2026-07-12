import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerRegistry } from '../src/executive/customer-registry.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { CustomerIntakeEngine } from '../src/executive/customer-intake-engine.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { MissionTypes } from '../src/executive/customer-intake-mission-control-contracts.js';

test('customer registry detects duplicates by company+website or company+email', () => {
  const registry = new CustomerRegistry();

  const first = registry.createCustomer({
    companyName: 'Acme Roofing',
    contactName: 'Alex',
    email: 'ops@acme.com',
    phone: '123',
    website: 'https://acme.example',
    industry: 'Roofing'
  });

  const second = registry.createCustomer({
    companyName: 'Acme Roofing',
    contactName: 'Taylor',
    email: 'ops@acme.com',
    phone: '999',
    website: 'https://another.example',
    industry: 'Roofing'
  });

  assert.equal(first.duplicateDetected, false);
  assert.equal(second.duplicateDetected, true);
  assert.equal(second.customer.customerId, first.customer.customerId);
});

test('intake engine validates required fields and rejects invalid requests', async () => {
  const engine = new CustomerIntakeEngine({
    customerRegistry: new CustomerRegistry(),
    missionRegistry: new MissionRegistry(),
    missionLaunchers: {
      [MissionTypes.WEBSITE_BUILD]: async () => ({ mission: { state: 'COMPLETED', currentStageId: 'DONE' }, progress: { completionPercentage: 100 } })
    }
  });

  const result = await engine.processIntake({
    companyName: '',
    website: 'bad-url',
    missionType: 'WEBSITE_BUILD'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.issues.length > 0, true);
});

test('mission control creates customer+mission and routes WEBSITE_BUILD downstream', async () => {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();

  const control = new CustomerIntakeMissionControl({
    intakeEngine: new CustomerIntakeEngine({
      customerRegistry,
      missionRegistry,
      missionLaunchers: {
        [MissionTypes.WEBSITE_BUILD]: async () => ({
          mission: { state: 'COMPLETED', currentStageId: 'SANDBOX_PROJECT_UPSERT' },
          progress: { completionPercentage: 100 }
        })
      }
    }),
    customerRegistry,
    missionRegistry
  });

  const result = await control.intake({
    companyName: 'North Ridge HVAC',
    contactName: 'Morgan Lee',
    email: 'morgan@northridge.example',
    phone: '+1-303-555-0199',
    website: 'https://northridge.example',
    industry: 'Home Services',
    missionType: 'WEBSITE_BUILD',
    adapterType: 'FRAMER'
  });

  assert.equal(result.accepted, true);
  assert.equal(typeof result.customer.customerId, 'string');
  assert.equal(typeof result.mission.missionId, 'string');
  assert.equal(result.mission.executiveStatus, 'AWAITING_EXECUTIVE_REVIEW');
});

test('dashboard model reports totals and recent activity', async () => {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();

  const control = new CustomerIntakeMissionControl({
    intakeEngine: new CustomerIntakeEngine({
      customerRegistry,
      missionRegistry,
      missionLaunchers: {
        [MissionTypes.WEBSITE_BUILD]: async () => ({
          mission: { state: 'COMPLETED', currentStageId: 'SANDBOX_PROJECT_UPSERT' },
          progress: { completionPercentage: 100 }
        })
      }
    }),
    customerRegistry,
    missionRegistry
  });

  await control.intake({
    companyName: 'Atlas Demo Co',
    contactName: 'Jamie',
    email: 'jamie@atlasdemo.example',
    phone: '123',
    website: 'https://atlasdemo.example',
    industry: 'Media',
    missionType: 'WEBSITE_BUILD',
    adapterType: 'FRAMER'
  });

  const dashboard = control.buildDashboard();

  assert.equal(dashboard.totalCustomers, 1);
  assert.equal(dashboard.awaitingExecutiveReview, 1);
  assert.equal(dashboard.blockedMissions, 0);
  assert.equal(Array.isArray(dashboard.recentActivityFeed), true);
  assert.equal(dashboard.recentActivityFeed.length > 0, true);
});
