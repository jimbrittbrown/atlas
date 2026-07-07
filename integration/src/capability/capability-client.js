export class CapabilityClient {
    constructor(config) {
        this.config = config;
    }

    async execute(request) {
        const prepared = this.prepareRequest(request);

        try {
            const response = await fetch(prepared.url, {
                method: 'POST',
                headers: prepared.headers,
                body: prepared.body
            });

            return await response.json();
        } catch (error) {
            throw this.normalizeError(error);
        }
    }

    prepareRequest(request) {
        return {
            url: `${this.config.baseUrl}${request.endpoint}`,
            headers: this.buildHeaders(),
            body: request.body,
            timeout: this.config.timeout
        };
    }

    buildHeaders() {
        return this.config.headers || {};
    }

    normalizeError(error) {
        return error;
    }
}
