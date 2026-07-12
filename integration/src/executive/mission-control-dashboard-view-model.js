export class MissionControlDashboardViewModel {
  project({ missions = [], customersById = {}, proposalsByMissionId = {} } = {}) {
    return {
      totalMissions: missions.length,
      records: missions.map((mission) => {
        const customer = customersById[mission.customerId] ?? null;
        const linkedProposal = proposalsByMissionId[mission.missionId] ?? null;

        return {
          missionId: mission.missionId,
          customer: customer?.companyName ?? mission.customerId ?? 'UNKNOWN_CUSTOMER',
          missionType: mission.missionType ?? 'UNKNOWN',
          currentState: mission.executiveStatus ?? 'UNKNOWN',
          currentStage: mission.currentStage ?? 'UNKNOWN',
          completionPercentage: Number(mission.progress ?? 0),
          assignedWorkers: Array.isArray(mission.assignedWorkforce) ? mission.assignedWorkforce : [],
          priority: linkedProposal?.priorityBand ?? 'UNSPECIFIED',
          confidence: linkedProposal?.confidence ?? null,
          risk: linkedProposal?.risk ?? null,
          estimatedCompletion: linkedProposal?.estimatedCompletion ?? null,
          lastActivity: mission.completedDate ?? mission.startedDate ?? null,
          warnings: mission.warnings ?? [],
          blockingIssues: mission.blockingIssues ?? [],
          linkedProposal: linkedProposal?.proposalId ?? null,
          linkedExecutiveReviewPackage: linkedProposal?.linkedExecutiveReviewPackage ?? null,
          ceoReviewStatus: mission.executiveStatus === 'AWAITING_EXECUTIVE_REVIEW' ? 'REQUIRES_CEO_REVIEW' : 'NOT_REQUIRED'
        };
      })
    };
  }

  filter(view = {}, criteria = {}) {
    const records = Array.isArray(view.records) ? view.records : [];
    const filters = {
      state: criteria.state ? String(criteria.state).toUpperCase() : null,
      missionType: criteria.missionType ? String(criteria.missionType).toUpperCase() : null,
      customer: criteria.customer ? String(criteria.customer).toLowerCase() : null,
      worker: criteria.worker ? String(criteria.worker).toUpperCase() : null,
      priority: criteria.priority ? String(criteria.priority).toUpperCase() : null,
      risk: Number.isFinite(Number(criteria.risk)) ? Number(criteria.risk) : null,
      ceoReviewStatus: criteria.ceoReviewStatus ? String(criteria.ceoReviewStatus).toUpperCase() : null
    };

    return records.filter((record) => {
      if (filters.state && String(record.currentState).toUpperCase() !== filters.state) return false;
      if (filters.missionType && String(record.missionType).toUpperCase() !== filters.missionType) return false;
      if (filters.customer && !String(record.customer).toLowerCase().includes(filters.customer)) return false;
      if (filters.worker && !record.assignedWorkers.some((worker) => String(worker).toUpperCase().includes(filters.worker))) return false;
      if (filters.priority && String(record.priority).toUpperCase() !== filters.priority) return false;
      if (filters.risk !== null && Number(record.risk ?? -1) < filters.risk) return false;
      if (filters.ceoReviewStatus && String(record.ceoReviewStatus).toUpperCase() !== filters.ceoReviewStatus) return false;
      return true;
    });
  }
}
