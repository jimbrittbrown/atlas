const {
  AssetTypes,
  AssetLifecycleStates,
  AssetRegistryFutureHooks,
  normalizeAssetType,
  normalizeAssetLifecycleState,
  createAssetRecord,
  validateAssetRecord,
  createAssetHealth,
  createAssetSummary,
  cloneAsset,
  cloneMetadata
} = require('./asset-registry-contracts.js');

const LifecycleTransitions = Object.freeze({
  NEW: new Set([AssetLifecycleStates.GENERATED, AssetLifecycleStates.DELETED]),
  GENERATED: new Set([AssetLifecycleStates.VALIDATED, AssetLifecycleStates.DELETED]),
  VALIDATED: new Set([AssetLifecycleStates.APPROVED, AssetLifecycleStates.SUPERSEDED, AssetLifecycleStates.DELETED]),
  APPROVED: new Set([AssetLifecycleStates.PUBLISHED, AssetLifecycleStates.SUPERSEDED, AssetLifecycleStates.DELETED]),
  PUBLISHED: new Set([AssetLifecycleStates.ARCHIVED, AssetLifecycleStates.SUPERSEDED, AssetLifecycleStates.DELETED]),
  ARCHIVED: new Set([AssetLifecycleStates.SUPERSEDED, AssetLifecycleStates.DELETED]),
  SUPERSEDED: new Set([AssetLifecycleStates.DELETED]),
  DELETED: new Set([])
});

class AssetRegistry {
  constructor({ assets = [], now = () => Date.now() } = {}) {
    this.now = now;
    this.assets = new Map();
    this.history = new Map();
    this.childrenByParentId = new Map();
    this.sequence = 0;

    assets.forEach(asset => {
      this.registerAsset(asset);
    });
  }

  registerAsset(assetInput = {}) {
    const assetId = this.resolveAssetId(assetInput.assetId);

    if (this.assets.has(assetId)) {
      throw new Error(`Asset already registered: ${assetId}`);
    }

    const parentAssetIds = Array.isArray(assetInput.parentAssetIds)
      ? [...assetInput.parentAssetIds]
      : [];
    const parentAssetId = this.resolveParentAssetId(assetInput.parentAssetId ?? parentAssetIds[0] ?? null);
    const rootMissionId = this.resolveRootMissionId(assetInput.rootMissionId ?? assetInput.missionId ?? null, parentAssetId);
    const asset = this.decorateAsset(createAssetRecord({
      ...assetInput,
      assetId,
      parentAssetId,
      parentAssetIds,
      rootMissionId,
      createdAt: assetInput.createdAt ?? this.buildTimestamp(),
      version: assetInput.version ?? 1,
      status: assetInput.status ?? 'NEW',
      lifecycleStage: assetInput.lifecycleStage ?? assetInput.status ?? 'NEW'
    }));

    this.persistAsset(asset);
    return cloneAsset(asset);
  }

  validateAsset(assetInput = {}) {
    const normalized = this.decorateAsset(createAssetRecord({
      ...assetInput,
      assetId: this.resolveAssetId(assetInput.assetId ?? this.generateAssetId()),
      parentAssetId: this.resolveParentAssetId(assetInput.parentAssetId ?? assetInput.parentAssetIds?.[0] ?? null),
      parentAssetIds: Array.isArray(assetInput.parentAssetIds) ? assetInput.parentAssetIds : [],
      rootMissionId: assetInput.rootMissionId ?? assetInput.missionId ?? null,
      createdAt: assetInput.createdAt ?? this.buildTimestamp(),
      version: assetInput.version ?? 1,
      status: assetInput.status ?? 'NEW',
      lifecycleStage: assetInput.lifecycleStage ?? assetInput.status ?? 'NEW'
    }));

    return this.validateNormalizedAsset(normalized);
  }

  getAsset(assetId) {
    const normalized = this.resolveAssetId(assetId);
    const asset = this.assets.get(normalized);

    return asset ? cloneAsset(asset) : null;
  }

