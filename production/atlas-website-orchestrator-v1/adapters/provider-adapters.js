const { IntegrationProviders } = require('../contracts/website-orchestrator-contracts.js');

class ProviderAdapter {
  constructor({ provider = IntegrationProviders.OTHER, adapterId = 'GENERIC_ADAPTER' } = {}) {
    this.provider = provider;
    this.adapterId = adapterId;
  }

  generateWebsite({ missionContext = {} } = {}) {
    return {
      provider: this.provider,
      adapterId: this.adapterId,
      status: 'READY',
      artifactPath: missionContext.websiteArtifactPath ?? '',
      warnings: []
    };
  }

  publishWebsite({ missionContext = {} } = {}) {
    return {
      provider: this.provider,
      adapterId: this.adapterId,
      status: 'PUBLISHED',
      publishUrl: missionContext.publishUrl ?? '',
      warnings: []
    };
  }
}

class FramerAdapter extends ProviderAdapter {
  constructor() {
    super({ provider: IntegrationProviders.FRAMER, adapterId: 'FRAMER_ADAPTER_V1' });
  }
}

class WebflowAdapter extends ProviderAdapter {
  constructor() {
    super({ provider: IntegrationProviders.WEBFLOW, adapterId: 'WEBFLOW_ADAPTER_V1' });
  }
}

class WordPressAdapter extends ProviderAdapter {
  constructor() {
    super({ provider: IntegrationProviders.WORDPRESS, adapterId: 'WORDPRESS_ADAPTER_V1' });
  }
}

class GenericSpecialistAdapter extends ProviderAdapter {
  constructor({ providerName = IntegrationProviders.OTHER, adapterId = 'GENERIC_SPECIALIST_ADAPTER_V1' } = {}) {
    super({ provider: providerName, adapterId });
  }
}

function createProviderAdapter({ provider = IntegrationProviders.OTHER, adapterId = '' } = {}) {
  if (provider === IntegrationProviders.FRAMER) {
    return new FramerAdapter();
  }

  if (provider === IntegrationProviders.WEBFLOW) {
    return new WebflowAdapter();
  }

  if (provider === IntegrationProviders.WORDPRESS) {
    return new WordPressAdapter();
  }

  return new GenericSpecialistAdapter({ providerName: provider, adapterId: adapterId || 'GENERIC_SPECIALIST_ADAPTER_V1' });
}

module.exports = {
  ProviderAdapter,
  FramerAdapter,
  WebflowAdapter,
  WordPressAdapter,
  GenericSpecialistAdapter,
  createProviderAdapter
};
