import { decisionCenterResponseSchema, type CeoDecisionCenterResponse } from './ceo-decision-center-contracts';
import { buildDecisionCenterViewModel, type CeoDecisionCenterViewModel } from './ceo-decision-center-dashboard-model';

export function parseDecisionCenterPayload(payload: unknown): CeoDecisionCenterResponse {
  return decisionCenterResponseSchema.parse(payload);
}

export function buildDecisionCenterModel(payload: unknown): CeoDecisionCenterViewModel {
  const parsed = parseDecisionCenterPayload(payload);
  return buildDecisionCenterViewModel(parsed);
}
