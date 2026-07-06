import { ExecutivePipeline } from './executive-pipeline.js';
import { IntentAnalysisEngine } from './intent-analysis-engine.js';
import { ExecutiveAssessmentEngine } from './executive-assessment-engine.js';
import { SituationAssessmentEngine } from './situation-assessment-engine.js';
import { StrategicPlanningEngine } from './strategic-planning-engine.js';
import { ExecutiveDecisionRecorder } from './executive-decision-recorder.js';
import { ExecutiveIntelligenceReport } from './executive-intelligence-report.js';

export class ExecutiveIntelligenceEngine {

    constructor() {

        this.pipeline = new ExecutivePipeline({
            intentAnalysisEngine: new IntentAnalysisEngine()
        });

        this.assessmentEngine =
            new ExecutiveAssessmentEngine();

        this.situationEngine =
            new SituationAssessmentEngine();

        this.strategyEngine =
            new StrategicPlanningEngine();

        this.decisionRecorder =
            new ExecutiveDecisionRecorder();

    }

    async analyze(request) {

        const cognitiveResult =
            await this.pipeline.process(request);

        const report =
            new ExecutiveIntelligenceReport();

        report.intent =
            cognitiveResult.intent;

        report.assessment =
            this.assessmentEngine.assess(
                report.intent
            );

        report.situation =
            this.situationEngine.assess(
                report
            );

        report.strategy =
            this.strategyEngine.plan(
                report
            );

        report.confidence =
            report.intent.confidence;

        this.decisionRecorder.record(report);

        report.history =
            this.decisionRecorder.historySnapshot();

        return report;

    }

}
