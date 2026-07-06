import { ExecutiveService } from '../../executive/src/executive-service.js';
import { WorkerOrchestrationAdapter } from '../../integration/src/worker-orchestration-adapter.js';
import { CapabilityRegistryService } from '../../registry/src/capability-registry-service.js';

export class AtlasApplication {
    constructor() {
        this.capabilityRegistry = new CapabilityRegistryService();

        this.workerOrchestration = new WorkerOrchestrationAdapter(
            this.capabilityRegistry
        );

        this.executive = new ExecutiveService({
            requestRouter: this.workerOrchestration
        });
    }

    start() {
        console.log('================================');
        console.log('Atlas Application Initialized');
        console.log('================================');

        return this;
    }
}
