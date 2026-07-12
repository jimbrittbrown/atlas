import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SQLiteStorageProvider } from '../src/storage/sqlite-storage-provider.js';
import {
  StrategicRegistryEntryTypes,
  StrategicRegistryStatuses,
  StrategicValueBands
} from '../src/executive/strategic-ideas-registry-contracts.js';
import { StrategicIdeasRegistry } from '../src/executive/strategic-ideas-registry.js';

function createStorageProvider() {
  const base = mkdtempSync(join(tmpdir(), 'atlas-strategic-registry-'));
  return new SQLiteStorageProvider({ databasePath: join(base, 'registry.sqlite') });
}

function createRegistry({ storageProvider, seedOnStartup = false, now = () => '2026-07-12T20:30:00.000Z' } = {}) {
  return new StrategicIdeasRegistry({
    storageProvider,
    seedOnStartup,
    now,
    createdBy: 'EKS_TEST'
  });
}

function createPayload(overrides = {}) {
  return {
    title: overrides.title ?? 'Test Strategic Entry',
    summary: overrides.summary ?? 'Strategic summary for test coverage.',
    entryType: overrides.entryType ?? StrategicRegistryEntryTypes.OPPORTUNITY,
    status: overrides.status ?? StrategicRegistryStatuses.CAPTURED,
    category: overrides.category ?? 'TESTING',
    source: overrides.source ?? 'TEST_SOURCE',
    createdBy: overrides.createdBy ?? 'EKS_TEST',
    businessScope: overrides.businessScope ?? {
      businessId: 'biz_test',
      customerId: 'cust_test',
      productArea: 'PRODUCT_TEST'
    },
    strategicValue: overrides.strategicValue ?? StrategicValueBands.HIGH,
    customerValue: overrides.customerValue ?? StrategicValueBands.MEDIUM,
    revenuePotential: overrides.revenuePotential ?? StrategicValueBands.HIGH,
    technicalComplexity: overrides.technicalComplexity ?? StrategicValueBands.MEDIUM,
    operationalComplexity: overrides.operationalComplexity ?? StrategicValueBands.MEDIUM,
    dependencies: overrides.dependencies ?? [],
    risks: overrides.risks ?? ['test-risk'],
    decisionReason: overrides.decisionReason ?? 'test decision reason',
    deferredReason: overrides.deferredReason ?? null,
    rejectionReason: overrides.rejectionReason ?? null,
    reviewTrigger: overrides.reviewTrigger ?? 'dependency completion',
    nextReviewAt: overrides.nextReviewAt ?? null,
    relatedEntryIds: overrides.relatedEntryIds ?? [],
    tags: overrides.tags ?? ['test', 'strategic'],
    evidenceReferences: overrides.evidenceReferences ?? [{ type: 'test', ref: 'ref-1' }]
  };
}

test('entry creation persists canonical model', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload(), { actor: 'tester' });

  assert.equal(created.accepted, true);
  assert.equal(created.code, 'CREATED');
  assert.equal(typeof created.entry.entryId, 'string');
  assert.equal(created.entry.status, StrategicRegistryStatuses.CAPTURED);
  assert.equal(created.entry.createdBy, 'EKS_TEST');
  assert.equal(Array.isArray(created.entry.dependencies), true);

  provider.closeSync();
});

test('required-field validation fails closed', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload({ title: '', summary: '' }), { actor: 'tester' });
  assert.equal(created.accepted, false);
  assert.equal(created.code, 'INVALID_ENTRY');

  provider.closeSync();
});

test('legal and illegal status transitions are enforced', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload(), { actor: 'tester' });
  const toEvaluating = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    toStatus: StrategicRegistryStatuses.EVALUATING,
    actor: 'tester'
  });

  assert.equal(toEvaluating.accepted, true);
  assert.equal(toEvaluating.entry.status, StrategicRegistryStatuses.EVALUATING);

  const illegal = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: toEvaluating.entry.version,
    toStatus: StrategicRegistryStatuses.COMPLETED,
    actor: 'tester'
  });

  assert.equal(illegal.accepted, false);
  assert.equal(illegal.code, 'ILLEGAL_STATUS_TRANSITION');

  provider.closeSync();
});

