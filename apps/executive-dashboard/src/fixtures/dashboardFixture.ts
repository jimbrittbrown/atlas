import type { ApiEnvelope, DashboardSnapshot } from '../api/types';

export const dashboardFixtureEnvelope: ApiEnvelope<DashboardSnapshot> = {
  success: true,
  status: 200,
  requestId: 'req_fixture_overview',
  timestamp: new Date().toISOString(),
  data: {
    executiveOverview: {
      totalCustomers: 0,
      totalMissions: 0,
      activeMissions: 0,
      blockedMissions: 0,
      missionsAwaitingCeoReview: 0,
      currentPortfolioValue: 0,
      averageConfidenceScore: null,
      averageRiskScore: null,
      systemHealthSummary: 'ATTENTION_REQUIRED',
      dataAvailability: 'PARTIAL',
      generatedTimestamp: new Date().toISOString(),
    },
    missionControl: { records: [] },
    workforce: { utilization: null, status: 'UNAVAILABLE', workerDetails: [] },
    customerPipeline: { status: 'PARTIAL', totalCustomers: 0 },
    opportunityPortfolio: { status: 'ESTIMATED', estimatedPortfolioValue: 0, rows: [] },
    providerHealth: {
      status: 'PARTIAL',
      providers: [
        {
          providerName: 'Framer',
          configuredStatus: 'NOT_CONFIGURED',
          connectionStatus: 'NOT_CONFIGURED',
          readCapabilityStatus: 'NOT_CONFIGURED',
          writeCapabilityStatus: 'NOT_CONFIGURED',
          warnings: ['Development fixture only.'],
        },
      ],
    },
    systemHealth: { status: 'PARTIAL', summary: 'DEVELOPMENT_DATA_ONLY' },
    alerts: {
      alerts: [
        {
          alertId: 'alert_fixture_1',
          severity: 'WARNING',
          title: 'Development fixture mode enabled',
          category: 'governance',
          recommendedAction: 'Switch to live API before executive decision-making.',
        },
      ],
    },
    activityFeed: {
      events: [
        {
          eventId: 'evt_fixture_1',
          timestamp: new Date().toISOString(),
          severity: 'INFO',
          title: 'Fixture snapshot generated',
          description: 'This dataset is not operational Atlas telemetry.',
          sourceSystem: 'FIXTURE',
        },
      ],
    },
    generatedAt: new Date().toISOString(),
    dataFreshness: [{ section: 'executiveOverview', status: 'ESTIMATED', checkedAt: new Date().toISOString(), notes: ['DEVELOPMENT DATA'] }],
    missingData: ['No live operational source attached.'],
    limitations: ['DEVELOPMENT DATA: not suitable for real executive operations decisions.'],
    recommendedExecutiveActions: [{ action: 'CONNECT_LIVE_API', reason: 'Use authenticated live data source before acting.' }],
    dashboardStatus: 'PARTIAL',
  },
  pagination: null,
  dataFreshness: [{ section: 'executiveOverview', status: 'ESTIMATED', checkedAt: new Date().toISOString(), notes: ['DEVELOPMENT DATA'] }],
  warnings: ['DEVELOPMENT DATA MODE'],
  limitations: ['DEVELOPMENT DATA MODE'],
  error: null,
};
