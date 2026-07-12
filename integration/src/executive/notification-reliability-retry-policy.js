import {
  NotificationFailureClasses,
  getFailureClassMetadata
} from './notification-domain-contracts.js';

const DEFAULT_ELIGIBILITY = Object.freeze({
  [NotificationFailureClasses.PROVIDER_UNAVAILABLE]: true,
  [NotificationFailureClasses.RATE_LIMITED]: true,
  [NotificationFailureClasses.TIMEOUT]: true,
  [NotificationFailureClasses.PERSISTENCE_FAILURE]: true,
  [NotificationFailureClasses.DELIVERY_UNKNOWN]: true,
  [NotificationFailureClasses.CONFIGURATION_FAILURE]: false,
  [NotificationFailureClasses.PROVIDER_REJECTED]: false,
  [NotificationFailureClasses.RECIPIENT_INVALID]: false,
  [NotificationFailureClasses.POLICY_BLOCKED]: false,
  [NotificationFailureClasses.INVALID_EVENT]: false,
  [NotificationFailureClasses.TEMPLATE_FAILURE]: false
});

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function parseTime(value, fallbackMs) {
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) return parsed;
  return fallbackMs;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

export class NotificationRetryPolicyEngine {
  constructor({
    now,
    baseDelayMs = Number.parseInt(String(process.env.ATLAS_NOTIFICATION_RETRY_BASE_DELAY_MS ?? '1500'), 10),
    maximumDelayMs = Number.parseInt(String(process.env.ATLAS_NOTIFICATION_RETRY_MAX_DELAY_MS ?? '300000'), 10),
    backoffMultiplier = Number.parseFloat(String(process.env.ATLAS_NOTIFICATION_RETRY_BACKOFF_MULTIPLIER ?? '2')),
    defaultMaximumAttempts = Number.parseInt(String(process.env.ATLAS_NOTIFICATION_RETRY_MAX_ATTEMPTS ?? '5'), 10),
    retryWindowMs = Number.parseInt(String(process.env.ATLAS_NOTIFICATION_RETRY_WINDOW_MS ?? '86400000'), 10),
    eligibilityByFailureClass = DEFAULT_ELIGIBILITY
  } = {}) {
    this.now = now;
    this.baseDelayMs = positiveInt(baseDelayMs, 1500);
    this.maximumDelayMs = positiveInt(maximumDelayMs, 300000);
    this.backoffMultiplier = Number.isFinite(backoffMultiplier) && backoffMultiplier >= 1 ? backoffMultiplier : 2;
    this.defaultMaximumAttempts = positiveInt(defaultMaximumAttempts, 5);
    this.retryWindowMs = positiveInt(retryWindowMs, 86400000);
    this.eligibilityByFailureClass = {
      ...DEFAULT_ELIGIBILITY,
      ...(eligibilityByFailureClass ?? {})
    };
  }

  validateStartup() {
    const issues = [];
    if (this.baseDelayMs > this.maximumDelayMs) issues.push('baseDelayMs must be <= maximumDelayMs.');
    if (!Number.isFinite(this.backoffMultiplier) || this.backoffMultiplier < 1) issues.push('backoffMultiplier must be >= 1.');
    if (!Number.isInteger(this.defaultMaximumAttempts) || this.defaultMaximumAttempts < 1) issues.push('defaultMaximumAttempts must be >= 1.');
    if (!Number.isInteger(this.retryWindowMs) || this.retryWindowMs < 1000) issues.push('retryWindowMs must be >= 1000.');

    return {
      accepted: issues.length === 0,
      issues,
      failStartup: false
    };
  }

  isFailureRetryEligible(failureClass) {
    const normalized = String(failureClass ?? '').trim().toUpperCase();
    if (!normalized) return false;

    if (Object.prototype.hasOwnProperty.call(this.eligibilityByFailureClass, normalized)) {
      return Boolean(this.eligibilityByFailureClass[normalized]);
    }

    const metadata = getFailureClassMetadata(normalized);
    return Boolean(metadata?.retryable);
  }

