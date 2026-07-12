import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveCouncilRuntime } from '../src/executive-council-runtime.js';

function baseContracts(decision = 'APPROVE') {
  const evidenceReferences = ['EVIDENCE-001'];

  return {
    COO: { decision, confidence: 85, rationale: 'COO rationale', evidenceReferences },
    CMO: { decision, confidence: 80, rationale: 'CMO rationale', evidenceReferences },
    CFO: { decision, confidence: 79, rationale: 'CFO rationale', evidenceReferences },
    CCO: { decision, confidence: 82, rationale: 'CCO rationale', evidenceReferences },
    CTO: { decision, confidence: 86, rationale: 'CTO rationale', evidenceReferences },
    CQO: { decision, confidence: 90, rationale: 'CQO rationale', evidenceReferences }
  };
}

test('unanimous approval outcome is supported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const result = runtime.evaluate({ recommendationContracts: baseContracts('APPROVE') });

  assert.equal(result.validation.isValid, true);
  assert.equal(result.outcome, 'UNANIMOUS_APPROVE');
  assert.equal(result.recommendedCEOAction, 'APPROVE');
});

test('waiver approval outcome is supported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('APPROVE');
  contracts.COO = {
    decision: 'APPROVE_WITH_WAIVERS',
    confidence: 84,
    rationale: 'Approve with waivers',
    evidenceReferences: ['EVIDENCE-001'],
    waivers: [{ waiverId: 'W-001' }]
  };

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, true);
  assert.equal(result.outcome, 'APPROVE_WITH_WAIVERS');
  assert.equal(result.recommendedCEOAction, 'APPROVE_WITH_WAIVERS');
  assert.equal(result.waivers.length > 0, true);
});

test('revision required outcome is supported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('APPROVE');
  contracts.CCO = {
    decision: 'REVISE',
    confidence: 70,
    rationale: 'Needs creative revision',
    evidenceReferences: ['EVIDENCE-001']
  };

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, true);
  assert.equal(result.outcome, 'REVISION_REQUIRED');
  assert.equal(result.recommendedCEOAction, 'RETURN_FOR_REVISION');
});

test('block outcome is supported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('BLOCK');

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, true);
  assert.equal(result.outcome, 'BLOCK');
  assert.equal(result.recommendedCEOAction, 'REJECT');
});

test('conflict outcome is supported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('APPROVE');
  contracts.CQO = {
    decision: 'BLOCK',
    confidence: 92,
    rationale: 'Quality blocked',
    evidenceReferences: ['EVIDENCE-001']
  };

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, true);
  assert.equal(result.outcome, 'CONFLICT');
  assert.equal(result.conflicts.length > 0, true);
  assert.equal(result.recommendedCEOAction, 'RETURN_FOR_REVISION');
});

test('missing recommendation is reported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('APPROVE');
  delete contracts.CQO;

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, false);
  assert.equal(result.validation.issues.some(issue => issue.type === 'MISSING_RECOMMENDATION'), true);
});

test('invalid confidence is reported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('APPROVE');
  contracts.CFO = {
    ...contracts.CFO,
    confidence: 140
  };

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, false);
  assert.equal(result.validation.issues.some(issue => issue.type === 'INVALID_CONFIDENCE'), true);
});

test('invalid decision is reported', () => {
  const runtime = new ExecutiveCouncilRuntime();
  const contracts = baseContracts('APPROVE');
  contracts.CMO = {
    ...contracts.CMO,
    decision: 'UNKNOWN_DECISION'
  };

  const result = runtime.evaluate({ recommendationContracts: contracts });

  assert.equal(result.validation.isValid, false);
  assert.equal(result.validation.issues.some(issue => issue.type === 'INVALID_DECISION'), true);
});
