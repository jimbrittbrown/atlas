const {
  ProductionConfigurationHealthStates,
  SupportedConfigurationDomains,
  RequiredProviderDefinitions,
  createProductionConfiguration,
  validateProductionConfiguration,
  aggregateRequiredCredentialIds,
  cloneValue
} = require('./production-configuration-contracts.js');

class ProductionConfigurationManager {
  constructor({ businessRegistry = null, providerRegistry = null, credentialRegistry = null, now = () => Date.now() } = {}) {
    this.businessRegistry = businessRegistry;
    this.providerRegistry = providerRegistry;
    this.credentialRegistry = credentialRegistry;
    this.now = now;
  }

  generateBusinessReport({ businessId, configuration = {}, businessRegistry = this.businessRegistry, providerRegistry = this.providerRegistry, credentialRegistry = this.credentialRegistry } = {}) {
    const businessProfile = this.resolveBusinessProfile(businessId, businessRegistry);
    const resolvedConfiguration = this.resolveConfigurationForBusiness(configuration, businessId);
    const normalizedConfiguration = this.buildResolvedConfiguration({ businessProfile, configuration: resolvedConfiguration });
    const validation = validateProductionConfiguration(normalizedConfiguration, {
      businessProfile,
      providerRegistry,
      credentialRegistry
    });

    return this.buildReport({
      businessProfile,
      normalizedConfiguration,
      validation,
      businessRegistry,
      providerRegistry,
      credentialRegistry
    });
  }

  generatePortfolioReport({ configurations = {}, businessRegistry = this.businessRegistry, providerRegistry = this.providerRegistry, credentialRegistry = this.credentialRegistry } = {}) {
    const businessProfiles = this.listBusinessProfiles(businessRegistry);

    if (businessProfiles.length === 0) {
      const missingProfileReport = this.buildEmptyPortfolioReport();
      missingProfileReport.configurationWarnings.push({
        category: 'business',
        domain: 'business',
        field: 'businessId',
        code: 'MISSING_BUSINESS_PROFILE',
        message: 'No business profiles are registered.',
        severity: 'BLOCKED',
        expected: null,
        actual: null
      });
      return missingProfileReport;
    }

    const reports = businessProfiles.map(profile => this.generateBusinessReport({
      businessId: profile.businessId,
      configuration: this.resolveConfigurationForBusiness(configurations, profile.businessId),
      businessRegistry,
      providerRegistry,
      credentialRegistry
    }));

    return this.aggregateReports(reports);
  }

  buildResolvedConfiguration({ businessProfile = null, configuration = {} } = {}) {
    const profile = businessProfile ?? {};
    const businessId = configuration.business?.businessId ?? profile.businessId ?? '';
    const displayName = configuration.business?.displayName ?? profile.displayName ?? '';

    return createProductionConfiguration({
      business: {
        businessId,
        displayName,
        productionReady: Boolean(configuration.business?.productionReady),
        brandConfigured: Boolean(configuration.business?.brandConfigured),
        channelConfigured: Boolean(configuration.business?.channelConfigured),
        assetRootConfigured: Boolean(configuration.business?.assetRootConfigured ?? profile.assetRoot),
        knowledgePartitionConfigured: Boolean(configuration.business?.knowledgePartitionConfigured ?? profile.knowledgePartition)
      },
      brand: {
        ...(configuration.brand ?? {})
      },
      providers: this.buildProvidersConfiguration({ businessProfile: profile, configuration }),
      credentials: this.buildCredentialsConfiguration({ businessProfile: profile, configuration }),
      publishing: {
        platform: configuration.publishing?.platform ?? profile.publishingProfile?.platform ?? 'YouTube',
        visibilityDefault: configuration.publishing?.visibilityDefault ?? 'PRIVATE',
        publishMode: configuration.publishing?.publishMode ?? 'NONE',
        approvalRequired: configuration.publishing?.approvalRequired ?? true,
        rollbackEnabled: configuration.publishing?.rollbackEnabled ?? true,
        channelConfigured: Boolean(configuration.publishing?.channelConfigured ?? profile.publishingProfile?.platform),
        channelId: configuration.publishing?.channelId ?? ''
      },
      storage: {
        assetStorage: configuration.storage?.assetStorage ?? profile.assetRoot ?? '',
        reportStorage: configuration.storage?.reportStorage ?? this.buildDefaultPath(profile.assetRoot, 'reports'),
        knowledgeStorage: configuration.storage?.knowledgeStorage ?? profile.knowledgePartition ?? '',
        backupPolicy: configuration.storage?.backupPolicy ?? 'daily-snapshot'
      },
      knowledge: {
        knowledgePartition: configuration.knowledge?.knowledgePartition ?? profile.knowledgePartition ?? '',
        learningEnabled: configuration.knowledge?.learningEnabled ?? true,
        promotionPolicy: configuration.knowledge?.promotionPolicy ?? 'governed-candidate-only',
        retentionPolicy: configuration.knowledge?.retentionPolicy ?? 'retain-candidates'
      },
      metrics: {
        youtubeMetrics: configuration.metrics?.youtubeMetrics ?? true,
        qualityMetrics: configuration.metrics?.qualityMetrics ?? true,
        businessMetrics: configuration.metrics?.businessMetrics ?? true,
        learningMetrics: configuration.metrics?.learningMetrics ?? true
      }
    });
  }

