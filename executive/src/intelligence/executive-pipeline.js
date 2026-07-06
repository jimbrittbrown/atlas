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

        console.log('================================');
        console.log('Executive Intelligence');
        console.log('Stage 1: Intent Analysis');
        console.log('================================');

        const analysis =
            this.intentAnalysisEngine.analyze(request);

        const intent =
            new IntentSummary(analysis);

        console.log('Objective:');
        console.log(`  ${intent.objective}`);
        console.log();

        console.log('Business Goal:');
        console.log(`  ${intent.businessGoal}`);
        console.log();

        console.log('Departments:');
        console.log(
            intent.departments.length
                ? intent.departments.join(', ')
                : 'None'
        );
        console.log();

        console.log('Workers:');
        console.log(
            intent.workers.length
                ? intent.workers.join(', ')
                : 'None'
        );
        console.log();

        console.log(`Confidence: ${intent.confidence}`);

        return new ExecutiveCognitiveResult({
            request,
            intent
        });

    }

}
