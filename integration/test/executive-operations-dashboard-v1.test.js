import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDecisions } from '../src/executive/executive-planning-contracts.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { WorkforceDirector } from '../src/executive/workforce-director.js';
import { CustomerRegistry } from '../src/executive/customer-registry.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';

function buildProposal(overrides = {}) {
  return {
    sourceType: 'CUSTOMER',
    sourceId: 'proposal-source-1',
    customerId: 'cus_alpha',
    title: 'Alpha Website Build',
    description: 'Execute website growth sprint.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Increase conversion volume.',
    strategicObjective: 'Customer acquisition growth',
    expectedBusinessValue: 90,
    urgency: 80,
    estimatedEffort: 30,
    estimatedCost: 50000,
    estimatedDuration: 45,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION'],
    risks: [{ id: 'risk-1', severity: 0.3 }],
    confidence: 0.82,
    metadata: {
      companyName: 'Alpha Co',
      contactName: 'Alex',
      contactEmail: 'alex@alpha.example',
      contactPhone: '+1-111-111-1111',
      website: 'https://alpha.example',
      industry: 'Services',
      adapterType: 'FRAMER',
      providerHint: 'FRAMER_SANDBOX'
    },
    ...overrides
  };
}

function createFakeMissionControl() {
  const customerRegistry = new CustomerRegistry();
  const missionRegistry = new MissionRegistry();
  const workforceDirector = new WorkforceDirector();
  const activityFeed = [];

  customerRegistry.createCustomer({
    companyName: 'Alpha Co',
    contactName: 'Alex',
    email: 'alex@alpha.example',
    phone: '+1-111-111-1111',
    website: 'https://alpha.example',
    industry: 'Services'
  });

  missionRegistry.createMission({
    customerId: customerRegistry.listCustomers()[0].customerId,
    missionType: 'WEBSITE_BUILD',
    currentStage: 'MISSION_CREATED',
    progress: 5,
    executiveStatus: 'ACTIVE'
  });

  const mission2 = missionRegistry.createMission({
    customerId: customerRegistry.listCustomers()[0].customerId,
    missionType: 'DOCUMENTARY',
    currentStage: 'EXECUTIVE_REVIEW_PENDING',
    progress: 85,
    executiveStatus: 'AWAITING_EXECUTIVE_REVIEW'
  });

  missionRegistry.updateMission(mission2.missionId, {
    startedDate: new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString(),
    executiveStatus: 'BLOCKED',
    progress: 10
  });

  activityFeed.push({
    timestamp: new Date().toISOString(),
    type: 'MISSION_CREATED',
    details: {
      missionId: mission2.missionId,
      customerId: customerRegistry.listCustomers()[0].customerId
    }
  });

  return {
    customerRegistry,
    missionRegistry,
    workforceDirector,
    activityFeed
  };
}

function createSeededDashboard() {
  const missionControl = createFakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });

  const a = planning.submitProposal(buildProposal({ title: 'Alpha Website Build', customerId: missionControl.customerRegistry.listCustomers()[0].customerId }));
  const b = planning.submitProposal(buildProposal({
    sourceId: 'proposal-source-2',
    title: 'Beta Research Program',
    missionType: 'RESEARCH',
    expectedBusinessValue: 55,
    urgency: 40,
    confidence: 0.45,
    estimatedCost: 320000,
    dependencies: ['proposal_dep_missing'],
    risks: [{ id: 'risk-high', severity: 0.8 }],
    requiredCapabilities: ['RESEARCH']
  }));

  planning.evaluateAll();
  planning.rankPortfolio();

  planning.applyDecision({
    proposalId: a.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Proceed',
    conditions: []
  });

  planning.applyDecision({
    proposalId: b.proposal.proposalId,
    decision: ExecutiveDecisions.REVISION_REQUIRED,
    decidedBy: 'CEO',
    rationale: 'Need dependency closure',
    conditions: []
  });

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: {
      getProviderStatuses() {
        return [
          {
            providerName: 'Framer',
            configuredStatus: 'AVAILABLE',
            authenticationStatus: 'AVAILABLE',
            connectionStatus: 'AVAILABLE',
            readCapabilityStatus: 'AVAILABLE',
            writeCapabilityStatus: 'PARTIAL',
            lastSuccessfulCheck: new Date().toISOString(),
            lastFailure: null,
            warnings: [],
            blockingIssues: [],
            capabilityLimitations: ['Publish path intentionally disabled']
          }
        ];
      }
    },
    reportPaths: ['review/executive-planning-system-v1-report.json']
  });

  return {
    dashboard: new ExecutiveOperationsDashboard({ manager }),
    manager,
    missionControl,
    planning
  };
}

