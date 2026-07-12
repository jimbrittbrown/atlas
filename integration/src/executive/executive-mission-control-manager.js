import {
  createMissionControlCommandRequest,
  MissionControlCommandTypes,
  validateMissionControlCommandRequest
} from './executive-mission-control-contracts.js';
import { ExecutiveMissionControlAuditLog } from './executive-mission-control-audit-log.js';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function normalizeState(state) {
  return String(state ?? '').trim().toUpperCase();
}

export class ExecutiveMissionControlManager {
  constructor({ orchestratorManager, auditLog, now, storageProvider, namespace = 'executive.mission-control-manager' } = {}) {
    this.orchestratorManager = orchestratorManager;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.auditLog = auditLog ?? new ExecutiveMissionControlAuditLog({ storageProvider: this.storageProvider });
    this.now = now;
    this.idempotency = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.idempotency` });
  }

  persistIdempotency(key, value) {
    this.idempotency.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.idempotency`, key, value });
  }

  getSessionByMissionId(missionId) {
    return this.orchestratorManager?.getSessionByMissionId?.(missionId) ?? null;
  }

  getBlockedCommands(session) {
    if (!session) return [];

    const state = normalizeState(session.state);
    const blocked = [];

    const can = {
      retry: ['WAITING_RETRY', 'REVISION_REQUIRED', 'ROLLED_BACK', 'TIMED_OUT', 'PAUSED'].includes(state),
      resume: ['PAUSED', 'ROLLED_BACK', 'REVISION_REQUIRED', 'WAITING_RETRY', 'TIMED_OUT'].includes(state),
      rollback: !['CANCELLED', 'FAILED'].includes(state),
      cancel: !['CANCELLED', 'COMPLETED', 'FAILED'].includes(state),
      pause: ['RUNNING', 'WAITING_RETRY', 'REVISION_REQUIRED', 'ROLLED_BACK'].includes(state),
      forceReview: ['RUNNING', 'WAITING_RETRY', 'PAUSED', 'ROLLED_BACK'].includes(state)
    };

    if (!can.retry) blocked.push({ command: 'retry', reason: `Unsupported from state ${state}.` });
    if (!can.resume) blocked.push({ command: 'resume', reason: `Unsupported from state ${state}.` });
    if (!can.rollback) blocked.push({ command: 'rollback', reason: `Unsupported from state ${state}.` });
    if (!can.cancel) blocked.push({ command: 'cancel', reason: `Unsupported from state ${state}.` });
    if (!can.pause) blocked.push({ command: 'pause', reason: `Unsupported from state ${state}.` });
    if (!can.forceReview) blocked.push({ command: 'force-executive-review', reason: `Unsupported from state ${state}.` });

    return blocked;
  }

  buildMissionControlProjection({ missionId = null } = {}) {
    const sessions = missionId
      ? [this.getSessionByMissionId(missionId)].filter(Boolean)
      : (this.orchestratorManager?.listSessions?.() ?? []);

    return {
      generatedAt: nowIso(this.now),
      totalMissions: sessions.length,
      records: sessions.map((session) => {
        const blockedCommands = this.getBlockedCommands(session);
        const availableCommands = ['retry', 'resume', 'rollback', 'cancel', 'pause', 'force-executive-review']
          .filter((command) => !blockedCommands.some((item) => item.command === command));

        return {
          missionId: session.missionId,
          orchestrationId: session.orchestrationId,
          state: session.state,
          currentStage: session.currentStage,
          completionPercentage: session.completionPercentage,
          availableCommands,
          blockedCommands,
          recentCommandHistory: this.auditLog.list({ missionId: session.missionId, limit: 10 }),
          recoveryStatus: {
            retryCount: session.retryCount,
            recoveryLog: (session.recoveryLog ?? []).slice(-10)
          },
          warnings: (session.blockers ?? []).map((item) => `BLOCKER: ${item}`),
          governance: {
            readOnlyControlSurface: session.governance?.readOnlyControlSurface === true,
            publishBypass: session.governance?.publishBypass === true,
            providerHardcoding: session.governance?.providerHardcoding === true,
            ceoApprovalGateBypassed: session.governance?.ceoApprovalGateBypassed === true
          }
        };
      })
    };
  }

  executeCommand(input = {}) {
    const request = createMissionControlCommandRequest(input);
    const validation = validateMissionControlCommandRequest(request);

    if (!validation.isValid) {
      this.auditLog.record({
        command: request.commandType,
        missionId: request.missionId,
        requestedBy: request.requestedBy,
        role: request.requesterRole,
        result: 'REJECTED',
        previousState: null,
        resultingState: null,
        rejectionReason: validation.issues.join(' | '),
        timestamp: request.timestamp,
        correlationId: request.correlationId
      });

      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: validation.issues.join(' | '),
        request,
        session: null
      };
    }

    const idempotencyKey = `${request.missionId}:${request.commandType}:${request.idempotencyKey}`;
    if (this.idempotency.has(idempotencyKey)) {
      const duplicate = this.idempotency.get(idempotencyKey);
      this.auditLog.record({
        command: request.commandType,
        missionId: request.missionId,
        requestedBy: request.requestedBy,
        role: request.requesterRole,
        result: 'REJECTED',
        previousState: duplicate.previousState,
        resultingState: duplicate.resultingState,
        rejectionReason: 'Duplicate idempotency key.',
        timestamp: request.timestamp,
        correlationId: request.correlationId
      });

      return {
        accepted: false,
        status: 409,
        code: 'DUPLICATE_COMMAND',
        reason: 'Duplicate idempotency key.',
        request,
        session: duplicate.session ?? null,
        duplicate: true
      };
    }

    const session = this.getSessionByMissionId(request.missionId);
    if (!session) {
      this.auditLog.record({
        command: request.commandType,
        missionId: request.missionId,
        requestedBy: request.requestedBy,
        role: request.requesterRole,
        result: 'REJECTED',
        previousState: null,
        resultingState: null,
        rejectionReason: 'Mission session not found.',
        timestamp: request.timestamp,
        correlationId: request.correlationId
      });

      return {
        accepted: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Mission session not found.',
        request,
        session: null
      };
    }

    const previousState = session.state;

    if (normalizeState(request.expectedCurrentState) !== normalizeState(previousState)) {
      this.auditLog.record({
        command: request.commandType,
        missionId: request.missionId,
        requestedBy: request.requestedBy,
        role: request.requesterRole,
        result: 'REJECTED',
        previousState,
        resultingState: session.state,
        rejectionReason: `Stale expected state. Expected ${request.expectedCurrentState}, actual ${previousState}.`,
        timestamp: request.timestamp,
        correlationId: request.correlationId
      });

      return {
        accepted: false,
        status: 409,
        code: 'STALE_EXPECTED_STATE',
        reason: `Stale expected state. Expected ${request.expectedCurrentState}, actual ${previousState}.`,
        request,
        session
      };
    }

    const execute = async () => {
      switch (request.commandType) {
        case MissionControlCommandTypes.RETRY:
          return this.orchestratorManager.retry({ orchestrationId: session.orchestrationId });
        case MissionControlCommandTypes.RESUME:
          return this.orchestratorManager.resume({ orchestrationId: session.orchestrationId });
        case MissionControlCommandTypes.ROLLBACK:
          return this.orchestratorManager.rollback({
            orchestrationId: session.orchestrationId,
            stageId: request.rollbackTargetStage
          });
        case MissionControlCommandTypes.CANCEL:
          return this.orchestratorManager.cancel({
            orchestrationId: session.orchestrationId,
            reason: request.reason
          });
        case MissionControlCommandTypes.PAUSE:
          return this.orchestratorManager.pause({
            orchestrationId: session.orchestrationId,
            reason: request.reason
          });
        case MissionControlCommandTypes.FORCE_EXECUTIVE_REVIEW:
          return this.orchestratorManager.forceExecutiveReview({
            orchestrationId: session.orchestrationId,
            reason: request.reason
          });
        default:
          throw new Error(`Unsupported command type ${request.commandType}`);
      }
    };

    return Promise.resolve()
      .then(execute)
      .then((result) => {
        const succeeded = Object.values(result ?? {}).some((value) => value === true);
        const response = {
          accepted: succeeded,
          status: succeeded ? 200 : 409,
          code: succeeded ? 'OK' : 'INVALID_TRANSITION',
          reason: succeeded ? null : (result?.reason ?? 'Command rejected by lifecycle constraints.'),
          request,
          session,
          result
        };

        this.persistIdempotency(idempotencyKey, {
          previousState,
          resultingState: session.state,
          session
        });

        this.auditLog.record({
          command: request.commandType,
          missionId: request.missionId,
          requestedBy: request.requestedBy,
          role: request.requesterRole,
          result: succeeded ? 'ACCEPTED' : 'REJECTED',
          previousState,
          resultingState: session.state,
          rejectionReason: succeeded ? null : response.reason,
          timestamp: nowIso(this.now),
          correlationId: request.correlationId
        });

        return response;
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.auditLog.record({
          command: request.commandType,
          missionId: request.missionId,
          requestedBy: request.requestedBy,
          role: request.requesterRole,
          result: 'REJECTED',
          previousState,
          resultingState: session.state,
          rejectionReason: reason,
          timestamp: nowIso(this.now),
          correlationId: request.correlationId
        });

        return {
          accepted: false,
          status: 409,
          code: 'INVALID_TRANSITION',
          reason,
          request,
          session,
          result: null
        };
      });
  }
}
