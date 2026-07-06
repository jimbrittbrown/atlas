import { ExecutiveRequest } from '../../executive/src/models.js';

export class AtlasApplication {
    constructor(services) {
        this.services = services;
        this.executive = services.executive;
        this.workerOrchestration = services.workerOrchestration;
        this.capabilityRegistry = services.capabilityRegistry;
    }

    start() {
        console.log('================================');
        console.log('Atlas Application Initialized');
        console.log('================================');

        return this;
    }

    async execute({ type, objective, payload = {} }) {
        const request = new ExecutiveRequest(
            `req-${Date.now()}`,
            type,
            {
                objective,
                ...payload
            },
            new Date().toISOString()
        );

        return this.executive.receiveRequest(request);
    }
}