function createProjectionEnvelope({
  providerId,
  projectionId,
  projectionType,
  contractVersion = '1.0.0',
  status = 'AVAILABLE',
  source = 'TEST',
  payload = {},
  aggregateMetrics = {},
  warnings = [],
  incidents = [],
  timestamp = new Date().toISOString(),
  generatedAt = null
} = {}) {
  const normalizedTimestamp = generatedAt ?? timestamp;
  return {
    providerId,
    projectionId,
    projectionType,
    contractVersion,
    status,
    source,
    payload,
    aggregateMetrics,
    warnings,
    incidents,
    timestamp: normalizedTimestamp,
    generatedAt: normalizedTimestamp
  };
}

test('successful complete snapshot generation', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(Boolean(snapshot.executiveOverview), true);
  assert.equal(Boolean(snapshot.ceoDecisionCenter), true);
  assert.equal(Boolean(snapshot.missionControl), true);
  assert.equal(Boolean(snapshot.workforce), true);
  assert.equal(Boolean(snapshot.customerPipeline), true);
  assert.equal(Boolean(snapshot.opportunityPortfolio), true);
  assert.equal(Boolean(snapshot.providerHealth), true);
  assert.equal(Boolean(snapshot.systemHealth), true);
  assert.equal(Boolean(snapshot.activityFeed), true);
  assert.equal(Boolean(snapshot.alerts), true);
});

test('empty system state', () => {
  const dashboard = new ExecutiveOperationsDashboard({
    manager: new ExecutiveOperationsDashboardManager({
      missionControl: {
        customerRegistry: { listCustomers: () => [] },
        missionRegistry: { listMissions: () => [] },
        workforceDirector: null,
        activityFeed: []
      },
      executivePlanningSystem: {
        portfolioManager: {
          portfolioRegistry: { listProposals: () => [] },
          getWorkforceSnapshot: () => ({ dashboard: {} }),
          requiresCeoApproval: () => ({ required: false, reasons: [] })
        }
      },
      providerHealthAdapter: { getProviderStatuses: () => [] }
    })
  });

  const snapshot = dashboard.generateSnapshot();
  assert.equal(snapshot.executiveOverview.totalCustomers, 0);
  assert.equal(snapshot.executiveOverview.totalMissions, 0);
  assert.equal(snapshot.missingData.length > 0, true);
});

test('partial data availability', () => {
  const { dashboard, manager } = createSeededDashboard();
  manager.providerHealthAdapter = { getProviderStatuses: () => [] };

  const snapshot = dashboard.generateSnapshot();
  assert.equal(snapshot.providerHealth.status, 'PARTIAL');
  assert.equal(snapshot.missingData.some((item) => item.includes('Provider health adapter')), true);
});

test('unavailable provider data labeling', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  const google = snapshot.providerHealth.providers.find((provider) => provider.providerName === 'Google');
  assert.equal(Boolean(google), true);
  assert.equal(google.configuredStatus, 'NOT_CONFIGURED');
});

test('blocked mission detection', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.executiveOverview.blockedMissions >= 1, true);
  assert.equal(snapshot.alerts.alerts.some((alert) => alert.category === 'blocked missions'), true);
});

