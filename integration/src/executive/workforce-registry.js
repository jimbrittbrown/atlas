import { randomUUID } from 'node:crypto';
import { WorkerStatuses } from './workforce-director-contracts.js';
import { loadRecordMap, upsertRecord } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class WorkforceRegistry {
  constructor({ initialWorkers = [], now, storageProvider, namespace = 'executive.workforce-registry' } = {}) {
    this.now = now;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.workers = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });

    if (this.workers.size === 0) {
      initialWorkers.forEach((worker) => {
        this.registerWorker(worker);
      });
    }
  }

  registerWorker({
    workerName,
    division,
    specialty,
    capabilities = [],
    status = WorkerStatuses.IDLE,
    currentMission = null,
    currentStage = null
  } = {}) {
    const timestamp = isoNow(this.now);
    const worker = {
      workerId: `wrk_${randomUUID()}`,
      workerName,
      division,
      specialty,
      capabilities: Array.isArray(capabilities) ? capabilities : [],
      status,
      currentMission,
      currentStage,
      lastUpdated: timestamp,
      createdAt: timestamp
    };

    this.workers.set(worker.workerId, worker);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: worker.workerId, value: worker });
    return worker;
  }

  listWorkers() {
    return Array.from(this.workers.values());
  }

  getWorkerById(workerId) {
    return this.workers.get(workerId) ?? null;
  }

  updateWorker(workerId, patch = {}) {
    const current = this.getWorkerById(workerId);
    if (!current) {
      return null;
    }

    const updated = {
      ...current,
      ...patch,
      lastUpdated: isoNow(this.now)
    };

    this.workers.set(workerId, updated);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: workerId, value: updated });
    return updated;
  }

  findAvailableWorkerBySpecialty({ specialty, excludeWorkerIds = [] } = {}) {
    const excluded = new Set(Array.isArray(excludeWorkerIds) ? excludeWorkerIds : []);
    const workers = this.listWorkers().filter((worker) => (
      worker.specialty === specialty
      && worker.status === WorkerStatuses.IDLE
      && worker.currentMission == null
      && !excluded.has(worker.workerId)
    ));

    return workers[0] ?? null;
  }

  assignWorkerToStage({ workerId, missionId, stageId } = {}) {
    const worker = this.getWorkerById(workerId);
    if (!worker) {
      return null;
    }

    if (worker.status === WorkerStatuses.OFFLINE) {
      return null;
    }

    if (worker.status === WorkerStatuses.BUSY && worker.currentMission !== missionId) {
      return null;
    }

    return this.updateWorker(worker.workerId, {
      status: WorkerStatuses.BUSY,
      currentMission: missionId,
      currentStage: stageId
    });
  }

  listUnavailableWorkersBySpecialty({ specialty } = {}) {
    return this.listWorkers().filter((worker) => (
      worker.specialty === specialty
      && worker.status !== WorkerStatuses.IDLE
    ));
  }

  releaseWorkersForStage({ missionId, stageId } = {}) {
    const released = [];

    this.listWorkers().forEach((worker) => {
      if (worker.currentMission === missionId && worker.currentStage === stageId) {
        released.push(this.updateWorker(worker.workerId, {
          status: WorkerStatuses.IDLE,
          currentMission: null,
          currentStage: null
        }));
      }
    });

    return released.filter(Boolean);
  }

  releaseWorkersForMission({ missionId } = {}) {
    const released = [];

    this.listWorkers().forEach((worker) => {
      if (worker.currentMission === missionId) {
        released.push(this.updateWorker(worker.workerId, {
          status: WorkerStatuses.IDLE,
          currentMission: null,
          currentStage: null
        }));
      }
    });

    return released.filter(Boolean);
  }
}
