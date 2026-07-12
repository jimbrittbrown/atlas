import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import { PostgreSQLStorageProvider } from '../src/storage/postgresql-storage-provider.js';
import { CustomerRegistry } from '../src/executive/customer-registry.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { WorkforceRegistry } from '../src/executive/workforce-registry.js';
import { createDefaultWebsiteWorkforceRoster } from '../src/executive/website-workforce-roster.js';
import { DashboardSnapshotRegistry } from '../src/executive/dashboard-snapshot-registry.js';
import { ExecutiveDashboardApiAuditLog } from '../src/executive/executive-dashboard-api-audit-log.js';
import { InMemoryExecutiveOperationsLoopStore } from '../src/executive/executive-operations-loop-store.js';
import { AtlasPersistentOperationsRuntime } from '../src/executive/atlas-persistent-operations-runtime.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';

function withSqliteProvider(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-persist-'));
  const databasePath = join(dir, 'atlas.sqlite');
  const provider = new SQLiteStorageProvider({ databasePath });
  provider.initializeSync();
  const cleanup = () => {
    provider.closeSync();
    rmSync(dir, { recursive: true, force: true });
  };

  const result = callback({ provider, dir, databasePath });
  if (result && typeof result.then === 'function') {
    return result.finally(cleanup);
  }

  cleanup();
  return result;
}

test('sqlite provider runs migrations and stores records/events/meta', () => {
  withSqliteProvider(({ provider }) => {
    provider.upsertRecordSync('records', 'a', { value: 1 });
    provider.appendEventSync('events', 'e1', { type: 'EVENT' });
    provider.setMetaSync('meta', 'm1', { ok: true });

    assert.equal(provider.listRecordsSync('records').length, 1);
    assert.equal(provider.listEventsSync('events').length, 1);
    assert.deepEqual(provider.getMetaSync('meta', 'm1'), { ok: true });
  });
});

test('postgres provider exposes implementation surface without connecting in tests', () => {
  const provider = new PostgreSQLStorageProvider({ connectionString: 'postgres://atlas:atlas@localhost:5432/atlas' });
  assert.equal(typeof provider.initialize, 'function');
  assert.equal(typeof provider.listRecords, 'function');
});

test('customer registry persists across restart', () => {
  withSqliteProvider(({ provider }) => {
    const first = new CustomerRegistry({ storageProvider: provider });
    const created = first.createCustomer({
      companyName: 'Persistent Customer',
      contactName: 'Ops',
      email: 'ops@persistent.example',
      phone: '123',
      website: 'https://persistent.example',
      industry: 'Media'
    });

    const second = new CustomerRegistry({ storageProvider: provider });
    assert.equal(second.getCustomerById(created.customer.customerId)?.companyName, 'Persistent Customer');
  });
});

test('mission registry persists across restart', () => {
  withSqliteProvider(({ provider }) => {
    const first = new MissionRegistry({ storageProvider: provider });
    const mission = first.createMission({ customerId: 'cus_1', missionType: 'WEBSITE_BUILD' });

    const second = new MissionRegistry({ storageProvider: provider });
    assert.equal(second.getMissionById(mission.missionId)?.missionType, 'WEBSITE_BUILD');
  });
});

test('workforce registry persists worker state across restart', () => {
  withSqliteProvider(({ provider }) => {
    const first = new WorkforceRegistry({ storageProvider: provider, initialWorkers: createDefaultWebsiteWorkforceRoster() });
    const worker = first.listWorkers()[0];
    first.updateWorker(worker.workerId, { currentMission: 'mis_1', status: 'BUSY' });

    const second = new WorkforceRegistry({ storageProvider: provider, initialWorkers: createDefaultWebsiteWorkforceRoster() });
    assert.equal(second.getWorkerById(worker.workerId)?.currentMission, 'mis_1');
  });
});

test('dashboard snapshots persist across restart', () => {
  withSqliteProvider(({ provider }) => {
    const first = new DashboardSnapshotRegistry({ storageProvider: provider });
    first.saveSnapshot({ hello: 'world' });

    const second = new DashboardSnapshotRegistry({ storageProvider: provider });
    assert.equal(second.listSnapshots().length, 1);
    assert.equal(second.getLatestSnapshot()?.snapshot?.hello, 'world');
  });
});