test('overdue mission detection', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.alerts.alerts.some((alert) => alert.category === 'overdue missions'), true);
});

test('CEO decision aggregation', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.ceoDecisionCenter.totalItems > 0, true);
  assert.equal(snapshot.ceoDecisionCenter.items.every((item) => item.decisionId), true);
});

test('workforce utilization calculation', () => {
  const { dashboard, missionControl } = createSeededDashboard();
  const missionId = missionControl.missionRegistry.listMissions()[0].missionId;

  missionControl.workforceDirector.planMissionAssignments({ missionId, missionType: 'WEBSITE_BUILD' });
  missionControl.workforceDirector.markStageStarted({ missionId, stageId: 'COMPANY_RESEARCH' });

  const snapshot = dashboard.generateSnapshot();
  assert.equal(typeof snapshot.workforce.utilization, 'number');
});

test('portfolio ranking display', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.opportunityPortfolio.rows.length >= 2, true);
  assert.equal(snapshot.opportunityPortfolio.ranking.length >= 2, true);
});

test('confidence and risk aggregation', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(typeof snapshot.executiveOverview.averageConfidenceScore, 'number');
  assert.equal(typeof snapshot.executiveOverview.averageRiskScore, 'number');
});

test('activity normalization', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.activityFeed.events.length > 0, true);
  const event = snapshot.activityFeed.events[0];
  assert.equal(Boolean(event.eventId), true);
  assert.equal(Boolean(event.timestamp), true);
  assert.equal(Boolean(event.category), true);
});

test('alert severity calculation', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.alerts.bySeverity.INFO >= 0, true);
  assert.equal(snapshot.alerts.bySeverity.WARNING >= 0, true);
  assert.equal(snapshot.alerts.bySeverity.HIGH >= 0, true);
  assert.equal(snapshot.alerts.bySeverity.CRITICAL >= 0, true);
});

test('missing-data labeling', () => {
  const dashboard = new ExecutiveOperationsDashboard({
    manager: new ExecutiveOperationsDashboardManager({
      missionControl: null,
      executivePlanningSystem: null,
      providerHealthAdapter: { getProviderStatuses: () => [] }
    })
  });

  const snapshot = dashboard.generateSnapshot();
  assert.equal(snapshot.missingData.some((item) => item.includes('Mission Control')), true);
  assert.equal(snapshot.dashboardStatus, 'PARTIAL');
});

test('read-only governance enforcement and prevention of publish/deploy/write operations', () => {
  const calls = {
    publish: 0,
    deploy: 0,
    approve: 0,
    reject: 0,
    delete: 0,
    intake: 0
  };

  const missionControl = {
    customerRegistry: { listCustomers: () => [] },
    missionRegistry: { listMissions: () => [] },
    workforceDirector: null,
    activityFeed: [],
    intake: () => { calls.intake += 1; },
    publish: () => { calls.publish += 1; },
    deploy: () => { calls.deploy += 1; },
    approve: () => { calls.approve += 1; },
    reject: () => { calls.reject += 1; },
    delete: () => { calls.delete += 1; }
  };

  const dashboard = new ExecutiveOperationsDashboard({
    manager: new ExecutiveOperationsDashboardManager({
      missionControl,
      executivePlanningSystem: {
        portfolioManager: {
          portfolioRegistry: { listProposals: () => [] },
          getWorkforceSnapshot: () => ({ dashboard: {} }),
          requiresCeoApproval: () => ({ required: false, reasons: [] })
        }
      },
      providerHealthAdapter: { getProviderStatuses: () => [] }
    })
  });

  const snapshot = dashboard.generateSnapshot();

  assert.equal(snapshot.governance.readOnly, true);
  assert.equal(snapshot.governance.publishOperationsExecuted, false);
  assert.equal(snapshot.governance.deploymentOperationsExecuted, false);
  assert.equal(calls.publish, 0);
  assert.equal(calls.deploy, 0);
  assert.equal(calls.approve, 0);
  assert.equal(calls.reject, 0);
  assert.equal(calls.delete, 0);
  assert.equal(calls.intake, 0);
});

