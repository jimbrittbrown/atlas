const CEO_ACTIONS = new Set([
  'APPROVE',
  'APPROVE_WITH_WAIVERS',
  'RETURN_FOR_REVISION',
  'REJECT'
]);

export function createExecutiveDecisionPacket({
  missionId,
  businessId,
  releaseCandidateId,
  overallRecommendation,
  confidence,
  conflicts = [],
  waivers = [],
  highestRisks = [],
  recommendedCEOAction,
  evidenceReferences = [],
  recommendationContracts = []
} = {}) {
  return {
    missionId,
    businessId,
    releaseCandidateId,
    overallRecommendation,
    confidence,
    conflicts: Array.isArray(conflicts) ? [...conflicts] : [],
    waivers: Array.isArray(waivers) ? [...waivers] : [],
    highestRisks: Array.isArray(highestRisks) ? [...highestRisks] : [],
    recommendedCEOAction,
    evidenceReferences: Array.isArray(evidenceReferences) ? [...evidenceReferences] : [],
    recommendationContracts: Array.isArray(recommendationContracts) ? [...recommendationContracts] : []
  };
}

export function validateExecutiveDecisionPacket(packet = {}) {
  const issues = [];

  if (!isNonEmptyString(packet.missionId)) {
    issues.push({ field: 'missionId', issue: 'MISSING_MISSION_ID' });
  }

  if (!isNonEmptyString(packet.businessId)) {
    issues.push({ field: 'businessId', issue: 'MISSING_BUSINESS_ID' });
  }

  if (!isNonEmptyString(packet.releaseCandidateId)) {
    issues.push({ field: 'releaseCandidateId', issue: 'MISSING_RELEASE_CANDIDATE_ID' });
  }

  if (!isNonEmptyString(packet.overallRecommendation)) {
    issues.push({ field: 'overallRecommendation', issue: 'MISSING_RECOMMENDATION' });
  }

  if (!Number.isFinite(Number(packet.confidence))) {
    issues.push({ field: 'confidence', issue: 'INVALID_CONFIDENCE' });
  }

  if (!CEO_ACTIONS.has(String(packet.recommendedCEOAction))) {
    issues.push({ field: 'recommendedCEOAction', issue: 'INVALID_CEO_ACTION' });
  }

  if (!Array.isArray(packet.recommendationContracts) || packet.recommendationContracts.length === 0) {
    issues.push({ field: 'recommendationContracts', issue: 'MISSING_RECOMMENDATION_CONTRACTS' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
