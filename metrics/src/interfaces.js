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
  recordCompletedInformation(_payload) {
    throw new Error('Not implemented');
  }
}

export class PerformanceIntelligenceServiceInterface {
  async analyze(_metricResult) {
    throw new Error('Not implemented');
  }
}

export class AtlasInstituteInterface {
  async publishInstitutionalMetricReference(_metricReference) {
    throw new Error('Not implemented');
  }
}

export class FutureDashboardInterface {
  async publishSnapshot(_snapshot) {
    throw new Error('Not implemented');
  }
}
