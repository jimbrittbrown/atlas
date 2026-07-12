import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function record({
  component,
  status,
  warnings = [],
  errors = [],
  dependencies = [],
  readinessScore,
  recommendedAction,
  lastChecked
}) {
  return {
    component,
    status,
    lastChecked: lastChecked ?? new Date().toISOString(),
    warnings,
    errors,
    dependencies,
    readinessScore,
    recommendedAction
  };
}

export class AtlasSystemHealthModel {
  project({ context = {} } = {}) {
    const now = new Date().toISOString();

    const hasMissionControl = Boolean(context.missionControl);
    const hasIntake = Boolean(context.missionControl?.intakeEngine);
    const hasMissionRegistry = Boolean(context.missionRegistry);
    const hasWorkforce = Boolean(context.workforceDirector);
    const hasPlanning = Boolean(context.executivePlanningSystem);
    const hasBuilder = Boolean(context.websiteBuilderMissionManager || context.missionControl?.websiteBuilderMissionManager);

    const providerEntries = context.providerHealth?.providers ?? [];
    const framerEntry = providerEntries.find((provider) => String(provider.providerName).toUpperCase() === 'FRAMER') ?? null;
    const reportingReady = Boolean(context.reportPaths?.length);

    return {
      status: DataAvailabilityStatuses.PARTIAL,
      records: [
        record({
          component: 'Atlas runtime',
          status: DataAvailabilityStatuses.AVAILABLE,
          warnings: [],
          errors: [],
          dependencies: ['Node.js runtime'],
          readinessScore: 0.9,
          recommendedAction: 'Continue runtime telemetry expansion.',
          lastChecked: now
        }),
        record({
          component: 'Mission Control',
          status: hasMissionControl ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.UNAVAILABLE,
          warnings: hasMissionControl ? [] : ['Mission Control instance missing.'],
          errors: hasMissionControl ? [] : ['Cannot query mission operations state.'],
          dependencies: ['Customer Intake', 'Mission Registry', 'Workforce Director'],
          readinessScore: hasMissionControl ? 0.9 : 0.1,
          recommendedAction: hasMissionControl ? 'Keep read-only dashboard bridge.' : 'Connect Mission Control adapter.',
          lastChecked: now
        }),
        record({
          component: 'Customer Intake',
          status: hasIntake ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
          warnings: hasIntake ? [] : ['Intake engine not connected directly.'],
          errors: [],
          dependencies: ['Customer Registry', 'Mission Registry'],
          readinessScore: hasIntake ? 0.88 : 0.5,
          recommendedAction: hasIntake ? 'Monitor intake rejection trends.' : 'Attach intake telemetry adapter.',
          lastChecked: now
        }),
        record({
          component: 'Mission Registry',
          status: hasMissionRegistry ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.UNAVAILABLE,
          warnings: hasMissionRegistry ? [] : ['Mission Registry missing.'],
          errors: hasMissionRegistry ? [] : ['Mission records unavailable.'],
          dependencies: ['Mission Control'],
          readinessScore: hasMissionRegistry ? 0.92 : 0.1,
          recommendedAction: hasMissionRegistry ? 'Track mission-state cardinality.' : 'Connect registry adapter.',
          lastChecked: now
        }),
        record({
          component: 'Workforce Director',
          status: hasWorkforce ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
          warnings: hasWorkforce ? [] : ['Workforce Director unavailable.'],
          errors: [],
          dependencies: ['Workforce Registry'],
          readinessScore: hasWorkforce ? 0.9 : 0.4,
          recommendedAction: hasWorkforce ? 'Expand capability gap monitoring.' : 'Attach workforce adapter.',
          lastChecked: now
        }),
        record({
          component: 'Executive Planning',
          status: hasPlanning ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
          warnings: hasPlanning ? [] : ['Executive Planning system not attached.'],
          errors: [],
          dependencies: ['Mission Portfolio Registry', 'Planning Engine'],
          readinessScore: hasPlanning ? 0.89 : 0.45,
          recommendedAction: hasPlanning ? 'Continue proposal telemetry capture.' : 'Connect planning adapter.',
          lastChecked: now
        }),
        record({
          component: 'Website Builder',
          status: hasBuilder ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
          warnings: hasBuilder ? [] : ['Website builder manager not connected.'],
          errors: [],
          dependencies: ['Website Orchestrator', 'Provider Adapter'],
          readinessScore: hasBuilder ? 0.87 : 0.5,
          recommendedAction: hasBuilder ? 'Keep governance checks enabled.' : 'Wire builder telemetry adapter.',
          lastChecked: now
        }),
        record({
          component: 'Framer integration',
          status: framerEntry?.connectionStatus ?? DataAvailabilityStatuses.NOT_CONNECTED,
          warnings: framerEntry?.warnings ?? ['No live Framer health signal found.'],
          errors: framerEntry?.blockingIssues ?? [],
          dependencies: ['framer-api', 'Framer auth config'],
          readinessScore: framerEntry?.connectionStatus === DataAvailabilityStatuses.AVAILABLE ? 0.9 : 0.45,
          recommendedAction: framerEntry?.connectionStatus === DataAvailabilityStatuses.AVAILABLE
            ? 'Run periodic read capability checks.'
            : 'Configure Framer credentials and health checks.',
          lastChecked: now
        }),
        record({
          component: 'Reporting system',
          status: reportingReady ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
          warnings: reportingReady ? [] : ['No report paths configured in dashboard manager context.'],
          errors: [],
          dependencies: ['review artifact outputs'],
          readinessScore: reportingReady ? 0.85 : 0.5,
          recommendedAction: reportingReady ? 'Add report freshness monitor.' : 'Provide report index adapter.',
          lastChecked: now
        }),
        record({
          component: 'Governance system',
          status: DataAvailabilityStatuses.AVAILABLE,
          warnings: [],
          errors: [],
          dependencies: ['CEO approval gates', 'Mission Conversion governance'],
          readinessScore: 0.9,
          recommendedAction: 'Maintain read-only dashboard contract boundaries.',
          lastChecked: now
        })
      ]
    };
  }
}
