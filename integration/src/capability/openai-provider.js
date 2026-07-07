import { CapabilityProvider } from './capability-provider.js';
import { ProviderMetadata } from './provider-metadata.js';
import { CapabilityHealth } from './capability-health.js';
import { CapabilityClient } from './capability-client.js';

export class OpenAIProvider extends CapabilityProvider {
    identity() {
        return new ProviderMetadata(
            'openai',
            'OpenAI',
            'v1',
            'General reasoning and executive analysis',
            'bearer',
            this.capabilities(),
            'unknown'
        );
    }

    capabilities() {
        return ['research', 'analysis'];
    }

    health() {
        return new CapabilityHealth();
    }

    buildConfiguration() {
        return {
            baseUrl: 'https://api.openai.com',
            timeout: 30000,
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        };
    }

    validate(request) {
        return super.validate(request);
    }

    async execute(request) {
        const client = new CapabilityClient(this.buildConfiguration());

        return client.execute({
            endpoint: '/v1/chat/completions',
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are Atlas Analysis. Provide concise executive reasoning.'
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
