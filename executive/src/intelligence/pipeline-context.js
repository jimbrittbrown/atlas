export class ExecutivePipelineContext {

    constructor({
        request,
        executiveService
    }) {
        this.request = request;
        this.executiveService = executiveService;
        this.intent = null;
        this.situation = null;
        this.strategy = null;
        this.capabilities = null;
        this.workflowPlan = null;
    }

}
