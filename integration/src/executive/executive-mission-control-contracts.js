import { randomUUID } from 'node:crypto';

export const MissionControlCommandTypes = Object.freeze({
  RETRY: 'RETRY',
  RESUME: 'RESUME',
  ROLLBACK: 'ROLLBACK',
  CANCEL: 'CANCEL',
  PAUSE: 'PAUSE',
  FORCE_EXECUTIVE_REVIEW: 'FORCE_EXECUTIVE_REVIEW'
});

export const MissionControlPermissionByCommand = Object.freeze({
  [MissionControlCommandTypes.RETRY]: 'mission-control:command:retry',
  [MissionControlCommandTypes.RESUME]: 'mission-control:command:resume',
  [MissionControlCommandTypes.ROLLBACK]: 'mission-control:command:rollback',
  [MissionControlCommandTypes.CANCEL]: 'mission-control:command:cancel',
  [MissionControlCommandTypes.PAUSE]: 'mission-control:command:pause',
  [MissionControlCommandTypes.FORCE_EXECUTIVE_REVIEW]: 'mission-control:command:force-review'
});

export function createMissionControlCommandRequest({
  commandType,
  missionId,
  requestedBy,
  requesterRole,
  reason,
  idempotencyKey,
  expectedCurrentState,
  rollbackTargetStage = null,
  timestamp = new Date().toISOString(),
  correlationId
} = {}) {
  return {
    commandId: `mcc_${randomUUID()}`,
    commandType,
    missionId,
    requestedBy,
    requesterRole,
    reason,
    idempotencyKey,
    expectedCurrentState,
    rollbackTargetStage,
    timestamp,
    correlationId: correlationId ?? `corr_${randomUUID()}`
  };
}

export function validateMissionControlCommandRequest(request = {}) {
  const issues = [];
  const commandType = String(request.commandType ?? '').toUpperCase();

  if (!Object.values(MissionControlCommandTypes).includes(commandType)) {
    issues.push('commandType is invalid or unsupported.');
  }

  if (!request.missionId || String(request.missionId).trim().length === 0) {
    issues.push('missionId is required.');
  }

  if (!request.requestedBy || String(request.requestedBy).trim().length === 0) {
    issues.push('requestedBy is required.');
  }

  if (!request.requesterRole || String(request.requesterRole).trim().length === 0) {
    issues.push('requesterRole is required.');
  }

  if (!request.reason || String(request.reason).trim().length === 0) {
    issues.push('reason is required.');
  }

  if (!request.idempotencyKey || String(request.idempotencyKey).trim().length < 8) {
    issues.push('idempotencyKey is required and must be at least 8 characters.');
  }

  if (!request.expectedCurrentState || String(request.expectedCurrentState).trim().length === 0) {
    issues.push('expectedCurrentState is required.');
  }

  if (!request.timestamp || Number.isNaN(Date.parse(String(request.timestamp)))) {
    issues.push('timestamp must be a valid ISO timestamp.');
  }

  if (!request.correlationId || String(request.correlationId).trim().length === 0) {
    issues.push('correlationId is required.');
  }

  if (
    commandType === MissionControlCommandTypes.ROLLBACK
    && (!request.rollbackTargetStage || String(request.rollbackTargetStage).trim().length === 0)
  ) {
    issues.push('rollbackTargetStage is required for rollback commands.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
