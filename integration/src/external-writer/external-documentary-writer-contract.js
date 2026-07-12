export function createExternalWriterInput({
  producerBrief = null,
  verifiedResearchPackage = null,
  editorialResearchBrief = '',
  storytellingPlan = null,
  narrativeBeats = [],
  goldStandard = '',
  targetAudience = '',
  targetRuntime = 0,
  documentaryVoice = '',
  factualRestrictions = [],
  titlePromise = '',
  endingObjective = ''
} = {}) {
  return {
    producerBrief,
    verifiedResearchPackage,
    editorialResearchBrief: String(editorialResearchBrief ?? '').trim(),
    storytellingPlan,
    narrativeBeats: Array.isArray(narrativeBeats) ? narrativeBeats : [],
    goldStandard: String(goldStandard ?? '').trim(),
    targetAudience: String(targetAudience ?? '').trim(),
    targetRuntime: Number(targetRuntime ?? 0),
    documentaryVoice: String(documentaryVoice ?? '').trim(),
    factualRestrictions: Array.isArray(factualRestrictions) ? factualRestrictions : [],
    titlePromise: String(titlePromise ?? '').trim(),
    endingObjective: String(endingObjective ?? '').trim()
  };
}

export function validateExternalWriterInput(input = {}) {
  const missing = [];

  if (!input.producerBrief || typeof input.producerBrief !== 'object') {
    missing.push('producerBrief');
  }

  if (!input.verifiedResearchPackage || typeof input.verifiedResearchPackage !== 'object') {
    missing.push('verifiedResearchPackage');
  }

  if (String(input.editorialResearchBrief ?? '').trim().length === 0) {
    missing.push('editorialResearchBrief');
  }

  if (!input.storytellingPlan || typeof input.storytellingPlan !== 'object') {
    missing.push('storytellingPlan');
  }

  if (!Array.isArray(input.narrativeBeats) || input.narrativeBeats.length === 0) {
    missing.push('narrativeBeats');
  }

  if (String(input.goldStandard ?? '').trim().length === 0) {
    missing.push('goldStandard');
  }

  if (String(input.targetAudience ?? '').trim().length === 0) {
    missing.push('targetAudience');
  }

  if (!Number.isFinite(Number(input.targetRuntime ?? NaN)) || Number(input.targetRuntime) <= 0) {
    missing.push('targetRuntime');
  }

  if (String(input.documentaryVoice ?? '').trim().length === 0) {
    missing.push('documentaryVoice');
  }

  if (String(input.titlePromise ?? '').trim().length === 0) {
    missing.push('titlePromise');
  }

  if (String(input.endingObjective ?? '').trim().length === 0) {
    missing.push('endingObjective');
  }

  return {
    isValid: missing.length === 0,
    missing
  };
}

export function createExternalWriterResult({
  providerIdentity = null,
  modelIdentity = null,
  screenplay = '',
  estimatedNarrationRuntime = null,
  factualClaims = [],
  providerWarnings = [],
  generationMetadata = {},
  usage = null
} = {}) {
  return {
    providerIdentity,
    modelIdentity,
    screenplay: String(screenplay ?? '').trim(),
    estimatedNarrationRuntime: estimatedNarrationRuntime ?? null,
    factualClaims: Array.isArray(factualClaims) ? factualClaims : [],
    providerWarnings: Array.isArray(providerWarnings) ? providerWarnings : [],
    generationMetadata: generationMetadata ?? {},
    usage: usage ?? null
  };
}

export function validateExternalWriterResult(result = {}) {
  const issues = [];

  if (String(result.providerIdentity ?? '').trim().length === 0) {
    issues.push('providerIdentity is required.');
  }

  if (String(result.modelIdentity ?? '').trim().length === 0) {
    issues.push('modelIdentity is required.');
  }

  if (String(result.screenplay ?? '').trim().length < 300) {
    issues.push('screenplay must be a complete audience-facing script.');
  }

  if (!Array.isArray(result.factualClaims)) {
    issues.push('factualClaims must be an array.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
