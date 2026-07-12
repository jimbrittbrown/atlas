import {
  createExecutiveMissionOrchestratorStateMachine,
  createOrchestrationSession,
  ExecutiveMissionOrchestratorStates,
  RecoveryActions
} from './executive-mission-orchestrator-contracts.js';
import { ExecutiveMissionOrchestratorPipelineRegistry } from './executive-mission-orchestrator-pipeline-registry.js';
import { ExecutiveMissionOrchestratorDashboardModel } from './executive-mission-orchestrator-dashboard-model.js';
import { loadRecordMap, upsertRecord } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function mapWebsiteBuilderProjection(result) {
  return {
    currentStage: result?.progress?.currentStage ?? null,
    assignedWorkers: result?.workforce?.assignments?.stageAssignments?.[result?.mission?.currentStageId] ?? [],
    completionPercentage: Number(result?.progress?.completionPercentage ?? 0),
    eta: result?.progress?.estimatedCompletion ?? null,
    blockers: result?.progress?.blockingIssues ?? [],
    confidence: Number((result?.mission?.artifacts?.sandboxBuildResult?.confidence ?? result?.mission?.artifacts?.productionCustomization?.confidence ?? 0.7))
  };
}

export class ExecutiveMissionOrchestratorManager {
  constructor({
    missionControl,
    executivePlanningSystem,
    workforceDirector,
    websiteBuilderMissionManager,
    pipelineRegistry,
    dashboardModel,
    stateMachine,
    logger,
    now,
    storageProvider,
    namespace = 'executive.mission-orchestrator.sessions'
  } = {}) {
    this.logger = logger ?? { log: () => {} };
    this.now = now;

    this.missionControl = missionControl ?? null;
    this.executivePlanningSystem = executivePlanningSystem ?? null;
    this.workforceDirector = workforceDirector ?? missionControl?.workforceDirector ?? null;
    this.websiteBuilderMissionManager = websiteBuilderMissionManager ?? missionControl?.websiteBuilderMissionManager ?? null;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;

    this.stateMachine = stateMachine ?? createExecutiveMissionOrchestratorStateMachine();
    this.dashboardModel = dashboardModel ?? new ExecutiveMissionOrchestratorDashboardModel();

    this.pipelineRegistry = pipelineRegistry ?? new ExecutiveMissionOrchestratorPipelineRegistry();
    this.sessions = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });

    this.registerDefaultPipelines();
  }

  persistSession(session) {
    if (!session?.orchestrationId) return;
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: session.orchestrationId, value: session });
  }

  registerDefaultPipelines() {
    if (!this.websiteBuilderMissionManager) return;

    if (this.pipelineRegistry.getHandler('WEBSITE_BUILDER')) return;

    this.pipelineRegistry.register({
      key: 'WEBSITE_BUILDER',
      supportsMissionType: (missionType) => String(missionType).toUpperCase() === 'WEBSITE_BUILD',
      execute: async ({ session, mission, customer }) => {
        if (!session.pipelineMission) {
          session.pipelineMission = this.websiteBuilderMissionManager.createMission({
            missionId: mission.missionId,
            prospectUrl: customer?.website ?? `https://${String(customer?.companyName ?? 'unknown').toLowerCase().replace(/\s+/g, '')}.example`,
            prospect: {
              approved: true,
              approvedBy: 'EXECUTIVE_MISSION_ORCHESTRATOR_V1',
              companyName: customer?.companyName ?? mission.customerId,
              segment: customer?.industry ?? 'UNKNOWN'
            },
            existingBranding: {},
            adapterType: customer?.adapterType ?? 'FRAMER',
            providerHint: customer?.providerHint ?? 'FRAMER_SANDBOX',
            stopAfterSandboxUpdate: true
          });
        }

        return this.websiteBuilderMissionManager.runMission({}, { mission: session.pipelineMission });
      },
      retry: async ({ session }) => {
        if (!session.pipelineMission) throw new Error('No pipeline mission to retry.');
        return this.websiteBuilderMissionManager.runMission({}, {
          mission: session.pipelineMission,
          retryStageId: session.pipelineMission.currentStageId
        });
      },
      resume: async ({ session }) => {
        if (!session.pipelineMission) throw new Error('No pipeline mission to resume.');
        return this.websiteBuilderMissionManager.resumeMission({ mission: session.pipelineMission });
      },
      rollback: async ({ session, stageId }) => {
        if (!session.pipelineMission) throw new Error('No pipeline mission to rollback.');
        this.websiteBuilderMissionManager.rollbackMission({ mission: session.pipelineMission, stageId, reason: 'Executive orchestrator rollback.' });
        return this.websiteBuilderMissionManager.runMission({}, {
          mission: session.pipelineMission,
          resumeFromStageId: stageId
        });
      },
      cancel: async ({ session }) => {
        if (!session.pipelineMission) return null;
        session.pipelineMission.state = 'FAILED';
        return null;
      },
      toProjection: ({ result }) => mapWebsiteBuilderProjection(result)
    });
  }

  transitionSession(session, toState) {
    const validation = this.stateMachine.validateTransition({ fromState: session.state, toState });
    if (!validation.isValid) {
      throw new Error(validation.reason);
    }

    session.state = toState;
    session.updatedAt = isoNow(this.now);
    session.lifecycle.push({ state: toState, timestamp: session.updatedAt });
    this.persistSession(session);
  }

  resolveProposal(proposalId) {
    const record = this.executivePlanningSystem?.portfolioManager?.portfolioRegistry?.getProposal?.(proposalId);
    return record?.proposal ?? null;
  }

  async resolveMissionForProposal(proposalId) {
    const proposal = this.resolveProposal(proposalId);
    if (!proposal) {
      return { resolved: false, reason: `Proposal not found: ${proposalId}`, proposal: null, mission: null };
    }

    const status = String(proposal.status ?? '').toUpperCase();
    if (status !== 'APPROVED' && status !== 'CONVERTED_TO_MISSION') {
      return {
        resolved: false,
        reason: `Proposal ${proposalId} is not approved for orchestration.`
      };
    }

    if (!proposal.linkedMissionId) {
      const converted = await this.executivePlanningSystem.convertApprovedProposal(proposalId);
      if (!converted.converted || !converted.missionId) {
        return {
          resolved: false,
          reason: converted.reason ?? 'Approved proposal could not be converted into mission.'
        };
      }
    }

    const refreshedProposal = this.resolveProposal(proposalId);
    const mission = this.missionControl?.missionRegistry?.getMissionById?.(refreshedProposal?.linkedMissionId);

    if (!mission) {
      return {
        resolved: false,
        reason: `Mission not found for proposal ${proposalId}.`
      };
    }

    return {
      resolved: true,
      proposal: refreshedProposal,
      mission
    };
  }

  createSessionFromApprovedProposal({ proposalId, timeoutMs = 300000 } = {}) {
    const proposal = this.resolveProposal(proposalId);
    if (!proposal) {
      return { created: false, reason: `Proposal not found: ${proposalId}`, session: null };
    }

    const resolvedPipeline = this.pipelineRegistry.resolveByMissionType(proposal.missionType);
    if (!resolvedPipeline) {
      return { created: false, reason: `No pipeline registered for mission type ${proposal.missionType}.`, session: null };
    }

    const session = createOrchestrationSession({
      missionId: proposal.linkedMissionId ?? null,
      proposalId: proposal.proposalId,
      missionType: proposal.missionType,
      customerId: proposal.customerId,
      timeoutMs,
      pipelineKey: resolvedPipeline.key,
      createdAt: isoNow(this.now)
    });

    this.sessions.set(session.orchestrationId, session);
    this.persistSession(session);

    return {
      created: true,
      reason: null,
      session
    };
  }

  getSession(orchestrationId) {
    return this.sessions.get(orchestrationId) ?? null;
  }

  getSessionByMissionId(missionId) {
    if (!missionId) return null;
    const normalized = String(missionId);
    return this.listSessions().find((session) => String(session.missionId ?? '') === normalized) ?? null;
  }

  listSessions() {
    return Array.from(this.sessions.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async orchestrate({ proposalId, orchestrationId = null, timeoutMs = 300000 } = {}) {
    let session = orchestrationId ? this.getSession(orchestrationId) : null;

    if (!session) {
      const created = this.createSessionFromApprovedProposal({ proposalId, timeoutMs });
      if (!created.created) {
        return { orchestrated: false, reason: created.reason, session: null, result: null };
      }
      session = created.session;
    }

    if (this.stateMachine.terminalStates.has(session.state)) {
      return {
        orchestrated: session.state === ExecutiveMissionOrchestratorStates.COMPLETED,
        reason: session.state === ExecutiveMissionOrchestratorStates.COMPLETED ? null : `Session is terminal: ${session.state}.`,
        session,
        result: session.pipelineResult
      };
    }

    if (session.cancelRequested) {
      if (session.state !== ExecutiveMissionOrchestratorStates.CANCELLED) {
        this.transitionSession(session, ExecutiveMissionOrchestratorStates.CANCELLED);
      }
      return { orchestrated: false, reason: 'Session cancellation requested.', session, result: null };
    }

    this.transitionSession(session, ExecutiveMissionOrchestratorStates.VALIDATING);

    const resolved = await this.resolveMissionForProposal(session.proposalId);
    if (!resolved.resolved) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.FAILED);
      session.failures.push({ reason: resolved.reason, timestamp: isoNow(this.now) });
      return { orchestrated: false, reason: resolved.reason, session, result: null };
    }

    session.missionId = resolved.mission.missionId;

    this.transitionSession(session, ExecutiveMissionOrchestratorStates.ROUTING);

    const handler = this.pipelineRegistry.getHandler(session.pipelineKey)
      ?? this.pipelineRegistry.resolveByMissionType(session.missionType);

    if (!handler) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.FAILED);
      const reason = `Pipeline handler not found for ${session.pipelineKey}.`;
      session.failures.push({ reason, timestamp: isoNow(this.now) });
      return { orchestrated: false, reason, session, result: null };
    }

    this.transitionSession(session, ExecutiveMissionOrchestratorStates.RUNNING);
    session.startedAt = session.startedAt ?? isoNow(this.now);

    const startedMs = Date.now();

    try {
      const result = await handler.execute({
        session,
        mission: resolved.mission,
        proposal: resolved.proposal,
        customer: this.missionControl?.customerRegistry?.getCustomerById?.(resolved.mission.customerId) ?? null
      });

      session.pipelineResult = result;

      const projection = typeof handler.toProjection === 'function'
        ? handler.toProjection({ result, session })
        : {};

      session.currentStage = projection.currentStage ?? session.currentStage;
      session.assignedWorkers = projection.assignedWorkers ?? session.assignedWorkers;
      session.completionPercentage = projection.completionPercentage ?? session.completionPercentage;
      session.eta = projection.eta ?? session.eta;
      session.blockers = projection.blockers ?? session.blockers;
      session.confidence = projection.confidence ?? session.confidence;

      const duration = Date.now() - startedMs;
      if (duration > Number(session.timeoutMs ?? timeoutMs)) {
        this.transitionSession(session, ExecutiveMissionOrchestratorStates.TIMED_OUT);
        session.recoveryLog.push({ action: RecoveryActions.TIMEOUT, timestamp: isoNow(this.now), durationMs: duration });
        return { orchestrated: false, reason: 'Orchestration timed out.', session, result };
      }

      if ((session.blockers ?? []).length > 0 || String(result?.mission?.state ?? '').toUpperCase() === 'REVISION_REQUIRED') {
        this.transitionSession(session, ExecutiveMissionOrchestratorStates.REVISION_REQUIRED);
      } else {
        this.transitionSession(session, ExecutiveMissionOrchestratorStates.COMPLETED);
      }

      session.endedAt = isoNow(this.now);
      this.persistSession(session);

      return {
        orchestrated: true,
        reason: null,
        session,
        result
      };
    } catch (error) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.WAITING_RETRY);
      session.failures.push({
        reason: error instanceof Error ? error.message : String(error),
        timestamp: isoNow(this.now)
      });
      this.persistSession(session);
      return {
        orchestrated: false,
        reason: error instanceof Error ? error.message : String(error),
        session,
        result: null
      };
    }
  }

  async retry({ orchestrationId } = {}) {
    const session = this.getSession(orchestrationId);
    if (!session) return { recovered: false, reason: 'Session not found.', session: null };

    const handler = this.pipelineRegistry.getHandler(session.pipelineKey);
    if (!handler?.retry) return { recovered: false, reason: 'Pipeline does not support retry.', session };

    if (session.state !== ExecutiveMissionOrchestratorStates.RUNNING) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.RUNNING);
    }
    session.retryCount += 1;

    const result = await handler.retry({ session });
    session.pipelineResult = result;
    const projection = handler.toProjection?.({ result, session }) ?? {};
    session.currentStage = projection.currentStage ?? session.currentStage;
    session.assignedWorkers = projection.assignedWorkers ?? session.assignedWorkers;
    session.completionPercentage = projection.completionPercentage ?? session.completionPercentage;
    session.eta = projection.eta ?? session.eta;
    session.blockers = projection.blockers ?? session.blockers;
    session.confidence = projection.confidence ?? session.confidence;

    this.transitionSession(session, (session.blockers ?? []).length > 0
      ? ExecutiveMissionOrchestratorStates.REVISION_REQUIRED
      : ExecutiveMissionOrchestratorStates.COMPLETED);

    session.recoveryLog.push({ action: RecoveryActions.RETRY, timestamp: isoNow(this.now) });
    this.persistSession(session);

    return { recovered: true, reason: null, session, result };
  }

  async resume({ orchestrationId } = {}) {
    const session = this.getSession(orchestrationId);
    if (!session) return { resumed: false, reason: 'Session not found.', session: null };

    const handler = this.pipelineRegistry.getHandler(session.pipelineKey);
    if (!handler?.resume) return { resumed: false, reason: 'Pipeline does not support resume.', session };

    if (session.state !== ExecutiveMissionOrchestratorStates.RUNNING) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.RUNNING);
    }
    const result = await handler.resume({ session });
    session.pipelineResult = result;

    const projection = handler.toProjection?.({ result, session }) ?? {};
    session.currentStage = projection.currentStage ?? session.currentStage;
    session.assignedWorkers = projection.assignedWorkers ?? session.assignedWorkers;
    session.completionPercentage = projection.completionPercentage ?? session.completionPercentage;
    session.eta = projection.eta ?? session.eta;
    session.blockers = projection.blockers ?? session.blockers;
    session.confidence = projection.confidence ?? session.confidence;

    this.transitionSession(session, (session.blockers ?? []).length > 0
      ? ExecutiveMissionOrchestratorStates.REVISION_REQUIRED
      : ExecutiveMissionOrchestratorStates.COMPLETED);

    session.recoveryLog.push({ action: RecoveryActions.RESUME, timestamp: isoNow(this.now) });
    this.persistSession(session);

    return { resumed: true, reason: null, session, result };
  }

  async rollback({ orchestrationId, stageId } = {}) {
    const session = this.getSession(orchestrationId);
    if (!session) return { rolledBack: false, reason: 'Session not found.', session: null };

    const handler = this.pipelineRegistry.getHandler(session.pipelineKey);
    if (!handler?.rollback) return { rolledBack: false, reason: 'Pipeline does not support rollback.', session };

    if (this.stateMachine.terminalStates.has(session.state)) {
      if (session.state !== ExecutiveMissionOrchestratorStates.COMPLETED) {
        return {
          rolledBack: false,
          reason: `Cannot rollback terminal session in state ${session.state}.`,
          session
        };
      }

      // Allow explicit operator-driven rollback from a completed session.
      session.state = ExecutiveMissionOrchestratorStates.ROLLED_BACK;
      session.updatedAt = isoNow(this.now);
      session.lifecycle.push({
        state: ExecutiveMissionOrchestratorStates.ROLLED_BACK,
        timestamp: session.updatedAt
      });
    } else if (session.state !== ExecutiveMissionOrchestratorStates.ROLLED_BACK) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.ROLLED_BACK);
    }
    const result = await handler.rollback({ session, stageId });
    session.pipelineResult = result;

    const projection = handler.toProjection?.({ result, session }) ?? {};
    session.currentStage = projection.currentStage ?? stageId ?? session.currentStage;
    session.assignedWorkers = projection.assignedWorkers ?? session.assignedWorkers;
    session.completionPercentage = projection.completionPercentage ?? session.completionPercentage;
    session.eta = projection.eta ?? session.eta;
    session.blockers = projection.blockers ?? session.blockers;
    session.confidence = projection.confidence ?? session.confidence;

    session.recoveryLog.push({ action: RecoveryActions.ROLLBACK, stageId, timestamp: isoNow(this.now) });
    this.persistSession(session);

    return { rolledBack: true, reason: null, session, result };
  }

  async cancel({ orchestrationId, reason = 'Cancelled by executive request.' } = {}) {
    const session = this.getSession(orchestrationId);
    if (!session) return { cancelled: false, reason: 'Session not found.', session: null };

    session.cancelRequested = true;
    const handler = this.pipelineRegistry.getHandler(session.pipelineKey);
    if (handler?.cancel) {
      await handler.cancel({ session, reason });
    }

    if (!this.stateMachine.terminalStates.has(session.state)) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.CANCELLED);
    }

    session.recoveryLog.push({ action: RecoveryActions.CANCEL, reason, timestamp: isoNow(this.now) });
    this.persistSession(session);

    return { cancelled: true, reason: null, session };
  }

  pause({ orchestrationId, reason = 'Paused by executive request.' } = {}) {
    const session = this.getSession(orchestrationId);
    if (!session) return { paused: false, reason: 'Session not found.', session: null };

    const allowed = new Set([
      ExecutiveMissionOrchestratorStates.RUNNING,
      ExecutiveMissionOrchestratorStates.WAITING_RETRY,
      ExecutiveMissionOrchestratorStates.REVISION_REQUIRED,
      ExecutiveMissionOrchestratorStates.ROLLED_BACK
    ]);

    if (!allowed.has(session.state)) {
      return {
        paused: false,
        reason: `Session state ${session.state} does not support pause.`,
        session
      };
    }

    session.state = ExecutiveMissionOrchestratorStates.PAUSED;
    session.updatedAt = isoNow(this.now);
    session.lifecycle.push({ state: ExecutiveMissionOrchestratorStates.PAUSED, timestamp: session.updatedAt });
    session.recoveryLog.push({ action: 'PAUSE', reason, timestamp: session.updatedAt });
    this.persistSession(session);

    return { paused: true, reason: null, session };
  }

  forceExecutiveReview({ orchestrationId, reason = 'Executive review forced.' } = {}) {
    const session = this.getSession(orchestrationId);
    if (!session) return { forced: false, reason: 'Session not found.', session: null };

    const allowed = new Set([
      ExecutiveMissionOrchestratorStates.RUNNING,
      ExecutiveMissionOrchestratorStates.WAITING_RETRY,
      ExecutiveMissionOrchestratorStates.PAUSED,
      ExecutiveMissionOrchestratorStates.ROLLED_BACK
    ]);

    if (!allowed.has(session.state)) {
      return {
        forced: false,
        reason: `Session state ${session.state} does not support forced executive review.`,
        session
      };
    }

    if (session.state !== ExecutiveMissionOrchestratorStates.REVISION_REQUIRED) {
      this.transitionSession(session, ExecutiveMissionOrchestratorStates.REVISION_REQUIRED);
    }

    const reviewReason = String(reason ?? '').trim() || 'Executive review forced.';
    const existing = new Set(Array.isArray(session.blockers) ? session.blockers : []);
    existing.add(`Executive review required: ${reviewReason}`);
    session.blockers = Array.from(existing);
    session.recoveryLog.push({ action: 'FORCE_EXECUTIVE_REVIEW', reason: reviewReason, timestamp: isoNow(this.now) });
    this.persistSession(session);

    return { forced: true, reason: null, session };
  }

  buildDashboardProjection() {
    return this.dashboardModel.project({
      sessions: this.listSessions(),
      workforceDirector: this.workforceDirector
    });
  }
}
