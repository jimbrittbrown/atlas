const AssetTypes = Object.freeze({
  SCRIPT: 'SCRIPT',
  VOICE: 'VOICE',
  IMAGE: 'IMAGE',
  THUMBNAIL: 'THUMBNAIL',
  VIDEO: 'VIDEO',
  SUBTITLE: 'SUBTITLE',
  RELEASE_CANDIDATE: 'RELEASE_CANDIDATE',
  EXECUTIVE_REPORT: 'EXECUTIVE_REPORT',
  QUALITY_REPORT: 'QUALITY_REPORT',
  LESSONS_LEARNED: 'LESSONS_LEARNED',
  KNOWLEDGE_RECORD: 'KNOWLEDGE_RECORD',
  METRICS_REPORT: 'METRICS_REPORT'
});

const AssetLifecycleStates = Object.freeze({
  NEW: 'NEW',
  GENERATED: 'GENERATED',
  VALIDATED: 'VALIDATED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
  SUPERSEDED: 'SUPERSEDED',
  DELETED: 'DELETED'
});

const AssetRegistryFutureHooks = Object.freeze({
  cloudStorage: 'cloudStorage',
  s3: 's3',
  googleCloudStorage: 'googleCloudStorage',
  checksumVerification: 'checksumVerification',
  deduplication: 'deduplication',
  retentionPolicies: 'retentionPolicies',
  automaticArchival: 'automaticArchival'
});

const AssetTypeAliases = Object.freeze({
  VOICE_AUDIO: AssetTypes.VOICE,
  PUBLISHED_VIDEO: AssetTypes.VIDEO,
  PUBLISH_THUMBNAIL: AssetTypes.THUMBNAIL,
  METRICS: AssetTypes.METRICS_REPORT,
  LESSONS: AssetTypes.LESSONS_LEARNED,
  KNOWLEDGE: AssetTypes.KNOWLEDGE_RECORD,
  RC: AssetTypes.RELEASE_CANDIDATE,
  RC_PACKAGE: AssetTypes.RELEASE_CANDIDATE,
  QUALITY_REVIEW: AssetTypes.QUALITY_REPORT,
  EXECUTIVE_DECISION: AssetTypes.EXECUTIVE_REPORT
});

const LifecycleAliases = Object.freeze({
  REGISTERED: AssetLifecycleStates.NEW,
  CREATED: AssetLifecycleStates.NEW,
  GENERATED: AssetLifecycleStates.GENERATED,
  VALIDATED: AssetLifecycleStates.VALIDATED,
  APPROVED: AssetLifecycleStates.APPROVED,
  PUBLISHED: AssetLifecycleStates.PUBLISHED,
  ARCHIVED: AssetLifecycleStates.ARCHIVED,
  SUPERSEDED: AssetLifecycleStates.SUPERSEDED,
  DELETED: AssetLifecycleStates.DELETED
});

function normalizeAssetType(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (normalized in AssetTypes) {
    return normalized;
  }

  if (normalized in AssetTypeAliases) {
    return AssetTypeAliases[normalized];
  }

  return normalized.length > 0 ? normalized : 'UNKNOWN_ASSET';
}

function normalizeAssetLifecycleState(value) {
  const normalized = String(value ?? '').toUpperCase().trim();

  if (normalized in AssetLifecycleStates) {
    return normalized;
  }

  if (normalized in LifecycleAliases) {
    return LifecycleAliases[normalized];
  }

  return AssetLifecycleStates.NEW;
}