  calculateDelayMs(attemptNumber) {
    const attempt = Math.max(1, Number.parseInt(String(attemptNumber ?? 1), 10));
    const exponent = Math.max(0, attempt - 1);
    const raw = Math.round(this.baseDelayMs * (this.backoffMultiplier ** exponent));
    return Math.min(raw, this.maximumDelayMs);
  }

  evaluateRetryDecision({
    job = {},
    attemptNumber,
    failureClass,
    now,
    retryWindowMs = this.retryWindowMs,
    maximumAttempts = null,
    retryEligibleOverride = null
  } = {}) {
    const nowAt = parseTime(now ?? nowIso(this.now), Date.now());
    const jobCreatedAt = parseTime(job.createdAt, nowAt);
    const attemptsUsed = Number.isInteger(Number(attemptNumber))
      ? Number(attemptNumber)
      : Number.parseInt(String(job.attemptCount ?? 0), 10);

    const maxAttemptsInput = hasText(maximumAttempts)
      ? Number.parseInt(String(maximumAttempts), 10)
      : Number.parseInt(String(job.maximumAttempts ?? this.defaultMaximumAttempts), 10);
    const maxAttempts = Number.isInteger(maxAttemptsInput) && maxAttemptsInput > 0
      ? maxAttemptsInput
      : this.defaultMaximumAttempts;

    const normalizedFailure = hasText(failureClass)
      ? String(failureClass).trim().toUpperCase()
      : String(job.lastErrorClass ?? '').trim().toUpperCase();

    const eligibleByClass = retryEligibleOverride == null
      ? this.isFailureRetryEligible(normalizedFailure)
      : Boolean(retryEligibleOverride);

    const exhausted = Number(attemptsUsed) >= Number(maxAttempts);
    const delayMs = this.calculateDelayMs(Math.max(1, Number(attemptsUsed)));
    const nextAttemptAtMs = nowAt + delayMs;
    const retryWindowEndMs = jobCreatedAt + Number.parseInt(String(retryWindowMs), 10);
    const insideWindow = nextAttemptAtMs <= retryWindowEndMs;

    if (!eligibleByClass) {
      return Object.freeze({
        accepted: true,
        canonicalPath: 'TERMINAL',
        retryable: false,
        terminal: true,
        reason: 'failure_class_not_retryable',
        failureClass: normalizedFailure,
        attemptNumber: attemptsUsed,
        maximumAttempts: maxAttempts,
        nextDelayMs: null,
        nextAttemptAt: null,
        retryWindowEndAt: new Date(retryWindowEndMs).toISOString()
      });
    }

    if (exhausted) {
      return Object.freeze({
        accepted: true,
        canonicalPath: 'TERMINAL',
        retryable: false,
        terminal: true,
        reason: 'maximum_attempts_exhausted',
        failureClass: normalizedFailure,
        attemptNumber: attemptsUsed,
        maximumAttempts: maxAttempts,
        nextDelayMs: null,
        nextAttemptAt: null,
        retryWindowEndAt: new Date(retryWindowEndMs).toISOString()
      });
    }

    if (!insideWindow) {
      return Object.freeze({
        accepted: true,
        canonicalPath: 'TERMINAL',
        retryable: false,
        terminal: true,
        reason: 'retry_window_exceeded',
        failureClass: normalizedFailure,
        attemptNumber: attemptsUsed,
        maximumAttempts: maxAttempts,
        nextDelayMs: delayMs,
        nextAttemptAt: new Date(nextAttemptAtMs).toISOString(),
        retryWindowEndAt: new Date(retryWindowEndMs).toISOString()
      });
    }

    return Object.freeze({
      accepted: true,
      canonicalPath: 'RETRY',
      retryable: true,
      terminal: false,
      reason: 'retry_scheduled',
      failureClass: normalizedFailure,
      attemptNumber: attemptsUsed,
      maximumAttempts: maxAttempts,
      nextDelayMs: delayMs,
      nextAttemptAt: new Date(nextAttemptAtMs).toISOString(),
      retryWindowEndAt: new Date(retryWindowEndMs).toISOString()
    });
  }
}
