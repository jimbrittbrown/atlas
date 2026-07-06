import { ExecutiveService } from '../../executive/src/executive-service.js';
import { WorkerOrchestrationAdapter } from '../../integration/src/worker-orchestration-adapter.js';
import { CapabilityRegistryService } from '../../registry/src/capability-registry-service.js';

export class DependencyContainer {
    constructor() {
        this.services = {};
    }

    build() {
        const capabilityRegistry = new CapabilityRegistryService();

        const workerOrchestration = new WorkerOrchestrationAdapter(
            capabilityRegistry
        );

        const executive = new ExecutiveService({
            requestRouter: workerOrchestration
        });

        this.services = {
            capabilityRegistry,
            workerOrchestration,
            executive
        };

        return this.services;
    }

    get(name) {
        return this.services[name];
    }
}
