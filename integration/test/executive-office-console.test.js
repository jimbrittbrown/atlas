import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveOfficeConsole } from '../src/executive/executive-office-console.js';

class MockIO {
  constructor(inputs = []) {
    this.inputs = [...inputs];
    this.outputs = [];
    this.closed = false;
  }

  writeLine(message = '') {
    this.outputs.push(message);
  }

  async prompt(message) {
    this.outputs.push(message);

    return this.inputs.shift() ?? '';
  }

  close() {
    this.closed = true;
  }
}

test('business evaluation selection builds a business opportunity request', async () => {
  let receivedRequest = null;
  const io = new MockIO(['1', 'Horror Shorts Studio', 'AI-generated horror shorts for YouTube', '2']);
  const consoleApp = new ExecutiveOfficeConsole({
    io,
    businessEvaluationApplication: {
      evaluateBusinessOpportunity: async request => {
        receivedRequest = request;

        return {
          executiveSummary: 'Summary',
          recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
          confidence: 80,
          decisionReadiness: { status: 'READY' },
          authorityRequired: 'CEO Strategic Approval'
        };
      }
    }
  });

  await consoleApp.run();

  assert.deepEqual(receivedRequest, {
    id: 'BO-HORROR-SHORTS-STUDIO',
    businessName: 'Horror Shorts Studio',
    description: 'AI-generated horror shorts for YouTube',
    businessOpportunity: 'Horror Shorts Studio - AI-generated horror shorts for YouTube',
    objective: 'Evaluate Horror Shorts Studio: AI-generated horror shorts for YouTube',
    ceoQuestions: []
  });
  assert.equal(io.closed, true);
});

test('business evaluation executes business evaluation application once', async () => {
  let executionCount = 0;
  const io = new MockIO(['1', 'Kids Story Channel', 'Educational short-form storytelling', '2']);
  const consoleApp = new ExecutiveOfficeConsole({
    io,
    businessEvaluationApplication: {
      evaluateBusinessOpportunity: async () => {
        executionCount += 1;

        return {
          executiveSummary: 'Summary',
          recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION',
          confidence: 71,
          decisionReadiness: { status: 'READY_WITH_CONDITIONS' },
          authorityRequired: 'CEO Strategic Approval Required Before Proceeding'
        };
      }
    }
  });

  await consoleApp.run();

  assert.equal(executionCount, 1);
});

test('business evaluation displays executive decision package fields', async () => {
  const io = new MockIO(['1', 'Atlas Media Lab', 'Build AI-native storytelling pipeline', '2']);
  const consoleApp = new ExecutiveOfficeConsole({
    io,
    businessEvaluationApplication: {
      evaluateBusinessOpportunity: async () => ({
        executiveSummary: 'Demand signals are positive and execution risk is manageable.',
        recommendation: 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION',
        confidence: 88,
        decisionReadiness: { status: 'READY_WITH_CONDITIONS' },
        authorityRequired: 'CEO Strategic Approval Required Before Proceeding'
      })
    }
  });

  await consoleApp.run();

  assert.equal(io.outputs.includes('================================='), true);
  assert.equal(io.outputs.includes('ATLAS EXECUTIVE OFFICE'), true);
  assert.equal(io.outputs.includes('Applications'), true);
  assert.equal(io.outputs.includes('1. Business Evaluation'), true);
  assert.equal(io.outputs.includes('2. Exit'), true);
  assert.equal(
    io.outputs.includes('Executive Summary: Demand signals are positive and execution risk is manageable.'),
    true
  );
  assert.equal(io.outputs.includes('Recommendation: REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION'), true);
  assert.equal(io.outputs.includes('Confidence: 88'), true);
  assert.equal(io.outputs.includes('Decision Readiness: READY_WITH_CONDITIONS'), true);
  assert.equal(
    io.outputs.includes('Authority Required: CEO Strategic Approval Required Before Proceeding'),
    true
  );
});
