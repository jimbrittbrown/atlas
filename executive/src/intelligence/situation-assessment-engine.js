export class SituationAssessmentEngine {

    assess(report) {

        return {

            currentState:
                this.determineCurrentState(report),

            constraints:
                this.identifyConstraints(report),

            availableInformation:
                this.identifyAvailableInformation(report),

            missingInformation:
                this.identifyMissingInformation(report),

            readiness:
                this.determineReadiness(report)

        };

    }

    determineCurrentState(report) {

        return "Objective Received";

    }

    identifyConstraints(report) {

        return [
            "No execution budget specified.",
            "Timeline not specified."
        ];

    }

    identifyAvailableInformation(report) {

        return [
            report.intent.objective,
            report.intent.businessGoal
        ];

    }

    identifyMissingInformation(report) {

        return report.intent.openQuestions;

    }

    determineReadiness(report) {

        if (report.intent.openQuestions.length === 0)
            return "READY";

        return "REQUIRES_INFORMATION";

    }

}