function normalizeChecksum(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStorageLocation(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMimeType(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map(tag => String(tag).trim())
    .filter(tag => tag.length > 0);
}

function normalizeSourceAssetIds(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(item => item.length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function createAssetRecord(input = {}, { now = () => Date.now() } = {}) {
  const parentAssetIds = normalizeSourceAssetIds(input.parentAssetIds);
  const sourceAssetIds = normalizeSourceAssetIds(
    input.sourceAssetIds ?? input.metadata?.sourceAssetIds ?? parentAssetIds
  );
  const parentAssetId = normalizeParentAssetId(input.parentAssetId ?? parentAssetIds[0] ?? null);
  const lifecycleStage = normalizeAssetLifecycleState(input.lifecycleStage ?? input.status ?? AssetLifecycleStates.NEW);
  const status = typeof input.status === 'string' && input.status.trim().length > 0
    ? input.status.trim().toUpperCase()
    : lifecycleStage;
  const createdAt = typeof input.createdAt === 'string' && input.createdAt.trim().length > 0
    ? input.createdAt.trim()
    : new Date(now()).toISOString();
  const createdBy = typeof input.createdBy === 'string' && input.createdBy.trim().length > 0
    ? input.createdBy.trim()
    : 'SYSTEM';
  const assetType = normalizeAssetType(input.assetType);
  const rootMissionId = normalizeRootMissionId(input.rootMissionId ?? input.missionId ?? null);

  return {
    assetId: String(input.assetId ?? '').trim(),
    assetType,
    businessId: normalizeBusinessId(input.businessId),
    missionId: normalizeMissionId(input.missionId),
    parentAssetId,
    rootMissionId,
    version: normalizeVersion(input.version),
    createdAt,
    createdBy,
    status,
    storageLocation: normalizeStorageLocation(input.storageLocation),
    checksum: normalizeChecksum(input.checksum),
    sizeBytes: normalizeSizeBytes(input.sizeBytes),
    mimeType: normalizeMimeType(input.mimeType),
    lifecycleStage,
    metadata: normalizeMetadata(input.metadata, { assetType, parentAssetIds, sourceAssetIds }),
    tags: normalizeTags(input.tags),
    workerId: typeof input.workerId === 'string' && input.workerId.trim().length > 0
      ? input.workerId.trim()
      : 'WORKER_ID_PLACEHOLDER',
    parentAssetIds,
    sourceAssetIds
  };
}

function validateAssetRecord(asset = {}, { allowOrphan = true } = {}) {
  const issues = [];
  const warnings = [];

  if (typeof asset.assetId !== 'string' || asset.assetId.trim().length === 0) {
    issues.push({ field: 'assetId', issue: 'MISSING_ASSET_ID' });
  }

  if (!Object.prototype.hasOwnProperty.call(AssetTypes, asset.assetType)) {
    issues.push({ field: 'assetType', issue: 'INVALID_ASSET_TYPE' });
  }

  if (typeof asset.businessId !== 'string' || asset.businessId.trim().length === 0) {
    issues.push({ field: 'businessId', issue: 'MISSING_BUSINESS_ID' });
  }

  if (typeof asset.missionId !== 'string' || asset.missionId.trim().length === 0) {
    issues.push({ field: 'missionId', issue: 'MISSING_MISSION_ID' });
  }

  if (typeof asset.rootMissionId !== 'string' || asset.rootMissionId.trim().length === 0) {
    issues.push({ field: 'rootMissionId', issue: 'MISSING_ROOT_MISSION_ID' });
  }

  if (typeof asset.version !== 'number' || !Number.isFinite(asset.version) || asset.version < 1) {
    issues.push({ field: 'version', issue: 'INVALID_VERSION' });
  }

  if (typeof asset.createdAt !== 'string' || asset.createdAt.trim().length === 0) {
    issues.push({ field: 'createdAt', issue: 'MISSING_CREATED_AT' });
  }

  if (typeof asset.createdBy !== 'string' || asset.createdBy.trim().length === 0) {
    issues.push({ field: 'createdBy', issue: 'MISSING_CREATED_BY' });
  }

  if (!Object.prototype.hasOwnProperty.call(AssetLifecycleStates, asset.lifecycleStage)) {
    issues.push({ field: 'lifecycleStage', issue: 'INVALID_LIFECYCLE_STAGE' });
  }

  if (typeof asset.status !== 'string' || asset.status.trim().length === 0) {
    issues.push({ field: 'status', issue: 'MISSING_STATUS' });
  }

  if (!Array.isArray(asset.tags)) {
    issues.push({ field: 'tags', issue: 'INVALID_TAGS' });
  }

  if (typeof asset.sizeBytes !== 'number' || !Number.isFinite(asset.sizeBytes) || asset.sizeBytes < 0) {
    issues.push({ field: 'sizeBytes', issue: 'INVALID_SIZE_BYTES' });
  }

  if (!asset.metadata || typeof asset.metadata !== 'object' || Array.isArray(asset.metadata)) {
    issues.push({ field: 'metadata', issue: 'INVALID_METADATA' });
  }

  if (asset.parentAssetId && typeof asset.parentAssetId === 'string' && asset.parentAssetId.trim().length > 0) {
    warnings.push({ field: 'parentAssetId', issue: allowOrphan ? 'POTENTIAL_ORPHAN' : 'PARENT_ASSET_REQUIRED' });
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings
  };
}

function createAssetHealth({ status = 'UNKNOWN', issues = [] } = {}) {
  return {
    status,
    issues: Array.isArray(issues) ? issues.map(issue => ({ ...issue })) : []
  };
}

function createAssetSummary(input = {}) {
  return {
    assetCount: Number(input.assetCount ?? 0),
    releaseCandidateCount: Number(input.releaseCandidateCount ?? 0),
    approvedAssets: Number(input.approvedAssets ?? 0),
    assetsAwaitingReview: Number(input.assetsAwaitingReview ?? 0),
    assetIntegrityWarnings: Number(input.assetIntegrityWarnings ?? 0)
  };
}

function normalizeBusinessId(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : 'BUSINESS_ID_PLACEHOLDER';
}

function normalizeMissionId(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : 'MISSION_ID_PLACEHOLDER';
}

function normalizeRootMissionId(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : 'MISSION_ID_PLACEHOLDER';
}

function normalizeParentAssetId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeVersion(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

function normalizeSizeBytes(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function normalizeMetadata(metadata, { assetType, parentAssetIds, sourceAssetIds } = {}) {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      originalAssetType: assetType,
      sourceAssetIds: [...sourceAssetIds],
      parentAssetIds: [...parentAssetIds]
    };
  }

  const normalized = { ...metadata };

  if (!Array.isArray(normalized.sourceAssetIds)) {
    normalized.sourceAssetIds = [...sourceAssetIds];
  } else {
    normalized.sourceAssetIds = normalizeSourceAssetIds(normalized.sourceAssetIds);
  }

  normalized.parentAssetIds = normalizeSourceAssetIds(normalized.parentAssetIds ?? parentAssetIds);
  normalized.originalAssetType = typeof normalized.originalAssetType === 'string'
    ? normalized.originalAssetType
    : assetType;

  return normalized;
}

function cloneAsset(asset) {
  return {
    ...asset,
    metadata: cloneMetadata(asset.metadata),
    tags: Array.isArray(asset.tags) ? [...asset.tags] : [],
    parentAssetIds: Array.isArray(asset.parentAssetIds) ? [...asset.parentAssetIds] : [],
    sourceAssetIds: Array.isArray(asset.sourceAssetIds) ? [...asset.sourceAssetIds] : []
  };
}

function cloneMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return JSON.parse(JSON.stringify(metadata));
}

module.exports = {
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
};