  listAssets() {
    return [...this.assets.values()]
      .map(asset => cloneAsset(asset))
      .sort((left, right) => {
        const timeDiff = Date.parse(left.createdAt) - Date.parse(right.createdAt);

        if (Number.isFinite(timeDiff) && timeDiff !== 0) {
          return timeDiff;
        }

        return left.assetId.localeCompare(right.assetId);
      });
  }

  updateAsset(assetId, updates = {}) {
    const normalizedId = this.resolveAssetId(assetId);
    const existing = this.assets.get(normalizedId);

    if (!existing) {
      return null;
    }

    const updated = this.decorateAsset(createAssetRecord({
      ...existing,
      ...updates,
      assetId: existing.assetId,
      version: existing.version + 1,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      rootMissionId: existing.rootMissionId,
      parentAssetId: existing.parentAssetId,
      parentAssetIds: existing.parentAssetIds,
      status: updates.status ?? existing.status,
      lifecycleStage: updates.lifecycleStage ?? updates.status ?? existing.lifecycleStage,
      metadata: {
        ...cloneMetadata(existing.metadata),
        ...(updates.metadata ?? {})
      },
      tags: Array.isArray(updates.tags) ? updates.tags : existing.tags
    }));

    this.persistAsset(updated);
    return cloneAsset(updated);
  }

  transitionAssetLifecycle(assetId, nextLifecycleStage, updates = {}) {
    const normalizedId = this.resolveAssetId(assetId);
    const existing = this.assets.get(normalizedId);

    if (!existing) {
      return null;
    }

    const targetStage = normalizeAssetLifecycleState(nextLifecycleStage);
    const allowed = LifecycleTransitions[existing.lifecycleStage] ?? new Set();

    if (!allowed.has(targetStage)) {
      throw new Error(`Invalid lifecycle transition: ${existing.lifecycleStage} -> ${targetStage}`);
    }

    return this.updateAsset(normalizedId, {
      ...updates,
      status: targetStage,
      lifecycleStage: targetStage
    });
  }

  resolveLineage(assetId) {
    const normalizedId = this.resolveAssetId(assetId);
    const lineage = [];
    const visited = new Set();
    let current = this.assets.get(normalizedId);

    while (current) {
      if (visited.has(current.assetId)) {
        break;
      }

      visited.add(current.assetId);
      lineage.unshift(cloneAsset(current));

      if (!current.parentAssetId) {
        break;
      }

      current = this.assets.get(current.parentAssetId);
    }

    return {
      assetId: normalizedId,
      rootMissionId: lineage[0]?.rootMissionId ?? null,
      lineage,
      lineageAssetIds: lineage.map(item => item.assetId),
      cycleDetected: false
    };
  }

  getVersionHistory(assetId) {
    const normalizedId = this.resolveAssetId(assetId);
    return (this.history.get(normalizedId) ?? []).map(item => cloneAsset(item));
  }

  getOrphanAssets() {
    return this.listAssets().filter(asset => asset.parentAssetId && !this.assets.has(asset.parentAssetId));
  }

  getFailedAssets() {
    return this.listAssets().filter(asset => {
      const validation = asset.metadata?.validation ?? null;
      const invalidLifecycle = asset.status === 'FAILED' || asset.lifecycleStage === AssetLifecycleStates.DELETED;

      return invalidLifecycle || validation?.isValid === false;
    });
  }

  getApprovedAssets() {
    return this.listAssets().filter(asset => (
      asset.lifecycleStage === AssetLifecycleStates.APPROVED
      || asset.lifecycleStage === AssetLifecycleStates.PUBLISHED
      || asset.status === 'APPROVED'
      || asset.status === 'PUBLISHED'
    ));
  }

  getAssetsAwaitingReview() {
    return this.listAssets().filter(asset => (
      asset.lifecycleStage === AssetLifecycleStates.NEW
      || asset.lifecycleStage === AssetLifecycleStates.GENERATED
      || asset.status === 'NEW'
      || asset.status === 'GENERATED'
    ));
  }

