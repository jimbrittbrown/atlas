import { ExecutiveOperationsLoopStates } from './executive-operations-loop-contracts.js';
import {
  appendEvent,
  getMetaMap,
  loadRecordMap,
  setMetaValue,
  upsertRecord
} from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class InMemoryExecutiveOperationsLoopStore {
  constructor({ now, storageProvider, namespace = 'executive.operations-loop-store' } = {}) {
    this.now = now;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;

    const meta = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.meta` });
    this.loopState = meta.get('loopState') ?? ExecutiveOperationsLoopStates.STOPPED;
    this.currentCycle = meta.get('currentCycle') ?? null;
    this.lastCompletedCycle = meta.get('lastCompletedCycle') ?? null;
    this.alerts = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.alerts` });
    this.recoveryHistory = Array.from(loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.recovery` }).values());
    this.auditEntries = Array.from(loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.audit` }).values());
    this.deduplicationKeys = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.dedupe` });
    this.metrics = meta.get('metrics') ?? {
      totalCycles: 0,
      successfulCycles: 0,
      warningCycles: 0,
      failedCycles: 0,
      averageCycleDurationMs: 0,
      findingsByType: {},
      actionsConsidered: 0,
      actionsExecuted: 0,
      actionsBlocked: 0,
      recoveriesAttempted: 0,
      recoveriesSuccessful: 0,
      recoveriesEscalated: 0,
      activeAlerts: 0,
      lastSuccessfulHeartbeat: null,
      currentLoopState: this.loopState
    };
    this.heartbeat = meta.get('heartbeat') ?? {
      lastStartedAt: null,
      lastBeatAt: null,
      lastSuccessfulAt: null
    };
    this.cycleLock = false;
    this.cycleHistory = Array.from(loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.cycles` }).values())
      .sort((a, b) => String(a.completedAt ?? a.startedAt ?? '').localeCompare(String(b.completedAt ?? b.startedAt ?? '')));
  }

  persistMeta() {
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.meta`, key: 'loopState', value: this.loopState });
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.meta`, key: 'currentCycle', value: this.currentCycle });
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.meta`, key: 'lastCompletedCycle', value: this.lastCompletedCycle });
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.meta`, key: 'metrics', value: this.metrics });
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.meta`, key: 'heartbeat', value: this.heartbeat });
  }

  transitionLoopState(state) {
    this.loopState = state;
    this.metrics.currentLoopState = state;
    this.persistMeta();
    return this.loopState;
  }

  tryAcquireCycleLock() {
    if (this.cycleLock) return false;
    this.cycleLock = true;
    return true;
  }

  releaseCycleLock() {
    this.cycleLock = false;
  }

  saveCurrentCycle(cycle) {
    this.currentCycle = cycle;
    this.touchHeartbeat();
    this.persistMeta();
  }

  completeCycle(cycle) {
    this.currentCycle = null;
    this.lastCompletedCycle = cycle;
    this.cycleHistory.push(cycle);
    this.cycleHistory = this.cycleHistory.slice(-100);
    this.metrics.totalCycles += 1;
    if (cycle.state === 'COMPLETED') this.metrics.successfulCycles += 1;
    if (cycle.state === 'COMPLETED_WITH_WARNINGS') this.metrics.warningCycles += 1;
    if (cycle.state === 'FAILED') this.metrics.failedCycles += 1;
    const totalDuration = this.cycleHistory.reduce((sum, item) => sum + Number(item.durationMs ?? 0), 0);
    this.metrics.averageCycleDurationMs = this.cycleHistory.length === 0 ? 0 : Number((totalDuration / this.cycleHistory.length).toFixed(2));
    this.metrics.lastSuccessfulHeartbeat = cycle.state === 'FAILED' ? this.metrics.lastSuccessfulHeartbeat : isoNow(this.now);
    if (cycle.state !== 'FAILED') {
      this.heartbeat.lastSuccessfulAt = isoNow(this.now);
    }
    if (cycle?.cycleId) {
      upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.cycles`, key: cycle.cycleId, value: cycle });
    }
    this.persistMeta();
  }

  recordAudit(entry) {
    this.auditEntries.push(entry);
    this.auditEntries = this.auditEntries.slice(-500);
    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.audit-events`,
      key: `${entry.timestamp ?? isoNow(this.now)}:${entry.event ?? 'AUDIT'}`,
      value: entry
    });
    if (entry?.timestamp) {
      upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.audit`, key: `${entry.timestamp}:${entry.event ?? 'AUDIT'}`, value: entry });
    }
  }

  listAuditEntries(limit = 100) {
    return this.auditEntries.slice(-Math.max(1, limit));
  }

  recordRecovery(entry) {
    this.recoveryHistory.push(entry);
    this.recoveryHistory = this.recoveryHistory.slice(-200);
    this.metrics.recoveriesAttempted += 1;
    if (entry.success) this.metrics.recoveriesSuccessful += 1;
    if (entry.escalated) this.metrics.recoveriesEscalated += 1;
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.recovery`, key: `${entry.attemptedAt ?? isoNow(this.now)}:${entry.actionType}`, value: entry });
    this.persistMeta();
  }

  listRecoveryHistory(limit = 100) {
    return this.recoveryHistory.slice(-Math.max(1, limit));
  }

  upsertAlert(key, alert) {
    const current = this.alerts.get(key) ?? null;
    if (!current) {
      this.alerts.set(key, alert);
    } else {
      this.alerts.set(key, {
        ...current,
        ...alert,
        alertId: current.alertId,
        firstDetectedAt: current.firstDetectedAt,
        occurrenceCount: Number(current.occurrenceCount ?? 1) + 1,
        lastDetectedAt: alert.lastDetectedAt
      });
    }
    this.metrics.activeAlerts = this.alerts.size;
    const persistedAlert = this.alerts.get(key);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.alerts`, key, value: persistedAlert });
    this.persistMeta();
    return persistedAlert;
  }

  listAlerts() {
    return Array.from(this.alerts.values()).sort((a, b) => String(b.lastDetectedAt).localeCompare(String(a.lastDetectedAt)));
  }

  hasDeduplicationKey(key) {
    return this.deduplicationKeys.has(key);
  }

  saveDeduplicationKey(key, value = true) {
    this.deduplicationKeys.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.dedupe`, key, value });
  }

  getDeduplicationValue(key) {
    return this.deduplicationKeys.get(key) ?? null;
  }

  touchHeartbeat() {
    const timestamp = isoNow(this.now);
    this.heartbeat.lastBeatAt = timestamp;
    this.heartbeat.lastStartedAt = this.heartbeat.lastStartedAt ?? timestamp;
    this.persistMeta();
  }

  setHeartbeatSuccessful() {
    this.heartbeat.lastSuccessfulAt = isoNow(this.now);
    this.persistMeta();
  }

  updateFindingsMetrics(findings = []) {
    findings.forEach((finding) => {
      const key = String(finding.type ?? 'UNKNOWN');
      this.metrics.findingsByType[key] = Number(this.metrics.findingsByType[key] ?? 0) + 1;
    });
    this.persistMeta();
  }

  incrementActionMetrics({ considered = 0, executed = 0, blocked = 0 } = {}) {
    this.metrics.actionsConsidered += Number(considered ?? 0);
    this.metrics.actionsExecuted += Number(executed ?? 0);
    this.metrics.actionsBlocked += Number(blocked ?? 0);
    this.persistMeta();
  }

  getStatus() {
    return {
      loopState: this.loopState,
      currentCycle: this.currentCycle,
      lastCompletedCycle: this.lastCompletedCycle,
      heartbeat: { ...this.heartbeat },
      metrics: { ...this.metrics },
      activeAlerts: this.listAlerts(),
      cycleLock: this.cycleLock
    };
  }
}
