const RuntimeBusinessStatuses = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
});

const PublishingModes = Object.freeze({
  NONE: 'NONE',
  PRIVATE: 'PRIVATE'
});

function createRuntimeBusinessProfile(input = {}) {
  return {
    businessId: String(input.businessId ?? '').toUpperCase().trim(),
    displayName: String(input.displayName ?? '').trim(),
    description: String(input.description ?? '').trim(),
    businessFamily: String(input.businessFamily ?? '').trim(),
    status: String(input.status ?? RuntimeBusinessStatuses.ACTIVE).toUpperCase().trim(),
    missionTypes: Array.isArray(input.missionTypes) ? [...input.missionTypes] : [],
    brandingProfile: String(input.brandingProfile ?? '').trim(),
    creativeProfile: {
      ...(input.creativeProfile ?? {})
    },
    productionProfile: String(input.productionProfile ?? '').trim(),
    qualityProfile: String(input.qualityProfile ?? '').trim(),
    executiveCouncilProfile: String(input.executiveCouncilProfile ?? '').trim(),
    publishingProfile: {
      platform: String(input.publishingProfile?.platform ?? '').trim(),
      visibility: String(input.publishingProfile?.visibility ?? PublishingModes.NONE).toUpperCase().trim(),
      scheduling: String(input.publishingProfile?.scheduling ?? 'disabled').trim(),
      requiresCEOApproval: Boolean(input.publishingProfile?.requiresCEOApproval)
    },
    knowledgePartition: String(input.knowledgePartition ?? '').trim(),
    metricsNamespace: String(input.metricsNamespace ?? '').trim(),
    metrics: {
      reservedMetrics: Array.isArray(input.metrics?.reservedMetrics) ? [...input.metrics.reservedMetrics] : []
    },
    assetRoot: String(input.assetRoot ?? '').trim(),
    assetLayout: {
      ...(input.assetLayout ?? {})
    },
    credentialProfile: String(input.credentialProfile ?? '').trim(),
    defaultPolicies: {
      ...(input.defaultPolicies ?? {})
    },
    featureFlags: {
      ...(input.featureFlags ?? {})
    }
  };
}

function validateRuntimeBusinessProfile(profile = {}) {
  const issues = [];

  const requiredFields = [
    'businessId',
    'displayName',
    'businessFamily',
    'status',
    'brandingProfile',
    'productionProfile',
    'qualityProfile',
    'executiveCouncilProfile',
    'knowledgePartition',
    'metricsNamespace',
    'assetRoot',
    'credentialProfile'
  ];

  requiredFields.forEach(field => {
    if (typeof profile[field] !== 'string' || profile[field].trim().length === 0) {
      issues.push({ field, issue: `MISSING_${field.toUpperCase()}` });
    }
  });

  if (!Array.isArray(profile.missionTypes) || profile.missionTypes.length === 0) {
    issues.push({ field: 'missionTypes', issue: 'MISSING_MISSION_TYPES' });
  }

  if (!Array.isArray(profile.metrics?.reservedMetrics) || profile.metrics.reservedMetrics.length === 0) {
    issues.push({ field: 'metrics.reservedMetrics', issue: 'MISSING_RESERVED_METRICS' });
  }

  if (!profile.publishingProfile || typeof profile.publishingProfile !== 'object') {
    issues.push({ field: 'publishingProfile', issue: 'MISSING_PUBLISHING_PROFILE' });
  } else {
    const visibility = String(profile.publishingProfile.visibility ?? '').toUpperCase().trim();
    if (!(visibility === PublishingModes.NONE || visibility === PublishingModes.PRIVATE)) {
      issues.push({ field: 'publishingProfile.visibility', issue: 'INVALID_PUBLISHING_VISIBILITY' });
    }
  }

  if (!profile.assetLayout || typeof profile.assetLayout !== 'object') {
    issues.push({ field: 'assetLayout', issue: 'MISSING_ASSET_LAYOUT' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.getOwnPropertyNames(value).forEach(name => {
    deepFreeze(value[name]);
  });

  return Object.freeze(value);
}

module.exports = {
  RuntimeBusinessStatuses,
  PublishingModes,
  createRuntimeBusinessProfile,
  validateRuntimeBusinessProfile,
  deepFreeze
};
