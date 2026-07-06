import { ResearchPlanner } from './research-planner.js';
import { ResearchReportGenerator } from './research-report-generator.js';

export class ResearchRuntime {

    constructor() {

        this.planner = new ResearchPlanner();

        this.reportGenerator =
            new ResearchReportGenerator();

    }

    async execute(action) {

        console.log();
        console.log("================================");
        console.log("RESEARCH DEPARTMENT");
        console.log("================================");

        const plan =
            this.planner.plan(action);

        const report =
            this.reportGenerator.generate(plan);

        console.log("Research planning complete.");
        console.log("Research report generated.");

        return {

            status:
                "RESEARCH_COMPLETE",

            plan,

            report

        };

    }

}
