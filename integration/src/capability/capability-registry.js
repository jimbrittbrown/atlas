export class CapabilityRegistry {
    constructor() {
        this.providers = new Map();
        this.capabilityIndex = new Map();
    }

    register(provider) {
        const identity = provider.identity();
        const capabilities = provider.capabilities();

        if (!identity?.name) {
            throw new Error('Provider must declare an identity name.');
        }

        this.providers.set(identity.name, {
            provider,
            identity,
            capabilities,
            registeredAt: new Date().toISOString()
        });

        for (const capability of capabilities) {
            if (!this.capabilityIndex.has(capability)) {
                this.capabilityIndex.set(capability, new Set());
            }

            this.capabilityIndex.get(capability).add(identity.name);
        }

        return identity;
    }

    listProviders() {
        return Array.from(this.providers.values()).map(entry => ({
            identity: entry.identity,
            capabilities: entry.capabilities,
            registeredAt: entry.registeredAt
        }));
    }

    listCapabilities() {
        return Array.from(this.capabilityIndex.keys());
    }

    findByCapability(capability) {
        const providerNames = this.capabilityIndex.get(capability);

        if (!providerNames) {
            return [];
        }

        return Array.from(providerNames)
            .map(name => this.providers.get(name))
            .filter(entry => Boolean(entry))
            .map(entry => entry.provider);
    }

    getProvider(name) {
        const entry = this.providers.get(name);

        if (!entry) {
            throw new Error(`Unknown capability provider: ${name}`);
        }

        return entry.provider;
    }
}
