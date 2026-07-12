export const QUALITY_REVIEW_VERSION = '1.0.0';

export class QualityReviewRequest {
  constructor(input = {}) {
    Object.assign(this, createQualityReviewRequest(input));
  }
}

export class QualityScore {
  constructor(input = {}) {
    Object.assign(this, createQualityScore(input));
  }
}

export class QualityIssue {
  constructor(input = {}) {
    Object.assign(this, createQualityIssue(input));
  }
}

export class QualityRecommendation {
  constructor(input = {}) {
    Object.assign(this, createQualityRecommendation(input));
  }
}

export class QualityReport {
  constructor(input = {}) {
    Object.assign(this, createQualityReport(input));
  }
}

export class QualityReviewResult {
  constructor(input = {}) {
    Object.assign(this, createQualityReviewResult(input));
  }
}

export function createQualityReviewRequest({
  requestId = null,
  missionId = null,
  businessId = null,
  mediaRenderResult = null,
  assets = {},
  context = {}
} = {}) {
  return {
    requestId,
    missionId,
    businessId,
    mediaRenderResult,
    assets: {
      voiceOutput: assets.voiceOutput ?? null,
      imageOutputs: Array.isArray(assets.imageOutputs) ? [...assets.imageOutputs] : [],
      videoOutput: assets.videoOutput ?? mediaRenderResult?.videoFile ?? null
    },
    context: {
      ...context
    }
  };
}

export function createQualityScore({
  category,
  score = 100,
  passed = true,
  issueCount = 0,
  maxSeverity = 'none'
} = {}) {
  return {
    category,
    score,
    passed,
    issueCount,
    maxSeverity
  };
}

export function createQualityIssue({
  issueId,
  code,
  category,
  severity = 'medium',
  message,
  details = {}
} = {}) {
  return {
    issueId,
    code,
    category,
    severity,
    message,
    details
  };
}

export function createQualityRecommendation({
  recommendationId,
  priority = 'medium',
  action,
  rationale,
  relatedIssueCodes = []
} = {}) {
  return {
    recommendationId,
    priority,
    action,
    rationale,
    relatedIssueCodes: Array.isArray(relatedIssueCodes) ? [...relatedIssueCodes] : []
  };
}

export function createQualityReport({
  reportId,
  generatedAt,
  overallScore,
  categoryScores = [],
  issues = [],
  recommendations = [],
  executiveSummary = '',
  diagnostics = {}
} = {}) {
  return {
    reportId,
    generatedAt,
    overallScore,
    categoryScores,
    issues,
    recommendations,
    executiveSummary,
    diagnostics
  };
}

export function createQualityReviewResult({
  requestId,
  missionId,
  businessId,
  status = 'COMPLETED',
  overallScore,
  categoryScores = [],
  issues = [],
  recommendations = [],
  reviewDecision = 'REVISE',
  qualityReport = null,
  executiveSummary = '',
  improvementRecommendations = []
} = {}) {
  return {
    requestId,
    missionId,
    businessId,
    status,
    overallScore,
    categoryScores,
    issues,
    recommendations,
    reviewDecision,
    qualityReport,
    executiveSummary,
    improvementRecommendations
  };
}
