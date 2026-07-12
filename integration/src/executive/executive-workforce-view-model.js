import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

export class ExecutiveWorkforceViewModel {
  project({ workforceDirector, missions = [] } = {}) {
    if (!workforceDirector) {
      return {
        status: DataAvailabilityStatuses.NOT_CONNECTED,
        totalWorkers: null,
        activeWorkers: null,
        idleWorkers: null,
        unavailableWorkers: null,
        blockedWorkers: null,
        utilization: null,
        workload: [],
        activeAssignments: [],
        pendingAssignments: [],
        capabilityCoverage: [],
        capabilityGaps: [],
        estimatedNextAvailability: [],
        reassignmentRecommendations: []
      };
    }

    const workers = workforceDirector.listWorkers();
    const dashboard = workforceDirector.buildDashboard();

    const capabilityCoverage = Array.from(new Set(workers.flatMap((worker) => worker.capabilities ?? []))).map((capability) => {
      const providers = workers.filter((worker) => (worker.capabilities ?? []).includes(capability));
      return {
        capability,
        workerCount: providers.length,
        availableNow: providers.filter((worker) => worker.status === 'IDLE').length
      };
    });

    const requiredCapabilities = Array.from(new Set(missions.flatMap((mission) => mission.requiredCapabilities ?? [])));
    const capabilityGaps = requiredCapabilities.filter((capability) => !capabilityCoverage.some((entry) => entry.capability === capability));

    const estimatedNextAvailability = capabilityCoverage.map((entry) => ({
      capability: entry.capability,
      availabilityStatus: entry.availableNow > 0 ? 'NOW' : 'AFTER_ACTIVE_ASSIGNMENTS'
    }));

    const reassignmentRecommendations = workers
      .filter((worker) => worker.status === 'OFFLINE')
      .map((worker) => ({
        workerId: worker.workerId,
        workerName: worker.workerName,
        specialty: worker.specialty,
        recommendation: 'Assign backup specialist for this capability domain.'
      }));

    const assignments = Array.isArray(workforceDirector.assignments) ? workforceDirector.assignments : [];
    const activeAssignments = assignments.filter((assignment) => workers.some((worker) => worker.workerId === assignment.workerId && worker.status === 'BUSY'));

    return {
      status: DataAvailabilityStatuses.AVAILABLE,
      totalWorkers: workers.length,
      activeWorkers: dashboard.activeWorkers,
      idleWorkers: dashboard.idleWorkers,
      unavailableWorkers: workers.filter((worker) => worker.status === 'OFFLINE').length,
      blockedWorkers: dashboard.blockedWorkers,
      utilization: dashboard.workerUtilization,
      workload: dashboard.currentWorkload,
      activeAssignments,
      pendingAssignments: assignments.filter((assignment) => !activeAssignments.some((active) => active.workerId === assignment.workerId && active.stageId === assignment.stageId)),
      capabilityCoverage,
      capabilityGaps,
      estimatedNextAvailability,
      reassignmentRecommendations,
      workerDetails: workers
    };
  }
}
