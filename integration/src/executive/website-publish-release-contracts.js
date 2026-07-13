import { randomUUID } from 'node:crypto';

export const WebsitePublishReleaseStatuses = Object.freeze({
  DRAFT: 'DRAFT',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
  CANCELLED: 'CANCELLED'
});

export const WebsitePublishReleaseTransitionMap = Object.freeze({
  [WebsitePublishReleaseStatuses.DRAFT]: [
    WebsitePublishReleaseStatuses.READY_FOR_APPROVAL,
    WebsitePublishReleaseStatuses.CANCELLED
  ],
  [WebsitePublishReleaseStatuses.READY_FOR_APPROVAL]: [
    WebsitePublishReleaseStatuses.APPROVED,
    WebsitePublishReleaseStatuses.CANCELLED
  ],
  [WebsitePublishReleaseStatuses.APPROVED]: [
    WebsitePublishReleaseStatuses.PUBLISHING,
    WebsitePublishReleaseStatuses.CANCELLED
  ],
  [WebsitePublishReleaseStatuses.PUBLISHING]: [
    WebsitePublishReleaseStatuses.PUBLISHED,
    WebsitePublishReleaseStatuses.FAILED,
    WebsitePublishReleaseStatuses.ROLLED_BACK
  ],
  [WebsitePublishReleaseStatuses.PUBLISHED]: [
    WebsitePublishReleaseStatuses.ROLLED_BACK
  ],
  [WebsitePublishReleaseStatuses.FAILED]: [
    WebsitePublishReleaseStatuses.PUBLISHING,
    WebsitePublishReleaseStatuses.ROLLED_BACK,
    WebsitePublishReleaseStatuses.CANCELLED
  ],
  [WebsitePublishReleaseStatuses.ROLLED_BACK]: [],
  [WebsitePublishReleaseStatuses.CANCELLED]: []
});

export const WebsitePublishChecklistItems = Object.freeze([
  'payment_verified',
  'proposal_terms_verified',
  'customer_approval_verified',
  'ceo_approval_verified',
  'qa_passed',
  'mobile_check_passed',
  'contact_form_tested',
  'phone_links_tested',
  'domain_target_verified',
  'ssl_tls_expected_verified',
  'analytics_configuration_verified',
  'rollback_artifact_present'
]);

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function normalize(value) {
  return String(value ?? '').trim();
}

export function canTransitionReleaseStatus(fromStatus, toStatus) {
  return (WebsitePublishReleaseTransitionMap[fromStatus] ?? []).includes(toStatus);
}

export function createWebsitePublishReleaseRecord({
  releaseId,
  projectId,
  customerId,
  businessId,
  missionId,
  websiteBuildReference,
  artifactReference,
  targetProvider,
  deploymentTarget,
  customerApprovalReference,
  ceoApprovalReference,
  qaReference,
  paymentReference,
  releaseChecklistVersion = 'WS3_CHECKLIST_V1',
  rollbackReference,
  correlationId,
  createdBy = 'SYSTEM',
  status = WebsitePublishReleaseStatuses.DRAFT
} = {}, { now } = {}) {
  const createdAt = nowIso(now);

  return {
    releaseId: releaseId ?? `wrel_${randomUUID()}`,
    projectId: normalize(projectId) || null,
    customerId: normalize(customerId) || null,
    businessId: normalize(businessId) || null,
    missionId: normalize(missionId) || null,
    websiteBuildReference: websiteBuildReference ?? null,
    artifactReference: artifactReference ?? null,
    targetProvider: normalize(targetProvider) || null,
    deploymentTarget: normalize(deploymentTarget) || null,
    customerApprovalReference: customerApprovalReference ?? null,
    ceoApprovalReference: ceoApprovalReference ?? null,
    qaReference: qaReference ?? null,
    paymentReference: paymentReference ?? null,
    releaseChecklistVersion,
    createdAt,
    publishedAt: null,
    status,
    rollbackReference: rollbackReference ?? null,
    correlationId: normalize(correlationId) || `corr_${randomUUID()}`,
    providerDeploymentReference: null,
    liveUrl: null,
    verification: null,
    approvals: {
      customerGoLiveApprovalId: null,
      ceoPublishApprovalId: null
    },
    checklist: null,
    history: [
      {
        event: 'RELEASE_CREATED',
        fromStatus: null,
        toStatus: status,
        actor: createdBy,
        timestamp: createdAt,
        reason: 'release_created'
      }
    ]
  };
}

export function validateWebsitePublishReleaseRecord(release = {}) {
  const issues = [];

  if (!release.releaseId || normalize(release.releaseId).length === 0) issues.push('releaseId is required.');
  if (!release.projectId || normalize(release.projectId).length === 0) issues.push('projectId is required.');
  if (!release.customerId || normalize(release.customerId).length === 0) issues.push('customerId is required.');
  if (!release.businessId || normalize(release.businessId).length === 0) issues.push('businessId is required.');
  if (!release.missionId || normalize(release.missionId).length === 0) issues.push('missionId is required.');
  if (!release.websiteBuildReference) issues.push('websiteBuildReference is required.');
  if (!release.artifactReference) issues.push('artifactReference is required.');
  if (!release.targetProvider || normalize(release.targetProvider).length === 0) issues.push('targetProvider is required.');
  if (!release.deploymentTarget || normalize(release.deploymentTarget).length === 0) issues.push('deploymentTarget is required.');
  if (!release.qaReference) issues.push('qaReference is required.');
  if (!release.paymentReference) issues.push('paymentReference is required.');
  if (!release.releaseChecklistVersion || normalize(release.releaseChecklistVersion).length === 0) issues.push('releaseChecklistVersion is required.');
  if (!release.rollbackReference) issues.push('rollbackReference is required.');
  if (!release.correlationId || normalize(release.correlationId).length === 0) issues.push('correlationId is required.');

  const normalizedStatus = String(release.status ?? '').toUpperCase();
  if (!Object.values(WebsitePublishReleaseStatuses).includes(normalizedStatus)) {
    issues.push(`status must be one of: ${Object.values(WebsitePublishReleaseStatuses).join(', ')}.`);
  }

  if (!release.createdAt || Number.isNaN(Date.parse(String(release.createdAt)))) {
    issues.push('createdAt must be valid ISO timestamp.');
  }

  if (release.publishedAt != null && Number.isNaN(Date.parse(String(release.publishedAt)))) {
    issues.push('publishedAt must be valid ISO timestamp when present.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
