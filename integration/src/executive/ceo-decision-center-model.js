import { createDecisionCenterItem } from './executive-operations-dashboard-contracts.js';

function ageInDays(timestamp) {
  if (!timestamp) return null;
  const millis = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(millis)) return null;
  return Number((millis / (1000 * 60 * 60 * 24)).toFixed(2));
}

export class CEDecisionCenterModel {
  project({ proposals = [], evaluationsByProposalId = {}, ceoGateByProposalId = {}, missions = [] } = {}) {
    const proposalItems = proposals
      .filter((proposal) => ['UNDER_REVIEW', 'SUBMITTED', 'REVISION_REQUIRED', 'APPROVED', 'DEFERRED'].includes(String(proposal.status ?? '').toUpperCase()))
      .flatMap((proposal) => {
        const evaluation = evaluationsByProposalId[proposal.proposalId] ?? null;
        const gate = ceoGateByProposalId[proposal.proposalId] ?? { required: false, reasons: [] };
        const items = [];

        if (gate.required) {
          items.push(createDecisionCenterItem({
            relatedCustomer: proposal.customerId,
            relatedMission: proposal.linkedMissionId,
            decisionType: 'CEO_GOVERNANCE_APPROVAL',
            recommendation: evaluation?.recommendedDecision ?? 'REVIEW_REQUIRED',
            confidence: evaluation?.confidenceBand ?? null,
            risk: Number((1 - Number(evaluation?.scoreBreakdown?.risk ?? 1)).toFixed(4)),
            estimatedCost: proposal.estimatedCost,
            expectedValue: proposal.expectedBusinessValue,
            urgency: proposal.urgency,
            age: ageInDays(proposal.createdAt),
            blockingIssues: gate.reasons,
            requiredCeoAction: 'APPROVE_OR_REJECT',
            sourceReportPath: 'review/executive-planning-system-v1-report.json',
            metadata: {
              proposalId: proposal.proposalId,
              proposalStatus: proposal.status
            }
          }));
        }

        if (String(proposal.status ?? '').toUpperCase() === 'APPROVED' && !proposal.linkedMissionId) {
          items.push(createDecisionCenterItem({
            relatedCustomer: proposal.customerId,
            relatedMission: null,
            decisionType: 'PROPOSAL_CONVERSION_APPROVAL',
            recommendation: 'CONVERT_TO_MISSION_CONTROL',
            confidence: evaluation?.confidenceBand ?? null,
            risk: Number((1 - Number(evaluation?.scoreBreakdown?.risk ?? 1)).toFixed(4)),
            estimatedCost: proposal.estimatedCost,
            expectedValue: proposal.expectedBusinessValue,
            urgency: proposal.urgency,
            age: ageInDays(proposal.createdAt),
            blockingIssues: evaluation?.blockingIssues ?? [],
            requiredCeoAction: 'AUTHORIZE_CONVERSION',
            sourceReportPath: 'review/executive-planning-system-v1-report.json',
            metadata: {
              proposalId: proposal.proposalId,
              proposalStatus: proposal.status
            }
          }));
        }

        return items;
      });

    const missionReviewItems = missions
      .filter((mission) => String(mission.executiveStatus ?? '').toUpperCase() === 'AWAITING_EXECUTIVE_REVIEW')
      .map((mission) => createDecisionCenterItem({
        relatedCustomer: mission.customerId ?? null,
        relatedMission: mission.missionId,
        decisionType: 'EXECUTIVE_REVIEW_PACKAGE',
        recommendation: 'REVIEW_PACKAGE_AND_DECIDE_NEXT_PHASE',
        confidence: null,
        risk: null,
        estimatedCost: mission.estimatedCost ?? null,
        expectedValue: null,
        urgency: null,
        age: ageInDays(mission.startedDate),
        blockingIssues: [],
        requiredCeoAction: 'REVIEW_AND_DECIDE',
        sourceReportPath: 'review/website-executive-review-package-v1-report.json',
        metadata: {
          missionId: mission.missionId,
          missionType: mission.missionType
        }
      }));

    const decisionItems = [...proposalItems, ...missionReviewItems]
      .sort((a, b) => Number(b.urgency ?? 0) - Number(a.urgency ?? 0));

    return {
      totalItems: decisionItems.length,
      items: decisionItems
    };
  }
}