  getAssetsCreatedToday(now = this.buildTimestamp()) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startTime = startOfDay.getTime();

    return this.listAssets().filter(asset => Date.parse(asset.createdAt) >= startTime).length;
  }

  getAssetGrowth(now = this.buildTimestamp()) {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime());
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const createdToday = this.listAssets().filter(asset => Date.parse(asset.createdAt) >= startOfToday.getTime()).length;
    const createdYesterday = this.listAssets().filter(asset => {
      const createdAt = Date.parse(asset.createdAt);
      return createdAt >= startOfYesterday.getTime() && createdAt < startOfToday.getTime();
    }).length;

    return {
      totalAssets: this.assets.size,
      createdToday,
      createdYesterday,
      growthDelta: createdToday - createdYesterday
    };
  }

  getAssetStorageSummary() {
    const assets = this.listAssets();
    const byMimeType = {};
    const byStorageLocation = {};
    const byType = {};

    let totalBytes = 0;

    assets.forEach(asset => {
      totalBytes += Number(asset.sizeBytes ?? 0);
      const mimeType = asset.mimeType ?? 'unknown';
      const storageLocation = asset.storageLocation ?? 'unassigned';
      byMimeType[mimeType] = Number(byMimeType[mimeType] ?? 0) + Number(asset.sizeBytes ?? 0);
      byStorageLocation[storageLocation] = Number(byStorageLocation[storageLocation] ?? 0) + Number(asset.sizeBytes ?? 0);
      byType[asset.assetType] = Number(byType[asset.assetType] ?? 0) + 1;
    });

    return {
      totalAssets: assets.length,
      totalBytes,
      byMimeType,
      byStorageLocation,
      byType
    };
  }

  getAssetHealth() {
    const orphanAssets = this.getOrphanAssets();
    const failedAssets = this.getFailedAssets();
    const warnings = [];

    orphanAssets.forEach(asset => {
      warnings.push({
        code: 'ORPHAN_ASSET',
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} is missing parent asset ${asset.parentAssetId}.`
      });
    });

    failedAssets.forEach(asset => {
      warnings.push({
        code: 'FAILED_ASSET',
        assetId: asset.assetId,
        message: `Asset ${asset.assetId} is marked as failed.`
      });
    });

    const awaitingReview = this.getAssetsAwaitingReview();
    if (warnings.length === 0 && awaitingReview.length > 0) {
      warnings.push({
        code: 'ASSETS_AWAITING_REVIEW',
        assetCount: awaitingReview.length,
        message: `${awaitingReview.length} asset(s) await review.`
      });
    }

    let status = 'HEALTHY';

    if (failedAssets.length > 0) {
      status = 'FAILED';
    } else if (orphanAssets.length > 0) {
      status = orphanAssets.length > 2 ? 'DEGRADED' : 'WARNING';
    } else if (awaitingReview.length > 0) {
      status = 'WARNING';
    } else if (this.assets.size === 0) {
      status = 'UNKNOWN';
    }

    return createAssetHealth({
      status,
      issues: warnings
    });
  }

  getAssetSummary() {
    const assets = this.listAssets();
    const approvedAssets = this.getApprovedAssets();
    const awaitingReview = this.getAssetsAwaitingReview();
    const health = this.getAssetHealth();

    return {
      assetCount: assets.length,
      releaseCandidateCount: assets.filter(asset => asset.assetType === AssetTypes.RELEASE_CANDIDATE).length,
      approvedAssets: approvedAssets.length,
      assetsAwaitingReview: awaitingReview.length,
      assetIntegrityWarnings: health.issues.length,
      assetHealth: health,
      recentAssets: this.getRecentAssets(5),
      orphanAssets: this.getOrphanAssets(),
      failedAssets: this.getFailedAssets(),
      assetGrowth: this.getAssetGrowth(),
      assetStorageSummary: this.getAssetStorageSummary(),
      assetsCreatedToday: this.getAssetsCreatedToday(),
      checksumVerification: {
        totalAssets: assets.length,
        verifiedAssets: assets.filter(asset => typeof asset.checksum === 'string' && asset.checksum.length > 0).length
      }
    };
  }

  getRecentAssets(limit = 5) {
    return this.listAssets()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  getAssetCount() {
    return this.assets.size;
  }

  getHealth() {
    return this.getAssetHealth().status;
  }

  buildTimestamp() {
    return new Date(this.now()).toISOString();
  }

  resolveAssetId(assetId) {
    const normalized = String(assetId ?? '').trim();

    if (normalized.length > 0) {
      return normalized;
    }

    this.sequence += 1;
    return `ASSET-${String(this.sequence).padStart(4, '0')}`;
  }

  resolveParentAssetId(parentAssetId) {
    if (typeof parentAssetId !== 'string') {
      return null;
    }

    const normalized = parentAssetId.trim();
    return normalized.length > 0 ? normalized : null;
  }

  resolveRootMissionId(rootMissionId, parentAssetId) {
    const normalized = String(rootMissionId ?? '').trim();

    if (normalized.length > 0) {
      return normalized;
    }

    if (parentAssetId && this.assets.has(parentAssetId)) {
      return this.assets.get(parentAssetId).rootMissionId;
    }

    return 'MISSION_ID_PLACEHOLDER';
  }

  decorateAsset(asset) {
    const validation = this.validateAssetShape(asset);
    const metadata = {
      ...cloneMetadata(asset.metadata),
      validation,
      originalAssetType: asset.metadata?.originalAssetType ?? asset.assetType,
      sourceAssetIds: Array.isArray(asset.sourceAssetIds) ? [...asset.sourceAssetIds] : [],
      parentAssetIds: Array.isArray(asset.parentAssetIds) ? [...asset.parentAssetIds] : []
    };

    return {
      ...asset,
      metadata,
      tags: Array.isArray(asset.tags) ? [...asset.tags] : [],
      parentAssetIds: Array.isArray(asset.parentAssetIds) ? [...asset.parentAssetIds] : [],
      sourceAssetIds: Array.isArray(asset.sourceAssetIds) ? [...asset.sourceAssetIds] : []
    };
  }

  validateAssetShape(asset) {
    const validation = validateAssetRecord(asset);
    const parentExists = !asset.parentAssetId || this.assets.has(asset.parentAssetId);

    if (asset.parentAssetId && !parentExists) {
      validation.warnings.push({
        field: 'parentAssetId',
        issue: 'ORPHAN_ASSET'
      });
    }

    return validation;
  }

  validateNormalizedAsset(asset) {
    const validation = this.validateAssetShape(asset);

    return {
      isValid: validation.isValid,
      issues: validation.issues,
      warnings: validation.warnings,
      hasOrphanLineage: validation.warnings.some(issue => issue.issue === 'ORPHAN_ASSET')
    };
  }

  persistAsset(asset) {
    this.assets.set(asset.assetId, asset);
    this.recordHistory(asset);
    this.linkChild(asset);
  }

  recordHistory(asset) {
    const history = this.history.get(asset.assetId) ?? [];
    history.push(cloneAsset(asset));
    this.history.set(asset.assetId, history);
  }

  linkChild(asset) {
    if (!asset.parentAssetId) {
      return;
    }

    const children = this.childrenByParentId.get(asset.parentAssetId) ?? new Set();
    children.add(asset.assetId);
    this.childrenByParentId.set(asset.parentAssetId, children);
  }

  getChildren(assetId) {
    const normalized = this.resolveAssetId(assetId);
    const childIds = [...(this.childrenByParentId.get(normalized) ?? new Set())];

    return childIds
      .map(childId => this.getAsset(childId))
      .filter(Boolean);
  }
}

module.exports = {
  AssetRegistry,
  AssetTypes,
  AssetLifecycleStates,
  AssetRegistryFutureHooks,
  normalizeAssetType,
  normalizeAssetLifecycleState,
  createAssetRecord,
  validateAssetRecord,
  createAssetHealth,
  createAssetSummary
};