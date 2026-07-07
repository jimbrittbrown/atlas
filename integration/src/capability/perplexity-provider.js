import { CapabilityProvider } from './capability-provider.js';
import { ProviderMetadata } from './provider-metadata.js';
import { CapabilityHealth } from './capability-health.js';

export class PerplexityProvider extends CapabilityProvider {
    identity() {
        return new ProviderMetadata(
            'perplexity',
            'Perplexity',
            'v1',
            'Live research evidence retrieval',
            'none',
            this.capabilities(),
            'unknown'
        );
    }

    capabilities() {
        return ['research'];
    }

    health() {
        return new CapabilityHealth();
    }

    validate(request) {
        return super.validate(request);
    }

    async execute(request) {
        void request;
        throw new Error('PerplexityProvider not yet implemented.');
    }

    normalize(response) {
        return response;
    }
}
