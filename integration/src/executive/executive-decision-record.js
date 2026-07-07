export class ExecutiveDecisionRecord {
    constructor(
        missionId,
        title,
        createdAt = new Date().toISOString(),
        executiveSummary,
        findings = [],
        conflicts = [],
        opportunities = [],
        risks = [],
        decisionConfidence,
        recommendation,
        nextActions = [],
        outcome = null,
        lessonsLearned = []
    ) {
        this.missionId = missionId;
        this.title = title;
        this.createdAt = createdAt;
        this.executiveSummary = executiveSummary;
        this.findings = findings;
        this.conflicts = conflicts;
        this.opportunities = opportunities;
        this.risks = risks;
        this.decisionConfidence = decisionConfidence;
        this.recommendation = recommendation;
        this.nextActions = nextActions;
        this.outcome = outcome;
        this.lessonsLearned = lessonsLearned;
    }
}