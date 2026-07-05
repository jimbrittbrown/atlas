export class CapabilityRegistryReadInterface {
  searchCapabilities(_query) {
    throw new Error('Not implemented');
  }
}

export class WorkerOrchestrationReadInterface {
  getWorkflowStatus(_workflowExecutionId) {
    throw new Error('Not implemented');
  }

  getHistory() {
    throw new Error('Not implemented');
  }
}

export class ApprovalReadInterface {
  getApprovalHistory(_query) {
    throw new Error('Not implemented');
  }
}

export class PerformanceReadInterface {
  getCapabilityHealth(_capabilityName) {
    throw new Error('Not implemented');
  }
}

export class TraceabilityReadInterface {
  getTraceabilitySnapshot() {
    throw new Error('Not implemented');
  }
}

export class ChangelogReadInterface {
  getLatestReleaseNotes() {
    throw new Error('Not implemented');
  }
}
