import { randomUUID } from 'node:crypto';
import { MissionExecutiveStatuses } from './customer-intake-mission-control-contracts.js';
import { loadRecordMap, upsertRecord } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class MissionRegistry {
  constructor({ now, storageProvider, namespace = 'executive.mission-registry' } = {}) {
    this.now = now;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.missions = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });
  }

  createMission({
    customerId,
    missionType,
    assignedWorkforce = ['WEBSITE_DIVISION'],
    executiveStatus = MissionExecutiveStatuses.ACTIVE,
    currentStage = 'INTAKE_ACCEPTED',
    progress = 0
  } = {}) {
    const timestamp = isoNow(this.now);
    const mission = {
      missionId: `mis_${randomUUID()}`,
      customerId,
      missionType,
      currentStage,
      assignedWorkforce,
      progress,
      executiveStatus,
      startedDate: timestamp,
      completedDate: null
    };

    this.missions.set(mission.missionId, mission);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: mission.missionId, value: mission });
    return mission;
  }

  getMissionById(missionId) {
    return this.missions.get(missionId) ?? null;
  }

  listMissions() {
    return Array.from(this.missions.values())
      .sort((a, b) => String(a.startedDate).localeCompare(String(b.startedDate)));
  }

  updateMission(missionId, patch = {}) {
    const current = this.getMissionById(missionId);
    if (!current) {
      return null;
    }

    const updated = {
      ...current,
      ...patch
    };

    this.missions.set(missionId, updated);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: missionId, value: updated });
    return updated;
  }
}
