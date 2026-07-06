export class ResearchRouterAdapter {
    constructor(researchService) {
        this.researchService = researchService;
    }

    async execute(request) {
        const objective =
            request.payload?.objective ??
            request.requestType ??
            'Executive research request';

        const job = await this.researchService.createResearchJob(
            request.id,
            objective,
            {
                requestType: request.requestType,
                payload: request.payload,
                createdAt: request.createdAt
            }
        );

        return this.researchService.executeResearch(job.id, request);
    }
}
