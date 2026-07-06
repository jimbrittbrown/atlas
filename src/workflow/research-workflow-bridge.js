export class ResearchWorkflowBridge {

    constructor({
        executiveWorkflowManager,
        researchService
    }) {
        this.executiveWorkflowManager = executiveWorkflowManager;
        this.researchService = researchService;
    }

    async execute(workflowId, request) {
        throw new Error(
            'ResearchWorkflowBridge not implemented yet.'
        );
    }

}
