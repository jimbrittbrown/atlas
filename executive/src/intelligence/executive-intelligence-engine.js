import { ExecutivePipeline } from './executive-pipeline.js';
import { IntentAnalysisEngine } from './intent-analysis-engine.js';
import { ExecutiveIntelligenceReport } from './executive-intelligence-report.js';

export class ExecutiveIntelligenceEngine {

    constructor() {

        this.pipeline = new ExecutivePipeline({
            intentAnalysisEngine: new IntentAnalysisEngine()
        });

    }

    async analyze(request) {

        const cognitiveResult =
            await this.pipeline.process(request);

        const report =
            new ExecutiveIntelligenceReport();

        report.intent = cognitiveResult.intent;

        report.confidence =
            cognitiveResult.intent.confidence;

        return report;

    }

}
