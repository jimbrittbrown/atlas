export class IntentAnalysisEngine {

    analyze(request) {

        const objective =
            this.extractObjective(request);

        return {
            objective,

            businessGoal:
                this.determineBusinessGoal(objective),

            departments:
                this.identifyDepartments(objective),

            workers:
                this.identifyWorkers(objective),

            assumptions:
                this.identifyAssumptions(objective),

            risks:
                this.identifyRisks(objective),

            openQuestions:
                this.identifyOpenQuestions(objective),

            confidence:
                this.estimateConfidence(objective),

            nextAction:
                "WORKFLOW_PLANNING"
        };

    }

    extractObjective(request) {
        return request.payload?.objective ?? "Unknown Objective";
    }

    determineBusinessGoal(objective) {

        const text = objective.toLowerCase();

        if (text.includes("business"))
            return "Business Creation";

        if (text.includes("research"))
            return "Knowledge Acquisition";

        if (text.includes("youtube"))
            return "Audience Growth";

        return "General Executive Objective";

    }

    identifyDepartments(objective) {

        const departments = [];

        const text = objective.toLowerCase();

        if (text.includes("research"))
            departments.push("Research");

        if (text.includes("business"))
            departments.push("Business Factory");

        if (text.includes("youtube"))
            departments.push("Marketing");

        return departments;

    }

    identifyWorkers(objective) {

        const workers = [];

        const text = objective.toLowerCase();

        if (text.includes("research"))
            workers.push("Research Worker");

        if (text.includes("youtube"))
            workers.push("Content Worker");

        return workers;

    }

    identifyAssumptions(objective) {

        return [
            "Objective description is complete.",
            "Atlas has required capabilities."
        ];

    }

    identifyRisks(objective) {

        return [
            "Insufficient information.",
            "Incorrect department selection."
        ];

    }

    identifyOpenQuestions(objective) {

        return [
            "What is the desired timeline?",
            "What budget constraints exist?",
            "How will success be measured?"
        ];

    }

    estimateConfidence(objective) {

        return 0.75;

    }

}
