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
  const io = new MockIO(['1', 'Horror Shorts Studio', 'AI-generated horror shorts for YouTube', 'EXIT', '2']);
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
  assert.equal(io.outputs.includes('Atlas Branding: Atlas Executive Command'), true);
  assert.equal(io.outputs.includes('Executive Health: NO_ACTIVE_MISSIONS'), true);
  assert.equal(io.outputs.includes('Mission Queue: 0 active (none)'), true);
  assert.equal(io.outputs.includes('Outstanding Investigation Requests: 0'), true);
  assert.equal(io.outputs.includes('Latest Executive Recommendation: NO_RECOMMENDATION_AVAILABLE'), true);
  assert.equal(io.outputs.includes('Enterprise Health: UNKNOWN'), true);
  assert.equal(io.outputs.includes('Available Executive Applications'), true);
});

test('business evaluation executes business evaluation application once', async () => {
  let executionCount = 0;
  const io = new MockIO(['1', 'Kids Story Channel', 'Educational short-form storytelling', 'EXIT', '2']);
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
  const io = new MockIO(['1', 'Atlas Media Lab', 'Build AI-native storytelling pipeline', 'EXIT', '2']);
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
  assert.equal(io.outputs.includes('Available Executive Applications'), true);
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

test('executive conversation loop answers follow-up question and exits on EXIT', async () => {
  const io = new MockIO([
    '1',
    'Atlas Opportunity Lab',
    'Evaluate rapid AI content studio',
    'What is the recommendation?',
    'EXIT',
    '2'
  ]);
  const consoleApp = new ExecutiveOfficeConsole({
    io,
    businessEvaluationApplication: {
      evaluateBusinessOpportunity: async () => ({
        executiveSummary: 'Summary.',
        recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
        confidence: 85,
        decisionReadiness: { status: 'READY' },
        authorityRequired: 'CEO Strategic Approval'
      })
    }
  });

  await consoleApp.run();

  assert.equal(io.outputs.includes('Ask a follow-up question or type EXIT. '), true);
  assert.equal(io.outputs.includes('Follow-up Answer: READY_FOR_EXECUTIVE_REVIEW'), true);
  assert.equal(io.outputs.includes('Investigation Requests: none'), true);
  assert.equal(io.outputs.includes('Updated Recommendation: READY_FOR_EXECUTIVE_REVIEW'), true);
});

test('executive conversation loop displays investigation request and updated recommendation', async () => {
  const io = new MockIO([
    '1',
    'Atlas Legal Risk Scan',
    'Evaluate legal uncertainty for launch',
    'What unresolved legal exposure remains?',
    'EXIT',
    '2'
  ]);
  const consoleApp = new ExecutiveOfficeConsole({
    io,
    businessEvaluationApplication: {
      evaluateBusinessOpportunity: async () => ({
        executiveSummary: 'Summary.',
        recommendation: 'READY_FOR_EXECUTIVE_REVIEW',
        confidence: 72,
        decisionReadiness: { status: 'READY' },
        authorityRequired: 'CEO Strategic Approval'
      })
    }
  });

  await consoleApp.run();

  assert.equal(io.outputs.includes('Follow-up Answer: No direct answer available.'), true);
  assert.equal(io.outputs.includes('Investigation Requests:'), true);
  assert.equal(io.outputs.includes('- INVREQ-001: What unresolved legal exposure remains?'), true);
  assert.equal(io.outputs.includes('Updated Recommendation: REQUIRES_ADDITIONAL_INVESTIGATION'), true);
});

test('home screen displays enterprise and executive status from workflow objects', async () => {
  const io = new MockIO(['2']);
  const consoleApp = new ExecutiveOfficeConsole({
    io,
    businessEvaluationApplication: {
      evaluateBusinessOpportunity: async () => ({})
    },
    workflowResults: [
      {
        mission: { id: 'VM-200', status: 'MISSION_CREATED' },
        decisionPackage: {
          recommendation: 'NOT_READY_FOR_EXECUTIVE_DECISION',
          confidence: 61
        },
        review: {
          additionalInvestigationRequired: true,
          updatedRecommendation: 'REQUIRES_ADDITIONAL_INVESTIGATION',
          investigationRequests: [{ id: 'INVREQ-200' }]
        }
      }
    ],
    currentPassingTestCount: 56,
    latestCommit: 'commit-ui-002'
  });

  await consoleApp.run();

  assert.equal(io.outputs.includes('Executive Health: AT_RISK'), true);
  assert.equal(io.outputs.includes('Mission Queue: 1 active (VM-200)'), true);
  assert.equal(io.outputs.includes('Outstanding Investigation Requests: 1'), true);
  assert.equal(io.outputs.includes('Latest Executive Recommendation: REQUIRES_ADDITIONAL_INVESTIGATION'), true);
  assert.equal(io.outputs.includes('Enterprise Health: DEGRADED'), true);
});
