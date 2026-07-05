export class ControlCenterRetrieval {
  constructor({
    capabilityRegistry,
    workerOrchestration,
    approvalService,
    performanceService,
    traceabilityProvider,
    changelogProvider,
  }) {
    this.capabilityRegistry = capabilityRegistry;
    this.workerOrchestration = workerOrchestration;
    this.approvalService = approvalService;
    this.performanceService = performanceService;
    this.traceabilityProvider = traceabilityProvider;
    this.changelogProvider = changelogProvider;
  }

  getCapabilities(filters = {}) {
    if (!this.capabilityRegistry?.searchCapabilities) {
      return { records: [], total: 0 };
    }
    return this.capabilityRegistry.searchCapabilities({
      search: filters.search,
      status: filters.status,
      owner: filters.owner,
      limit: filters.limit,
    });
  }

  getWorkflowStatus(workflowExecutionId) {
    if (!workflowExecutionId || !this.workerOrchestration?.getWorkflowStatus) {
      return null;
    }
    return this.workerOrchestration.getWorkflowStatus(workflowExecutionId);
  }

  getExecutionHistory() {
    if (!this.workerOrchestration?.getHistory) {
      return [];
    }
    return this.workerOrchestration.getHistory();
  }

  getApprovalHistory(query = {}) {
    if (!this.approvalService?.getApprovalHistory) {
      return [];
    }
    return this.approvalService.getApprovalHistory(query);
  }

  getCapabilityHealth(capabilityName) {
    if (!this.performanceService?.getCapabilityHealth) {
      return null;
    }
    return this.performanceService.getCapabilityHealth(capabilityName);
  }

  getTraceabilitySnapshot() {
    if (!this.traceabilityProvider?.getTraceabilitySnapshot) {
      return null;
    }
    return this.traceabilityProvider.getTraceabilitySnapshot();
  }

  getLatestReleaseNotes() {
    if (!this.changelogProvider?.getLatestReleaseNotes) {
      return null;
    }
    return this.changelogProvider.getLatestReleaseNotes();
  }
}
