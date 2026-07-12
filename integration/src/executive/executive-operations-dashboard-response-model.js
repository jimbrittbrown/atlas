import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

export class ExecutiveOperationsDashboardResponseModel {
  build({
    executiveOverview,
    ceoDecisionCenter,
    missionOrchestrator,
    operationsLoop,
    websiteProduction,
    notificationObservability = null,
    websiteBusinessLaunch,
    missionControl,
    workforce,
    customerPipeline,
    opportunityPortfolio,
    providerHealth,
    systemHealth,
    activityFeed,
    alerts,
    generatedAt,
    dataFreshness,
    missingData,
    limitations,
    recommendedExecutiveActions
  } = {}) {
    return {
      executiveOverview,
      ceoDecisionCenter,
      missionOrchestrator,
      operationsLoop,
      websiteProduction,
      notificationObservability,
      websiteBusinessLaunch,
      missionControl,
      workforce,
      customerPipeline,
      opportunityPortfolio,
      providerHealth,
      systemHealth,
      activityFeed,
      alerts,
      generatedAt,
      dataFreshness,
      missingData,
      limitations,
      recommendedExecutiveActions,
      dashboardStatus: missingData.length > 0
        ? DataAvailabilityStatuses.PARTIAL
        : DataAvailabilityStatuses.AVAILABLE,
      governance: {
        readOnly: true,
        writeOperationsExecuted: false,
        publishOperationsExecuted: false,
        deploymentOperationsExecuted: false,
        destructiveOperationsExecuted: false
      }
    };
  }
}
