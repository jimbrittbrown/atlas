export class IntentSummary {

    constructor({
        objective,
        businessGoal,
        departments = [],
        workers = [],
        assumptions = [],
        risks = [],
        openQuestions = [],
        confidence = 0.0,
        nextAction = 'WORKFLOW_PLANNING'
    }) {
        this.objective = objective;
        this.businessGoal = businessGoal;
        this.departments = departments;
        this.workers = workers;
        this.assumptions = assumptions;
        this.risks = risks;
        this.openQuestions = openQuestions;
        this.confidence = confidence;
        this.nextAction = nextAction;
    }

}

export class ExecutiveCognitiveResult {

    constructor({
        request,
        intent
    }) {
        this.request = request;
        this.intent = intent;
    }

}
