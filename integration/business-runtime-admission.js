import {
  BUSINESS_RUNTIME_ADMISSION_VERSION,
  PublishingModes,
  AllowedPublishingModes,
  AllowedBrandingProfiles,
  createRuntimeBusinessContext,
  validateRuntimeBusinessContext
} from './contracts/business-runtime-admission-contracts.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BusinessRegistry } = require('../business/business-registry.js');

function mapBusinessProfileToAdmissionProfile(profile = {}) {
  const businessId = String(profile.businessId ?? '').toUpperCase().trim();

  return {
    businessId,
    businessName: profile.displayName ?? profile.businessName ?? businessId,
    businessFamily: profile.businessFamily ?? 'SYSTEM',
    missionType: Array.isArray(profile.missionTypes) && profile.missionTypes.length > 0
      ? String(profile.missionTypes[0]).toUpperCase().trim()
      : 'SYSTEM_INTERNAL',
    productionProfileId: profile.productionProfile ?? 'legacy_default_v1',
    publishingMode: (
      profile.defaultPolicies?.publishingMode
      ?? profile.publishingProfile?.visibility
      ?? PublishingModes.NONE
    ),
    credentialProfileId: profile.credentialProfile,
    qualityProfileId: profile.qualityProfile,
    knowledgePartition: profile.knowledgePartition,
    executiveCouncilProfile: profile.executiveCouncilProfile,
    budgetProfile: profile.budgetProfile ?? `BUDGET_${businessId}`,
    brandingProfile: profile.brandingProfile,
    defaultPolicies: {
      publishingMode: PublishingModes.NONE,
      ...(profile.defaultPolicies ?? {})
    },
    featureFlags: {
      ...(profile.featureFlags ?? {})
    }
  };
}

function buildProfilesFromRegistry(registry) {
  const profiles = {};

  if (!registry || typeof registry.listBusinesses !== 'function') {
    return profiles;
  }

  registry.listBusinesses().forEach(profile => {
    profiles[profile.businessId] = mapBusinessProfileToAdmissionProfile(profile);
  });

  return Object.freeze(profiles);
}

const DEFAULT_REGISTRY = new BusinessRegistry();
const BUSINESS_PROFILES = buildProfilesFromRegistry(DEFAULT_REGISTRY);

export class BusinessRuntimeAdmission {
  constructor({ profiles = null, businessRegistry = null, now = () => Date.now() } = {}) {
    this.businessRegistry = businessRegistry ?? DEFAULT_REGISTRY;
    this.profiles = profiles ?? buildProfilesFromRegistry(this.businessRegistry);
    this.now = now;
  }

  getProfile(businessId) {
    if (this.profiles && this.profiles[businessId]) {
      return this.profiles[businessId];
    }

    if (
      this.businessRegistry
      && typeof this.businessRegistry.hasBusiness === 'function'
      && this.businessRegistry.hasBusiness(businessId)
    ) {
      const runtimeProfile = this.businessRegistry.getRuntimeBusinessProfile(businessId);
      return mapBusinessProfileToAdmissionProfile(runtimeProfile);
    }

    return null;
  }

  admit({ request = {} } = {}) {
    const admissionStartEpochMs = this.now();
    const diagnostics = {
      version: BUSINESS_RUNTIME_ADMISSION_VERSION,
      admissionStart: new Date(admissionStartEpochMs).toISOString(),
      admissionEnd: null,
      admissionDuration: null,
      selectedBusiness: null,
      selectedProfiles: null,
      validationResults: [],
      warnings: []
    };

    const businessId = String(request.businessId ?? 'SYSTEM_INTERNAL').toUpperCase().trim();
    diagnostics.selectedBusiness = businessId;

    const profile = this.getProfile(businessId);
    if (!profile) {
      return this.rejectAdmission({
        diagnostics,
        code: 'UNKNOWN_BUSINESS',
        message: `Unknown business profile: ${businessId}`
      });
    }

    const normalizedContext = createRuntimeBusinessContext({
      ...profile,
      missionType: request.missionType ?? profile.missionType,
      productionProfileId: request.productionProfileId ?? request.productionProfile ?? profile.productionProfileId,
      publishingMode: this.resolvePublishingMode({ request, profile }),
      credentialProfileId: request.credentialProfileId ?? profile.credentialProfileId,
      executiveCouncilProfile: request.executiveCouncilProfile ?? profile.executiveCouncilProfile,
      qualityProfileId: request.qualityProfileId ?? profile.qualityProfileId,
      knowledgePartition: request.knowledgePartition ?? profile.knowledgePartition,
      budgetProfile: request.budgetProfile ?? profile.budgetProfile,
      brandingProfile: request.brandingProfile ?? profile.brandingProfile,
      defaultPolicies: {
        ...profile.defaultPolicies,
        ...(request.defaultPolicies ?? {})
      },
      featureFlags: {
        ...profile.featureFlags,
        ...(request.featureFlags ?? {})
      }
    });

    diagnostics.selectedProfiles = {
      missionType: normalizedContext.missionType,
      productionProfileId: normalizedContext.productionProfileId,
      publishingMode: normalizedContext.publishingMode,
      credentialProfileId: normalizedContext.credentialProfileId,
      executiveCouncilProfile: normalizedContext.executiveCouncilProfile,
      qualityProfileId: normalizedContext.qualityProfileId,
      knowledgePartition: normalizedContext.knowledgePartition,
      budgetProfile: normalizedContext.budgetProfile,
      brandingProfile: normalizedContext.brandingProfile
    };

    const validation = this.validateAdmission({ normalizedContext });
    diagnostics.validationResults = validation.validationResults;

    if (!validation.isValid) {
      return this.rejectAdmission({
        diagnostics,
        code: validation.code,
        message: validation.message
      });
    }

    const admissionEndEpochMs = this.now();
    diagnostics.admissionEnd = new Date(admissionEndEpochMs).toISOString();
    diagnostics.admissionDuration = Math.max(0, admissionEndEpochMs - admissionStartEpochMs);

    return {
      admitted: true,
      runtimeBusinessContext: normalizedContext,
      diagnostics,
      errors: []
    };
  }

