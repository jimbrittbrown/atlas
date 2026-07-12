import { ExecutiveOperationsActionTypes } from './executive-operations-loop-contracts.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class ExecutiveOperationsRecoveryCoordinator {
  constructor({ missionControlManager, workforceDirector, store, config = {}, now } = {}) {
    this.missionControlManager = missionControlManager;
    this.workforceDirector = workforceDirector;
    this.store = store;
    this.config = config;
    this.now = now;
  }

  buildRecoveryKey({ missionId, actionType }) {
    return `${missionId}:${actionType}`;
  }

  evaluateEligibility({ missionId, actionType, session }) {
    if (!this.config.recoveryEnabled) {
      return { eligible: false, reason: 'Recovery disabled by configuration.' };
    }

    const dedupKey = this.buildRecoveryKey({ missionId, actionType });
    const record = this.store.getDeduplicationValue(dedupKey) ?? { attempts: 0, lastAttemptAt: null };

    if (Number(record.attempts ?? 0) >= Number(this.config.maxRecoveryAttempts ?? 2)) {
      return { eligible: false, reason: 'Recovery attempt limit reached.' };
    }

    if (record.lastAttemptAt) {
      const elapsed = Date.now() - new Date(record.lastAttemptAt).getTime();
      if (elapsed < Number(this.config.recoveryCooldownMs ?? 60000)) {
        return { eligible: false, reason: 'Recovery cooldown active.' };
      }
    }

    if (!session) {
      return { eligible: false, reason: 'Mission session not found.' };
    }

    return { eligible: true, reason: null, record };
  }

  recordAttempt({ missionId, actionType, success, escalated = false, reason = null }) {
    const dedupKey = this.buildRecoveryKey({ missionId, actionType });
    const record = this.store.getDeduplicationValue(dedupKey) ?? { attempts: 0, lastAttemptAt: null };
    const next = {
      attempts: Number(record.attempts ?? 0) + 1,
      lastAttemptAt: isoNow(this.now),
      lastSuccess: Boolean(success),
      lastReason: reason
    };
    this.store.saveDeduplicationKey(dedupKey, next);
    this.store.recordRecovery({
      missionId,
      actionType,
      success,
      escalated,
      reason,
      attemptedAt: next.lastAttemptAt
    });
  }

  async retryMission({ missionId, session }) {
    const eligibility = this.evaluateEligibility({ missionId, actionType: ExecutiveOperationsActionTypes.RETRY_MISSION, session });
    if (!eligibility.eligible) {
      this.recordAttempt({ missionId, actionType: ExecutiveOperationsActionTypes.RETRY_MISSION, success: false, escalated: true, reason: eligibility.reason });
      return { recovered: false, escalated: true, reason: eligibility.reason };
    }

    const result = await this.missionControlManager.executeCommand({
      commandType: 'RETRY',
      missionId,
      requestedBy: 'ATLAS_EXECUTIVE_OPERATIONS_LOOP_V1',
      requesterRole: 'EXECUTIVE',
      reason: 'Automatic retry for eligible operational recovery.',
      idempotencyKey: `ops-retry-${Date.now()}`,
      expectedCurrentState: session.state,
      timestamp: isoNow(this.now),
      correlationId: `ops-retry-${missionId}`
    });

    this.recordAttempt({ missionId, actionType: ExecutiveOperationsActionTypes.RETRY_MISSION, success: result.accepted, escalated: !result.accepted, reason: result.reason });
    return {
      recovered: result.accepted,
      escalated: !result.accepted,
      reason: result.reason,
      result
    };
  }

  async resumeMission({ missionId, session }) {
    const eligibility = this.evaluateEligibility({ missionId, actionType: ExecutiveOperationsActionTypes.RESUME_MISSION, session });
    if (!eligibility.eligible) {
      this.recordAttempt({ missionId, actionType: ExecutiveOperationsActionTypes.RESUME_MISSION, success: false, escalated: true, reason: eligibility.reason });
      return { resumed: false, escalated: true, reason: eligibility.reason };
    }

    const result = await this.missionControlManager.executeCommand({
      commandType: 'RESUME',
      missionId,
      requestedBy: 'ATLAS_EXECUTIVE_OPERATIONS_LOOP_V1',
      requesterRole: 'EXECUTIVE',
      reason: 'Automatic resume for eligible paused mission.',
      idempotencyKey: `ops-resume-${Date.now()}`,
      expectedCurrentState: session.state,
      timestamp: isoNow(this.now),
      correlationId: `ops-resume-${missionId}`
    });

    this.recordAttempt({ missionId, actionType: ExecutiveOperationsActionTypes.RESUME_MISSION, success: result.accepted, escalated: !result.accepted, reason: result.reason });
    return {
      resumed: result.accepted,
      escalated: !result.accepted,
      reason: result.reason,
      result
    };
  }

  reassignWorkers({ missionId, missionType, currentStage, errorMessage = 'Operational recovery reassignment' }) {
    const result = this.workforceDirector.handleStageFailure({
      missionId,
      stageId: currentStage,
      missionType,
      errorMessage
    });

    this.recordAttempt({
      missionId,
      actionType: ExecutiveOperationsActionTypes.REASSIGN_WORKER,
      success: result.recovered,
      escalated: !result.recovered,
      reason: result.reason
    });

    return result;
  }
}
