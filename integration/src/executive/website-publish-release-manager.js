import {
  createWebsitePublishReleaseRecord,
  validateWebsitePublishReleaseRecord,
  WebsitePublishChecklistItems,
  WebsitePublishReleaseStatuses,
  canTransitionReleaseStatus
} from './website-publish-release-contracts.js';
import {
  appendEvent,
  getMetaMap,
  loadRecordMap,
  setMetaValue,
  upsertRecord
} from '../storage/provider-backed-state.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function toText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function redact(value) {
  if (value == null) return null;
  const text = String(value);
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}***${text.slice(-2)}`;
}

function toIsoMs(value) {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeAuditPayload(payload = {}) {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeAuditPayload(item));
  }

  if (!isObject(payload)) {
    if (typeof payload === 'string' && payload.length > 200) {
      return `${payload.slice(0, 80)}...`;
    }
    return payload;
  }

  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = String(key).toLowerCase();
    if (lower.includes('apikey') || lower.includes('api_key') || lower.includes('token')
      || lower.includes('secret') || lower.includes('authorization') || lower.includes('password')) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = sanitizeAuditPayload(value);
  }
  return out;
}

function validateCeoApprovalForRelease({ release, approval, approvalId, nowMs, maxAgeMs }) {
  if (!release) {
    return { ok: false, code: 'INVALID_RELEASE', reason: 'Release is required for CEO approval validation.' };
  }

  if (!approvalId || !approval || approval.approved !== true) {
    return { ok: false, code: 'CEO_APPROVAL_MISSING', reason: 'CEO publish approval is missing.' };
  }

  if (approval.releaseId !== release.releaseId) {
    return { ok: false, code: 'CEO_APPROVAL_MISMATCH', reason: 'CEO publish approval does not match release.' };
  }

  if (approval.missionId !== release.missionId) {
    return { ok: false, code: 'CEO_APPROVAL_MISMATCH', reason: 'CEO publish approval does not match mission.' };
  }

  if (toText(approval.businessId) && toText(release.businessId) && approval.businessId !== release.businessId) {
    return { ok: false, code: 'CEO_APPROVAL_CROSS_BUSINESS', reason: 'CEO publish approval business mismatch.' };
  }

  if (toText(approval.projectId) && toText(release.projectId) && approval.projectId !== release.projectId) {
    return { ok: false, code: 'CEO_APPROVAL_MISMATCH', reason: 'CEO publish approval project mismatch.' };
  }

  if (toText(approval.websiteBuildReference) && toText(release.websiteBuildReference)
    && approval.websiteBuildReference !== release.websiteBuildReference) {
    return { ok: false, code: 'CEO_APPROVAL_BUILD_MISMATCH', reason: 'CEO publish approval build mismatch.' };
  }

  if (toText(approval.artifactReference) && toText(release.artifactReference)
    && approval.artifactReference !== release.artifactReference) {
    return { ok: false, code: 'CEO_APPROVAL_BUILD_MISMATCH', reason: 'CEO publish approval artifact mismatch.' };
  }

  if (release.ceoApprovalReference !== approval.approvalReference) {
    return { ok: false, code: 'CEO_APPROVAL_REVOKED', reason: 'CEO publish approval reference is no longer active.' };
  }

  const approvedAtMs = toIsoMs(approval.approvedAt);
  if (!approvedAtMs) {
    return { ok: false, code: 'CEO_APPROVAL_INVALID', reason: 'CEO publish approval timestamp is invalid.' };
  }

  if (approvedAtMs < toIsoMs(release.createdAt)) {
    return { ok: false, code: 'CEO_APPROVAL_STALE', reason: 'CEO publish approval predates release creation.' };
  }

  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0 && nowMs - approvedAtMs > maxAgeMs) {
    return { ok: false, code: 'CEO_APPROVAL_STALE', reason: 'CEO publish approval is stale.' };
  }

  return { ok: true, approval };
}

function normalizeChecklistEntries(entries = []) {
  const byId = new Map();
  const now = new Date().toISOString();

  WebsitePublishChecklistItems.forEach((itemId) => {
    byId.set(itemId, {
      itemId,
      status: 'PENDING',
      completedAt: null,
      completedBy: null,
      note: null,
      updatedAt: now
    });
  });

  for (const raw of Array.isArray(entries) ? entries : []) {
    const itemId = toText(raw?.itemId);
    if (!itemId || !byId.has(itemId)) continue;

    const status = String(raw?.status ?? 'PENDING').toUpperCase();
    byId.set(itemId, {
      itemId,
      status: status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      completedAt: status === 'COMPLETED' ? (raw?.completedAt ?? now) : null,
      completedBy: status === 'COMPLETED' ? toText(raw?.completedBy) : null,
      note: toText(raw?.note),
      updatedAt: raw?.updatedAt ?? now
    });
  }

  return Array.from(byId.values());
}

function evaluateEligibility({ release, checklist, customerApproval, ceoApproval }) {
  const reasons = [];

  if (!release) {
    reasons.push('Release is required.');
    return { eligible: false, reasons };
  }

  if (!release.paymentReference) reasons.push('Payment reference is missing.');
  if (!release.websiteBuildReference) reasons.push('Website build reference is missing.');
  if (!release.artifactReference) reasons.push('Artifact reference is missing.');
  if (!release.rollbackReference) reasons.push('Rollback reference is missing.');
  if (!release.qaReference) reasons.push('QA reference is missing.');

  if (!customerApproval || customerApproval.approved !== true) {
    reasons.push('Customer go-live approval is missing.');
  }

  if (!ceoApproval || ceoApproval.approved !== true) {
    reasons.push('CEO publish approval is missing.');
  }

  const incompleteChecklist = checklist.filter((item) => item.status !== 'COMPLETED').map((item) => item.itemId);
  if (incompleteChecklist.length > 0) {
    reasons.push(`Checklist incomplete: ${incompleteChecklist.join(', ')}`);
  }

  return {
    eligible: reasons.length === 0,
    reasons
  };
}

export class WebsitePublishReleaseManager {
  constructor({
    missionControl,
    websiteProductionManager,
    customerPortalManager,
    planningSystem,
    executivePlanningSystem,
    providerAdapterRegistry,
    storageProvider,
    namespace = 'executive.website-publish-release-manager',
    ceoApprovalMaxAgeMs = 24 * 60 * 60 * 1000,
    now,
    logger
  } = {}) {
    this.missionControl = missionControl ?? null;
    this.websiteProductionManager = websiteProductionManager ?? null;
    this.customerPortalManager = customerPortalManager ?? null;
    this.planningSystem = planningSystem ?? executivePlanningSystem ?? null;
    this.providerAdapterRegistry = providerAdapterRegistry ?? null;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.ceoApprovalMaxAgeMs = Number(ceoApprovalMaxAgeMs);
    this.now = now;
    this.logger = logger ?? { log: () => {} };

    this.releases = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.releases` });
    this.customerApprovals = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.customer-approvals` });
    this.ceoApprovals = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.ceo-approvals` });
    this.checklists = loadRecordMap({ provider: this.storageProvider, namespace: `${this.namespace}.checklists` });
    this.idempotency = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.idempotency` });
  }

  persistRelease(release) {
    this.releases.set(release.releaseId, release);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.releases`, key: release.releaseId, value: release });
    return release;
  }

  persistCustomerApproval(approvalId, approval) {
    this.customerApprovals.set(approvalId, approval);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.customer-approvals`, key: approvalId, value: approval });
    return approval;
  }

  persistCeoApproval(approvalId, approval) {
    this.ceoApprovals.set(approvalId, approval);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.ceo-approvals`, key: approvalId, value: approval });
    return approval;
  }

  persistChecklist(releaseId, checklist) {
    this.checklists.set(releaseId, checklist);
    upsertRecord({ provider: this.storageProvider, namespace: `${this.namespace}.checklists`, key: releaseId, value: checklist });
    return checklist;
  }

  appendAudit(type, payload = {}) {
    const timestamp = nowIso(this.now);
    appendEvent({
      provider: this.storageProvider,
      namespace: `${this.namespace}.audit`,
      key: `${timestamp}:${type}:${toText(payload.releaseId) ?? 'none'}`,
      value: {
        type,
        timestamp,
        ...sanitizeAuditPayload(payload)
      }
    });
  }

  writeIdempotency(key, value) {
    this.idempotency.set(key, value);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.idempotency`, key, value });
  }

  findReleaseByMissionId(missionId) {
    const normalizedMissionId = toText(missionId);
    if (!normalizedMissionId) return null;

    for (const release of this.releases.values()) {
      if (release.missionId === normalizedMissionId) return release;
    }

    return null;
  }

  getReleaseById(releaseId) {
    return this.releases.get(String(releaseId ?? '')) ?? null;
  }

  listReleases() {
    return Array.from(this.releases.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  createRelease(input = {}) {
    const release = createWebsitePublishReleaseRecord(input, { now: this.now });
    const validation = validateWebsitePublishReleaseRecord(release);

    if (!validation.isValid) {
      return {
        accepted: false,
        code: 'INVALID_RELEASE',
        reason: validation.issues.join(' | '),
        status: 400
      };
    }

    this.persistRelease(release);
    this.persistChecklist(release.releaseId, normalizeChecklistEntries(input?.checklist?.items ?? []));
    this.appendAudit('WEBSITE_PUBLISH_RELEASE_CREATED', {
      releaseId: release.releaseId,
      missionId: release.missionId,
      customerId: release.customerId,
      projectId: release.projectId
    });

    return {
      accepted: true,
      status: 201,
      data: {
        release,
        checklist: this.checklists.get(release.releaseId)
      }
    };
  }

  moveReleaseStatus({ releaseId, toStatus, actor = 'SYSTEM', reason = null } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    const targetStatus = String(toStatus ?? '').toUpperCase();
    if (!canTransitionReleaseStatus(release.status, targetStatus)) {
      return {
        accepted: false,
        code: 'INVALID_TRANSITION',
        reason: `Invalid transition from ${release.status} to ${targetStatus}.`,
        status: 409
      };
    }

    const updated = {
      ...release,
      status: targetStatus,
      publishedAt: targetStatus === WebsitePublishReleaseStatuses.PUBLISHED ? nowIso(this.now) : release.publishedAt,
      history: [
        ...(release.history ?? []),
        {
          event: 'RELEASE_STATUS_UPDATED',
          fromStatus: release.status,
          toStatus: targetStatus,
          actor,
          timestamp: nowIso(this.now),
          reason: reason ?? 'status_update'
        }
      ]
    };

    this.persistRelease(updated);
    this.appendAudit('WEBSITE_PUBLISH_RELEASE_STATUS_UPDATED', {
      releaseId: updated.releaseId,
      fromStatus: release.status,
      toStatus: updated.status,
      actor,
      reason
    });

    return {
      accepted: true,
      status: 200,
      data: updated
    };
  }

  recordCustomerGoLiveApproval({ releaseId, projectId, customerId, approvedBy, approved = true, approvalReference = null } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    if (release.projectId !== toText(projectId) || release.customerId !== toText(customerId)) {
      return { accepted: false, code: 'FORBIDDEN', reason: 'Approval does not match release ownership.', status: 403 };
    }

    const approvalId = `cga_${release.releaseId}`;
    const approval = {
      approvalId,
      releaseId: release.releaseId,
      projectId: release.projectId,
      customerId: release.customerId,
      approved: approved === true,
      approvedBy: toText(approvedBy),
      approvalReference: approvalReference ?? `customer_go_live_${release.releaseId}`,
      approvedAt: nowIso(this.now)
    };

    this.persistCustomerApproval(approvalId, approval);

    let updated = {
      ...release,
      approvals: {
        ...(release.approvals ?? {}),
        customerGoLiveApprovalId: approval.approved ? approvalId : null
      },
      customerApprovalReference: approval.approved ? approval.approvalReference : null
    };

    this.persistRelease(updated);

    if (approval.approved && updated.status === WebsitePublishReleaseStatuses.DRAFT) {
      const moved = this.moveReleaseStatus({
        releaseId: updated.releaseId,
        toStatus: WebsitePublishReleaseStatuses.READY_FOR_APPROVAL,
        actor: approval.approvedBy ?? 'CUSTOMER',
        reason: 'customer_go_live_approved'
      });
      if (moved.accepted) {
        updated = moved.data;
      }
    }

    if (!approval.approved && updated.status === WebsitePublishReleaseStatuses.APPROVED) {
      const moved = this.moveReleaseStatus({
        releaseId: updated.releaseId,
        toStatus: WebsitePublishReleaseStatuses.READY_FOR_APPROVAL,
        actor: approval.approvedBy ?? 'CUSTOMER',
        reason: 'customer_go_live_revoked'
      });
      if (moved.accepted) {
        updated = moved.data;
      }
    }

    this.appendAudit('WEBSITE_PUBLISH_CUSTOMER_GO_LIVE_APPROVED', {
      releaseId: release.releaseId,
      projectId: release.projectId,
      customerId: release.customerId,
      approvedBy: approval.approvedBy,
      approved: approval.approved
    });

    return { accepted: true, status: 200, data: approval };
  }

  recordCeoPublishApproval({ releaseId, approvedBy, approved = true, approvalReference = null } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    const approvalId = `cpa_${release.releaseId}`;
    const approval = {
      approvalId,
      releaseId: release.releaseId,
      missionId: release.missionId,
      customerId: release.customerId,
      projectId: release.projectId,
      businessId: release.businessId,
      websiteBuildReference: release.websiteBuildReference,
      artifactReference: release.artifactReference,
      deploymentTarget: release.deploymentTarget,
      approved: approved === true,
      approvedBy: toText(approvedBy),
      approvalReference: approvalReference ?? `ceo_publish_${release.releaseId}`,
      approvedAt: nowIso(this.now)
    };

    this.persistCeoApproval(approvalId, approval);

    let updated = {
      ...release,
      approvals: {
        ...(release.approvals ?? {}),
        ceoPublishApprovalId: approval.approved ? approvalId : null
      },
      ceoApprovalReference: approval.approved ? approval.approvalReference : null
    };

    this.persistRelease(updated);

    if (approval.approved) {
      if (updated.status === WebsitePublishReleaseStatuses.DRAFT) {
        const toReady = this.moveReleaseStatus({
          releaseId: updated.releaseId,
          toStatus: WebsitePublishReleaseStatuses.READY_FOR_APPROVAL,
          actor: approval.approvedBy ?? 'CEO',
          reason: 'ceo_publish_approved'
        });
        if (toReady.accepted) {
          updated = toReady.data;
        }
      }

      const hasCustomerApproval = Boolean(updated?.approvals?.customerGoLiveApprovalId);
      if (hasCustomerApproval && updated.status === WebsitePublishReleaseStatuses.READY_FOR_APPROVAL) {
        const toApproved = this.moveReleaseStatus({
          releaseId: updated.releaseId,
          toStatus: WebsitePublishReleaseStatuses.APPROVED,
          actor: approval.approvedBy ?? 'CEO',
          reason: 'ceo_publish_approved'
        });
        if (toApproved.accepted) {
          updated = toApproved.data;
        }
      }
    }

    if (!approval.approved && updated.status === WebsitePublishReleaseStatuses.APPROVED) {
      const moved = this.moveReleaseStatus({
        releaseId: updated.releaseId,
        toStatus: WebsitePublishReleaseStatuses.READY_FOR_APPROVAL,
        actor: approval.approvedBy ?? 'CEO',
        reason: 'ceo_publish_revoked'
      });
      if (moved.accepted) {
        updated = moved.data;
      }
    }

    this.appendAudit('WEBSITE_PUBLISH_CEO_APPROVED', {
      releaseId: release.releaseId,
      missionId: release.missionId,
      approvedBy: approval.approvedBy,
      approved: approval.approved
    });

    return { accepted: true, status: 200, data: approval };
  }

  saveChecklist({ releaseId, items = [], updatedBy = 'SYSTEM' } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    const normalized = normalizeChecklistEntries(items).map((item) => ({
      ...item,
      updatedAt: nowIso(this.now),
      completedBy: item.status === 'COMPLETED' ? (item.completedBy ?? updatedBy) : null,
      completedAt: item.status === 'COMPLETED' ? (item.completedAt ?? nowIso(this.now)) : null
    }));

    this.persistChecklist(releaseId, normalized);
    this.appendAudit('WEBSITE_PUBLISH_CHECKLIST_UPDATED', {
      releaseId,
      updatedBy,
      completedItems: normalized.filter((item) => item.status === 'COMPLETED').length,
      totalItems: normalized.length
    });

    return {
      accepted: true,
      status: 200,
      data: normalized
    };
  }

  getChecklist(releaseId) {
    return this.checklists.get(String(releaseId ?? '')) ?? normalizeChecklistEntries([]);
  }

  evaluateReleaseEligibility({ releaseId } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    const customerApprovalId = release?.approvals?.customerGoLiveApprovalId;
    const ceoApprovalId = release?.approvals?.ceoPublishApprovalId;

    const result = evaluateEligibility({
      release,
      checklist: this.getChecklist(releaseId),
      customerApproval: customerApprovalId ? this.customerApprovals.get(customerApprovalId) : null,
      ceoApproval: ceoApprovalId ? this.ceoApprovals.get(ceoApprovalId) : null
    });

    this.appendAudit('WEBSITE_PUBLISH_ELIGIBILITY_EVALUATED', {
      releaseId,
      eligible: result.eligible,
      reasons: result.reasons
    });

    return {
      accepted: true,
      status: 200,
      data: {
        releaseId,
        eligible: result.eligible,
        reasons: result.reasons
      }
    };
  }

  async executePublish({ releaseId, idempotencyKey, requestedBy = 'SYSTEM' } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    const idem = toText(idempotencyKey);
    if (!idem || idem.length < 8) {
      return { accepted: false, code: 'INVALID_REQUEST', reason: 'idempotencyKey must be at least 8 characters.', status: 400 };
    }

    const idemKey = `${releaseId}:publish:${idem}`;
    if (this.idempotency.has(idemKey)) {
      return {
        accepted: true,
        status: 200,
        code: 'IDEMPOTENT_REPLAY',
        data: this.idempotency.get(idemKey)
      };
    }

    if (release.status !== WebsitePublishReleaseStatuses.APPROVED) {
      return {
        accepted: false,
        status: 409,
        code: 'INVALID_RELEASE_STATE',
        reason: `Release must be in APPROVED state before publishing. Current state: ${release.status}.`
      };
    }

    const eligibility = this.evaluateReleaseEligibility({ releaseId });
    if (!eligibility.accepted) return eligibility;
    if (eligibility.data.eligible !== true) {
      return {
        accepted: false,
        status: 409,
        code: 'INELIGIBLE_RELEASE',
        reason: eligibility.data.reasons.join(' | '),
        data: eligibility.data
      };
    }

    const ceoApprovalId = release?.approvals?.ceoPublishApprovalId;
    const ceoApproval = ceoApprovalId ? this.ceoApprovals.get(ceoApprovalId) : null;
    const ceoValidation = validateCeoApprovalForRelease({
      release,
      approval: ceoApproval,
      approvalId: ceoApprovalId,
      nowMs: Date.now(),
      maxAgeMs: this.ceoApprovalMaxAgeMs
    });

    if (!ceoValidation.ok) {
      return {
        accepted: false,
        status: 409,
        code: ceoValidation.code,
        reason: ceoValidation.reason
      };
    }

    const movePublishing = this.moveReleaseStatus({
      releaseId,
      toStatus: WebsitePublishReleaseStatuses.PUBLISHING,
      actor: requestedBy,
      reason: 'publish_started'
    });

    if (!movePublishing.accepted) return movePublishing;

    const adapter = this.providerAdapterRegistry?.getAdapter?.(release.targetProvider);
    if (!adapter || typeof adapter.publishWebsite !== 'function') {
      return {
        accepted: false,
        status: 500,
        code: 'ADAPTER_UNAVAILABLE',
        reason: `No publish adapter available for ${release.targetProvider}.`
      };
    }

    try {
      const publishResult = await adapter.publishWebsite({
        generatedWebsite: {
          websiteId: release.websiteBuildReference,
          artifactReference: release.artifactReference,
          deploymentTarget: release.deploymentTarget
        },
        ceoApproved: true,
        approvalContext: {
          approvalId: ceoApproval.approvalId,
          approvalReference: ceoApproval.approvalReference,
          approvedBy: ceoApproval.approvedBy,
          approvedAt: ceoApproval.approvedAt,
          releaseId: release.releaseId,
          missionId: release.missionId,
          projectId: release.projectId,
          businessId: release.businessId,
          websiteBuildReference: release.websiteBuildReference
        }
      });

      const verification = {
        verified: Boolean(publishResult?.publishedUrl || publishResult?.status === 'PUBLISHED'),
        verifiedAt: nowIso(this.now),
        checks: {
          publishedUrlPresent: Boolean(publishResult?.publishedUrl),
          providerStatusPublished: String(publishResult?.status ?? '').toUpperCase() === 'PUBLISHED'
        }
      };

      if (!verification.verified) {
        this.moveReleaseStatus({
          releaseId,
          toStatus: WebsitePublishReleaseStatuses.FAILED,
          actor: requestedBy,
          reason: 'publish_verification_failed'
        });

        return {
          accepted: false,
          status: 502,
          code: 'PUBLISH_VERIFICATION_FAILED',
          reason: 'Publish result did not pass verification checks.',
          data: verification
        };
      }

      const current = this.getReleaseById(releaseId);
      const updated = {
        ...current,
        providerDeploymentReference: publishResult?.websiteId ?? null,
        liveUrl: publishResult?.publishedUrl ?? null,
        verification
      };
      this.persistRelease(updated);

      const published = this.moveReleaseStatus({
        releaseId,
        toStatus: WebsitePublishReleaseStatuses.PUBLISHED,
        actor: requestedBy,
        reason: 'publish_completed'
      });

      if (!published.accepted) return published;

      const response = {
        releaseId,
        status: published.data.status,
        publishedAt: published.data.publishedAt,
        liveUrl: updated.liveUrl,
        verification,
        provider: release.targetProvider
      };

      this.writeIdempotency(idemKey, response);
      this.appendAudit('WEBSITE_PUBLISH_EXECUTED', {
        releaseId,
        requestedBy,
        liveUrl: response.liveUrl,
        providerDeploymentReference: redact(updated.providerDeploymentReference)
      });

      return {
        accepted: true,
        status: 200,
        data: response
      };
    } catch (error) {
      this.moveReleaseStatus({
        releaseId,
        toStatus: WebsitePublishReleaseStatuses.FAILED,
        actor: requestedBy,
        reason: 'publish_failed'
      });

      return {
        accepted: false,
        status: 502,
        code: 'PUBLISH_FAILED',
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async executeRollback({
    releaseId,
    requestedBy = 'SYSTEM',
    reason = 'rollback_requested',
    rollbackReference = null,
    idempotencyKey = null
  } = {}) {
    const release = this.getReleaseById(releaseId);
    if (!release) {
      return { accepted: false, code: 'NOT_FOUND', reason: 'Release not found.', status: 404 };
    }

    const idem = toText(idempotencyKey) ?? 'rollback-default';
    const rollbackIdemKey = `${releaseId}:rollback:${idem}`;
    if (this.idempotency.has(rollbackIdemKey)) {
      return {
        accepted: true,
        status: 200,
        code: 'IDEMPOTENT_REPLAY',
        data: this.idempotency.get(rollbackIdemKey)
      };
    }

    const targetRollbackReference = toText(rollbackReference) ?? toText(release.rollbackReference);

    if (!targetRollbackReference) {
      return {
        accepted: false,
        code: 'INVALID_RELEASE',
        reason: 'Rollback reference is required.',
        status: 409
      };
    }

    if (release.status === WebsitePublishReleaseStatuses.ROLLED_BACK) {
      if (targetRollbackReference !== toText(release.rollbackReference)) {
        return {
          accepted: false,
          code: 'CONFLICTING_ROLLBACK_REQUEST',
          reason: 'Rollback target conflicts with persisted rollback reference.',
          status: 409
        };
      }

      return {
        accepted: false,
        code: 'ALREADY_ROLLED_BACK',
        reason: 'Release already rolled back. Use original idempotency key for replay.',
        status: 409
      };
    }

    if (![WebsitePublishReleaseStatuses.PUBLISHED, WebsitePublishReleaseStatuses.FAILED, WebsitePublishReleaseStatuses.PUBLISHING].includes(release.status)) {
      return {
        accepted: false,
        code: 'INVALID_TRANSITION',
        reason: `Rollback not allowed from status ${release.status}.`,
        status: 409
      };
    }

    const adapter = this.providerAdapterRegistry?.getAdapter?.(release.targetProvider);
    if (!adapter || typeof adapter.restoreWebsite !== 'function') {
      return {
        accepted: false,
        code: 'ADAPTER_UNAVAILABLE',
        reason: `Provider ${release.targetProvider} does not support rollback/restore.`,
        status: 500
      };
    }

    let restoreResult;
    try {
      restoreResult = await adapter.restoreWebsite({
        rollbackReference: targetRollbackReference,
        release,
        requestedBy,
        reason
      });
    } catch (error) {
      const restoreReason = error instanceof Error ? error.message : String(error);
      this.appendAudit('WEBSITE_PUBLISH_ROLLBACK_FAILED', {
        releaseId,
        requestedBy,
        reason,
        rollbackReference: redact(targetRollbackReference),
        restoreReason
      });
      return {
        accepted: false,
        code: 'ROLLBACK_RESTORE_FAILED',
        reason: restoreReason,
        status: 502
      };
    }

    const restored = restoreResult?.restored === true || String(restoreResult?.status ?? '').toUpperCase() === 'RESTORED';
    const restoredReference = toText(restoreResult?.restoredReference) ?? targetRollbackReference;
    const rollbackVerification = {
      providerRestoreSucceeded: restored,
      restoredReferenceMatchesRequested: restoredReference === targetRollbackReference,
      liveUrlPresent: Boolean(toText(restoreResult?.liveUrl) ?? toText(release.liveUrl))
    };

    if (!rollbackVerification.providerRestoreSucceeded || !rollbackVerification.restoredReferenceMatchesRequested) {
      this.appendAudit('WEBSITE_PUBLISH_ROLLBACK_FAILED', {
        releaseId,
        requestedBy,
        reason,
        rollbackReference: redact(targetRollbackReference),
        verification: rollbackVerification
      });
      return {
        accepted: false,
        code: 'ROLLBACK_VERIFICATION_FAILED',
        reason: 'Rollback restore verification failed.',
        status: 502,
        data: rollbackVerification
      };
    }

    const moved = this.moveReleaseStatus({
      releaseId,
      toStatus: WebsitePublishReleaseStatuses.ROLLED_BACK,
      actor: requestedBy,
      reason
    });

    if (!moved.accepted) return moved;

    const updatedRelease = {
      ...moved.data,
      rollbackReference: release.rollbackReference,
      rollbackResult: {
        restoredReference: targetRollbackReference,
        liveUrl: toText(restoreResult?.liveUrl) ?? toText(release.liveUrl),
        restoredAt: nowIso(this.now),
        verification: rollbackVerification
      }
    };
    this.persistRelease(updatedRelease);

    this.appendAudit('WEBSITE_PUBLISH_ROLLBACK_EXECUTED', {
      releaseId,
      requestedBy,
      reason,
      rollbackReference: redact(targetRollbackReference),
      verification: rollbackVerification
    });

    const response = {
      releaseId,
      status: updatedRelease.status,
      rollbackReference: targetRollbackReference,
      rolledBackAt: nowIso(this.now),
      verification: rollbackVerification
    };

    this.writeIdempotency(rollbackIdemKey, response);

    return {
      accepted: true,
      status: 200,
      data: response
    };
  }

  getDashboardProjection() {
    const releases = this.listReleases();
    const published = releases.filter((release) => release.status === WebsitePublishReleaseStatuses.PUBLISHED).length;
    const failed = releases.filter((release) => release.status === WebsitePublishReleaseStatuses.FAILED).length;
    const rolledBack = releases.filter((release) => release.status === WebsitePublishReleaseStatuses.ROLLED_BACK).length;

    return {
      generatedAt: nowIso(this.now),
      releaseSummary: {
        total: releases.length,
        published,
        failed,
        rolledBack,
        awaitingApproval: releases.filter((release) => release.status === WebsitePublishReleaseStatuses.READY_FOR_APPROVAL).length
      },
      releases: releases.map((release) => {
        const checklist = this.getChecklist(release.releaseId);
        const completed = checklist.filter((item) => item.status === 'COMPLETED').length;
        return {
          releaseId: release.releaseId,
          missionId: release.missionId,
          projectId: release.projectId,
          status: release.status,
          createdAt: release.createdAt,
          publishedAt: release.publishedAt,
          liveUrl: release.liveUrl,
          targetProvider: release.targetProvider,
          deploymentTarget: release.deploymentTarget,
          approvals: {
            customerGoLiveApprovalId: release?.approvals?.customerGoLiveApprovalId ?? null,
            ceoPublishApprovalId: release?.approvals?.ceoPublishApprovalId ?? null
          },
          checklistProgress: {
            completed,
            total: checklist.length
          }
        };
      })
    };
  }
}
