export class ExecutiveActionPlanner {

    plan(report) {

        if (
            report.assessment.requiresResearch
        ) {

            return {

                department: "Research",

                action:
                    "Launch Research Workflow",

                priority:
                    "HIGH"

            };

        }

        return {

            department:
                "Business Factory",

            action:
                "Begin Workflow Planning",

            priority:
                "NORMAL"

        };

    }

}