  resolvePublishingMode({ request, profile }) {
    const mode = (
      request.publishingMode
      ?? request.publishingPolicy?.mode
      ?? profile.publishingMode
      ?? PublishingModes.NONE
    );

    return String(mode).toUpperCase().trim();
  }

  validateAdmission({ normalizedContext }) {
    const contractValidation = validateRuntimeBusinessContext(normalizedContext);
    const validationResults = [];

    if (!contractValidation.isValid) {
      contractValidation.issues.forEach(issue => {
        validationResults.push({
          field: issue.field,
          status: 'FAILED',
          issue: issue.issue
        });
      });

      const invalidPublishingMode = contractValidation.issues.find(issue => issue.issue === 'INVALID_PUBLISHING_MODE');
      if (invalidPublishingMode) {
        return {
          isValid: false,
          code: 'INVALID_PUBLISHING_MODE',
          message: `Invalid publishing mode: ${normalizedContext.publishingMode}`,
          validationResults
        };
      }

      const invalidBrandingProfile = contractValidation.issues.find(issue => issue.issue === 'INVALID_BRANDING_PROFILE');
      if (invalidBrandingProfile) {
        return {
          isValid: false,
          code: 'INVALID_BRANDING_PROFILE',
          message: `Invalid branding profile: ${normalizedContext.brandingProfile}`,
          validationResults
        };
      }

      const missingQualityProfile = contractValidation.issues.find(issue => issue.field === 'qualityProfileId');
      if (missingQualityProfile) {
        return {
          isValid: false,
          code: 'MISSING_QUALITY_PROFILE',
          message: 'Missing quality profile for business admission.',
          validationResults
        };
      }

      const missingCredentialProfile = contractValidation.issues.find(issue => issue.field === 'credentialProfileId');
      if (missingCredentialProfile) {
        return {
          isValid: false,
          code: 'MISSING_CREDENTIAL_PROFILE',
          message: 'Missing credential profile for business admission.',
          validationResults
        };
      }

      return {
        isValid: false,
        code: 'MISSING_PROFILE',
        message: 'Business admission failed due to missing required profile fields.',
        validationResults
      };
    }

    validationResults.push(
      {
        field: 'businessId',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'missionType',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'productionProfileId',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'publishingMode',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'credentialProfileId',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'executiveCouncilProfile',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'qualityProfileId',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'knowledgePartition',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'budgetProfile',
        status: 'PASSED',
        issue: null
      },
      {
        field: 'brandingProfile',
        status: 'PASSED',
        issue: null
      }
    );

    return {
      isValid: true,
      code: null,
      message: null,
      validationResults
    };
  }

  rejectAdmission({ diagnostics, code, message }) {
    const admissionEndEpochMs = this.now();
    diagnostics.admissionEnd = new Date(admissionEndEpochMs).toISOString();
    diagnostics.admissionDuration = Math.max(0, admissionEndEpochMs - Date.parse(diagnostics.admissionStart));

    return {
      admitted: false,
      runtimeBusinessContext: null,
      diagnostics,
      errors: [
        {
          code,
          message
        }
      ]
    };
  }
}

export {
  BUSINESS_PROFILES,
  PublishingModes,
  AllowedPublishingModes,
  AllowedBrandingProfiles
};
