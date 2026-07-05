import { ExecutiveRequest, WorkflowState } from '../../executive/src/models.js';
import { ResearchRequest } from '../../research/src/models.js';

export class ExecutiveResearchBridge {
  constructor({ executiveService, researchService, requestTranslator, responseTranslator, logger }) {
    this.executiveService = executiveService;
    this.researchService = researchService;
    this.requestTranslator = requestTranslator;
    this.responseTranslator = responseTranslator;
    this.logger = logger;
  }

  async execute(request) {
    const executiveResponse = await this.executiveService.handleRequest(request);
    const translatedRequest = this.requestTranslator.translate(request);
    const job = await this.researchService.createResearchJob(translatedRequest.id, translatedRequest.objective, translatedRequest.context);
    const result = await this.researchService.executeResearch(job.id, translatedRequest);
    const translatedResponse = this.responseTranslator.translate(result, executiveResponse.workflowId);
    this.logger.log({ workflowId: executiveResponse.workflowId, message: 'Research report returned', result: translatedResponse });
    return translatedResponse;
  }
}
