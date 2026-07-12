export const BUSINESS_RUNTIME_ADMISSION_VERSION = '1.0.0';

export const PublishingModes = Object.freeze({
  NONE: 'NONE',
  PRIVATE: 'PRIVATE'
});

export const AllowedPublishingModes = new Set([
  PublishingModes.NONE,
  PublishingModes.PRIVATE
]);

export const AllowedBrandingProfiles = new Set([
  'ATLAS_SYSTEM',
  'MIDNIGHT_ARCHIVES_BRAND'
]);

export function createRuntimeBusinessContext(input = {}) {
  return {
    businessId: String(input.businessId ?? '').trim(),
    businessName: String(input.businessName ?? '').trim(),
    businessFamily: String(input.businessFamily ?? '').trim(),
    missionType: String(input.missionType ?? '').trim(),
    productionProfileId: String(input.productionProfileId ?? '').trim(),
    publishingMode: String(input.publishingMode ?? PublishingModes.NONE).toUpperCase().trim(),
    credentialProfileId: String(input.credentialProfileId ?? '').trim(),
    qualityProfileId: String(input.qualityProfileId ?? '').trim(),
    knowledgePartition: String(input.knowledgePartition ?? '').trim(),
    executiveCouncilProfile: String(input.executiveCouncilProfile ?? '').trim(),
    budgetProfile: String(input.budgetProfile ?? '').trim(),
    brandingProfile: String(input.brandingProfile ?? '').trim(),
    defaultPolicies: {
      ...(input.defaultPolicies ?? {})
    },
    featureFlags: {
      ...(input.featureFlags ?? {})
    }
  };
}

export function validateRuntimeBusinessContext(context = {}) {
  const issues = [];

  const requiredFields = [
    'businessId',
    'missionType',
    'productionProfileId',
    'credentialProfileId',
    'qualityProfileId',
    'knowledgePartition',
    'executiveCouncilProfile',
    'budgetProfile',
    'brandingProfile'
  ];

  requiredFields.forEach(field => {
    if (typeof context[field] !== 'string' || context[field].trim().length === 0) {
      issues.push({ field, issue: `MISSING_${field.toUpperCase()}` });
    }
  });

  const publishingMode = String(context.publishingMode ?? '').toUpperCase().trim();
  if (!AllowedPublishingModes.has(publishingMode)) {
    issues.push({ field: 'publishingMode', issue: 'INVALID_PUBLISHING_MODE' });
  }

  const brandingProfile = String(context.brandingProfile ?? '').toUpperCase().trim();
  if (!AllowedBrandingProfiles.has(brandingProfile)) {
    issues.push({ field: 'brandingProfile', issue: 'INVALID_BRANDING_PROFILE' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
