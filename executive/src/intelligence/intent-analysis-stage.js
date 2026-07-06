import { ExecutiveCognitiveStage } from './cognitive-stage.js';

export class IntentAnalysisStage extends ExecutiveCognitiveStage {

    constructor(engine) {
        super();
        this.engine = engine;
    }

    async process(cognitiveResult) {

        cognitiveResult.intent =
            this.engine.analyze(cognitiveResult.request);

        return cognitiveResult;

    }

}
