export class ExecutiveServiceInterface {
  async handleRequest(_request) {
    throw new Error('Not implemented');
  }
}

export class ResearchServiceInterface {
  async executeResearch(_jobId, _request) {
    throw new Error('Not implemented');
  }
}

export class MemoryServiceInterface {
  retrieve(_query) {
    throw new Error('Not implemented');
  }
}

export class MetricsServiceInterface {
  retrieveMetrics(_query) {
    throw new Error('Not implemented');
  }

  aggregateMetrics(_query) {
    throw new Error('Not implemented');
  }
}

export class AtlasInstituteInterface {
  async publishPerformanceIntelligence(_artifact) {
    throw new Error('Not implemented');
  }
}

export class FutureDashboardInterface {
  async publishPerformanceSnapshot(_snapshot) {
    throw new Error('Not implemented');
  }
}
