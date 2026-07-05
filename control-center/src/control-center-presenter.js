import {
  CapabilityHealthSnapshot,
  ControlCenterOverview,
  ExecutionAlertsView,
  ReleaseTraceabilityView,
  WorkflowOperationsView,
} from './models.js';

export class ControlCenterPresenter {
  createOverview(data) {
    return new ControlCenterOverview(data);
  }

  createCapabilityHealthSnapshot(data) {
    return new CapabilityHealthSnapshot(data);
  }

  createWorkflowOperationsView(data) {
    return new WorkflowOperationsView(data);
  }

  createExecutionAlertsView(data) {
    return new ExecutionAlertsView(data);
  }

  createReleaseTraceabilityView(data) {
    return new ReleaseTraceabilityView(data);
  }
}
