import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchCoordinator } from '../src/research/research-coordinator.js';

test('performInvestigation maps investigation to research request and reuses research pipeline', async () => {
  const coordinator = new ResearchCoordinator({
    route: () => {
      throw new Error('route should not be called directly in this test');
    }
  });
  let receivedRequest = null;

  coordinator.research = async request => {
    receivedRequest = request;

    return { status: 'ok' };
  };

  const result = await coordinator.performInvestigation({
    id: 'INV-001',
    name: 'Customer Demand Check'
  });

  assert.deepEqual(receivedRequest, {
    id: 'INV-001',
    objective: 'Customer Demand Check',
    context: {},
    capability: 'research'
  });
  assert.deepEqual(result, {
    investigationId: 'INV-001',
    investigationName: 'Customer Demand Check',
    research: { status: 'ok' }
  });
});