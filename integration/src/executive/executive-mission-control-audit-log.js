import { createHash, randomUUID } from 'node:crypto';
import { appendEvent, loadEventList } from '../storage/provider-backed-state.js';

function hashRequesterIdentity(requestedBy) {
  return createHash('sha256').update(String(requestedBy ?? 'unknown'), 'utf8').digest('hex').slice(0, 16);
}

export class ExecutiveMissionControlAuditLog {
  constructor({ storageProvider, namespace = 'executive.mission-control-audit-log' } = {}) {
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.events = loadEventList({ provider: this.storageProvider, namespace: this.namespace });
  }

  record({
    command,
    missionId,
    requestedBy,
    role,
    result,
    previousState,
    resultingState,
    rejectionReason = null,
    timestamp = new Date().toISOString(),
    correlationId
  } = {}) {
    const event = {
      auditEventId: `mc_audit_${randomUUID()}`,
      command,
      missionId,
      requesterIdentityHash: hashRequesterIdentity(requestedBy),
      role,
      result,
      previousState,
      resultingState,
      rejectionReason,
      timestamp,
      correlationId
    };

    this.events.push(event);
    appendEvent({ provider: this.storageProvider, namespace: this.namespace, key: event.auditEventId, value: event });
    return event;
  }

  list({ missionId, limit = 20 } = {}) {
    let records = this.events.slice();
    if (missionId) {
      records = records.filter((event) => event.missionId === missionId);
    }

    return records
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, Math.max(1, Number(limit) || 20));
  }
}
