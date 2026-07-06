import { ExecutiveService } from './executive/src/executive-service.js';
import { ExecutiveRequest } from './executive/src/models.js';
import { WorkerOrchestrationAdapter } from './integration/src/worker-orchestration-adapter.js';
import { CapabilityRegistryService } from './registry/src/capability-registry-service.js';

const capabilityRegistry = new CapabilityRegistryService();

const workerOrchestration = new WorkerOrchestrationAdapter(
  capabilityRegistry
);

const executive = new ExecutiveService({
  requestRouter: {
    async route(request, workflow) {
      console.log('Atlas Runtime: routing executive request');
      console.log({ requestId: request.id, workflowId: workflow.id });
      return workerOrchestration;
    },
  },
});

const request = new ExecutiveRequest(
  'boot-001',
  'ATLAS_BOOT',
  {
    mission: 'Atlas Boot #1',
    objective: 'Verify Atlas runtime composition root can receive and process an executive request.',
  },
  new Date().toISOString()
);

const response = await executive.receiveRequest(request);

console.log('================================');
console.log('ATLAS BOOT #1 COMPLETE');
console.log('================================');
console.log(response);
