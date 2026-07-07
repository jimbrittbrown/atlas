import { CapabilityProvider } from './capability-provider.js';
import { ProviderMetadata } from './provider-metadata.js';
import { CapabilityHealth } from './capability-health.js';
import { CapabilityClient } from './capability-client.js';

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

    buildConfiguration() {
        return {
            baseUrl: 'https://api.perplexity.ai',
            timeout: 30000,
            headers: {
                Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        };
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
        const configuration = this.buildConfiguration();
        const client = new CapabilityClient(configuration);

        return client.execute({
            endpoint: '/v1/sonar',
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are Atlas Research. Provide concise, source-grounded research.'
                    },
                    {
                        role: 'user',
                        content: request.objective
                    }
                ]
            })
        });
    }

    normalize(response) {
        return response;
    }
}
