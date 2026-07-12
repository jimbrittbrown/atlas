import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

export class CeoDecisionCenterDashboardModel {
  build({
    executiveReviews,
    blockedMissions,
    opportunities,
    risks,
    decisionHistory,
    dashboardHealth
  } = {}) {
    return {
      executiveReviews,
      blockedMissions,
      opportunities,
      risks,
      decisionHistory,
      dashboardHealth: {
        status: dashboardHealth?.status ?? DataAvailabilityStatuses.PARTIAL,
        generatedAt: dashboardHealth?.generatedAt ?? new Date().toISOString(),
        source: dashboardHealth?.source ?? 'EXECUTIVE_OPERATIONS_DASHBOARD',
        limitations: dashboardHealth?.limitations ?? []
      }
    };
  }
}
