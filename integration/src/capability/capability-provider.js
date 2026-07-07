export class CapabilityProvider {
    identity() {
        throw new Error('CapabilityProvider.identity() must be implemented.');
    }

    capabilities() {
        throw new Error('CapabilityProvider.capabilities() must be implemented.');
    }

    health() {
        return {
            available: false,
            authenticated: false,
            latency: null,
            lastSuccessfulCall: null,
            failureCount: 0,
            rateLimitStatus: 'unknown',
            lastHealthCheck: new Date().toISOString()
        };
    }

    validate(request) {
        if (!request?.capability) {
            throw new Error('Capability request must include a capability.');
        }

        if (!request?.objective) {
            throw new Error('Capability request must include an objective.');
        }

        return true;
    }

    async execute(request) {
        throw new Error('CapabilityProvider.execute() must be implemented.');
    }

    normalize(response) {
        return response;
    }
}
