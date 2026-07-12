import { randomUUID } from 'node:crypto';

export const WebsiteProductionManagerStates = Object.freeze({
  WAITING_QA: 'WAITING_QA',
  RUNNING_QA: 'RUNNING_QA',
  AWAITING_CEO_APPROVAL: 'AWAITING_CEO_APPROVAL',
  FAILED: 'FAILED'
});

export const WebsiteProductionExecutionStages = Object.freeze({
  RECEIVE_SANDBOX_PROJECT: 'RECEIVE_SANDBOX_PROJECT',
  QUALITY_ASSURANCE: 'QUALITY_ASSURANCE',
  REVISION_CYCLE: 'REVISION_CYCLE',
  DELIVERY_PACKAGE: 'DELIVERY_PACKAGE',
  AWAIT_GOVERNANCE_APPROVAL: 'AWAIT_GOVERNANCE_APPROVAL'
});

export const WebsiteProductionQaChecks = Object.freeze([
  'REQUIRED_PAGE_VERIFICATION',
  'NAVIGATION_VERIFICATION',
  'BRANDING_CONSISTENCY',
  'RESPONSIVE_LAYOUT_VERIFICATION',
  'MISSING_ASSET_DETECTION',
  'BROKEN_COMPONENT_DETECTION',
  'SCREENSHOT_CAPTURE_TASK_GENERATION',
  'QA_SCORING'
]);

export function createWebsiteProductionReviewRequest({
  reviewId,
  missionId = null,
  sandboxProject = null,
  adapterType = 'FRAMER',
  requiredPages = [],
  requestedBy = 'ATLAS_WEBSITE_PRODUCTION_MANAGER_V1',
  timestamp = new Date().toISOString(),
  correlationId
} = {}) {
  return {
    reviewId: reviewId ?? `wpr_${randomUUID()}`,
    missionId,
    sandboxProject,
    adapterType,
    requiredPages,
    requestedBy,
    timestamp,
    correlationId: correlationId ?? `corr_${randomUUID()}`
  };
}

export function validateWebsiteProductionReviewRequest(request = {}) {
  const issues = [];

  if (!request.reviewId || String(request.reviewId).trim().length === 0) {
    issues.push('reviewId is required.');
  }

  if (!request.missionId && !request.sandboxProject) {
    issues.push('missionId or sandboxProject is required.');
  }

  if (!request.requestedBy || String(request.requestedBy).trim().length === 0) {
    issues.push('requestedBy is required.');
  }

  if (!request.timestamp || Number.isNaN(Date.parse(String(request.timestamp)))) {
    issues.push('timestamp must be a valid ISO timestamp.');
  }

  if (!request.correlationId || String(request.correlationId).trim().length === 0) {
    issues.push('correlationId is required.');
  }

  const adapterType = String(request.adapterType ?? '').toUpperCase();
  if (adapterType !== 'FRAMER') {
    issues.push('adapterType must be FRAMER for website production review v1.');
  }

  if (request.requiredPages != null && !Array.isArray(request.requiredPages)) {
    issues.push('requiredPages must be an array when provided.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
