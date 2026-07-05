export class CapabilityRegistryInterface {
  searchCapabilities(_query) {
    throw new Error('Not implemented');
  }
}

export class WorkerExecutorInterface {
  async execute(_worker, _workItem) {
    throw new Error('Not implemented');
  }
}

export class MetricsServiceInterface {
  recordMetricEvent(_payload) {
    throw new Error('Not implemented');
  }
}

export class MemoryServiceInterface {
  recordWorkflowHistory(_payload) {
    throw new Error('Not implemented');
  }
}

export class PerformanceIntelligenceServiceInterface {
  recordExecution(_payload) {
    throw new Error('Not implemented');
  }
}
