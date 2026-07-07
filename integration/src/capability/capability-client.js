export class CapabilityClient {
    constructor(config) {
        this.config = config;
    }

    async execute(request) {
        void request;
        throw new Error('CapabilityClient not yet implemented.');
    }

    buildHeaders() {
        return {};
    }

    normalizeError(error) {
        return error;
    }
}
