export class ExecutiveMissionOrchestratorPipelineRegistry {
  constructor({ handlers = [] } = {}) {
    this.handlers = new Map();
    this.capabilities = new Map();
    handlers.forEach((entry) => this.register(entry));
  }

  register({ key, supportsMissionType, execute, retry, resume, rollback, cancel, toProjection }) {
    if (!key || typeof key !== 'string') {
      throw new Error('Pipeline key is required.');
    }

    if (typeof supportsMissionType !== 'function') {
      throw new Error(`Pipeline ${key} requires supportsMissionType(missionType).`);
    }

    if (typeof execute !== 'function') {
      throw new Error(`Pipeline ${key} requires execute().`);
    }

    if (this.handlers.has(key)) {
      throw new Error(`Pipeline ${key} is already registered.`);
    }

    this.handlers.set(key, {
      key,
      supportsMissionType,
      execute,
      retry,
      resume,
      rollback,
      cancel,
      toProjection
    });

    return this;
  }

  resolveByMissionType(missionType) {
    for (const handler of this.handlers.values()) {
      if (handler.supportsMissionType(missionType)) return handler;
    }
    return null;
  }

  getHandler(key) {
    return this.handlers.get(key) ?? null;
  }

  listHandlers() {
    return Array.from(this.handlers.values()).map((handler) => ({ key: handler.key }));
  }

  registerCapability({
    key,
    instance = null,
    factory = null,
    dependencies = [],
    governance = {},
    metadata = {},
    isHealthy = null,
    validate = null
  } = {}) {
    if (!key || typeof key !== 'string') {
      throw new Error('Capability key is required.');
    }

    if (this.capabilities.has(key)) {
      throw new Error(`Capability ${key} is already registered.`);
    }

    if (!instance && typeof factory !== 'function') {
      throw new Error(`Capability ${key} requires an instance or factory.`);
    }

    this.capabilities.set(key, {
      key,
      instance,
      factory,
      dependencies: Array.isArray(dependencies) ? dependencies : [],
      governance: { ...governance },
      metadata: { ...metadata },
      isHealthy,
      validate
    });

    return this;
  }

  resolveCapability(key, { validateContract = true } = {}) {
    const capability = this.capabilities.get(key) ?? null;
    if (!capability) {
      return {
        found: false,
        key,
        reason: `Capability ${key} is not registered.`,
        instance: null,
        status: 'NOT_REGISTERED'
      };
    }

    if (!capability.instance && typeof capability.factory === 'function') {
      capability.instance = capability.factory();
    }

    if (!capability.instance) {
      return {
        found: false,
        key,
        reason: `Capability ${key} failed to construct an instance.`,
        instance: null,
        status: 'INVALID_CONFIGURATION',
        metadata: capability.metadata,
        dependencies: capability.dependencies,
        governance: capability.governance
      };
    }

    if (typeof capability.isHealthy === 'function') {
      const healthy = capability.isHealthy(capability.instance);
      if (!healthy) {
        return {
          found: false,
          key,
          reason: `Capability ${key} is unhealthy.`,
          instance: null,
          status: 'UNHEALTHY',
          metadata: capability.metadata,
          dependencies: capability.dependencies,
          governance: capability.governance
        };
      }
    }

    if (validateContract && typeof capability.validate === 'function') {
      const validation = capability.validate(capability.instance);
      const isValid = validation === true || validation?.isValid === true;
      if (!isValid) {
        return {
          found: false,
          key,
          reason: validation?.reason ?? `Capability ${key} failed contract validation.`,
          instance: null,
          status: 'INVALID_CONTRACT',
          metadata: capability.metadata,
          dependencies: capability.dependencies,
          governance: capability.governance
        };
      }
    }

    return {
      found: true,
      key,
      reason: null,
      instance: capability.instance,
      status: 'READY',
      metadata: capability.metadata,
      dependencies: capability.dependencies,
      governance: capability.governance
    };
  }

  listCapabilities() {
    return Array.from(this.capabilities.values()).map((capability) => ({
      key: capability.key,
      metadata: capability.metadata,
      dependencies: capability.dependencies,
      governance: capability.governance,
      ready: Boolean(capability.instance || capability.factory)
    }));
  }
}