test('compatibility with existing Customer Intake and Mission Control', () => {
  const missionControl = new CustomerIntakeMissionControl();
  const dashboard = new ExecutiveOperationsDashboard({
    manager: new ExecutiveOperationsDashboardManager({
      missionControl,
      executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
      providerHealthAdapter: { getProviderStatuses: () => [] }
    })
  });

  const snapshot = dashboard.generateSnapshot();
  assert.equal(Boolean(snapshot.missionControl), true);
});

test('compatibility with Workforce Director', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(Boolean(snapshot.workforce.workerDetails), true);
  assert.equal(Array.isArray(snapshot.workforce.workerDetails), true);
});

test('compatibility with Executive Planning', () => {
  const { dashboard } = createSeededDashboard();
  const snapshot = dashboard.generateSnapshot();

  assert.equal(Array.isArray(snapshot.opportunityPortfolio.rows), true);
  assert.equal(snapshot.opportunityPortfolio.rows.length > 0, true);
});

test('compatibility with Website Builder and Framer integration abstractions', () => {
  const missionControl = new CustomerIntakeMissionControl();
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
    providerHealthAdapter: { getProviderStatuses: () => [] }
  });

  const snapshot = manager.buildSnapshot();
  const providerNames = snapshot.providerHealth.providers.map((provider) => provider.providerName.toUpperCase());

  assert.equal(providerNames.includes('FRAMER'), true);
});

test('dashboard manager does not auto-construct customer or website production managers', () => {
  const missionControl = createFakeMissionControl();
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
    providerHealthAdapter: { getProviderStatuses: () => [] }
  });

  assert.equal(manager.customerPortalManager, null);
  assert.equal(manager.websiteProductionManager, null);
});

test('projection composer consumes injected projections', () => {
  const missionControl = createFakeMissionControl();
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
    providerHealthAdapter: { getProviderStatuses: () => [] },
    projectionProviders: {
      'operations.telemetry.provider': () => createProjectionEnvelope({
        providerId: 'operations.telemetry.provider',
        projectionId: 'operations.telemetry.injected',
        projectionType: 'OPERATIONS_TELEMETRY',
        payload: {
          loopState: 'RUNNING',
          currentCycle: null,
          lastCompletedCycle: { cycleId: 'c-1', state: 'COMPLETED', warnings: [], errors: [] },
          heartbeat: { lastBeatAt: new Date().toISOString() },
          metrics: { totalCycles: 1 },
          recentFindings: [],
          recentSafeActions: [],
          blockedActions: [],
          recoveryStatus: { recentRecoveries: [], recoveryEnabled: true },
          activeAlerts: [],
          configurationSummary: {},
          governanceStatus: {
            dryRun: true,
            publishAttempted: false,
            deployAttempted: false,
            destructiveOperationAttempted: false,
            ceoApprovalBypassed: false,
            existingExecutionManagersReused: true
          },
          dataFreshness: [],
          limitations: []
        },
        aggregateMetrics: { totalCycles: 1 }
      }),
      'website.production.provider': () => createProjectionEnvelope({
        providerId: 'website.production.provider',
        projectionId: 'website.production.injected',
        projectionType: 'WEBSITE_PRODUCTION',
        payload: {
          status: 'AVAILABLE',
          totalReviews: 3,
          awaitingCeoApproval: 2,
          records: []
        },
        aggregateMetrics: { totalReviews: 3, awaitingCeoApproval: 2 }
      }),
      'customer.portal.provider': () => createProjectionEnvelope({
        providerId: 'customer.portal.provider',
        projectionId: 'customer.portal.injected',
        projectionType: 'CUSTOMER_PORTAL',
        payload: {
          status: 'AVAILABLE',
          totalRequests: 7,
          totalRevisionRequests: 4,
          auth: { mode: 'SESSION' },
          payments: { status: 'READ_ONLY' }
        },
        aggregateMetrics: { totalRequests: 7, totalRevisionRequests: 4 }
      })
    }
  });

  const snapshot = manager.buildSnapshot();
  assert.equal(snapshot.operationsLoop.loopState, 'RUNNING');
  assert.equal(snapshot.websiteProduction.totalReviews, 3);
  assert.equal(snapshot.websiteBusinessLaunch.newLeads, 7);
  assert.equal(snapshot.websiteBusinessLaunch.revisionQueue, 4);
});

