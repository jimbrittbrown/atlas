import { AtlasFramerWebsiteAdapter } from './framer-website-adapter.js';

const REQUIRED_ADAPTER_METHODS = Object.freeze([
  'researchCompany',
  'generateBrandPackage',
  'selectTemplate',
  'generateWebsite',
  'publishWebsite',
  'buildDeliveryPackage',
  'restoreWebsite'
]);

export class SpecialistWebsiteProviderAdapter {
  constructor({ name = 'Specialist Pool Adapter', type = 'OTHER' } = {}) {
    this.name = name;
    this.type = type;
  }

  async researchCompany({ prospect }) {
    return {
      summary: `Research baseline generated for ${prospect?.companyName ?? 'unknown company'}.`,
      confidence: 0.7,
      findings: []
    };
  }

  async generateBrandPackage({ existingBranding = {}, companyResearch = {} }) {
    return {
      preservedBranding: { ...existingBranding },
      brandNarrative: companyResearch.summary ?? 'Brand narrative pending deeper research.',
      confidence: 0.72,
      warnings: []
    };
  }

  async selectTemplate({ brandPackage }) {
    return {
      templateId: 'atlas-template-neutral-01',
      rationale: `Selected for narrative clarity and brand continuity (${brandPackage?.brandNarrative ?? 'baseline'}).`,
      confidence: 0.74
    };
  }

  async generateWebsite({ templateSelection, brandPackage }) {
    return {
      websiteId: `site-${Date.now()}`,
      provider: this.name,
      templateId: templateSelection?.templateId ?? null,
      brandingSnapshot: brandPackage?.preservedBranding ?? {},
      previewUrl: 'https://preview.atlas.local',
      confidence: 0.75,
      warnings: []
    };
  }

  async publishWebsite({ generatedWebsite }) {
    return {
      websiteId: generatedWebsite?.websiteId ?? null,
      status: 'PUBLISHED',
      publishedUrl: 'https://published.atlas.local',
      confidence: 0.78
    };
  }

  async buildDeliveryPackage({ mission, artifacts }) {
    return {
      missionId: mission?.missionId ?? null,
      websiteId: artifacts?.generatedWebsite?.websiteId ?? null,
      publishedUrl: artifacts?.publishedWebsite?.publishedUrl ?? null,
      handoffChecklist: [
        'Brand package',
        'Template selection rationale',
        'QA report',
        'Publishing log'
      ]
    };
  }

  async restoreWebsite({ rollbackReference }) {
    return {
      status: 'RESTORED',
      restored: true,
      restoredReference: rollbackReference ?? null,
      liveUrl: 'https://published.atlas.local'
    };
  }

  async applySandboxBuildInstructions({ buildInstructions, customizationPackage, productionCustomization }) {
    return {
      status: 'SANDBOX_UPSERT_PREPARED',
      sandboxOnly: true,
      publishExecuted: false,
      deployExecuted: false,
      writeExecuted: false,
      productionOverwriteExecuted: false,
      destructiveOperationExecuted: false,
      accepted: {
        buildInstructions: Boolean(buildInstructions),
        customizationPackage: Boolean(customizationPackage),
        productionCustomization: Boolean(productionCustomization)
      },
      limitations: ['Provider adapter has no direct sandbox mutation API in base implementation.']
    };
  }
}

export class FramerWebsiteAdapter extends SpecialistWebsiteProviderAdapter {
  constructor({ framerAdapter } = {}) {
    super({ name: 'Framer Adapter', type: 'FRAMER' });
    this.framerAdapter = framerAdapter ?? new AtlasFramerWebsiteAdapter();
  }

  async researchCompany(payload = {}) {
    return this.framerAdapter.researchCompany(payload);
  }

  async generateBrandPackage(payload = {}) {
    return this.framerAdapter.generateBrandPackage(payload);
  }

  async selectTemplate(payload = {}) {
    return this.framerAdapter.selectTemplate(payload);
  }

  async generateWebsite(payload = {}) {
    return this.framerAdapter.generateWebsite(payload);
  }

  async publishWebsite(payload = {}) {
    return this.framerAdapter.publishWebsite(payload);
  }

  async buildDeliveryPackage(payload = {}) {
    return this.framerAdapter.buildDeliveryPackage(payload);
  }

  async restoreWebsite(payload = {}) {
    return this.framerAdapter.restoreWebsite(payload);
  }

  async readAllProjectDetails(payload = {}) {
    return this.framerAdapter.readAllProjectDetails(payload);
  }

  async applySandboxBuildInstructions(payload = {}) {
    return this.framerAdapter.applySandboxBuildInstructions(payload);
  }
}

export class WebflowWebsiteAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'Webflow Adapter', type: 'WEBFLOW' });
  }
}

export class WordPressWebsiteAdapter extends SpecialistWebsiteProviderAdapter {
  constructor() {
    super({ name: 'WordPress Adapter', type: 'WORDPRESS' });
  }
}

export function validateWebsiteProviderAdapter(adapter = {}) {
  const missingMethods = REQUIRED_ADAPTER_METHODS.filter(
    (methodName) => typeof adapter?.[methodName] !== 'function'
  );

  return {
    isValid: missingMethods.length === 0,
    missingMethods
  };
}

export class WebsiteProviderAdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  register({ adapterType = 'OTHER', adapter }) {
    const validation = validateWebsiteProviderAdapter(adapter);
    if (!validation.isValid) {
      throw new Error(`Provider adapter missing required methods: ${validation.missingMethods.join(', ')}`);
    }

    this.adapters.set(String(adapterType).toUpperCase(), adapter);
    return this;
  }

  getAdapter(adapterType = 'OTHER') {
    const requestedType = String(adapterType).toUpperCase();

    if (this.adapters.has(requestedType)) {
      return this.adapters.get(requestedType);
    }

    if (this.adapters.has('OTHER')) {
      return this.adapters.get('OTHER');
    }

    throw new Error(`No adapter registered for type ${requestedType}.`);
  }

  listAdapters() {
    return Array.from(this.adapters.entries()).map(([type, adapter]) => ({
      type,
      name: adapter?.name ?? 'Unknown Adapter'
    }));
  }
}
