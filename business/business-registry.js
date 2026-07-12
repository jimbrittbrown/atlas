const {
  RuntimeBusinessStatuses,
  PublishingModes,
  createRuntimeBusinessProfile,
  validateRuntimeBusinessProfile,
  deepFreeze
} = require('./business-registry-contracts.js');
const { MIDNIGHT_ARCHIVES_PROFILE } = require('../profiles/midnight-archives-profile.js');

const SYSTEM_INTERNAL_PROFILE = Object.freeze({
  businessId: 'SYSTEM_INTERNAL',
  displayName: 'Atlas System Internal',
  description: 'Default internal Atlas business profile for system missions.',
  businessFamily: 'System',
  status: RuntimeBusinessStatuses.ACTIVE,
  missionTypes: ['SYSTEM_INTERNAL'],
  brandingProfile: 'ATLAS_SYSTEM',
  creativeProfile: {
    genre: 'System Operations',
    targetLengthSeconds: {
      min: 30,
      max: 60
    },
    narrationStyle: 'Operational',
    visualStyle: 'Functional',
    defaultProductionProfile: 'legacy_default_v1'
  },
  productionProfile: 'legacy_default_v1',
  qualityProfile: 'QUALITY_STANDARD',
  executiveCouncilProfile: 'EXEC_COUNCIL_STANDARD',
  publishingProfile: {
    platform: 'YouTube',
    visibility: PublishingModes.NONE,
    scheduling: 'disabled',
    requiresCEOApproval: true
  },
  knowledgePartition: 'knowledge/system-internal/',
  metricsNamespace: 'system_internal',
  metrics: {
    reservedMetrics: [
      'views',
      'CTR',
      'watch time',
      'retention',
      'subscribers',
      'upload latency',
      'quality score'
    ]
  },
  assetRoot: 'assets/system-internal/',
  assetLayout: {
    scripts: 'assets/system-internal/scripts/',
    voice: 'assets/system-internal/voice/',
    images: 'assets/system-internal/images/',
    video: 'assets/system-internal/video/',
    thumbnails: 'assets/system-internal/thumbnails/',
    reports: 'assets/system-internal/reports/',
    releaseCandidates: 'assets/system-internal/release-candidates/'
  },
  credentialProfile: 'CREDENTIALS_SYSTEM_INTERNAL',
  defaultPolicies: {
    publishingMode: PublishingModes.NONE
  },
  featureFlags: {
    transitions: false
  }
});

class BusinessRegistry {
  constructor({ initialBusinesses = null } = {}) {
    this.businesses = new Map();

    const defaults = initialBusinesses ?? [SYSTEM_INTERNAL_PROFILE, MIDNIGHT_ARCHIVES_PROFILE];
    defaults.forEach(profile => {
      this.registerBusiness(profile);
    });
  }

  registerBusiness(profileInput = {}) {
    const profile = createRuntimeBusinessProfile(profileInput);
    const validation = validateRuntimeBusinessProfile(profile);

    if (!validation.isValid) {
      throw new Error(`Invalid business profile: ${validation.issues.map(issue => issue.issue).join(', ')}`);
    }

    if (this.businesses.has(profile.businessId)) {
      throw new Error(`Business already registered: ${profile.businessId}`);
    }

    const immutableProfile = deepFreeze(profile);
    this.businesses.set(profile.businessId, immutableProfile);

    return immutableProfile;
  }

  hasBusiness(businessId) {
    const normalized = String(businessId ?? '').toUpperCase().trim();
    return this.businesses.has(normalized);
  }

  loadBusinessProfile(businessId) {
    const normalized = String(businessId ?? '').toUpperCase().trim();
    const profile = this.businesses.get(normalized);

    if (!profile) {
      throw new Error(`Unknown business profile: ${normalized}`);
    }

    return profile;
  }

  validateBusiness(businessId) {
    const profile = this.loadBusinessProfile(businessId);
    return validateRuntimeBusinessProfile(profile);
  }

  getRuntimeBusinessProfile(businessId) {
    return this.loadBusinessProfile(businessId);
  }

  listBusinesses() {
    return [...this.businesses.values()];
  }

  getBusinessCount() {
    return this.businesses.size;
  }

  getBusinessHealth() {
    const byBusiness = {};

    this.businesses.forEach((profile, businessId) => {
      byBusiness[businessId] = profile.status === RuntimeBusinessStatuses.ACTIVE ? 'HEALTHY' : 'WARNING';
    });

    return byBusiness;
  }
}

module.exports = {
  BusinessRegistry,
  SYSTEM_INTERNAL_PROFILE
};
