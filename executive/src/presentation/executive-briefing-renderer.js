export class ExecutiveBriefingRenderer {

    render(report) {

        console.clear();

        console.log("================================================");
        console.log("ATLAS EXECUTIVE BRIEFING");
        console.log("================================================");

        console.log();
        console.log("Objective");
        console.log(report.intent.objective);

        console.log();
        console.log("Business Goal");
        console.log(report.intent.businessGoal);

        console.log();
        console.log("Recommendation");
        console.log(report.assessment.recommendation);

        console.log();
        console.log("Selected Strategy");
        console.log(report.strategy.selectedStrategy);

        console.log();
        console.log("Readiness");
        console.log(report.situation.readiness);

        console.log();
        console.log("Confidence");
        console.log(report.confidence);

        console.log();
        console.log("================================================");

    }

}
