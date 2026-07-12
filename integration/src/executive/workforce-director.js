import {
  resolveWorkforceRequirementsForMissionType,
  WorkerStatuses
} from './workforce-director-contracts.js';
import { WorkforceRegistry } from './workforce-registry.js';
import { WorkforceDirectorDashboardModel } from './workforce-dashboard-model.js';
import { createDefaultWebsiteWorkforceRoster } from './website-workforce-roster.js';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class WorkforceDirector {
  constructor({ workforceRegistry, dashboardModel, logger, now, storageProvider, namespace = 'executive.workforce-director' } = {}) {
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.workforceRegistry = workforceRegistry ?? new WorkforceRegistry({
      initialWorkers: createDefaultWebsiteWorkforceRoster(),
      storageProvider: this.storageProvider,
      now
    });
    this.dashboardModel = dashboardModel ?? new WorkforceDirectorDashboardModel();
    const meta = getMetaMap({ provider: this.storageProvider, namespace: this.namespace });
    this.assignments = meta.get('assignments') ?? [];
    this.blockers = meta.get('blockers') ?? [];
  }

  persistState() {
    setMetaValue({ provider: this.storageProvider, namespace: this.namespace, key: 'assignments', value: this.assignments });
    setMetaValue({ provider: this.storageProvider, namespace: this.namespace, key: 'blockers', value: this.blockers });
  }

  planMissionAssignments({ missionId, missionType } = {}) {
    const requirements = resolveWorkforceRequirementsForMissionType(missionType);
    const stageAssignments = [];
    const unavailable = [];

    for (const requirement of requirements) {
      const workers = [];

      for (const specialty of requirement.requiredSpecialties) {
        const worker = this.workforceRegistry.findAvailableWorkerBySpecialty({ specialty });

        if (!worker) {
          const unavailableWorkers = this.workforceRegistry.listUnavailableWorkersBySpecialty({ specialty });
          unavailable.push({
            stageId: requirement.stageId,
            specialty,
            unavailableWorkers: unavailableWorkers.map((item) => ({
              workerId: item.workerId,
              workerName: item.workerName,
              status: item.status
            }))
          });
          continue;
        }

        workers.push(worker);
      }

      stageAssignments.push({
        stageId: requirement.stageId,
        workers,
        ready: workers.length === requirement.requiredSpecialties.length,
        requiredSpecialties: requirement.requiredSpecialties
      });
    }

    const assignmentPlan = {
      missionId,
      missionType,
      createdAt: isoNow(this.now),
      stageAssignments,
      unavailable,
      ready: unavailable.length === 0
    };

    this.assignments.push(...stageAssignments.flatMap((stageAssignment) => (
      stageAssignment.workers.map((worker) => ({
        missionId,
        stageId: stageAssignment.stageId,
        workerId: worker.workerId,
        workerName: worker.workerName,
        specialty: worker.specialty,
        assignedAt: isoNow(this.now)
      }))
    )));

    if (unavailable.length > 0) {
      this.blockers.push({
        missionId,
        missionType,
        unavailable,
        detectedAt: isoNow(this.now)
      });
    }

    this.persistState();

    return assignmentPlan;
  }

  getStageAssignments({ missionId, stageId } = {}) {
    return this.assignments.filter((assignment) => (
      assignment.missionId === missionId && assignment.stageId === stageId
    ));
  }

  markStageStarted({ missionId, stageId } = {}) {
    const stageAssignments = this.getStageAssignments({ missionId, stageId });
    const workers = stageAssignments.map((assignment) => (
      this.workforceRegistry.assignWorkerToStage({
        workerId: assignment.workerId,
        missionId,
        stageId
      })
    )).filter(Boolean);

    this.logger.log({
      event: 'workforce_stage_started',
      missionId,
      stageId,
      workerIds: workers.map((worker) => worker.workerId)
    });

    this.persistState();

    return workers;
  }

  markStageCompleted({ missionId, stageId } = {}) {
    const released = this.workforceRegistry.releaseWorkersForStage({ missionId, stageId });
    this.logger.log({
      event: 'workforce_stage_completed',
      missionId,
      stageId,
      releasedWorkerIds: released.map((worker) => worker.workerId)
    });

    this.persistState();

    return released;
  }

  handleStageFailure({ missionId, stageId, missionType, errorMessage } = {}) {
    const released = this.markStageCompleted({ missionId, stageId });
    const releasedWorkerIds = released.map((worker) => worker.workerId);
    const stageRequirement = resolveWorkforceRequirementsForMissionType(missionType)
      .find((requirement) => requirement.stageId === stageId);

    if (!stageRequirement) {
      return {
        recovered: false,
        reason: 'No workforce requirement found for stage.',
        reassignedWorkers: []
      };
    }

    const reassignedWorkers = [];
    const unavailable = [];

    for (const specialty of stageRequirement.requiredSpecialties) {
      let replacement = this.workforceRegistry.findAvailableWorkerBySpecialty({
        specialty,
        excludeWorkerIds: releasedWorkerIds
      });

      if (!replacement) {
        replacement = this.workforceRegistry.findAvailableWorkerBySpecialty({ specialty });
      }

      if (!replacement) {
        unavailable.push(specialty);
        continue;
      }

      reassignedWorkers.push(replacement);
    }

    if (unavailable.length === 0) {
      this.assignments = this.assignments.filter((assignment) => (
        !(assignment.missionId === missionId && assignment.stageId === stageId)
      ));

      this.assignments.push(...reassignedWorkers.map((worker) => ({
        missionId,
        stageId,
        workerId: worker.workerId,
        workerName: worker.workerName,
        specialty: worker.specialty,
        assignedAt: isoNow(this.now)
      })));
    }

    this.logger.log({
      event: 'workforce_stage_failure',
      missionId,
      stageId,
      errorMessage,
      releasedWorkerIds: released.map((worker) => worker.workerId),
      reassignedWorkerIds: reassignedWorkers.map((worker) => worker.workerId),
      unavailableSpecialties: unavailable
    });

    this.persistState();

    return {
      recovered: unavailable.length === 0,
      reason: unavailable.length === 0 ? null : `Unavailable specialties: ${unavailable.join(', ')}`,
      reassignedWorkers,
      unavailableSpecialties: unavailable
    };
  }

  completeMission({ missionId } = {}) {
    this.workforceRegistry.releaseWorkersForMission({ missionId });
    this.assignments = this.assignments.filter((assignment) => assignment.missionId !== missionId);
    this.blockers = this.blockers.filter((blocker) => blocker.missionId !== missionId);
    this.persistState();
  }

  buildDashboard() {
    return this.dashboardModel.build({
      workers: this.workforceRegistry.listWorkers(),
      assignments: this.assignments
    });
  }

  listWorkers() {
    return this.workforceRegistry.listWorkers();
  }

  markWorkerOffline(workerId) {
    return this.workforceRegistry.updateWorker(workerId, {
      status: WorkerStatuses.OFFLINE,
      currentMission: null,
      currentStage: null
    });
  }
}
