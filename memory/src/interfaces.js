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

export class PerformanceIntelligenceInterface {
  async retrievePerformanceReference(_query) {
    throw new Error('Not implemented');
  }
}

export class AtlasInstituteInterface {
  async retrieveInstitutionalReference(_query) {
    throw new Error('Not implemented');
  }
}

export class MetricsServiceInterface {
  async retrieveMetricsReference(_query) {
    throw new Error('Not implemented');
  }
}

export class FutureSearchServiceInterface {
  async search(_query) {
    throw new Error('Not implemented');
  }
}
