const { BusinessRegistry } = require('../business/business-registry.js');
const { ProviderRegistry } = require('../providers/provider-registry.js');
const { CredentialRegistry } = require('../providers/credential-registry.js');
const { CEODashboardService } = require('../dashboard/ceo-dashboard-service.js');

const ReadinessStates = Object.freeze({
  READY: 'READY',
  READY_WITH_WARNINGS: 'READY_WITH_WARNINGS',
  BLOCKED: 'BLOCKED'
});

const CategoryStatuses = Object.freeze({
  READY: 'READY',
  READY_WITH_WARNINGS: 'READY_WITH_WARNINGS',
  BLOCKED: 'BLOCKED'
});

const RequiredProviders = Object.freeze(['GOOGLE_CLOUD', 'VERTEX_AI', 'GEMINI', 'YOUTUBE', 'ELEVENLABS']);

const RequiredCredentials = Object.freeze({
  GOOGLE_CLOUD: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS_JSON'],
  VERTEX_AI: ['GOOGLE_VERTEX_API_KEY'],
  GEMINI: ['GOOGLE_VERTEX_API_KEY'],
  YOUTUBE: ['YOUTUBE_API_KEY', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
  ELEVENLABS: ['ELEVENLABS_API_KEY']
});

const RequiredCredentialIds = Object.freeze([
  ...new Set(Object.values(RequiredCredentials).flat())
]);

function createMidnightArchivesProductionChecklist(input = {}) {
  const businessRegistry = input.businessRegistry ?? new BusinessRegistry();
  const providerRegistry = input.providerRegistry ?? new ProviderRegistry();
  const credentialRegistry = input.credentialRegistry ?? new CredentialRegistry();
  const dashboardService = input.dashboardService ?? new CEODashboardService({
    businessRegistry,
    providerRegistry,
    credentialRegistry
  });

  const business = evaluateBusinessCategory({ businessRegistry });
  const brand = evaluateBrandCategory({ businessRegistry, brandPackage: input.brandPackage, youtubeChannel: input.youtubeChannel });
  const providers = evaluateProvidersCategory({ providerRegistry });
  const credentials = evaluateCredentialsCategory({ providerRegistry, credentialRegistry });
  const publishingSafety = evaluatePublishingSafetyCategory({
    businessRegistry,
    publishingPolicy: input.publishingPolicy,
    ceoApprovalGranted: input.ceoApprovalGranted,
    publishRequested: input.publishRequested
  });
  const assets = evaluateAssetsCategory({ businessRegistry });
  const knowledge = evaluateKnowledgeCategory({ businessRegistry });
  const dashboard = evaluateDashboardCategory({ dashboardService, businessRegistry, providerRegistry, credentialRegistry });
  const executiveApproval = evaluateExecutiveApprovalCategory({
    publishingSafety,
    ceoApprovalGranted: input.ceoApprovalGranted,
    publishRequested: input.publishRequested
  });

  const categories = {
    business,
    brand,
    providers,
    credentials,
    'publishing safety': publishingSafety,
    assets,
    knowledge,
    dashboard,
    'executive approval': executiveApproval
  };

  const overallStatus = resolveOverallStatus(categories);
  const warnings = collectWarnings(categories);
  const blockers = collectBlockers(categories);

  return deepFreeze({
    readinessState: overallStatus,
    generatedAt: new Date().toISOString(),
    categories,
    summary: {
      readyCategories: Object.values(categories).filter(category => category.status === CategoryStatuses.READY).length,
      warningCategories: Object.values(categories).filter(category => category.status === CategoryStatuses.READY_WITH_WARNINGS).length,
      blockedCategories: Object.values(categories).filter(category => category.status === CategoryStatuses.BLOCKED).length
    },
    warnings,
    blockers,
    sourceSummary: {
      businessId: business.businessId,
      providerCount: providers.providerIds.length,
      credentialCount: credentials.summary.credentialCount,
      dashboardReady: dashboard.status === CategoryStatuses.READY
    }
  });
}

function evaluateBusinessCategory({ businessRegistry }) {
  const hasBusiness = typeof businessRegistry.hasBusiness === 'function' && businessRegistry.hasBusiness('MIDNIGHT_ARCHIVES');
  const profile = hasBusiness && typeof businessRegistry.getRuntimeBusinessProfile === 'function'
    ? businessRegistry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES')
    : null;

  if (!profile) {
    return {
      status: CategoryStatuses.BLOCKED,
      businessId: 'MIDNIGHT_ARCHIVES',
      businessName: null,
      profileExists: false,
      notes: ['Midnight Archives business profile is missing.']
    };
  }

  return {
    status: CategoryStatuses.READY,
    businessId: profile.businessId,
    businessName: profile.displayName ?? profile.businessName ?? 'Midnight Archives',
    profileExists: true,
    notes: []
  };
}

function evaluateBrandCategory({ businessRegistry, brandPackage = null, youtubeChannel = null }) {
  const profile = businessRegistry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');
  const trackedStatus = String(brandPackage?.status ?? 'NOT_TRACKED').toUpperCase().trim();
  const youtubeChannelStatus = String(youtubeChannel?.status ?? 'NOT_TRACKED').toUpperCase().trim();

  const channelTracked = youtubeChannelStatus === 'READY' || youtubeChannelStatus === 'TRACKED';
  const channelBlocked = youtubeChannelStatus === 'BLOCKED' || youtubeChannelStatus === 'FAILED';

  if (trackedStatus === 'READY' || trackedStatus === 'TRACKED') {
    if (channelBlocked) {
      return {
        status: CategoryStatuses.BLOCKED,
        brandPackageStatus: trackedStatus,
        brandPackageTracked: true,
        youtubeChannelStatus,
        youtubeChannelTracked: true,
        notes: ['YouTube channel status is blocked.']
      };
    }

    if (!channelTracked) {
      return {
        status: CategoryStatuses.READY_WITH_WARNINGS,
        brandPackageStatus: trackedStatus,
        brandPackageTracked: true,
        youtubeChannelStatus,
        youtubeChannelTracked: false,
        notes: [`Brand package is ready, but YouTube channel status for ${profile.businessId} is not yet tracked.`]
      };
    }

    return {
      status: CategoryStatuses.READY,
      brandPackageStatus: trackedStatus,
      brandPackageTracked: true,
      youtubeChannelStatus,
      youtubeChannelTracked: true,
      notes: []
    };
  }

  if (trackedStatus === 'BLOCKED' || trackedStatus === 'FAILED') {
    return {
      status: CategoryStatuses.BLOCKED,
      brandPackageStatus: trackedStatus,
      brandPackageTracked: true,
      youtubeChannelStatus,
      youtubeChannelTracked: channelTracked,
      notes: ['Brand package is blocked.']
    };
  }

  return {
    status: CategoryStatuses.READY_WITH_WARNINGS,
    brandPackageStatus: trackedStatus,
    brandPackageTracked: false,
    youtubeChannelStatus,
    youtubeChannelTracked: channelTracked,
    notes: [`Brand package status is tracked for ${profile.businessId}.`]
  };
}

function evaluateProvidersCategory({ providerRegistry }) {
  const providerIds = typeof providerRegistry.listProviders === 'function'
    ? providerRegistry.listProviders().map(provider => provider.providerId)
    : [];
  const missingProviders = RequiredProviders.filter(providerId => !providerIds.includes(providerId));

  if (missingProviders.length > 0) {
    return {
      status: CategoryStatuses.BLOCKED,
      providerIds,
      missingProviders,
      notes: [`Missing providers: ${missingProviders.join(', ')}.`]
    };
  }

  return {
    status: CategoryStatuses.READY,
    providerIds,
    missingProviders: [],
    notes: []
  };
}

function evaluateCredentialsCategory({ providerRegistry, credentialRegistry }) {
  const summary = typeof credentialRegistry.getCredentialSummary === 'function'
    ? credentialRegistry.getCredentialSummary({ environment: 'production' })
    : {
        environment: 'production',
        credentialCount: 0,
        configuredCredentials: 0,
        verifiedCredentials: 0,
        warningCredentials: 0
      };

  const configuredCredentialIds = new Set(
    typeof credentialRegistry.listCredentials === 'function'
      ? credentialRegistry.listCredentials()
        .filter(credential => credential.environment === 'production' && credential.configured === true)
        .map(credential => credential.credentialId)
      : []
  );

  const missingCredentialIds = RequiredCredentialIds.filter(credentialId => !configuredCredentialIds.has(credentialId));

  const verificationFailures = typeof credentialRegistry.listCredentials === 'function'
    ? credentialRegistry.listCredentials()
      .filter(credential => credential.environment === 'production' && credential.configured === true && credential.verified !== true)
      .map(credential => credential.credentialId)
    : [];

  const exposureSafeCredentials = typeof credentialRegistry.listCredentials === 'function'
    ? credentialRegistry.listCredentials().map(credential => ({
        credentialId: credential.credentialId,
        providerId: credential.providerId,
        environment: credential.environment,
        configured: credential.configured,
        verified: credential.verified,
        status: credential.status
      }))
    : [];

  if (missingCredentialIds.length > 0 || verificationFailures.length > 0) {
    return {
      status: CategoryStatuses.BLOCKED,
      summary,
      missingCredentialIds,
      verificationFailures,
      credentials: exposureSafeCredentials,
      notes: ['Required credentials are missing or unverified.']
    };
  }

  const warningCredentials = summary.warningCredentials > 0;

  return {
    status: warningCredentials ? CategoryStatuses.READY_WITH_WARNINGS : CategoryStatuses.READY,
    summary,
    missingCredentialIds: [],
    verificationFailures: [],
    credentials: exposureSafeCredentials,
    notes: warningCredentials ? ['Some credentials are in WARNING state.'] : []
  };
}

function evaluatePublishingSafetyCategory({ businessRegistry, publishingPolicy = {}, ceoApprovalGranted = false, publishRequested = false }) {
  const profile = businessRegistry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');
  const publishingMode = normalizeValue(publishingPolicy.publishingMode ?? profile.defaultPolicies?.publishingMode ?? 'NONE');
  const defaultVisibility = normalizeValue(publishingPolicy.defaultVisibility ?? profile.publishingProfile?.visibility ?? 'PRIVATE');
  const requiresCEOApproval = Boolean(publishingPolicy.ceoApprovalRequired ?? profile.publishingProfile?.requiresCEOApproval ?? true);
  const publishingEnabled = publishingMode !== 'NONE';
  const explicitPublishAction = Boolean(publishRequested || publishingEnabled);

  if (defaultVisibility !== 'PRIVATE') {
    return {
      status: CategoryStatuses.BLOCKED,
      publishingMode,
      defaultVisibility,
      requiresCEOApproval,
      publishRequested: explicitPublishAction,
      notes: ['Default production upload visibility must be PRIVATE.']
    };
  }

  if (explicitPublishAction && requiresCEOApproval && !ceoApprovalGranted) {
    return {
      status: CategoryStatuses.BLOCKED,
      publishingMode,
      defaultVisibility,
      requiresCEOApproval,
      publishRequested: explicitPublishAction,
      notes: ['Publishing is enabled or requested without CEO approval.']
    };
  }

  if (publishingEnabled && !ceoApprovalGranted) {
    return {
      status: CategoryStatuses.BLOCKED,
      publishingMode,
      defaultVisibility,
      requiresCEOApproval,
      publishRequested: explicitPublishAction,
      notes: ['Publishing mode is enabled without CEO approval.']
    };
  }

  return {
    status: CategoryStatuses.READY,
    publishingMode,
    defaultVisibility,
    requiresCEOApproval,
    publishRequested: explicitPublishAction,
    notes: []
  };
}

function evaluateAssetsCategory({ businessRegistry }) {
  const profile = businessRegistry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');
  const assetRoot = normalizeValue(profile.assetRoot);
  const assetLayout = profile.assetLayout ?? {};
  const hasAllFolders = Boolean(assetRoot)
    && Boolean(assetLayout.scripts)
    && Boolean(assetLayout.voice)
    && Boolean(assetLayout.images)
    && Boolean(assetLayout.video)
    && Boolean(assetLayout.thumbnails)
    && Boolean(assetLayout.reports)
    && Boolean(assetLayout.releaseCandidates);

  return {
    status: hasAllFolders ? CategoryStatuses.READY : CategoryStatuses.BLOCKED,
    assetRoot,
    assetLayout: { ...assetLayout },
    notes: hasAllFolders ? [] : ['Asset root or asset layout is incomplete.']
  };
}

function evaluateKnowledgeCategory({ businessRegistry }) {
  const profile = businessRegistry.getRuntimeBusinessProfile('MIDNIGHT_ARCHIVES');
  const knowledgePartition = normalizeValue(profile.knowledgePartition);

  return {
    status: knowledgePartition ? CategoryStatuses.READY : CategoryStatuses.BLOCKED,
    knowledgePartition,
    notes: knowledgePartition ? [] : ['Knowledge partition is missing.']
  };
}

function evaluateDashboardCategory({ dashboardService, businessRegistry, providerRegistry, credentialRegistry }) {
  const snapshot = dashboardService.generateDashboardSnapshot({
    businessRegistry,
    providerRegistry,
    credentialRegistry,
    runtimeMissions: []
  });

  const hasRequiredShape = Boolean(snapshot)
    && Boolean(snapshot.executiveSummary)
    && Array.isArray(snapshot.business)
    && Array.isArray(snapshot.missions)
    && Boolean(snapshot.operations)
    && Boolean(snapshot.executiveQueue)
    && Boolean(snapshot.diagnostics);

  return {
    status: hasRequiredShape ? CategoryStatuses.READY : CategoryStatuses.BLOCKED,
    snapshotShape: {
      executiveSummary: Boolean(snapshot.executiveSummary),
      business: Array.isArray(snapshot.business),
      missions: Array.isArray(snapshot.missions),
      operations: Boolean(snapshot.operations),
      executiveQueue: Boolean(snapshot.executiveQueue),
      diagnostics: Boolean(snapshot.diagnostics)
    },
    notes: hasRequiredShape ? [] : ['Dashboard snapshot shape is incomplete.']
  };
}

function evaluateExecutiveApprovalCategory({ publishingSafety, ceoApprovalGranted = false, publishRequested = false }) {
  const approvalRequired = publishingSafety.requiresCEOApproval || publishRequested || publishingSafety.publishingMode !== 'NONE';

  if (approvalRequired && !ceoApprovalGranted) {
    return {
      status: CategoryStatuses.BLOCKED,
      approvalRequired: true,
      ceoApprovalGranted: false,
      notes: ['CEO approval must be granted before any publish action.']
    };
  }

  return {
    status: CategoryStatuses.READY,
    approvalRequired,
    ceoApprovalGranted: Boolean(ceoApprovalGranted),
    notes: []
  };
}

function resolveOverallStatus(categories) {
  const values = Object.values(categories);

  if (values.some(category => category.status === CategoryStatuses.BLOCKED)) {
    return ReadinessStates.BLOCKED;
  }

  if (values.some(category => category.status === CategoryStatuses.READY_WITH_WARNINGS)) {
    return ReadinessStates.READY_WITH_WARNINGS;
  }

  return ReadinessStates.READY;
}

function collectWarnings(categories) {
  return Object.entries(categories)
    .filter(([, category]) => category.status === CategoryStatuses.READY_WITH_WARNINGS)
    .map(([name, category]) => ({
      category: name,
      notes: category.notes ?? []
    }));
}

function collectBlockers(categories) {
  return Object.entries(categories)
    .filter(([, category]) => category.status === CategoryStatuses.BLOCKED)
    .map(([name, category]) => ({
      category: name,
      notes: category.notes ?? []
    }));
}

function normalizeValue(value) {
  return String(value ?? '').trim().toUpperCase();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.getOwnPropertyNames(value).forEach(name => {
    deepFreeze(value[name]);
  });

  return Object.freeze(value);
}

module.exports = {
  ReadinessStates,
  CategoryStatuses,
  RequiredProviders,
  RequiredCredentials,
  createMidnightArchivesProductionChecklist,
  evaluateBusinessCategory,
  evaluateBrandCategory,
  evaluateProvidersCategory,
  evaluateCredentialsCategory,
  evaluatePublishingSafetyCategory,
  evaluateAssetsCategory,
  evaluateKnowledgeCategory,
  evaluateDashboardCategory,
  evaluateExecutiveApprovalCategory,
  resolveOverallStatus,
  collectWarnings,
  collectBlockers,
  normalizeValue,
  deepFreeze
};