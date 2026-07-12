import { MissionExecutiveStatuses } from './customer-intake-mission-control-contracts.js';

export class CustomerIntakeExecutiveDashboardModel {
  build({ customers = [], missions = [], activityFeed = [] } = {}) {
    const totalCustomers = customers.length;

    const activeMissions = missions.filter((mission) => mission.executiveStatus === MissionExecutiveStatuses.ACTIVE).length;
    const awaitingExecutiveReview = missions
      .filter((mission) => mission.executiveStatus === MissionExecutiveStatuses.AWAITING_EXECUTIVE_REVIEW)
      .length;
    const completedMissions = missions.filter((mission) => mission.executiveStatus === MissionExecutiveStatuses.COMPLETED).length;
    const blockedMissions = missions.filter((mission) => mission.executiveStatus === MissionExecutiveStatuses.BLOCKED).length;

    return {
      generatedAt: new Date().toISOString(),
      totalCustomers,
      activeMissions,
      awaitingExecutiveReview,
      completedMissions,
      blockedMissions,
      recentActivityFeed: Array.isArray(activityFeed)
        ? activityFeed.slice(-20).reverse()
        : []
    };
  }
}
