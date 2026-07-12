import { WorkerStatuses } from './workforce-director-contracts.js';

export class WorkforceDirectorDashboardModel {
  build({ workers = [], assignments = [] } = {}) {
    const activeWorkers = workers.filter((worker) => worker.status === WorkerStatuses.BUSY).length;
    const idleWorkers = workers.filter((worker) => worker.status === WorkerStatuses.IDLE).length;
    const blockedWorkers = workers.filter((worker) => worker.status === WorkerStatuses.OFFLINE).length;

    const totalWorkers = workers.length;
    const workerUtilization = totalWorkers === 0 ? 0 : Number(((activeWorkers / totalWorkers) * 100).toFixed(2));

    const missionAssignments = assignments.reduce((acc, assignment) => {
      const missionId = assignment.missionId;
      acc[missionId] = (acc[missionId] ?? 0) + 1;
      return acc;
    }, {});

    const currentWorkload = workers
      .filter((worker) => worker.status === WorkerStatuses.BUSY)
      .map((worker) => ({
        workerId: worker.workerId,
        workerName: worker.workerName,
        specialty: worker.specialty,
        missionId: worker.currentMission,
        stageId: worker.currentStage
      }));

    return {
      generatedAt: new Date().toISOString(),
      activeWorkers,
      idleWorkers,
      workerUtilization,
      missionAssignments,
      blockedWorkers,
      currentWorkload
    };
  }
}