test('api audit logs persist across restart', () => {
  withSqliteProvider(({ provider }) => {
    const first = new ExecutiveDashboardApiAuditLog({ storageProvider: provider });
    first.record({ requestId: 'r1', role: 'CEO', endpoint: '/api/v1/dashboard', operation: 'READ', success: true, responseCategory: 'OK', filters: {}, clientId: 'client', durationMs: 1 });

    const second = new ExecutiveDashboardApiAuditLog({ storageProvider: provider });
    assert.equal(second.listEvents().length, 1);
  });
});

test('operations loop store persists alerts, metrics, and heartbeat across restart', () => {
  withSqliteProvider(({ provider }) => {
    const first = new InMemoryExecutiveOperationsLoopStore({ storageProvider: provider });
    first.transitionLoopState('RUNNING');
    first.touchHeartbeat();
    first.upsertAlert('alert:1', { alertId: 'alert1', firstDetectedAt: new Date().toISOString(), lastDetectedAt: new Date().toISOString(), occurrenceCount: 1 });
    first.completeCycle({ cycleId: 'c1', state: 'COMPLETED', durationMs: 10 });

    const second = new InMemoryExecutiveOperationsLoopStore({ storageProvider: provider });
    assert.equal(second.getStatus().loopState, 'RUNNING');
    assert.equal(second.listAlerts().length, 1);
    assert.equal(second.getStatus().metrics.totalCycles, 1);
  });
});

test('automatic startup recovery restores registries, proposals, snapshots, loop alerts, and orchestrator sessions', async () => {
  await withSqliteProvider(async ({ provider }) => {
    const missionControl = new CustomerIntakeMissionControl({ storageProvider: provider });
    const customer = missionControl.customerRegistry.createCustomer({
      companyName: 'Recovered Co',
      contactName: 'Ops',
      email: 'ops@recovered.example',
      phone: '123',
      website: 'https://recovered.example',
      industry: 'Media'
    }).customer;

    const planning = new ExecutivePlanningSystem({ missionControl, storageProvider: provider });
    const proposal = planning.submitProposal({
      sourceType: 'CEO',
      sourceId: 'persist-source',
      customerId: customer.customerId,
      title: 'Recovered proposal',
      description: 'Persisted proposal',
      missionType: 'WEBSITE_BUILD',
      requestedOutcome: 'Recovery',
      strategicObjective: 'Persistence',
      expectedBusinessValue: 88,
      urgency: 77,
      estimatedEffort: 25,
      estimatedCost: 70000,
      estimatedDuration: 35,
      dependencies: [],
      requiredCapabilities: ['COMPANY_RESEARCH'],
      risks: [{ id: 'risk-1', severity: 0.2 }],
      confidence: 0.8,
      metadata: { strategicAlignment: 0.9 }
    });
    planning.evaluateAll();
    planning.rankPortfolio();
    planning.applyDecision({
      proposalId: proposal.proposal.proposalId,
      decision: ExecutiveDecisions.APPROVE,
      decidedBy: 'CEO',
      rationale: 'persist',
      conditions: []
    });

    const runtimeA = new AtlasPersistentOperationsRuntime({ storageProvider: provider });
    const envA = runtimeA.initializeSync();
    await envA.dashboardManager.missionOrchestratorManager.orchestrate({ proposalId: proposal.proposal.proposalId });
    envA.dashboardManager.snapshotRegistry.saveSnapshot({ status: 'ok' });
    envA.dashboardManager.operationsLoopManager.store.upsertAlert('ops:1', { alertId: 'ops1', firstDetectedAt: new Date().toISOString(), lastDetectedAt: new Date().toISOString(), occurrenceCount: 1 });
    await runtimeA.close();

    const runtimeB = new AtlasPersistentOperationsRuntime({ storageProvider: provider });
    runtimeB.initializeSync();
    const summary = runtimeB.buildRecoverySummary();

    assert.equal(summary.recoveredCustomers >= 1, true);
    assert.equal(summary.recoveredMissions >= 1, true);
    assert.equal(summary.recoveredWorkers >= 1, true);
    assert.equal(summary.recoveredProposals >= 1, true);
    assert.equal(summary.recoveredSnapshots >= 1, true);
    assert.equal(summary.recoveredLoopAlerts >= 1, true);
    assert.equal(summary.recoveredOrchestratorSessions >= 1, true);

    await runtimeB.close();
  });
});
