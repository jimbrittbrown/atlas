export class ControlCenterOverview {
  constructor({
    generatedAt,
    workflowId = null,
    requestId = null,
    capabilitiesTotal = 0,
    workflowState = 'UNKNOWN',
    approvals = { approved: 0, rejected: 0, pending: 0 },
  }) {
    this.generatedAt = generatedAt ?? new Date().toISOString();
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.capabilitiesTotal = capabilitiesTotal;
    this.workflowState = workflowState;
    this.approvals = approvals;
  }
}

export class CapabilityHealthSnapshot {
  constructor({ generatedAt, records }) {
    this.generatedAt = generatedAt ?? new Date().toISOString();
    this.records = records ?? [];
  }
}

export class WorkflowOperationsView {
  constructor({ generatedAt, workflowExecution = null, history = [] }) {
    this.generatedAt = generatedAt ?? new Date().toISOString();
    this.workflowExecution = workflowExecution;
    this.history = history;
  }
}

export class ExecutionAlertsView {
  constructor({ generatedAt, alerts = [] }) {
    this.generatedAt = generatedAt ?? new Date().toISOString();
    this.alerts = alerts;
  }
}

export class ReleaseTraceabilityView {
  constructor({ generatedAt, traceability = null, changelog = null }) {
    this.generatedAt = generatedAt ?? new Date().toISOString();
    this.traceability = traceability;
    this.changelog = changelog;
  }
}
