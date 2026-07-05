import { ControlCenterService } from '../../control-center/src/control-center-service.js';

export class ControlCenterAdapter {
  constructor({
    capabilityRegistryService,
    workerOrchestrationService,
    approvalService,
    performanceService,
    traceabilityProvider = null,
    changelogProvider = null,
    service = null,
  }) {
    this.service = service ?? new ControlCenterService({
      capabilityRegistry: capabilityRegistryService,
      workerOrchestration: workerOrchestrationService,
      approvalService,
      performanceService,
      traceabilityProvider,
      changelogProvider,
    });
  }

  buildOperationalView({ workflowId, workflowExecutionId, requestId }) {
    return {
      overview: this.service.getSystemOverview({ workflowId, workflowExecutionId, requestId }),
      capabilityHealth: this.service.getCapabilityHealthSnapshot(),
      workflowOperations: this.service.getWorkflowOperationsView({ workflowExecutionId }),
      alerts: this.service.getExecutionAlerts({ workflowId, requestId }),
      releaseTraceability: this.service.getReleaseAndTraceabilityView(),
    };
  }
}
