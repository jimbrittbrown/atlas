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
}

export class PerformanceIntelligenceServiceInterface {
  retrieveIntelligence(_query) {
    throw new Error('Not implemented');
  }
}

export class ApprovalServiceInterface {
  getApprovalHistory(_query) {
    throw new Error('Not implemented');
  }
}
