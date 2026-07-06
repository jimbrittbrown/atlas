export class ExecutiveDecisionRecorder {

    constructor() {
        this.history = [];
    }

    record(report) {

        this.history.push({

            timestamp: report.timestamp,

            objective: report.intent.objective,

            businessGoal: report.intent.businessGoal,

            confidence: report.confidence,

            recommendation:
                report.assessment.recommendation

        });

    }

    historySnapshot() {
        return [...this.history];
    }

}
