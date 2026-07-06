import { ExecutiveRequest } from '../../executive/src/models.js';

export class AtlasApplication {
    constructor(services) {
        this.services = services;
        this.executive = services.executive;
        this.executiveIntelligenceEngine = services.executiveIntelligenceEngine;
    }

    start() {
        console.log('================================');
        console.log('Atlas Application Initialized');
        console.log('================================');

        return this;
    }

    async execute(command) {
        const request = new ExecutiveRequest(
            `req-${Date.now()}`,
            command.type ?? 'ATLAS_EXECUTIVE_REQUEST',
            {
                objective: command.objective,
                ...command
            },
            new Date().toISOString()
        );

        const intelligenceReport =
            await this.executiveIntelligenceEngine.analyze(request);

        request.payload.intelligenceReport = intelligenceReport;

        return this.executive.handleRequest(request);
    }
}
