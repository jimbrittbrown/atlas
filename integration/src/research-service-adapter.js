import { ResearchRequest } from '../../research/src/models.js';

export class ResearchServiceAdapter {
  constructor(researchService) {
    this.researchService = researchService;
  }

  async createJob(request) {
    return this.researchService.createResearchJob(request.id, request.objective, request.context);
  }

  async runJob(jobId, request) {
    return this.researchService.executeResearch(jobId, request);
  }
}
