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
      executiveSummary: 'Evidence summary generated.',
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

test('research generates beliefs from findings', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-003',
    objective: 'Generate beliefs',
    capability: 'research'
  });

  assert.equal(result.report.findings.length, 1);
  assert.equal(result.report.beliefs.length, 1);
  assert.equal(result.report.beliefs[0].statement, result.report.findings[0].statement);
  assert.deepEqual(result.report.beliefs[0].supportingFindings, [result.report.findings[0].id]);
});

test('research report includes beliefs', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-004',
    objective: 'Belief field check',
    capability: 'research'
  });

  assert.equal(Array.isArray(result.report.beliefs), true);
  assert.equal(result.report.beliefs.length > 0, true);
});

test('research generates importance from beliefs', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-005',
    objective: 'Importance check',
    capability: 'research'
  });

  assert.equal(Array.isArray(result.report.importance), true);
  assert.equal(result.report.importance.length, result.report.beliefs.length);
  assert.equal(result.report.importance[0].importance, 'high');
});

test('research passes generated importance into synthesis engine', async () => {
  const originalSynthesize = SynthesisEngine.prototype.synthesize;
  let synthesisInput = null;

  SynthesisEngine.prototype.synthesize = function synthesize(report) {
    synthesisInput = report;

    return {
      capability: report.capability,
      providerCount: report.providers.length,
      confidence: report.confidence,
      agreement: report.confidence.agreement,
      executiveSummary: 'Evidence summary generated.',
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
      id: 'REQ-006',
      objective: 'Synthesis importance input check',
      capability: 'research'
    });

    assert.equal(Array.isArray(synthesisInput.importance), true);
    assert.equal(synthesisInput.importance.length, 1);
    assert.deepEqual(result.report.importance, synthesisInput.importance);
  } finally {
    SynthesisEngine.prototype.synthesize = originalSynthesize;
  }
});

test('research generates decision readiness', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-007',
    objective: 'Decision readiness check',
    capability: 'research'
  });

  assert.equal(typeof result.report.decisionReadiness, 'object');
  assert.equal(result.report.decisionReadiness.status, 'READY_WITH_CONDITIONS');
  assert.equal(Array.isArray(result.report.decisionReadiness.missingEvidence), true);
  assert.equal(Array.isArray(result.report.decisionReadiness.criticalUnknowns), true);
});

test('research passes decision readiness into synthesis engine', async () => {
  const originalSynthesize = SynthesisEngine.prototype.synthesize;
  let synthesisInput = null;

  SynthesisEngine.prototype.synthesize = function synthesize(report) {
    synthesisInput = report;

    return {
      capability: report.capability,
      providerCount: report.providers.length,
      confidence: report.confidence,
      agreement: report.confidence.agreement,
      executiveSummary: 'Evidence summary generated.',
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
      id: 'REQ-008',
      objective: 'Synthesis decision readiness input check',
      capability: 'research'
    });

    assert.equal(typeof synthesisInput.decisionReadiness, 'object');
    assert.deepEqual(result.report.decisionReadiness, synthesisInput.decisionReadiness);
  } finally {
    SynthesisEngine.prototype.synthesize = originalSynthesize;
  }
});

test('research generates executive tensions', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-009',
    objective: 'Executive tensions check',
    capability: 'research'
  });

  assert.equal(Array.isArray(result.report.executiveTensions), true);
  assert.equal(result.report.executiveTensions.length, 1);
  assert.equal(result.report.executiveTensions[0].title, 'Executive Review Required');
});

test('research passes executive tensions into synthesis engine', async () => {
  const originalSynthesize = SynthesisEngine.prototype.synthesize;
  let synthesisInput = null;

  SynthesisEngine.prototype.synthesize = function synthesize(report) {
    synthesisInput = report;

    return {
      capability: report.capability,
      providerCount: report.providers.length,
      confidence: report.confidence,
      agreement: report.confidence.agreement,
      executiveSummary: 'Evidence summary generated.',
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
      id: 'REQ-010',
      objective: 'Synthesis tensions input check',
      capability: 'research'
    });

    assert.equal(Array.isArray(synthesisInput.executiveTensions), true);
    assert.equal(synthesisInput.executiveTensions.length, 1);
    assert.deepEqual(result.report.executiveTensions, synthesisInput.executiveTensions);
  } finally {
    SynthesisEngine.prototype.synthesize = originalSynthesize;
  }
});

test('research executive summary is generated from evidence via synthesis output', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-011',
    objective: 'Executive summary evidence generation check',
    capability: 'research'
  });

  assert.equal(result.report.executiveSummary, result.report.synthesis.executiveSummary);
  assert.match(result.report.executiveSummary, /Strongest finding:/);
  assert.match(result.report.executiveSummary, /Highest-importance belief:/);
  assert.match(result.report.executiveSummary, /Readiness: READY_WITH_CONDITIONS/);
  assert.match(result.report.executiveSummary, /Primary executive tension:/);
});

test('research executive summary placeholder no longer exists', async () => {
  const provider = {
    identity: () => ({ vendor: 'TestProvider' }),
    execute: async () => ({ payload: 'ok' })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-012',
    objective: 'Executive summary placeholder removal check',
    capability: 'research'
  });

  assert.notEqual(result.report.executiveSummary, 'Synthesis not yet implemented.');
  assert.notEqual(result.report.executiveSummary, 'Pending synthesis');
});

test('research findings include evidence traceability metadata', async () => {
  const provider = {
    identity: () => ({ vendor: 'TraceProvider' }),
    execute: async () => ({ payload: { result: 'ok', detail: 'provider output' } })
  };
  const coordinator = new ResearchCoordinator({
    route: () => ({ capability: 'research', providers: [provider] })
  });

  const result = await coordinator.research({
    id: 'REQ-TRACE-001',
    objective: 'Traceability check',
    capability: 'research'
  });

  const finding = result.report.findings[0];
  const evidence = finding.supportingEvidence[0];

  assert.equal(Array.isArray(finding.supportingEvidence), true);
  assert.equal(finding.supportingEvidence.length > 0, true);
  assert.equal(evidence.provider, 'TraceProvider');
  assert.equal(evidence.requestId, 'REQ-TRACE-001');
  assert.deepEqual(evidence.sourceResponse, { payload: { result: 'ok', detail: 'provider output' } });
  assert.equal(result.report.beliefs[0].supportingFindings.length > 0, true);
});