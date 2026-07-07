export class CapabilityRouter {
    constructor(registry) {
        this.registry = registry;
    }

    route(request) {
        if (!request?.capability) {
            throw new Error('Capability request must include a capability.');
        }

        const providers = this.registry.findByCapability(request.capability);

        if (providers.length === 0) {
            throw new Error('No provider available for capability.');
        }

        return {
            capability: request.capability,
            providers
        };
    }
}