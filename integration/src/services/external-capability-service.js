export class ExternalCapabilityService {

    constructor() {
        this.providers = new Map();
    }

    register(name, provider) {
        this.providers.set(name, provider);
    }

    get(name) {

        const provider = this.providers.get(name);

        if (!provider) {
            throw new Error(
                `Unknown capability provider: ${name}`
            );
        }

        return provider;

    }

    async execute(providerName, request) {

        const provider = this.get(providerName);

        return provider.execute(request);

    }

}
