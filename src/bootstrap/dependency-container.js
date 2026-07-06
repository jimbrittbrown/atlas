import { ExecutiveService } from '../../executive/src/executive-service.js';
import { SimpleRequestRouter } from '../../executive/src/request-router.js';

import { WorkerOrchestrationAdapter } from '../../integration/src/worker-orchestration-adapter.js';
import { CapabilityRegistryService } from '../../registry/src/capability-registry-service.js';

import { ResearchService } from '../../research/src/research-service.js';
import { ApprovalService } from '../../approval/src/approval-service.js';
import { MemoryService } from '../../memory/src/memory-service.js';
import { MetricsService } from '../../metrics/src/metrics-service.js';
import { PerformanceService } from '../../performance-intelligence/src/performance-service.js';

import { ResearchRouterAdapter } from '../adapters/research-router-adapter.js';

export class DependencyContainer {
    constructor() {
        this.services = {};
    }

    build() {
        const capabilityRegistry = new CapabilityRegistryService();

        const workerOrchestration = new WorkerOrchestrationAdapter(
            capabilityRegistry
        );

        const researchService = new ResearchService();
        const approvalService = new ApprovalService();
        const memoryService = new MemoryService();
        const metricsService = new MetricsService();
        const performanceService = new PerformanceService();

        const researchAdapter = new ResearchRouterAdapter(researchService);

        const requestRouter = new SimpleRequestRouter(
            researchAdapter,
            approvalService,
            memoryService,
            metricsService,
            performanceService,
            null,
            null,
            workerOrchestration
        );

        const executive = new ExecutiveService({
            requestRouter
        });

        this.services = {
            capabilityRegistry,
            workerOrchestration,
            researchService,
            researchAdapter,
            approvalService,
            memoryService,
            metricsService,
            performanceService,
            requestRouter,
            executive
        };

        return this.services;
    }

    get(name) {
        return this.services[name];
    }
}