test('optional projection provider failure does not collapse dashboard snapshot', () => {
  const missionControl = createFakeMissionControl();
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
    providerHealthAdapter: { getProviderStatuses: () => [] },
    projectionProviders: {
      'operations.telemetry.provider': () => createProjectionEnvelope({
        providerId: 'operations.telemetry.provider',
        projectionId: 'operations.telemetry.required',
        projectionType: 'OPERATIONS_TELEMETRY',
        payload: manager?.operationsLoopManager?.getDashboardProjection?.() ?? {
          loopState: 'STOPPED',
          currentCycle: null,
          lastCompletedCycle: null,
          heartbeat: {},
          metrics: {},
          recentFindings: [],
          recentSafeActions: [],
          blockedActions: [],
          recoveryStatus: { recentRecoveries: [], recoveryEnabled: true },
          activeAlerts: [],
          configurationSummary: {},
          governanceStatus: {
            dryRun: true,
            publishAttempted: false,
            deployAttempted: false,
            destructiveOperationAttempted: false,
            ceoApprovalBypassed: false,
            existingExecutionManagersReused: true
          },
          dataFreshness: [],
          limitations: []
        },
        aggregateMetrics: {}
      }),
      'website.production.provider': () => {
        throw new Error('website production provider offline');
      }
    }
  });

  const snapshot = manager.buildSnapshot();
  assert.equal(Boolean(snapshot.operationsLoop), true);
  assert.equal(snapshot.websiteProduction.status, 'PARTIAL');
  assert.equal(
    snapshot.missingData.some((item) => item.includes('website.production.provider')),
    true
  );
});

test('required operations telemetry failure is visible and fail-safe', () => {
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl: createFakeMissionControl(),
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl: createFakeMissionControl() }),
    providerHealthAdapter: { getProviderStatuses: () => [] },
    projectionProviders: {
      'operations.telemetry.provider': () => {
        throw new Error('telemetry unavailable');
      }
    }
  });

  assert.throws(() => {
    manager.buildSnapshot();
  }, /operations\.telemetry\.provider/i);
});

test('malformed optional projection payload is rejected safely', () => {
  const missionControl = createFakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: { getProviderStatuses: () => [] },
    projectionProviders: {
      'website.production.provider': () => ({ bad: 'payload' })
    }
  });

  const snapshot = manager.buildSnapshot();
  assert.equal(snapshot.websiteProduction.status, 'PARTIAL');
  assert.equal(snapshot.missingData.some((item) => item.includes('malformed payload')), true);
});

test('duplicate projection identifiers are rejected', () => {
  const missionControl = createFakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: { getProviderStatuses: () => [] },
    projectionProviders: {
      'operations.telemetry.provider': () => createProjectionEnvelope({
        providerId: 'operations.telemetry.provider',
        projectionId: 'shared.id',
        projectionType: 'OPERATIONS_TELEMETRY',
        payload: manager?.operationsLoopManager?.getDashboardProjection?.(),
        aggregateMetrics: {}
      }),
      'website.production.provider': () => createProjectionEnvelope({
        providerId: 'website.production.provider',
        projectionId: 'shared.id',
        projectionType: 'WEBSITE_PRODUCTION',
        payload: {
          status: 'AVAILABLE',
          totalReviews: 0,
          awaitingCeoApproval: 0,
          records: []
        },
        aggregateMetrics: {}
      })
    }
  });

  assert.throws(() => {
    manager.buildSnapshot();
  }, /Duplicate projection identifier/);
});

