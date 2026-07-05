import { ControlCenterLogger } from './control-center-logger.js';
import { ControlCenterPresenter } from './control-center-presenter.js';
import { ControlCenterRetrieval } from './control-center-retrieval.js';

const countApprovalStates = (approvals) => {
  const summary = { approved: 0, rejected: 0, pending: 0 };
  for (const record of approvals ?? []) {
    const status = record?.status ?? record?.decision ?? 'PENDING';
    if (status === 'APPROVED') {
      summary.approved += 1;
    } else if (status === 'REJECTED') {
      summary.rejected += 1;
    } else {
      summary.pending += 1;
    }
  }
  return summary;
};

export class ControlCenterService {
  constructor({
    capabilityRegistry,
    workerOrchestration,
    approvalService,
    performanceService,
    traceabilityProvider = null,
    changelogProvider = null,
    retrieval = null,
    presenter = new ControlCenterPresenter(),
    logger = new ControlCenterLogger(),
  } = {}) {
    this.retrieval = retrieval ?? new ControlCenterRetrieval({
      capabilityRegistry,
      workerOrchestration,
      approvalService,
      performanceService,
      traceabilityProvider,
      changelogProvider,
    });
    this.presenter = presenter;
    this.logger = logger;
  }

  getSystemOverview({ workflowId = null, workflowExecutionId = null, requestId = null } = {}) {
    const capabilities = this.retrieval.getCapabilities();
    const approvals = this.retrieval.getApprovalHistory({ workflowId, requestId });
    const workflowStatus = this.retrieval.getWorkflowStatus(workflowExecutionId);

    const overview = this.presenter.createOverview({
      workflowId,
      requestId,
      capabilitiesTotal: capabilities?.total ?? capabilities?.records?.length ?? 0,
      workflowState: workflowStatus?.state?.value ?? 'UNKNOWN',
      approvals: countApprovalStates(approvals),
    });

    this.logger.log({ message: 'Control Center system overview generated', workflowId, requestId });
    return overview;
  }

  getCapabilityHealthSnapshot(filters = {}) {
    const capabilities = this.retrieval.getCapabilities(filters);
    const records = (capabilities?.records ?? []).map((record) => {
      const capabilityName = record?.metadata?.name ?? record?.name ?? 'Unknown Capability';
      return {
        capability: capabilityName,
        status: record?.status ?? record?.metadata?.status ?? 'UNKNOWN',
        owner: record?.metadata?.owner ?? null,
        version: record?.metadata?.version ?? null,
        health: this.retrieval.getCapabilityHealth(capabilityName),
      };
    });

    const snapshot = this.presenter.createCapabilityHealthSnapshot({ records });
    this.logger.log({ message: 'Control Center capability health snapshot generated', count: records.length });
    return snapshot;
  }

  getWorkflowOperationsView({ workflowExecutionId = null } = {}) {
    const workflowExecution = this.retrieval.getWorkflowStatus(workflowExecutionId);
    const history = this.retrieval.getExecutionHistory();

    const view = this.presenter.createWorkflowOperationsView({
      workflowExecution,
      history,
    });

    this.logger.log({
      message: 'Control Center workflow operations view generated',
      workflowExecutionId,
      historyCount: history.length,
    });
    return view;
  }

  getExecutionAlerts({ workflowId = null, requestId = null } = {}) {
    const history = this.retrieval.getExecutionHistory();
    const approvals = this.retrieval.getApprovalHistory({ workflowId, requestId });

    const alerts = [];
    for (const item of history) {
      const state = item?.state?.value ?? 'UNKNOWN';
      if (state === 'FAILED' || state === 'CANCELLED') {
        alerts.push({
          source: 'worker-orchestration',
          severity: state === 'FAILED' ? 'HIGH' : 'MEDIUM',
          status: state,
          assignmentId: item.id ?? null,
          workerId: item.workerId ?? null,
        });
      }
    }

    for (const approval of approvals) {
      if ((approval?.status ?? approval?.decision) === 'REJECTED') {
        alerts.push({
          source: 'approval-service',
          severity: 'HIGH',
          status: 'REJECTED',
          approvalId: approval.id ?? null,
          workflowId: approval.workflowId ?? workflowId,
        });
      }
    }

    const view = this.presenter.createExecutionAlertsView({ alerts });
    this.logger.log({ message: 'Control Center execution alerts generated', count: alerts.length });
    return view;
  }

  getReleaseAndTraceabilityView() {
    const view = this.presenter.createReleaseTraceabilityView({
      traceability: this.retrieval.getTraceabilitySnapshot(),
      changelog: this.retrieval.getLatestReleaseNotes(),
    });

    this.logger.log({ message: 'Control Center release and traceability view generated' });
    return view;
  }

  requestOperationalAction(_command) {
    throw new Error('Control Center is observational only and cannot execute operational actions');
  }

  getHistory() {
    return this.logger.getEntries();
  }
}
