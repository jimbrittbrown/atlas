import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function asNumber(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

export class ExecutiveMissionOrchestratorDashboardModel {
  project({ sessions = [], workforceDirector } = {}) {
    const workforceDashboard = workforceDirector?.buildDashboard?.() ?? null;

    const records = sessions
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((session) => ({
        orchestrationId: session.orchestrationId,
        missionId: session.missionId,
        proposalId: session.proposalId,
        missionType: session.missionType,
        state: session.state,
        currentStage: session.currentStage,
        assignedWorkers: session.assignedWorkers,
        completionPercentage: asNumber(session.completionPercentage, 0),
        eta: session.eta,
        blockers: session.blockers,
        confidence: asNumber(session.confidence, null),
        retryCount: session.retryCount,
        timeoutMs: session.timeoutMs,
        updatedAt: session.updatedAt
      }));

    return {
      status: sessions.length === 0 ? DataAvailabilityStatuses.PARTIAL : DataAvailabilityStatuses.AVAILABLE,
      totalSessions: sessions.length,
      runningSessions: sessions.filter((session) => session.state === 'RUNNING').length,
      blockedSessions: sessions.filter((session) => (session.blockers ?? []).length > 0).length,
      averageCompletion: records.length === 0
        ? 0
        : Number((records.reduce((sum, record) => sum + Number(record.completionPercentage ?? 0), 0) / records.length).toFixed(2)),
      records,
      workforce: workforceDashboard
    };
  }
}