test('stale optional projection is flagged in missingData', () => {
  const missionControl = createFakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const stale = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    providerHealthAdapter: { getProviderStatuses: () => [] },
    projectionProviders: {
      'customer.portal.provider': () => createProjectionEnvelope({
        providerId: 'customer.portal.provider',
        projectionId: 'customer.portal.stale',
        projectionType: 'CUSTOMER_PORTAL',
        timestamp: stale,
        payload: {
          status: 'AVAILABLE',
          totalRequests: 1,
          totalRevisionRequests: 0,
          auth: null,
          payments: { status: 'READ_ONLY' }
        },
        aggregateMetrics: {}
      })
    }
  });

  const snapshot = manager.buildSnapshot();
  assert.equal(snapshot.missingData.some((item) => item.includes('stale projection timestamp')), true);
});

test('source-of-truth domain services are not mutated during projection composition', () => {
  const calls = {
    createMission: 0,
    updateMission: 0,
    updateCustomer: 0,
    executeCommand: 0
  };

  const missionControl = createFakeMissionControl();
  missionControl.missionRegistry.createMission = () => { calls.createMission += 1; };
  missionControl.missionRegistry.updateMission = () => { calls.updateMission += 1; };
  missionControl.customerRegistry.updateCustomer = () => { calls.updateCustomer += 1; };

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
    providerHealthAdapter: { getProviderStatuses: () => [] }
  });

  manager.missionControlManager.executeCommand = async () => {
    calls.executeCommand += 1;
    return { accepted: true };
  };

  manager.buildSnapshot();

  assert.equal(calls.createMission, 0);
  assert.equal(calls.updateMission, 0);
  assert.equal(calls.updateCustomer, 0);
  assert.equal(calls.executeCommand, 0);
});

test('provider/customer/workforce/website/payment projections remain read-only', () => {
  const mutationCalls = {
    providerWrite: 0,
    workforceAssign: 0,
    paymentCharge: 0,
    customerMutate: 0,
    websitePublish: 0
  };

  const missionControl = createFakeMissionControl();
  missionControl.providerWrite = () => { mutationCalls.providerWrite += 1; };
  missionControl.workforceDirector.assignWorker = () => { mutationCalls.workforceAssign += 1; };
  missionControl.customerRegistry.updateCustomer = () => { mutationCalls.customerMutate += 1; };

  const customerPortalManager = {
    getDashboardProjection() {
      return {
        status: 'AVAILABLE',
        totalRequests: 2,
        totalRevisionRequests: 1,
        auth: { mode: 'SESSION' },
        payments: { status: 'READ_ONLY' }
      };
    },
    chargeCustomer() {
      mutationCalls.paymentCharge += 1;
    }
  };

  const websiteProductionManager = {
    getDashboardProjection() {
      return {
        status: 'AVAILABLE',
        totalReviews: 1,
        awaitingCeoApproval: 1,
        records: []
      };
    },
    publish() {
      mutationCalls.websitePublish += 1;
    }
  };

  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: new ExecutivePlanningSystem({ missionControl }),
    providerHealthAdapter: { getProviderStatuses: () => [] },
    customerPortalManager,
    websiteProductionManager
  });

  const snapshot = manager.buildSnapshot();
  assert.equal(snapshot.providerHealth.status, 'PARTIAL');
  assert.equal(snapshot.workforce.status, 'AVAILABLE');
  assert.equal(snapshot.websiteProduction.status, 'AVAILABLE');
  assert.equal(snapshot.websiteBusinessLaunch.payments.status, 'READ_ONLY');
  assert.equal(mutationCalls.providerWrite, 0);
  assert.equal(mutationCalls.workforceAssign, 0);
  assert.equal(mutationCalls.paymentCharge, 0);
  assert.equal(mutationCalls.customerMutate, 0);
  assert.equal(mutationCalls.websitePublish, 0);
});