test('version conflict rejects stale updates', () => {
  const provider = createStorageProvider();
  const registryA = createRegistry({ storageProvider: provider });

  const created = registryA.createEntry(createPayload({ title: 'Version Conflict Entry' }), { actor: 'tester' });
  const registryB = createRegistry({ storageProvider: provider });
  const updated = registryA.updateEntry({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    patch: { summary: 'updated summary' },
    actor: 'tester'
  });
  assert.equal(updated.accepted, true);

  const stale = registryB.updateEntry({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    patch: { summary: 'stale update' },
    actor: 'tester'
  });

  assert.equal(stale.accepted, false);
  assert.equal(stale.code, 'VERSION_MISMATCH');

  provider.closeSync();
});

test('immutable append-only history is preserved', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload({ title: 'History Entry' }), { actor: 'tester' });
  const historyBefore = registry.listHistory({ entryId: created.entry.entryId });
  assert.equal(historyBefore.length, 1);

  const updated = registry.updateEntry({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    patch: { summary: 'History update' },
    actor: 'tester'
  });
  assert.equal(updated.accepted, true);

  const historyAfter = registry.listHistory({ entryId: created.entry.entryId });
  assert.equal(historyAfter.length, 2);
  assert.equal(historyAfter.every((entry) => Object.isFrozen(entry)), true);
  assert.equal(historyAfter[0].type, 'ENTRY_CREATED');
  assert.equal(historyAfter[1].type, 'ENTRY_UPDATED');

  provider.closeSync();
});

test('deferral and rejection reasons are preserved', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload({ title: 'Deferred and Rejected Entry' }), { actor: 'tester' });

  const deferred = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    toStatus: StrategicRegistryStatuses.DEFERRED,
    deferredReason: 'waiting on readiness',
    actor: 'tester'
  });
  assert.equal(deferred.accepted, true);
  assert.equal(deferred.entry.deferredReason, 'waiting on readiness');

  const toEvaluating = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: deferred.entry.version,
    toStatus: StrategicRegistryStatuses.EVALUATING,
    actor: 'tester'
  });
  assert.equal(toEvaluating.accepted, true);

  const rejected = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: toEvaluating.entry.version,
    toStatus: StrategicRegistryStatuses.REJECTED,
    rejectionReason: 'insufficient strategic fit',
    actor: 'tester'
  });
  assert.equal(rejected.accepted, true);
  assert.equal(rejected.entry.rejectionReason, 'insufficient strategic fit');

  provider.closeSync();
});

test('reconsideration creates explicit history and preserves rejection reason', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload({ title: 'Reconsideration Entry' }), { actor: 'tester' });
  const rejected = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    toStatus: StrategicRegistryStatuses.REJECTED,
    rejectionReason: 'initial reject',
    actor: 'tester'
  });
  assert.equal(rejected.accepted, true);

  const reconsidered = registry.changeStatus({
    entryId: created.entry.entryId,
    expectedVersion: rejected.entry.version,
    toStatus: StrategicRegistryStatuses.EVALUATING,
    reconsiderationReason: 'new supporting evidence',
    actor: 'tester'
  });

  assert.equal(reconsidered.accepted, true);
  assert.equal(reconsidered.entry.rejectionReason, 'initial reject');

  const history = registry.listHistory({ entryId: created.entry.entryId });
  assert.equal(history.some((entry) => entry.changes?.reconsiderationReason === 'new supporting evidence'), true);

  provider.closeSync();
});

test('review due and dependency ready queries work', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({
    storageProvider: provider,
    now: () => '2026-07-12T20:30:00.000Z'
  });

  const completed = registry.createEntry(createPayload({
    title: 'Completed Dependency',
    status: StrategicRegistryStatuses.COMPLETED
  }), { actor: 'tester' });

  const deferred = registry.createEntry(createPayload({
    title: 'Deferred Dependency Ready',
    status: StrategicRegistryStatuses.DEFERRED,
    deferredReason: 'waiting on completed dependency',
    dependencies: [completed.entry.entryId]
  }), { actor: 'tester' });

  const scheduled = registry.scheduleReview({
    entryId: deferred.entry.entryId,
    expectedVersion: deferred.entry.version,
    nextReviewAt: '2026-07-12T20:00:00.000Z',
    reviewTrigger: 'monthly review',
    actor: 'tester'
  });

  assert.equal(scheduled.accepted, true);

  const due = registry.listEntriesDueForReview({ at: '2026-07-12T20:30:00.000Z' });
  assert.equal(due.some((entry) => entry.entryId === deferred.entry.entryId), true);

  const ready = registry.listDeferredDependencyReady({});
  assert.equal(ready.some((entry) => entry.entryId === deferred.entry.entryId), true);

  provider.closeSync();
});

