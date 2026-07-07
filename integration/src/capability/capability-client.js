export class CapabilityClient {
    constructor(config) {
        this.config = config;
    }

    async execute(request) {
        const prepared = this.prepareRequest(request);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.config.timeout);

        try {
            const response = await fetch(prepared.url, {
                method: 'POST',
                headers: prepared.headers,
                body: prepared.body,
                signal: controller.signal
            });

            if (response.ok) {
                return await response.json();
            }

            let body = null;

            try {
                body = await response.json();
            } catch {
                body = null;
            }

            const error = new Error(`HTTP ${response.status} ${response.statusText}`);

            if (body !== null) {
                error.body = body;
            }

            throw this.normalizeError(error);
        } catch (error) {
            if (controller.signal.aborted) {
                throw this.normalizeError(new Error('CapabilityClient request timed out'));
            }

            throw this.normalizeError(error);
        } finally {
            clearTimeout(timeoutId);
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
