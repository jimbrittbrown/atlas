import test from 'node:test';
import assert from 'node:assert/strict';
import { InvestigationManager } from '../src/research/investigation-manager.js';

test('executeInvestigations runs performInvestigation in parallel and returns results', async () => {
  const resolvers = new Map();
  const started = [];
  const researchCoordinator = {
    performInvestigation: investigation => {
      started.push(investigation.id);

      return new Promise(resolve => {
        resolvers.set(investigation.id, () => {
          resolve({ investigationId: investigation.id, research: { status: 'ok' } });
        });
      });
    }
  };
  const manager = new InvestigationManager(researchCoordinator);
  const investigations = [
    { id: 'INV-001', name: 'Market Scan' },
    { id: 'INV-002', name: 'Risk Scan' }
  ];

  const executionPromise = manager.executeInvestigations(investigations);

  await Promise.resolve();
  assert.deepEqual(started, ['INV-001', 'INV-002']);

  resolvers.get('INV-001')();
  resolvers.get('INV-002')();

  const results = await executionPromise;

  assert.deepEqual(results, [
    { investigationId: 'INV-001', research: { status: 'ok' } },
    { investigationId: 'INV-002', research: { status: 'ok' } }
  ]);
});