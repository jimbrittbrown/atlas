import test from 'node:test';
import assert from 'node:assert/strict';

import { NotificationRetryPolicyEngine } from '../src/executive/notification-reliability-retry-policy.js';

test('exponential backoff is deterministic', () => {
  const engine = new NotificationRetryPolicyEngine({
    baseDelayMs: 1000,
    maximumDelayMs: 120000,
    backoffMultiplier: 2,
    retryWindowMs: 3600000,
    defaultMaximumAttempts: 6
  });

  assert.equal(engine.calculateDelayMs(1), 1000);
  assert.equal(engine.calculateDelayMs(2), 2000);
  assert.equal(engine.calculateDelayMs(3), 4000);
  assert.equal(engine.calculateDelayMs(6), 32000);
});

test('retryable classification follows canonical retry path', () => {
  const engine = new NotificationRetryPolicyEngine({
    baseDelayMs: 500,
    maximumDelayMs: 5000,
    backoffMultiplier: 2,
    retryWindowMs: 3600000,
    defaultMaximumAttempts: 5
  });

  const decision = engine.evaluateRetryDecision({
    job: {
      createdAt: '2025-01-01T00:00:00.000Z',
      attemptCount: 1,
      maximumAttempts: 5,
      lastErrorClass: 'TIMEOUT'
    },
    now: '2025-01-01T00:00:00.000Z',
    failureClass: 'TIMEOUT'
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.canonicalPath, 'RETRY');
  assert.equal(decision.retryable, true);
  assert.equal(decision.terminal, false);
  assert.equal(decision.reason, 'retry_scheduled');
});

test('terminal classification follows canonical terminal path', () => {
  const engine = new NotificationRetryPolicyEngine({
    baseDelayMs: 500,
    maximumDelayMs: 5000,
    backoffMultiplier: 2,
    retryWindowMs: 3600000,
    defaultMaximumAttempts: 5
  });

  const decision = engine.evaluateRetryDecision({
    job: {
      createdAt: '2025-01-01T00:00:00.000Z',
      attemptCount: 1,
      maximumAttempts: 5,
      lastErrorClass: 'RECIPIENT_INVALID'
    },
    now: '2025-01-01T00:00:00.000Z',
    failureClass: 'RECIPIENT_INVALID'
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.canonicalPath, 'TERMINAL');
  assert.equal(decision.retryable, false);
  assert.equal(decision.terminal, true);
  assert.equal(decision.reason, 'failure_class_not_retryable');
});

test('retry exhaustion is terminal', () => {
  const engine = new NotificationRetryPolicyEngine({
    baseDelayMs: 500,
    maximumDelayMs: 5000,
    backoffMultiplier: 2,
    retryWindowMs: 3600000,
    defaultMaximumAttempts: 3
  });

  const decision = engine.evaluateRetryDecision({
    job: {
      createdAt: '2025-01-01T00:00:00.000Z',
      attemptCount: 3,
      maximumAttempts: 3,
      lastErrorClass: 'TIMEOUT'
    },
    now: '2025-01-01T00:05:00.000Z',
    failureClass: 'TIMEOUT'
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.canonicalPath, 'TERMINAL');
  assert.equal(decision.reason, 'maximum_attempts_exhausted');
});
