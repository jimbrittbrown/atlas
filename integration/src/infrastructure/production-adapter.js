import { ConfigurationService } from './configuration-service.js';
import { SecretManager } from './secret-manager.js';
import { IntegrationLogger } from '../integration-logger.js';

class TimeoutError extends Error {
  constructor(message, timeoutMs) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class ProductionAdapter {
  constructor({
    providerId,
    configurationService = null,
    secretManager = null,
    logger = null,
    metricsAdapter = null,
    now = () => Date.now(),
    sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs))
  } = {}) {
    this.providerId = this.normalizeProviderId(providerId);
    this.configurationService = configurationService ?? new ConfigurationService();
    this.secretManager = secretManager
      ?? this.configurationService.secretManager
      ?? new SecretManager();
    this.logger = logger ?? new IntegrationLogger();
    this.metricsAdapter = metricsAdapter;
    this.now = now;
    this.sleep = sleep;
    this.healthState = {
      providerId: this.providerId,
      status: 'UNKNOWN',
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      consecutiveFailures: 0,
      lastAttemptedAt: 'NEVER',
      lastSuccessfulAt: 'NEVER',
      lastFailedAt: 'NEVER',
      lastError: null
    };
  }

  async run(request = {}) {
    const operation = String(request.operation ?? 'execute');
    const configuration = this.resolveConfiguration();
    const secrets = this.resolveSecrets(configuration);

    await this.authenticate({ request, configuration, secrets, providerId: this.providerId });

    const maxRetries = this.resolveMaxRetries(configuration);
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt += 1;

      this.logEvent('info', 'provider_request_attempt', {
        providerId: this.providerId,
        operation,
        attempt,
        maxRetries
      });

      this.healthState.totalRequests += 1;
      this.healthState.lastAttemptedAt = this.buildTimestamp();

      try {
        const rawResponse = await this.executeWithTimeout({
          request,
          configuration,
          secrets,
          attempt,
          operation
        });
        const normalizedResponse = this.normalizeResponse(rawResponse, {
          request,
          configuration,
          secrets,
          providerId: this.providerId,
          attempt
        });

        this.healthState.successfulRequests += 1;
        this.healthState.consecutiveFailures = 0;
        this.healthState.lastSuccessfulAt = this.buildTimestamp();
        this.healthState.status = 'HEALTHY';
        this.healthState.lastError = null;

        this.recordMetrics({
          name: 'provider_request_success',
          status: 'success',
          operation,
          attempt,
          retryCount: attempt - 1
        });

        this.logEvent('info', 'provider_request_success', {
          providerId: this.providerId,
          operation,
          attempt
        });

        return normalizedResponse;
      } catch (error) {
        const normalizedError = this.normalizeError(error, {
          request,
          configuration,
          providerId: this.providerId,
          operation,
          attempt
        });
        const shouldRetry = normalizedError.retriable && attempt <= maxRetries;

        this.healthState.failedRequests += 1;
        this.healthState.consecutiveFailures += 1;
        this.healthState.lastFailedAt = this.buildTimestamp();
        this.healthState.status = shouldRetry ? 'DEGRADED' : 'UNHEALTHY';
        this.healthState.lastError = {
          code: normalizedError.code,
          message: normalizedError.message,
          retriable: normalizedError.retriable
        };

        this.recordMetrics({
          name: 'provider_request_failure',
          status: 'failure',
          operation,
          attempt,
          retryCount: attempt - 1,
          errorCode: normalizedError.code
        });

        this.logEvent('error', 'provider_request_failure', {
          providerId: this.providerId,
          operation,
          attempt,
          errorCode: normalizedError.code,
          retriable: normalizedError.retriable,
          willRetry: shouldRetry,
          status: normalizedError.status ?? null,
          providerError: normalizedError.providerError ?? null,
          providerResponseBody: normalizedError.providerResponseBody ?? null
        });

        if (shouldRetry) {
          const delayMs = this.resolveRetryDelayMs({ attempt, configuration, normalizedError });
          await this.sleep(delayMs);
          continue;
        }

        throw this.createAdapterError(normalizedError);
      }
    }

    throw this.createAdapterError({
      code: 'RETRY_EXHAUSTED',
      message: `Provider ${this.providerId} exhausted retries.`,
      retriable: false,
      timeout: false,
      status: null,
      providerId: this.providerId,
      operation,
      attempt: maxRetries + 1
    });
  }

  resolveConfiguration() {
    const configuration = this.configurationService.getProviderConfiguration(this.providerId);

    if (!configuration) {
      throw this.createAdapterError({
        code: 'CONFIGURATION_NOT_FOUND',
        message: `Configuration not found for provider ${this.providerId}.`,
        retriable: false,
        timeout: false,
        status: null,
        providerId: this.providerId,
        operation: 'startup',
        attempt: 0
      });
    }

    return configuration;
  }

  resolveSecrets(configuration) {
    const requiredSecrets = Array.isArray(configuration.requiredSecrets)
      ? configuration.requiredSecrets
      : [];

    const secrets = this.secretManager.getProviderSecrets(this.providerId);

    for (const secretName of requiredSecrets) {
      const secret = secrets.configuredSecrets[secretName];

      if (!secret || !secret.configured) {
        throw this.createAdapterError({
          code: 'MISSING_REQUIRED_SECRET',
          message: `Missing required secret ${secretName} for provider ${this.providerId}.`,
          retriable: false,
          timeout: false,
          status: null,
          providerId: this.providerId,
          operation: 'startup',
          attempt: 0
        });
      }
    }

    return secrets;
  }

  resolveMaxRetries(configuration) {
    const maxRetries = configuration.retryPolicy?.maxRetries;

    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      return 0;
    }

    return maxRetries;
  }

  resolveRetryDelayMs({ attempt, configuration, normalizedError }) {
    const retryAfterMs = Number.parseInt(String(normalizedError.retryAfterMs ?? ''), 10);

    if (Number.isInteger(retryAfterMs) && retryAfterMs >= 0) {
      return retryAfterMs;
    }

    const baseDelayMs = configuration.retryPolicy?.baseDelayMs;

    if (Number.isInteger(baseDelayMs) && baseDelayMs >= 0) {
      return baseDelayMs * Math.max(1, attempt);
    }

    return 0;
  }

  async executeWithTimeout({ request, configuration, secrets, attempt, operation }) {
    const timeoutMs = this.resolveTimeoutMs(configuration.timeoutMs);

    if (timeoutMs <= 0) {
      return this.execute({ request, configuration, secrets, providerId: this.providerId, attempt });
    }

    let timeoutId = null;

    try {
      return await Promise.race([
        this.execute({ request, configuration, secrets, providerId: this.providerId, attempt }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new TimeoutError(
              `Provider ${this.providerId} timed out while executing ${operation}.`,
              timeoutMs
            ));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  resolveTimeoutMs(timeoutMs) {
    const parsed = Number.parseInt(String(timeoutMs), 10);

    if (!Number.isInteger(parsed) || parsed < 0) {
      return 0;
    }

    return parsed;
  }

  normalizeError(error, context = {}) {
    if (error?.name === 'ProductionAdapterError') {
      return {
        ...error.details,
        providerId: context.providerId ?? error.details.providerId ?? this.providerId,
        operation: context.operation ?? error.details.operation ?? 'execute',
        attempt: context.attempt ?? error.details.attempt ?? 1
      };
    }

    if (error instanceof TimeoutError) {
      return {
        code: 'TIMEOUT',
        message: error.message,
        retriable: true,
        timeout: true,
        status: null,
        retryAfterMs: null,
        providerId: context.providerId ?? this.providerId,
        operation: context.operation ?? 'execute',
        attempt: context.attempt ?? 1
      };
    }

    const status = Number.parseInt(String(error?.status ?? error?.statusCode ?? ''), 10);

    if (status === 429) {
      return {
        code: 'RATE_LIMITED',
        message: error.message ?? 'Provider rate limit reached.',
        retriable: true,
        timeout: false,
        status,
        retryAfterMs: this.resolveRetryAfterMs(error),
        providerResponseBody: error?.providerResponseBody ?? null,
        providerResponseJson: error?.providerResponseJson ?? null,
        providerError: error?.providerError ?? null,
        providerId: context.providerId ?? this.providerId,
        operation: context.operation ?? 'execute',
        attempt: context.attempt ?? 1
      };
    }

    if (status === 408 || (status >= 500 && status <= 599)) {
      return {
        code: `HTTP_${status}`,
        message: error.message ?? `Provider request failed with status ${status}.`,
        retriable: true,
        timeout: false,
        status,
        retryAfterMs: null,
        providerResponseBody: error?.providerResponseBody ?? null,
        providerResponseJson: error?.providerResponseJson ?? null,
        providerError: error?.providerError ?? null,
        providerId: context.providerId ?? this.providerId,
        operation: context.operation ?? 'execute',
        attempt: context.attempt ?? 1
      };
    }

    if (status >= 400 && status <= 499) {
      return {
        code: `HTTP_${status}`,
        message: error.message ?? `Provider request failed with status ${status}.`,
        retriable: false,
        timeout: false,
        status,
        retryAfterMs: null,
        providerResponseBody: error?.providerResponseBody ?? null,
        providerResponseJson: error?.providerResponseJson ?? null,
        providerError: error?.providerError ?? null,
        providerId: context.providerId ?? this.providerId,
        operation: context.operation ?? 'execute',
        attempt: context.attempt ?? 1
      };
    }

    if (this.isNetworkError(error)) {
      return {
        code: 'NETWORK_ERROR',
        message: error.message ?? 'Provider network error.',
        retriable: true,
        timeout: false,
        status: null,
        retryAfterMs: null,
        providerId: context.providerId ?? this.providerId,
        operation: context.operation ?? 'execute',
        attempt: context.attempt ?? 1
      };
    }

    return {
      code: 'PROVIDER_EXECUTION_FAILED',
      message: error?.message ?? 'Provider execution failed.',
      retriable: false,
      timeout: false,
      status: null,
      retryAfterMs: null,
      providerId: context.providerId ?? this.providerId,
      operation: context.operation ?? 'execute',
      attempt: context.attempt ?? 1
    };
  }

  isNetworkError(error) {
    const code = String(error?.code ?? '').toUpperCase();

    return ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT'].includes(code);
  }

  resolveRetryAfterMs(error) {
    const retryAfterSeconds = Number.parseInt(String(error?.retryAfter ?? ''), 10);

    if (Number.isInteger(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }

    const retryAfterMs = Number.parseInt(String(error?.retryAfterMs ?? ''), 10);

    if (Number.isInteger(retryAfterMs) && retryAfterMs >= 0) {
      return retryAfterMs;
    }

    return null;
  }

  createAdapterError(details) {
    const error = new Error(details.message);
    error.name = 'ProductionAdapterError';
    error.details = details;

    return error;
  }

  logEvent(level, event, metadata) {
    if (typeof this.logger?.log !== 'function') {
      return;
    }

    this.logger.log({
      level,
      event,
      metadata,
      timestamp: this.buildTimestamp()
    });
  }

  recordMetrics({ name, status, operation, attempt, retryCount, errorCode = null }) {
    if (!this.metricsAdapter) {
      return;
    }

    if (typeof this.metricsAdapter.recordMetricEvent === 'function') {
      this.metricsAdapter.recordMetricEvent({
        name,
        category: 'Provider Integration',
        value: 1,
        unit: 'count',
        status,
        retryCount,
        metadata: {
          providerId: this.providerId,
          operation,
          attempt,
          errorCode,
          source: 'production-adapter'
        }
      });
    }

    if (typeof this.metricsAdapter.recordServiceOutcome === 'function') {
      this.metricsAdapter.recordServiceOutcome({
        service: this.providerId,
        operation,
        success: status === 'success',
        retryCount,
        metadata: {
          source: 'production-adapter',
          errorCode
        }
      });
    }
  }

  getHealthReport() {
    return {
      ...this.healthState,
      checkedAt: this.buildTimestamp()
    };
  }

  buildTimestamp() {
    return new Date(this.now()).toISOString();
  }

  normalizeProviderId(providerId) {
    const normalized = String(providerId ?? '').toLowerCase().trim();

    if (normalized.length === 0) {
      throw new Error('ProductionAdapter requires a providerId.');
    }

    return normalized;
  }

  async authenticate() {
    throw new Error('ProductionAdapter.authenticate must be implemented by a provider.');
  }

  async execute() {
    throw new Error('ProductionAdapter.execute must be implemented by a provider.');
  }

  normalizeResponse() {
    throw new Error('ProductionAdapter.normalizeResponse must be implemented by a provider.');
  }
}
