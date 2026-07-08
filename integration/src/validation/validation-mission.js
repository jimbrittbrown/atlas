export class ValidationMission {
    constructor(
        missionId,
        title,
        executiveQuestion,
        expectedOutputs = [],
        evaluationCriteria = [],
        benchmarkVersion = '1.0',
        createdAt = new Date().toISOString()
    ) {
        this.missionId = missionId;
        this.title = title;
        this.executiveQuestion = executiveQuestion;
        this.expectedOutputs = expectedOutputs;
        this.evaluationCriteria = evaluationCriteria;
        this.benchmarkVersion = benchmarkVersion;
        this.createdAt = createdAt;
    }
}