  buildProvidersConfiguration({ businessProfile = null, configuration = {} } = {}) {
    const requiredProviderIds = Object.keys(RequiredProviderDefinitions);
    const configuredProviderIds = this.listConfiguredProviderIds(this.providerRegistry);

    return {
      requiredProviderIds,
      configuredProviderIds,
      providerHealth: this.resolveProviderHealth(this.providerRegistry),
      providerSummary: this.resolveProviderSummary(this.providerRegistry, this.credentialRegistry, businessProfile),
      providerRegistryAvailable: Boolean(this.providerRegistry)
    };
  }

  buildCredentialsConfiguration({ businessProfile = null, configuration = {} } = {}) {
    const requiredCredentialIds = aggregateRequiredCredentialIds();
    const configuredCredentialIds = this.listConfiguredCredentialIds(this.credentialRegistry);

    return {
      requiredCredentialIds,
      configuredCredentialIds,
      credentialHealth: this.resolveCredentialHealth(this.credentialRegistry),
      credentialSummary: this.resolveCredentialSummary(this.credentialRegistry),
      credentialRegistryAvailable: Boolean(this.credentialRegistry)
    };
  }

  buildReport({ businessProfile, normalizedConfiguration, validation, businessRegistry, providerRegistry, credentialRegistry }) {
    const configurationSummary = this.buildConfigurationSummary({
      businessProfile,
      normalizedConfiguration,
      validation,
      businessRegistry,
      providerRegistry,
      credentialRegistry
    });

    return {
      businessId: normalizedConfiguration.business.businessId || businessProfile?.businessId || null,
      displayName: normalizedConfiguration.business.displayName || businessProfile?.displayName || null,
      productionConfigurationHealth: validation.productionConfigurationHealth,
      configurationWarnings: validation.configurationWarnings,
      missingConfiguration: validation.missingConfiguration,
      configurationDrift: validation.configurationDrift,
      launchReadiness: validation.launchReadiness,
      configurationSummary,
      business: validation.business,
      brand: validation.brand,
      providers: validation.providers,
      credentials: validation.credentials,
      publishing: validation.publishing,
      storage: validation.storage,
      knowledge: validation.knowledge,
      metrics: validation.metrics,
      validation,
      generatedAt: new Date(this.now()).toISOString()
    };
  }

