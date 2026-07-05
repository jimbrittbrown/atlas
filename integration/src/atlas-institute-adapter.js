import { AtlasInstituteService } from '../../atlas-institute/src/atlas-institute-service.js';

export class AtlasInstituteAdapter {
  constructor({
    executiveService,
    researchService,
    memoryService,
    metricsService,
    performanceService,
    approvalService,
    capabilityRegistryService,
    workerOrchestrationService,
    controlCenterService,
    service = null,
  }) {
    this.service = service ?? new AtlasInstituteService({
      executiveService,
      researchService,
      memoryService,
      metricsService,
      performanceService,
      approvalService,
      capabilityRegistryService,
      workerOrchestrationService,
      controlCenterService,
    });
  }

  captureLearningFromWorkflow({ request, result }) {
    return this.service.captureSystemKnowledge({
      workflowId: result.workflowId,
      requestId: request.id,
      objective: request.objective,
      controlCenterView: result.controlCenter,
      executionResult: result,
    });
  }

  generateOrganizationalLearning({ request, result }) {
    const topic = request.context?.learningTopic ?? request.objective ?? 'Atlas Operations';
    const area = request.context?.improvementArea ?? 'Operational Excellence';

    return {
      playbook: this.service.generatePlaybook({ topic, query: { workflowId: result.workflowId } }),
      bestPractices: this.service.generateBestPractices({ domain: topic }),
      improvements: this.service.recommendImprovements({ area }),
      summary: this.service.getKnowledgeSummary(),
    };
  }

  searchKnowledge(query = {}) {
    return this.service.searchKnowledge(query);
  }
}
