import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';

function sumByStatus(proposals = [], status) {
  return proposals
    .filter((proposal) => String(proposal.status ?? '').toUpperCase() === status)
    .reduce((sum, proposal) => sum + Number(proposal.expectedBusinessValue ?? 0), 0);
}

export class CustomerPipelineDashboardModel {
  project({ customers = [], missions = [], proposals = [], intakeActivityFeed = [] } = {}) {
    const activeCustomerIds = new Set(missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'ACTIVE').map((mission) => mission.customerId));
    const customersAwaitingReview = new Set(missions.filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'AWAITING_EXECUTIVE_REVIEW').map((mission) => mission.customerId));

    const prospects = proposals.filter((proposal) => !proposal.customerId || !customers.some((customer) => customer.customerId === proposal.customerId));

    const status = customers.length === 0 && proposals.length === 0
      ? DataAvailabilityStatuses.PARTIAL
      : DataAvailabilityStatuses.AVAILABLE;

    return {
      status,
      totalCustomers: customers.length,
      activeCustomers: activeCustomerIds.size,
      prospects: prospects.length,
      customersWithActiveMissions: activeCustomerIds.size,
      customersAwaitingExecutiveReview: customersAwaitingReview.size,
      proposedProjectValue: Number(sumByStatus(proposals, 'SUBMITTED').toFixed(2)),
      approvedProjectValue: Number(sumByStatus(proposals, 'APPROVED').toFixed(2)),
      deferredProjectValue: Number(sumByStatus(proposals, 'DEFERRED').toFixed(2)),
      rejectedProjectValue: Number(sumByStatus(proposals, 'REJECTED').toFixed(2)),
      completedProjectValue: Number(sumByStatus(proposals, 'CONVERTED_TO_MISSION').toFixed(2)),
      financialValuesNote: 'Values represent proposal-level expected business value estimates, not recognized revenue.',
      customerActivityFeed: Array.isArray(intakeActivityFeed)
        ? intakeActivityFeed.slice(-30).reverse()
        : []
    };
  }
}