test('filtering by entry type, status, and category works', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  registry.createEntry(createPayload({ title: 'Filter Opportunity', entryType: StrategicRegistryEntryTypes.OPPORTUNITY, category: 'GROWTH' }), { actor: 'tester' });
  registry.createEntry(createPayload({ title: 'Filter Lesson', entryType: StrategicRegistryEntryTypes.LESSON_LEARNED, category: 'LESSONS', status: StrategicRegistryStatuses.ACTIVE }), { actor: 'tester' });

  const byType = registry.listEntries({ entryType: StrategicRegistryEntryTypes.LESSON_LEARNED });
  const byStatus = registry.listEntries({ status: StrategicRegistryStatuses.ACTIVE });
  const byCategory = registry.listEntries({ category: 'LESSONS' });

  assert.equal(byType.length, 1);
  assert.equal(byStatus.length, 1);
  assert.equal(byCategory.length, 1);

  provider.closeSync();
});

test('no hard-delete behavior and archive preserves evidence', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload({ title: 'Archive Entry' }), { actor: 'tester' });
  const archived = registry.archiveEntry({
    entryId: created.entry.entryId,
    expectedVersion: created.entry.version,
    actor: 'tester',
    reason: 'retained for institutional memory'
  });

  assert.equal(typeof registry.deleteEntry, 'undefined');
  assert.equal(archived.accepted, true);
  assert.equal(archived.entry.status, StrategicRegistryStatuses.ARCHIVED);
  assert.equal(registry.getEntry({ entryId: created.entry.entryId, includeArchived: false }), null);
  assert.equal(registry.getEntry({ entryId: created.entry.entryId, includeArchived: true })?.entryId, created.entry.entryId);

  const history = registry.listHistory({ entryId: created.entry.entryId });
  assert.equal(history.length >= 2, true);

  provider.closeSync();
});

test('business isolation is enforced in list and get', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const a = registry.createEntry(createPayload({ title: 'Business A', businessScope: { businessId: 'biz_a', customerId: null, productArea: 'A' } }), { actor: 'tester' });
  const b = registry.createEntry(createPayload({ title: 'Business B', businessScope: { businessId: 'biz_b', customerId: null, productArea: 'B' } }), { actor: 'tester' });

  const listA = registry.listEntries({ businessId: 'biz_a' });
  assert.equal(listA.length, 1);
  assert.equal(listA[0].entryId, a.entry.entryId);

  const forbidden = registry.getEntry({ entryId: b.entry.entryId, businessId: 'biz_a' });
  assert.equal(forbidden, null);

  provider.closeSync();
});

test('audit entries are redacted for sensitive keys', () => {
  const provider = createStorageProvider();
  const registry = createRegistry({ storageProvider: provider });

  const created = registry.createEntry(createPayload({
    title: 'Audit Redaction Entry',
    evidenceReferences: [{ type: 'secret', token: 'dont-log-this' }]
  }), { actor: 'tester' });

  const auditRows = Array.from(registry.audit.values());
  const createdAudit = auditRows.find((entry) => entry.event === 'strategic_entry_created' && entry.details.entryId === created.entry.entryId);

  assert.equal(Boolean(createdAudit), true);
  assert.equal(createdAudit.details?.token ?? null, null);

  registry.recordAudit('strategic_entry_updated', {
    entryId: created.entry.entryId,
    password: 'never-store',
    customerMessageBody: 'sensitive'
  });

  const explicitAudit = Array.from(registry.audit.values()).find((entry) => entry.details?.password === '[REDACTED]');
  assert.equal(Boolean(explicitAudit), true);
  assert.equal(explicitAudit.details.customerMessageBody, '[REDACTED]');

  provider.closeSync();
});

test('initial seed entries are present and idempotent without duplicates', () => {
  const provider = createStorageProvider();
  const registryA = createRegistry({ storageProvider: provider, seedOnStartup: true });
  const registryB = createRegistry({ storageProvider: provider, seedOnStartup: true });

  const entriesA = registryA.listEntries({ includeArchived: true });
  const entriesB = registryB.listEntries({ includeArchived: true });

  assert.equal(entriesA.length, 18);
  assert.equal(entriesB.length, 18);

  const titles = entriesB.map((entry) => entry.title);
  assert.equal(new Set(titles).size, 18);
  assert.equal(titles.includes('Website Care service'), true);
  assert.equal(titles.includes('Executive Knowledge Platform'), true);
  assert.equal(titles.includes('Notification Platform certification lesson'), true);

  provider.closeSync();
});
