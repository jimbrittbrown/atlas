import { ExecutiveIntelligenceEngine } from './intelligence/executive-intelligence-engine.js';
import { ExecutiveActionPlanner } from './intelligence/executive-action-planner.js';
import { ExecutiveDispatcher } from './executive-dispatcher.js';

export class ExecutiveRuntime {

    constructor() {
        this.intelligence = new ExecutiveIntelligenceEngine();
        this.actionPlanner = new ExecutiveActionPlanner();
        this.dispatcher = new ExecutiveDispatcher();
    }

    async execute(request) {
        const briefing = await this.intelligence.analyze(request);
        const action = this.actionPlanner.plan(briefing);
        const dispatch = await this.dispatcher.dispatch(action);

        return {
            briefing,
            action,
            dispatch
        };
    }
}
