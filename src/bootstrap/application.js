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
}
