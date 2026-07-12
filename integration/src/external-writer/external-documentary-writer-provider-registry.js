export class ExternalDocumentaryWriterProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    const identity = String(provider?.identity?.() ?? '').trim();
    if (identity.length === 0) {
      throw new Error('External documentary writer provider must declare identity().');
    }

    this.providers.set(identity, provider);
    return identity;
  }

  list() {
    return [...this.providers.keys()].sort((a, b) => a.localeCompare(b));
  }

  has(identity) {
    return this.providers.has(String(identity ?? '').trim());
  }

  get(identity) {
    const provider = this.providers.get(String(identity ?? '').trim());
    if (!provider) {
      throw new Error(`Unknown external documentary writer provider: ${identity}`);
    }

    return provider;
  }

  resolveBestAvailable({ preferredProvider = null } = {}) {
    if (preferredProvider && this.has(preferredProvider)) {
      const provider = this.get(preferredProvider);
      if (provider.isConfigured()) {
        return provider;
      }
    }

    const providers = [...this.providers.values()];
    const configured = providers.filter(provider => provider.isConfigured());
    if (configured.length === 0) {
      return null;
    }

    configured.sort((a, b) => {
      const rankA = Number(a.priority?.() ?? 100);
      const rankB = Number(b.priority?.() ?? 100);
      return rankA - rankB;
    });

    return configured[0];
  }
}
