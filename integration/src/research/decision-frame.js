export class DecisionFrame {
    constructor(
        missionId,
        objective,
        decisionQuestion,
        primaryObjective,
        secondaryObjectives = [],
        constraints = [],
        successCriteria = [],
        createdAt = new Date().toISOString()
    ) {
        this.missionId = missionId;
        this.objective = objective;
        this.decisionQuestion = decisionQuestion;
        this.primaryObjective = primaryObjective;
        this.secondaryObjectives = secondaryObjectives;
        this.constraints = constraints;
        this.successCriteria = successCriteria;
        this.createdAt = createdAt;
    }
}
