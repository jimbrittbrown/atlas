export class ExecutiveAssessmentEngine {

    assess(intent) {

        return {

            proceed:
                this.shouldProceed(intent),

            requiresResearch:
                this.requiresResearch(intent),

            priority:
                this.determinePriority(intent),

            businessValue:
                this.estimateBusinessValue(intent),

            recommendation:
                this.recommend(intent)

        };

    }

    shouldProceed(intent) {

        return intent.confidence >= 0.60;

    }

    requiresResearch(intent) {

        return intent.openQuestions.length > 0;

    }

    determinePriority(intent) {

        if (intent.businessGoal === "Business Creation")
            return "HIGH";

        return "NORMAL";

    }

    estimateBusinessValue(intent) {

        if (intent.businessGoal === "Business Creation")
            return "HIGH";

        return "UNKNOWN";

    }

    recommend(intent) {

        if (intent.openQuestions.length > 0)
            return "Conduct Research";

        return "Proceed";

    }

}
