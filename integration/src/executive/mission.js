export class Mission {
    constructor(
        missionId,
        title,
        objective,
        status = 'created',
        priority = 'normal',
        createdAt = new Date().toISOString(),
        updatedAt = new Date().toISOString(),
        findings = [],
        executiveDecision = null,
        plan = null,
        execution = null,
        outcome = null,
        lessonsLearned = []
    ) {
        this.missionId = missionId;
        this.title = title;
        this.objective = objective;
        this.status = status;
        this.priority = priority;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.findings = findings;
        this.executiveDecision = executiveDecision;
        this.plan = plan;
        this.execution = execution;
        this.outcome = outcome;
        this.lessonsLearned = lessonsLearned;
    }
}