import {
    IntentSummary,
    ExecutiveCognitiveResult
} from './models.js';

export class ExecutivePipeline {

    constructor({
        intentAnalysisEngine
    }) {
        this.intentAnalysisEngine = intentAnalysisEngine;
    }

    async process(request) {

        const analysis =
            this.intentAnalysisEngine.analyze(request);

        const intent =
            new IntentSummary(analysis);

        return new ExecutiveCognitiveResult({
            request,
            intent
        });

    }

}