  buildConfigurationSummary({ businessProfile, normalizedConfiguration, validation, businessRegistry, providerRegistry, credentialRegistry }) {
    return {
      businessCount: this.listBusinessProfiles(businessRegistry).length,
      readyBusinesses: validation.productionConfigurationHealth === ProductionConfigurationHealthStates.READY ? 1 : 0,
      warningBusinesses: validation.productionConfigurationHealth === ProductionConfigurationHealthStates.READY_WITH_WARNINGS ? 1 : 0,
      blockedBusinesses: validation.productionConfigurationHealth === ProductionConfigurationHealthStates.BLOCKED ? 1 : 0,
      requiredProviderCount: Object.keys(RequiredProviderDefinitions).length,
      configuredProviderCount: this.listConfiguredProviderIds(providerRegistry).length,
      requiredCredentialCount: aggregateRequiredCredentialIds().length,
      configuredCredentialCount: this.listConfiguredCredentialIds(credentialRegistry).length,
      missingItems: validation.missingConfiguration.length,
      driftItems: validation.configurationDrift.length,
      warningItems: validation.configurationWarnings.length,
      businessId: normalizedConfiguration.business.businessId || businessProfile?.businessId || null,
      displayName: normalizedConfiguration.business.displayName || businessProfile?.displayName || null
    };
  }

  aggregateReports(reports = []) {
    const allMissing = reports.flatMap(report => report.missingConfiguration.map(issue => ({ ...issue, businessId: report.businessId })));
    const allWarnings = reports.flatMap(report => report.configurationWarnings.map(issue => ({ ...issue, businessId: report.businessId })));
    const allDrift = reports.flatMap(report => report.configurationDrift.map(issue => ({ ...issue, businessId: report.businessId })));
    const health = this.resolvePortfolioHealth(reports);

    return {
      productionConfigurationHealth: health,
      launchReadiness: health,
      configurationWarnings: allWarnings,
      missingConfiguration: allMissing,
      configurationDrift: allDrift,
      configurationSummary: {
        businessCount: reports.length,
        readyBusinesses: reports.filter(report => report.productionConfigurationHealth === ProductionConfigurationHealthStates.READY).length,
        warningBusinesses: reports.filter(report => report.productionConfigurationHealth === ProductionConfigurationHealthStates.READY_WITH_WARNINGS).length,
        blockedBusinesses: reports.filter(report => report.productionConfigurationHealth === ProductionConfigurationHealthStates.BLOCKED).length,
        missingItems: allMissing.length,
        driftItems: allDrift.length,
        warningItems: allWarnings.length,
        requiredProviderCount: Object.keys(RequiredProviderDefinitions).length,
        requiredCredentialCount: aggregateRequiredCredentialIds().length,
        businessIds: reports.map(report => report.businessId).filter(Boolean)
      },
      businesses: reports
    };
  }

  buildEmptyPortfolioReport() {
    return {
      productionConfigurationHealth: ProductionConfigurationHealthStates.BLOCKED,
      launchReadiness: ProductionConfigurationHealthStates.BLOCKED,
      configurationWarnings: [],
      missingConfiguration: [],
      configurationDrift: [],
      configurationSummary: {
        businessCount: 0,
        readyBusinesses: 0,
        warningBusinesses: 0,
        blockedBusinesses: 0,
        missingItems: 0,
        driftItems: 0,
        warningItems: 0,
        requiredProviderCount: Object.keys(RequiredProviderDefinitions).length,
        requiredCredentialCount: aggregateRequiredCredentialIds().length,
        businessIds: []
      },
      businesses: []
    };
  }

  resolvePortfolioHealth(reports = []) {
    if (reports.some(report => report.productionConfigurationHealth === ProductionConfigurationHealthStates.BLOCKED)) {
      return ProductionConfigurationHealthStates.BLOCKED;
    }

    if (reports.some(report => report.productionConfigurationHealth === ProductionConfigurationHealthStates.READY_WITH_WARNINGS)) {
      return ProductionConfigurationHealthStates.READY_WITH_WARNINGS;
    }

    return ProductionConfigurationHealthStates.READY;
  }

  resolveBusinessProfile(businessId, businessRegistry = this.businessRegistry) {
    const normalizedBusinessId = String(businessId ?? '').toUpperCase().trim();

    if (!businessRegistry || !normalizedBusinessId) {
      return null;
    }

    if (typeof businessRegistry.getRuntimeBusinessProfile === 'function') {
      try {
        return businessRegistry.getRuntimeBusinessProfile(normalizedBusinessId);
      } catch (_error) {
        return null;
      }
    }

    if (typeof businessRegistry.listBusinesses === 'function') {
      return businessRegistry.listBusinesses().find(profile => profile.businessId === normalizedBusinessId) ?? null;
    }

    return null;
  }

