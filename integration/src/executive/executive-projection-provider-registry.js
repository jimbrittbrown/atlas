const SupportedProjectionContractVersions = new Set(['1.0.0']);

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDependencyList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function normalizeProjectionResult(projection) {
  const normalized = { ...projection };

  if (normalized.timestamp && !normalized.generatedAt) {
    normalized.generatedAt = normalized.timestamp;
  }

  if (!normalized.timestamp && normalized.generatedAt) {
    normalized.timestamp = normalized.generatedAt;
  }

  return normalized;
}

export class ExecutiveProjectionProviderRegistry {
  constructor({ now, logger, allowDuplicateProjectionOwnership = false } = {}) {
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.allowDuplicateProjectionOwnership = allowDuplicateProjectionOwnership;
    this.providers = new Map();
    this.providerByProjectionType = new Map();
  }

  validateProviderContract(provider = {}) {
    const issues = [];

    if (!isObject(provider)) {
      return { isValid: false, issues: ['Provider contract must be an object.'] };
    }

    if (!provider.providerId || typeof provider.providerId !== 'string') {
      issues.push('providerId is required.');
    }

    if (!provider.projectionType || typeof provider.projectionType !== 'string') {
      issues.push('projectionType is required.');
    }

    if (!provider.contractVersion || typeof provider.contractVersion !== 'string') {
      issues.push('contractVersion is required.');
    } else if (!SupportedProjectionContractVersions.has(provider.contractVersion)) {
      issues.push(`Unsupported contractVersion: ${provider.contractVersion}`);
    }

    if (typeof provider.required !== 'boolean') {
      issues.push('required flag must be boolean.');
    }

    if (!provider.sourceDomain || typeof provider.sourceDomain !== 'string') {
      issues.push('sourceDomain is required.');
    }

    if (provider.maxAgeMs != null && (!Number.isFinite(Number(provider.maxAgeMs)) || Number(provider.maxAgeMs) <= 0)) {
      issues.push('maxAgeMs must be a positive number when provided.');
    }

    if (provider.dependencies != null && !Array.isArray(provider.dependencies)) {
      issues.push('dependencies must be an array of strings when provided.');
    }

    if (provider.isHealthy != null && typeof provider.isHealthy !== 'function') {
      issues.push('isHealthy must be a function when provided.');
    }

    if (typeof provider.project !== 'function') {
      issues.push('project() is required.');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  registerProvider(provider = {}) {
    const validation = this.validateProviderContract(provider);
    if (!validation.isValid) {
      throw new Error(`Projection provider contract invalid: ${validation.issues.join(' | ')}`);
    }

    if (this.providers.has(provider.providerId)) {
      throw new Error(`Projection provider ${provider.providerId} is already registered.`);
    }

    if (!this.allowDuplicateProjectionOwnership && this.providerByProjectionType.has(provider.projectionType)) {
      const owner = this.providerByProjectionType.get(provider.projectionType);
      throw new Error(`Projection type ${provider.projectionType} is already owned by ${owner}.`);
    }

    const normalized = {
      providerId: provider.providerId,
      projectionType: provider.projectionType,
      contractVersion: provider.contractVersion,
      required: provider.required,
      sourceDomain: provider.sourceDomain,
      maxAgeMs: Number(provider.maxAgeMs ?? (provider.required ? 10 * 60 * 1000 : 15 * 60 * 1000)),
      dependencies: normalizeDependencyList(provider.dependencies),
      metadata: isObject(provider.metadata) ? { ...provider.metadata } : {},
      isHealthy: provider.isHealthy ?? null,
      project: provider.project,
      registeredAt: isoNow(this.now)
    };

    this.providers.set(normalized.providerId, normalized);
    this.providerByProjectionType.set(normalized.projectionType, normalized.providerId);

    this.logger.log({
      event: 'executive_projection_provider_registered',
      providerId: normalized.providerId,
      projectionType: normalized.projectionType,
      required: normalized.required,
      contractVersion: normalized.contractVersion
    });

    return normalized;
  }

  registerProviders(providers = []) {
    return providers.map((provider) => this.registerProvider(provider));
  }

  getProvider(providerId) {
    const provider = this.providers.get(providerId) ?? null;
    if (!provider) {
      throw new Error(`Unknown projection provider: ${providerId}`);
    }

    return provider;
  }

  resolveByProjectionType(projectionType) {
    const providerId = this.providerByProjectionType.get(projectionType) ?? null;
    if (!providerId) return null;
    return this.providers.get(providerId) ?? null;
  }

  listProviders() {
    return Array.from(this.providers.values()).map((provider) => ({
      providerId: provider.providerId,
      projectionType: provider.projectionType,
      contractVersion: provider.contractVersion,
      required: provider.required,
      sourceDomain: provider.sourceDomain,
      maxAgeMs: provider.maxAgeMs,
      dependencies: provider.dependencies,
      metadata: provider.metadata,
      registeredAt: provider.registeredAt
    }));
  }

  validateProjectionResult(provider, projection) {
    const issues = [];

    if (!isObject(projection)) {
      return { isValid: false, issues: ['Projection result must be an object.'] };
    }

    if (!projection.projectionId || typeof projection.projectionId !== 'string') {
      issues.push('Projection projectionId is required.');
    }

    if (projection.providerId !== provider.providerId) {
      issues.push(`Projection providerId mismatch. Expected ${provider.providerId}, received ${projection.providerId}.`);
    }

    if (projection.projectionType !== provider.projectionType) {
      issues.push(`Projection type mismatch. Expected ${provider.projectionType}, received ${projection.projectionType}.`);
    }

    if (projection.contractVersion !== provider.contractVersion) {
      issues.push(`Projection contractVersion mismatch. Expected ${provider.contractVersion}, received ${projection.contractVersion}.`);
    }

    if (!projection.source || typeof projection.source !== 'string') {
      issues.push('Projection source is required.');
    }

    if (!projection.status || typeof projection.status !== 'string') {
      issues.push('Projection status is required.');
    }

    if (!projection.generatedAt || typeof projection.generatedAt !== 'string') {
      issues.push('Projection generatedAt timestamp is required.');
    }

    if (!isObject(projection.aggregateMetrics)) {
      issues.push('Projection aggregateMetrics object is required.');
    }

    if (!Array.isArray(projection.warnings)) {
      issues.push('Projection warnings must be an array.');
    }

    if (!Array.isArray(projection.incidents)) {
      issues.push('Projection incidents must be an array.');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  evaluateFreshness(provider, projection) {
    const parsed = Date.parse(String(projection.generatedAt ?? ''));
    if (!Number.isFinite(parsed)) {
      return {
        isFresh: false,
        isMalformedTimestamp: true,
        isStale: false,
        ageMs: null,
        maxAgeMs: provider.maxAgeMs
      };
    }

    const ageMs = Date.now() - parsed;
    return {
      isFresh: ageMs <= provider.maxAgeMs,
      isMalformedTimestamp: false,
      isStale: ageMs > provider.maxAgeMs,
      ageMs,
      maxAgeMs: provider.maxAgeMs
    };
  }

  invokeProvider(providerId, context = {}) {
    const provider = this.getProvider(providerId);

    if (typeof provider.isHealthy === 'function') {
      const healthy = provider.isHealthy();
      if (!healthy) {
        return {
          ok: false,
          provider,
          status: 'UNHEALTHY',
          reason: `Projection provider ${provider.providerId} reported unhealthy status.`,
          projection: null,
          failure: {
            type: 'PROVIDER_HEALTH_FAILURE',
            providerId: provider.providerId,
            projectionType: provider.projectionType,
            required: provider.required,
            contractVersion: provider.contractVersion,
            at: isoNow(this.now)
          }
        };
      }
    }

    try {
      const rawProjection = provider.project(context);
      const projection = normalizeProjectionResult(rawProjection);
      const validation = this.validateProjectionResult(provider, projection);
      if (!validation.isValid) {
        return {
          ok: false,
          provider,
          status: 'INVALID_PROJECTION',
          reason: validation.issues.join(' | '),
          projection: null,
          failure: {
            type: 'MALFORMED_PROJECTION',
            providerId: provider.providerId,
            projectionType: provider.projectionType,
            required: provider.required,
            contractVersion: provider.contractVersion,
            issues: validation.issues,
            at: isoNow(this.now)
          }
        };
      }

      const freshness = this.evaluateFreshness(provider, projection);
      if (freshness.isMalformedTimestamp) {
        return {
          ok: false,
          provider,
          status: 'MALFORMED_TIMESTAMP',
          reason: `Projection provider ${provider.providerId} returned malformed timestamp ${projection.generatedAt}.`,
          projection,
          failure: {
            type: 'MALFORMED_TIMESTAMP',
            providerId: provider.providerId,
            projectionType: provider.projectionType,
            required: provider.required,
            contractVersion: provider.contractVersion,
            at: isoNow(this.now)
          },
          freshness
        };
      }

      if (freshness.isStale) {
        return {
          ok: true,
          provider,
          status: 'STALE',
          reason: `Projection provider ${provider.providerId} returned stale data.`,
          projection,
          freshness
        };
      }

      return {
        ok: true,
        provider,
        status: 'READY',
        reason: null,
        projection,
        freshness
      };
    } catch (error) {
      return {
        ok: false,
        provider,
        status: 'PROJECTION_EXCEPTION',
        reason: error instanceof Error ? error.message : String(error),
        projection: null,
        failure: {
          type: 'PROVIDER_PROJECTION_EXCEPTION',
          providerId: provider.providerId,
          projectionType: provider.projectionType,
          required: provider.required,
          contractVersion: provider.contractVersion,
          at: isoNow(this.now)
        }
      };
    }
  }
}
