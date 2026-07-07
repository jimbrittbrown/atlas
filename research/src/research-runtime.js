import { ResearchPlanner } from './research-planner.js';
import { EvidenceCollector } from './evidence-collector.js';
import { EvidenceBroker } from './evidence-broker.js';
import { EvidenceAnalyzer } from './evidence-analyzer.js';
import { ResearchReportGenerator } from './research-report-generator.js';

export class ResearchRuntime {

    constructor() {

        this.planner =
            new ResearchPlanner();

        this.collector =
            new EvidenceCollector();

        this.analyzer =
            new EvidenceAnalyzer();

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

        const evidence =
            await this.collector.collect(plan);

        const analysis =
            this.analyzer.analyze(evidence);

        const report =
            this.reportGenerator.generate(plan);

        report.evidence = evidence;
        report.analysis = analysis;

        console.log("Research planning complete.");
        console.log("Evidence collected.");
        console.log("Evidence analyzed.");
        console.log("Research report generated.");

        return {

            status:
                "RESEARCH_COMPLETE",

            plan,

            report

        };

    }

}