  listBusinessProfiles(businessRegistry = this.businessRegistry) {
    if (!businessRegistry || typeof businessRegistry.listBusinesses !== 'function') {
      return [];
    }

    return businessRegistry.listBusinesses().map(profile => cloneValue(profile));
  }

  listConfiguredProviderIds(providerRegistry = this.providerRegistry) {
    if (!providerRegistry || typeof providerRegistry.listProviders !== 'function') {
      return [];
    }

    return providerRegistry.listProviders()
      .filter(provider => String(provider.status ?? '').toUpperCase() !== 'DISABLED')
      .map(provider => provider.providerId)
      .filter(Boolean);
  }

  listConfiguredCredentialIds(credentialRegistry = this.credentialRegistry) {
    if (!credentialRegistry || typeof credentialRegistry.listCredentials !== 'function') {
      return [];
    }

    return credentialRegistry.listCredentials()
      .filter(credential => credential.configured === true)
      .map(credential => credential.credentialId)
      .filter(Boolean);
  }

  resolveProviderSummary(providerRegistry = this.providerRegistry, credentialRegistry = this.credentialRegistry, businessProfile = null) {
    if (!providerRegistry || typeof providerRegistry.getProviderSummary !== 'function') {
      return {
        providerCount: 0,
        configuredProviders: 0,
        healthyProviders: 0,
        productionReadyProviders: 0,
        failedProviders: [],
        quotaWarnings: []
      };
    }

    return cloneValue(providerRegistry.getProviderSummary({
      environment: 'production',
      credentialRegistry
    }));
  }

  resolveCredentialSummary(credentialRegistry = this.credentialRegistry) {
    if (!credentialRegistry || typeof credentialRegistry.getCredentialSummary !== 'function') {
      return {
        environment: 'production',
        credentialCount: 0,
        configuredCredentials: 0,
        verifiedCredentials: 0,
        warningCredentials: 0
      };
    }

    return cloneValue(credentialRegistry.getCredentialSummary({ environment: 'production' }));
  }

  resolveProviderHealth(providerRegistry = this.providerRegistry) {
    if (!providerRegistry || typeof providerRegistry.getHealth !== 'function') {
      return 'UNKNOWN';
    }

    return providerRegistry.getHealth();
  }

  resolveCredentialHealth(credentialRegistry = this.credentialRegistry) {
    if (!credentialRegistry || typeof credentialRegistry.getCredentialSummary !== 'function') {
      return 'UNKNOWN';
    }

    const summary = credentialRegistry.getCredentialSummary({ environment: 'production' });
    return summary.warningCredentials > 0 ? 'WARNING' : 'HEALTHY';
  }

  buildDefaultPath(rootPath, suffix) {
    const normalizedRoot = String(rootPath ?? '').trim().replace(/\/+$/, '');

    if (normalizedRoot.length === 0) {
      return '';
    }

    return `${normalizedRoot}/${suffix}`;
  }

  resolveConfigurationForBusiness(configurations = {}, businessId) {
    const normalizedBusinessId = String(businessId ?? '').toUpperCase().trim();

    if (!configurations || typeof configurations !== 'object') {
      return {};
    }

    if (configurations.businesses && typeof configurations.businesses === 'object') {
      return cloneValue(configurations.businesses[normalizedBusinessId] ?? {});
    }

    if (configurations[normalizedBusinessId] && typeof configurations[normalizedBusinessId] === 'object') {
      return cloneValue(configurations[normalizedBusinessId]);
    }

    if (configurations.business && configurations.brand && configurations.publishing) {
      return cloneValue(configurations);
    }

    if (configurations.businessId || configurations.displayName) {
      return cloneValue(configurations);
    }

    return {};
  }
}

module.exports = {
  ProductionConfigurationManager
};