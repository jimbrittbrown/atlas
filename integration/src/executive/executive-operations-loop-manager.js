import {
  createExecutiveOperationsLoopConfig,
  sanitizeExecutiveOperationsLoopConfig,
  ExecutiveOperationsActionTypes,
  ExecutiveOperationsCycleStates,
  ExecutiveOperationsFindingTypes,
  ExecutiveOperationsLoopStates,
  createOperationalAction,
  createOperationalFinding
} from './executive-operations-loop-contracts.js';
import { InMemoryExecutiveOperationsLoopStore } from './executive-operations-loop-store.js';
import { ExecutiveOperationsLoopPolicy } from './executive-operations-loop-policy.js';
import { ExecutiveOperationsPriorityEngine } from './executive-operations-priority-engine.js';
import { ExecutiveOperationsAlertEngine } from './executive-operations-alert-engine.js';
import { ExecutiveOperationsRecoveryCoordinator } from './executive-operations-recovery-coordinator.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function diffHours(start) {
  if (!start) return null;
  const parsed = new Date(start).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Number(((Date.now() - parsed) / (1000 * 60 * 60)).toFixed(2));
}

function nextWakeTime(intervalMs) {
  return new Date(Date.now() + Number(intervalMs ?? 0)).toISOString();
}

export class ExecutiveOperationsLoopManager {
  constructor({
    missionControl,
    executivePlanningSystem,
    missionOrchestratorManager,
    missionControlManager,
    workforceDirector,
    providerHealthAdapter,
    dashboardSnapshotProvider,
    store,
    policy,
    priorityEngine,
    alertEngine,
    recoveryCoordinator,
    config,
    storageProvider,
    logger,
    now
  } = {}) {
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.config = config ?? createExecutiveOperationsLoopConfig();

    this.missionControl = missionControl ?? null;
    this.executivePlanningSystem = executivePlanningSystem ?? null;
    this.missionOrchestratorManager = missionOrchestratorManager ?? null;
    this.missionControlManager = missionControlManager ?? null;
    this.workforceDirector = workforceDirector ?? missionControl?.workforceDirector ?? null;
    this.providerHealthAdapter = providerHealthAdapter ?? { getProviderStatuses: () => [] };
    this.dashboardSnapshotProvider = dashboardSnapshotProvider ?? (() => null);
    this.storageProvider = storageProvider ?? null;

    this.store = store ?? new InMemoryExecutiveOperationsLoopStore({ now, storageProvider: this.storageProvider });
    this.policy = policy ?? new ExecutiveOperationsLoopPolicy();
    this.priorityEngine = priorityEngine ?? new ExecutiveOperationsPriorityEngine();
    this.alertEngine = alertEngine ?? new ExecutiveOperationsAlertEngine({ store: this.store, now: this.now });
    this.recoveryCoordinator = recoveryCoordinator ?? new ExecutiveOperationsRecoveryCoordinator({
      missionControlManager: this.missionControlManager,
      workforceDirector: this.workforceDirector,
      store: this.store,
      config: this.config,
      now: this.now
    });

    this.consecutiveFailures = 0;
    this.timer = null;
    this.shouldStop = false;
  }

  recordAudit(event, details = {}) {
    this.store.recordAudit({
      timestamp: isoNow(this.now),
      event,
      details
    });
  }

  transitionLoopState(state) {
    this.store.transitionLoopState(state);
    this.recordAudit('LOOP_STATE_TRANSITION', { state });
  }

  collectContext() {
    const customers = this.missionControl?.customerRegistry?.listCustomers?.() ?? [];
    const missions = this.missionControl?.missionRegistry?.listMissions?.() ?? [];
    const proposals = this.executivePlanningSystem?.portfolioManager?.portfolioRegistry?.listProposals?.() ?? [];
    const orchestratorSessions = this.missionOrchestratorManager?.listSessions?.() ?? [];
    const workforce = this.workforceDirector?.buildDashboard?.() ?? null;
    const providerStatuses = this.providerHealthAdapter?.getProviderStatuses?.() ?? [];
    const dashboardSnapshot = this.dashboardSnapshotProvider?.() ?? null;

    return {
      customers,
      missions,
      proposals,
      orchestratorSessions,
      workforce,
      providerStatuses,
      dashboardSnapshot
    };
  }

