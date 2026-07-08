import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchCoordinator } from '../src/research/research-coordinator.js';
import { SynthesisEngine } from '../src/research/synthesis-engine.js';

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

test('research generates findings in report', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-001',
    objective: 'Check outcome',
    capability: 'research'
  });

  assert.equal(Array.isArray(result.report.findings), true);
  assert.equal(result.report.findings.length, 1);
  assert.equal(
    result.report.findings[0].statement,
    'All routed providers completed successfully.'
  );
});

test('research passes generated findings into synthesis engine', async () => {
  const originalSynthesize = SynthesisEngine.prototype.synthesize;
  let synthesisInput = null;

  SynthesisEngine.prototype.synthesize = function synthesize(report) {
    synthesisInput = report;

    return {
      capability: report.capability,
      providerCount: report.providers.length,
      confidence: report.confidence,
      agreement: report.confidence.agreement,
      executiveSummary: 'Synthesis not yet implemented.',
      findings: report.findings,
      conflicts: [],
      recommendations: []
    };
  };

  try {
    const provider = {
      identity: () => ({ vendor: 'TestProvider' }),
      execute: async () => ({ payload: 'ok' })
    };
    const coordinator = new ResearchCoordinator({
      route: () => ({ capability: 'research', providers: [provider] })
    });

    const result = await coordinator.research({
      id: 'REQ-002',
      objective: 'Check synthesis input',
      capability: 'research'
    });

    assert.equal(Array.isArray(synthesisInput.findings), true);
    assert.equal(synthesisInput.findings.length, 1);
    assert.deepEqual(result.report.synthesis.findings, result.report.findings);
  } finally {
    SynthesisEngine.prototype.synthesize = originalSynthesize;
  }
});