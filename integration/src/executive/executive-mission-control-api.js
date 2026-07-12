import { MissionControlCommandTypes } from './executive-mission-control-contracts.js';

function safeUserFingerprint(auth) {
  if (!auth?.tokenFingerprint) return 'anonymous';
  return `token:${auth.tokenFingerprint}`;
}

export class ExecutiveMissionControlApi {
  constructor({ manager } = {}) {
    this.manager = manager;
  }

  listMissions() {
    return this.manager.buildMissionControlProjection();
  }

  getMission(missionId) {
    const projection = this.manager.buildMissionControlProjection({ missionId });
    const record = projection.records[0] ?? null;

    if (!record) {
      return {
        found: false,
        reason: 'Mission session not found.',
        data: null
      };
    }

    return {
      found: true,
      reason: null,
      data: record
    };
  }

  async issueCommand({ missionId, commandType, body = {}, auth = {} } = {}) {
    const normalized = String(commandType ?? '').toUpperCase();

    if (!Object.values(MissionControlCommandTypes).includes(normalized)) {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: `Unsupported command type ${commandType}.`,
        data: null
      };
    }

    const payload = {
      commandType: normalized,
      missionId,
      requestedBy: String(body.requestedBy ?? safeUserFingerprint(auth)),
      requesterRole: String(auth.role ?? body.requesterRole ?? 'UNKNOWN'),
      reason: String(body.reason ?? '').trim(),
      idempotencyKey: String(body.idempotencyKey ?? '').trim(),
      expectedCurrentState: String(body.expectedCurrentState ?? '').trim(),
      rollbackTargetStage: body.rollbackTargetStage ?? null,
      timestamp: body.timestamp,
      correlationId: String(body.correlationId ?? '').trim() || undefined
    };

    const result = await this.manager.executeCommand(payload);

    return {
      accepted: result.accepted,
      status: result.status,
      code: result.code,
      reason: result.reason,
      data: {
        missionId,
        commandType: normalized,
        state: result.session?.state ?? null,
        orchestrationId: result.session?.orchestrationId ?? null,
        duplicate: result.duplicate === true,
        correlationId: result.request?.correlationId ?? null
      }
    };
  }
}