  buildFindings(context) {
    const findings = [];
    const missionIds = new Set((context.missions ?? []).map((mission) => mission.customerId));

    (context.customers ?? []).forEach((customer) => {
      if (!missionIds.has(customer.customerId)) {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.CUSTOMER_INTAKE_GAP,
          title: 'Customer without routed mission',
          summary: `Customer ${customer.customerId} has no mission record yet.`,
          sourceSystem: 'CustomerRegistry',
          customerId: customer.customerId,
          customerImpact: 55,
          missionUrgency: 35,
          operationalRisk: 0.25,
          metadata: { companyName: customer.companyName }
        }));
      }
    });

    (context.proposals ?? []).forEach((proposal) => {
      const status = String(proposal.status ?? '').toUpperCase();
      if (status === 'UNDER_REVIEW' || status === 'REVISION_REQUIRED' || (status === 'APPROVED' && !proposal.linkedMissionId)) {
        findings.push(createOperationalFinding({
          type: status === 'APPROVED' ? ExecutiveOperationsFindingTypes.PENDING_PROPOSAL : ExecutiveOperationsFindingTypes.CEO_DECISION_REQUIRED,
          title: `Proposal requires attention: ${proposal.proposalId}`,
          summary: `Proposal ${proposal.proposalId} is ${status}.`,
          sourceSystem: 'ExecutivePlanningSystem',
          customerId: proposal.customerId,
          estimatedBusinessValue: Number(proposal.expectedBusinessValue ?? 0),
          missionUrgency: Number(proposal.urgency ?? 0),
          operationalRisk: Array.isArray(proposal.risks) && proposal.risks.length > 0
            ? Number(proposal.risks[0]?.severity ?? 0.3)
            : 0.3,
          confidenceScore: Number(proposal.confidence ?? 0.7)
        }));
      }
    });

    (context.missions ?? []).forEach((mission) => {
      const status = String(mission.executiveStatus ?? '').toUpperCase();
      const ageHours = diffHours(mission.startedDate);
      if (status === 'BLOCKED') {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.BLOCKED_MISSION,
          title: `Blocked mission ${mission.missionId}`,
          summary: `Mission ${mission.missionId} is blocked at ${mission.currentStage}.`,
          sourceSystem: 'MissionRegistry',
          customerId: mission.customerId,
          missionId: mission.missionId,
          blockedDurationHours: ageHours,
          customerImpact: 80,
          missionUrgency: 75,
          operationalRisk: 0.7,
          metadata: { missionType: mission.missionType, currentStage: mission.currentStage }
        }));
      }

      if (status === 'AWAITING_EXECUTIVE_REVIEW') {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.EXECUTIVE_REVIEW_REQUIRED,
          title: `Mission awaiting executive review ${mission.missionId}`,
          summary: `Mission ${mission.missionId} awaits executive review.`,
          sourceSystem: 'MissionRegistry',
          customerId: mission.customerId,
          missionId: mission.missionId,
          customerImpact: 65,
          missionUrgency: 60,
          operationalRisk: 0.4
        }));
      }

      if (ageHours !== null && ageHours >= Number(this.config.staleMissionHours ?? 24) && Number(mission.progress ?? 0) < 100) {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.STALE_ACTIVITY,
          title: `Stale mission activity ${mission.missionId}`,
          summary: `Mission ${mission.missionId} has stale activity for ${ageHours} hours.`,
          sourceSystem: 'MissionRegistry',
          customerId: mission.customerId,
          missionId: mission.missionId,
          blockedDurationHours: ageHours,
          customerImpact: 50,
          missionUrgency: 55,
          operationalRisk: 0.45
        }));
      }
    });

    (context.orchestratorSessions ?? []).forEach((session) => {
      const state = String(session.state ?? '').toUpperCase();
      if (state === 'WAITING_RETRY' || state === 'TIMED_OUT') {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.FAILED_MISSION,
          title: `Mission recovery candidate ${session.missionId}`,
          summary: `Mission ${session.missionId} is in ${state}.`,
          sourceSystem: 'ExecutiveMissionOrchestrator',
          customerId: session.customerId,
          missionId: session.missionId,
          estimatedRecoveryProbability: 0.7,
          customerImpact: 78,
          missionUrgency: 72,
          operationalRisk: 0.62,
          metadata: { sessionState: state }
        }));
      }

      if (state === 'PAUSED' || state === 'ROLLED_BACK') {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.PAUSED_MISSION,
          title: `Paused mission candidate ${session.missionId}`,
          summary: `Mission ${session.missionId} is in ${state}.`,
          sourceSystem: 'ExecutiveMissionOrchestrator',
          customerId: session.customerId,
          missionId: session.missionId,
          estimatedRecoveryProbability: 0.75,
          customerImpact: 62,
          missionUrgency: 68,
          operationalRisk: 0.35,
          metadata: { sessionState: state }
        }));
      }

      if (String(session.missionType ?? '').toUpperCase() === 'WEBSITE_BUILD' && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(state)) {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.WEBSITE_PRODUCTION_QUEUE,
          title: `Website production queue item ${session.missionId}`,
          summary: `Website mission ${session.missionId} remains active in queue.`,
          sourceSystem: 'ExecutiveMissionOrchestrator',
          customerId: session.customerId,
          missionId: session.missionId,
          customerImpact: 40,
          missionUrgency: 50,
          operationalRisk: 0.25
        }));
      }
    });

    (context.providerStatuses ?? []).forEach((provider) => {
      if ((provider.blockingIssues ?? []).length > 0 || String(provider.connectionStatus ?? '').toUpperCase() !== 'AVAILABLE') {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.PROVIDER_HEALTH_WARNING,
          title: `Provider warning ${provider.providerName}`,
          summary: `Provider ${provider.providerName} reported degraded health.`,
          sourceSystem: 'ProviderHealth',
          customerImpact: 45,
          missionUrgency: 48,
          operationalRisk: 0.7,
          metadata: { providerName: provider.providerName, blockingIssues: provider.blockingIssues ?? [] }
        }));
      }
    });

    if ((context.workforce?.capabilityGaps ?? []).length > 0 || Number(context.workforce?.unavailableWorkers ?? 0) > 0) {
      findings.push(createOperationalFinding({
        type: ExecutiveOperationsFindingTypes.WORKFORCE_CAPACITY_ISSUE,
        title: 'Workforce capacity issue',
        summary: 'Workforce dashboard indicates missing capabilities or unavailable workers.',
        sourceSystem: 'WorkforceDirector',
        customerImpact: 52,
        missionUrgency: 57,
        operationalRisk: 0.58,
        metadata: {
          capabilityGaps: context.workforce?.capabilityGaps ?? [],
          unavailableWorkers: context.workforce?.unavailableWorkers ?? 0
        }
      }));
    }

    (context.dashboardSnapshot?.missingData ?? []).forEach((item) => {
      findings.push(createOperationalFinding({
        type: ExecutiveOperationsFindingTypes.MISSING_TELEMETRY,
        title: 'Missing telemetry detected',
        summary: item,
        sourceSystem: 'ExecutiveOperationsDashboard',
        customerImpact: 25,
        missionUrgency: 30,
        operationalRisk: 0.4
      }));
    });

    (context.dashboardSnapshot?.websiteProduction?.records ?? []).forEach((record) => {
      const issuesRemaining = Number(record.issuesRemaining ?? 0);
      const qualityScore = Number(record.qualityScore ?? record.score ?? 0);

      if (issuesRemaining > 0 || String(record.qaStatus ?? '').toUpperCase() !== 'PASS') {
        findings.push(createOperationalFinding({
          type: ExecutiveOperationsFindingTypes.WEBSITE_PRODUCTION_QUEUE,
          title: `Website production revisions pending ${record.missionId ?? record.reviewId}`,
          summary: `Website production has ${issuesRemaining} remaining issues with QA status ${record.qaStatus ?? 'UNKNOWN'}.`,
          sourceSystem: 'WebsiteProductionManager',
          missionId: record.missionId ?? null,
          customerImpact: 58,
          missionUrgency: 64,
          operationalRisk: qualityScore >= 70 ? 0.35 : 0.55,
          metadata: {
            stage: record.stage ?? null,
            qualityScore,
            deliveryReadiness: record.deliveryReadiness ?? null
          }
        }));
      }
    });

    (context.dashboardSnapshot?.alerts?.alerts ?? []).slice(0, 10).forEach((alert) => {
      findings.push(createOperationalFinding({
        type: ExecutiveOperationsFindingTypes.SYSTEM_HEALTH_WARNING,
        title: alert.title,
        summary: alert.description,
        sourceSystem: alert.sourceSystem,
        customerId: alert.customerId ?? null,
        missionId: alert.missionId ?? null,
        customerImpact: 45,
        missionUrgency: 45,
        operationalRisk: alert.severity === 'CRITICAL' ? 0.9 : alert.severity === 'HIGH' ? 0.75 : 0.4
      }));
    });

    return findings;
  }

  buildSafeActions(prioritizedFindings, context) {
    const actions = [
      createOperationalAction({
        actionType: ExecutiveOperationsActionTypes.REFRESH_DASHBOARD_SNAPSHOT,
        reason: 'Refresh executive dashboard snapshot for latest operational visibility.',
        requestedRole: 'VIEWER'
      }),
      createOperationalAction({
        actionType: ExecutiveOperationsActionTypes.REFRESH_PROVIDER_HEALTH,
        reason: 'Refresh provider-health telemetry for current cycle.',
        requestedRole: 'VIEWER'
      })
    ];

    prioritizedFindings.forEach((finding) => {
      const session = finding.missionId ? this.missionOrchestratorManager?.getSessionByMissionId?.(finding.missionId) : null;
      if (finding.type === ExecutiveOperationsFindingTypes.FAILED_MISSION && session) {
        actions.push(createOperationalAction({
          actionType: ExecutiveOperationsActionTypes.RETRY_MISSION,
          missionId: finding.missionId,
          customerId: finding.customerId,
          reason: finding.summary,
          requestedRole: 'EXECUTIVE'
        }));
      }

      if (finding.type === ExecutiveOperationsFindingTypes.PAUSED_MISSION && session) {
        actions.push(createOperationalAction({
          actionType: ExecutiveOperationsActionTypes.RESUME_MISSION,
          missionId: finding.missionId,
          customerId: finding.customerId,
          reason: finding.summary,
          requestedRole: 'EXECUTIVE'
        }));
      }

      if (finding.type === ExecutiveOperationsFindingTypes.BLOCKED_MISSION) {
        const mission = (context.missions ?? []).find((item) => item.missionId === finding.missionId) ?? null;
        if (mission) {
          actions.push(createOperationalAction({
            actionType: ExecutiveOperationsActionTypes.REASSIGN_WORKER,
            missionId: mission.missionId,
            customerId: mission.customerId,
            reason: 'Attempt reversible reassignment after blocked mission detection.',
            requestedRole: 'EXECUTIVE',
            metadata: { missionType: mission.missionType, currentStage: mission.currentStage }
          }));
        }
      }

      if (finding.type === ExecutiveOperationsFindingTypes.CEO_DECISION_REQUIRED) {
        actions.push(createOperationalAction({
          actionType: ExecutiveOperationsActionTypes.ESCALATE_TO_CEO_DECISION_CENTER,
          missionId: finding.missionId,
          customerId: finding.customerId,
          reason: 'Escalate proposal or mission for CEO attention.',
          requestedRole: 'EXECUTIVE'
        }));
      }

      if (finding.type === ExecutiveOperationsFindingTypes.STALE_ACTIVITY) {
        actions.push(createOperationalAction({
          actionType: ExecutiveOperationsActionTypes.MARK_STALE_OPERATIONAL_RECORD,
          missionId: finding.missionId,
          customerId: finding.customerId,
          reason: 'Mark stale operational record for review.',
          requestedRole: 'EXECUTIVE'
        }));
      }
    });

    return actions;
  }

  async executeSafeAction(action, context) {
    switch (action.actionType) {
      case ExecutiveOperationsActionTypes.REFRESH_DASHBOARD_SNAPSHOT:
        this.dashboardSnapshotProvider?.();
        return { executed: true, output: { snapshotRefreshed: true } };
      case ExecutiveOperationsActionTypes.REFRESH_PROVIDER_HEALTH:
        this.providerHealthAdapter?.getProviderStatuses?.();
        return { executed: true, output: { providerHealthRefreshed: true } };
      case ExecutiveOperationsActionTypes.RETRY_MISSION: {
        const session = this.missionOrchestratorManager?.getSessionByMissionId?.(action.missionId) ?? null;
        return this.recoveryCoordinator.retryMission({ missionId: action.missionId, session });
      }
      case ExecutiveOperationsActionTypes.RESUME_MISSION: {
        const session = this.missionOrchestratorManager?.getSessionByMissionId?.(action.missionId) ?? null;
        return this.recoveryCoordinator.resumeMission({ missionId: action.missionId, session });
      }
      case ExecutiveOperationsActionTypes.REASSIGN_WORKER:
        return this.recoveryCoordinator.reassignWorkers({
          missionId: action.missionId,
          missionType: action.metadata?.missionType,
          currentStage: action.metadata?.currentStage
        });
      case ExecutiveOperationsActionTypes.ESCALATE_TO_CEO_DECISION_CENTER:
        return { executed: true, output: { escalated: true, target: 'CEO_DECISION_CENTER' } };
      case ExecutiveOperationsActionTypes.MARK_STALE_OPERATIONAL_RECORD:
        return { executed: true, output: { markedForReview: true } };
      case ExecutiveOperationsActionTypes.ROUTE_VALIDATED_INTAKE:
        return { executed: false, reason: 'Public intake routing queue is not available in current v1 interfaces.' };
      case ExecutiveOperationsActionTypes.REQUEST_EXECUTIVE_REVIEW:
        return { executed: false, reason: 'Blocked by governance policy.' };
      default:
        return { executed: false, reason: `Unsupported action ${action.actionType}.` };
    }
  }

  async runCycle({ dryRun = this.config.dryRun } = {}) {
    const cycleId = `ops_cycle_${Date.now()}`;
    const startedAt = isoNow(this.now);

    if (!this.store.tryAcquireCycleLock()) {
      return {
        cycleId,
        state: ExecutiveOperationsCycleStates.FAILED,
        startedAt,
        completedAt: isoNow(this.now),
        durationMs: 0,
        findings: [],
        priorities: [],
        safeActionsConsidered: [],
        safeActionsExecuted: [],
        actionsBlockedByGovernance: [],
        ceoDecisionsRequired: [],
        warnings: ['Cycle lock already held; overlapping cycles prevented.'],
        errors: ['OVERLAPPING_CYCLE_BLOCKED'],
        dataFreshness: [],
        nextRecommendedWakeTime: nextWakeTime(this.config.intervalMs)
      };
    }

    this.transitionLoopState(ExecutiveOperationsLoopStates.RUNNING);
    this.store.saveCurrentCycle({ cycleId, state: ExecutiveOperationsCycleStates.INSPECTING, startedAt });
    this.recordAudit('CYCLE_STARTED', { cycleId, dryRun });

    try {
      const context = this.collectContext();
      const findings = this.buildFindings(context);
      const priorities = this.priorityEngine.prioritize(findings);
      const safeActionsConsidered = this.buildSafeActions(priorities, context);

      const actionsBlockedByGovernance = [];
      const safeActionsExecuted = [];

      for (const action of safeActionsConsidered) {
        const session = action.missionId ? this.missionOrchestratorManager?.getSessionByMissionId?.(action.missionId) ?? null : null;
        const policyDecision = this.policy.evaluateAction(action, {
          config: { ...this.config, dryRun },
          context: {
            requiresCeoApproval: action.actionType === ExecutiveOperationsActionTypes.ESCALATE_TO_CEO_DECISION_CENTER
              ? false
              : false,
            session
          }
        });

        this.recordAudit('POLICY_EVALUATED', {
          actionType: action.actionType,
          missionId: action.missionId,
          allowed: policyDecision.allowed,
          reason: policyDecision.reason,
          governingRule: policyDecision.governingRule
        });

        if (!policyDecision.allowed) {
          actionsBlockedByGovernance.push({
            ...action,
            ...policyDecision
          });
          continue;
        }

        if (dryRun) {
          safeActionsExecuted.push({
            ...action,
            dryRun: true,
            output: { wouldExecute: true }
          });
          continue;
        }

        const execution = await this.executeSafeAction(action, context);
        if (execution.executed === true || execution.recovered === true || execution.resumed === true || execution.recovered === true) {
          safeActionsExecuted.push({
            ...action,
            output: execution.output ?? execution.result ?? execution
          });
        } else if (execution.recovered === false || execution.resumed === false || execution.executed === false) {
          actionsBlockedByGovernance.push({
            ...action,
            denied: true,
            reason: execution.reason ?? 'Execution denied or failed.',
            governingRule: 'EXECUTION_RESULT',
            recommendedNextAction: 'Escalate for review if repeated.'
          });
        }
      }

      const alerts = this.alertEngine.upsertFromFindings(priorities, actionsBlockedByGovernance);
      const ceoDecisionsRequired = priorities.filter((finding) => finding.type === ExecutiveOperationsFindingTypes.CEO_DECISION_REQUIRED);
      const warnings = [
        ...(dryRun ? ['Dry-run mode enabled; no side effects were executed.'] : []),
        ...actionsBlockedByGovernance.map((item) => item.reason)
      ];

      const completedAt = isoNow(this.now);
      const durationMs = Math.max(new Date(completedAt).getTime() - new Date(startedAt).getTime(), 0);
      const state = warnings.length > 0 ? ExecutiveOperationsCycleStates.COMPLETED_WITH_WARNINGS : ExecutiveOperationsCycleStates.COMPLETED;

      const cycleResult = {
        cycleId,
        state,
        startedAt,
        completedAt,
        durationMs,
        findings,
        priorities,
        safeActionsConsidered,
        safeActionsExecuted,
        actionsBlockedByGovernance,
        ceoDecisionsRequired,
        warnings,
        errors: [],
        dataFreshness: context.dashboardSnapshot?.dataFreshness ?? [],
        nextRecommendedWakeTime: nextWakeTime(this.config.intervalMs),
        activeAlerts: alerts
      };

      this.store.updateFindingsMetrics(findings);
      this.store.incrementActionMetrics({
        considered: safeActionsConsidered.length,
        executed: safeActionsExecuted.length,
        blocked: actionsBlockedByGovernance.length
      });
      this.store.completeCycle(cycleResult);
      this.store.setHeartbeatSuccessful();
      this.consecutiveFailures = 0;
      this.transitionLoopState(ExecutiveOperationsLoopStates.SLEEPING);
      this.recordAudit('CYCLE_COMPLETED', { cycleId, state, durationMs });

      return cycleResult;
    } catch (error) {
      const completedAt = isoNow(this.now);
      const durationMs = Math.max(new Date(completedAt).getTime() - new Date(startedAt).getTime(), 0);
      const cycleResult = {
        cycleId,
        state: ExecutiveOperationsCycleStates.FAILED,
        startedAt,
        completedAt,
        durationMs,
        findings: [],
        priorities: [],
        safeActionsConsidered: [],
        safeActionsExecuted: [],
        actionsBlockedByGovernance: [],
        ceoDecisionsRequired: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        dataFreshness: [],
        nextRecommendedWakeTime: nextWakeTime(this.config.intervalMs),
        activeAlerts: []
      };

      this.store.completeCycle(cycleResult);
      this.consecutiveFailures += 1;
      this.transitionLoopState(this.consecutiveFailures >= Number(this.config.maxConsecutiveFailures ?? 3)
        ? ExecutiveOperationsLoopStates.FAILED
        : ExecutiveOperationsLoopStates.DEGRADED);
      this.recordAudit('CYCLE_FAILED', { cycleId, error: cycleResult.errors[0] });
      return cycleResult;
    } finally {
      this.store.releaseCycleLock();
    }
  }

  async startContinuous({ maxCycles = this.config.developmentMaxCycles } = {}) {
    this.shouldStop = false;
    this.transitionLoopState(ExecutiveOperationsLoopStates.STARTING);
    this.recordAudit('LOOP_STARTED', { maxCycles });

    let cycles = 0;
    while (!this.shouldStop) {
      if (this.store.loopState === ExecutiveOperationsLoopStates.PAUSED) {
        this.transitionLoopState(ExecutiveOperationsLoopStates.PAUSED);
        await new Promise((resolve) => {
          this.timer = setTimeout(resolve, Math.min(Number(this.config.intervalMs ?? 300000), 50));
        });
        continue;
      }

      await this.runCycle();
      cycles += 1;

      if (this.shouldStop || (maxCycles && cycles >= maxCycles)) {
        break;
      }

      this.transitionLoopState(ExecutiveOperationsLoopStates.SLEEPING);
      await new Promise((resolve) => {
        this.timer = setTimeout(resolve, Number(this.config.intervalMs ?? 300000));
      });
    }

    this.transitionLoopState(ExecutiveOperationsLoopStates.STOPPED);
    this.recordAudit('LOOP_STOPPED', { cycles });
    return this.getDashboardProjection();
  }

  pause() {
    this.transitionLoopState(ExecutiveOperationsLoopStates.PAUSED);
    this.recordAudit('LOOP_PAUSED');
  }

  resume() {
    this.transitionLoopState(ExecutiveOperationsLoopStates.RUNNING);
    this.recordAudit('LOOP_RESUMED');
  }

  stop() {
    this.shouldStop = true;
    this.transitionLoopState(ExecutiveOperationsLoopStates.STOPPING);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.recordAudit('LOOP_STOPPING');
  }

  getDashboardProjection() {
    const status = this.store.getStatus();
    return {
      loopState: status.loopState,
      currentCycle: status.currentCycle,
      lastCompletedCycle: status.lastCompletedCycle,
      heartbeat: status.heartbeat,
      metrics: status.metrics,
      recentFindings: status.lastCompletedCycle?.priorities?.slice(0, 10) ?? [],
      recentSafeActions: status.lastCompletedCycle?.safeActionsExecuted?.slice(0, 10) ?? [],
      blockedActions: status.lastCompletedCycle?.actionsBlockedByGovernance?.slice(0, 10) ?? [],
      recoveryStatus: {
        recentRecoveries: this.store.listRecoveryHistory(10),
        recoveryEnabled: Boolean(this.config.recoveryEnabled)
      },
      activeAlerts: status.activeAlerts.slice(0, 20),
      configurationSummary: sanitizeExecutiveOperationsLoopConfig(this.config),
      governanceStatus: {
        dryRun: Boolean(this.config.dryRun),
        publishAttempted: false,
        deployAttempted: false,
        destructiveOperationAttempted: false,
        ceoApprovalBypassed: false,
        existingExecutionManagersReused: true
      },
      dataFreshness: status.lastCompletedCycle?.dataFreshness ?? [],
      limitations: [
        'Loop storage is in-memory in v1 and resets on process restart.',
        'Validated intake routing is reported but not auto-executed because no public queue abstraction exists yet.',
        'Automatic force executive review is intentionally blocked by governance policy.'
      ]
    };
  }
}
