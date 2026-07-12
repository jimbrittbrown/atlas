import type { CeoDecisionCenterResponse } from './ceo-decision-center-contracts';

export type CeoDecisionCenterViewModel = {
  approvalQueueCount: number;
  blockedMissionCount: number;
  topOpportunityValue: number | null;
  topRiskSeverity: string;
  recentDecisionCount: number;
  sections: CeoDecisionCenterResponse;
};

export function buildDecisionCenterViewModel(data: CeoDecisionCenterResponse): CeoDecisionCenterViewModel {
  return {
    approvalQueueCount: data.executiveReviews.length,
    blockedMissionCount: data.blockedMissions.length,
    topOpportunityValue: data.opportunities[0]?.expectedValue ?? null,
    topRiskSeverity: data.risks[0]?.severity ?? 'INFO',
    recentDecisionCount: data.decisionHistory.length,
    sections: data,
  };
}
