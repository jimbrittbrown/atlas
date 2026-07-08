import { ConfidenceEngine } from './confidence-engine.js';
import { BeliefEngine } from './belief-engine.js';
import { FindingsEngine } from './findings-engine.js';
import { ImportanceEngine } from './importance-engine.js';
import { SynthesisEngine } from './synthesis-engine.js';

export class ResearchCoordinator {
    constructor(router) {
        this.router = router;
    }

    async performInvestigation(investigation) {
        const request = {
            id: investigation.id,
            objective: investigation.objective ?? investigation.name,
            context: investigation.context ?? {},
            capability: 'research'
        };
        const research = await this.research(request);

        return {
            investigationId: investigation.id,
            investigationName: investigation.name,
            research
        };
    }

    async research(request) {
        const routing = this.router.route(request);
        const executions = routing.providers.map(provider => ({
            provider,
            promise: provider.execute(request)
        }));
        const settledResults = await Promise.allSettled(executions.map(execution => execution.promise));
        const results = settledResults.map((result, index) => {
            const provider = executions[index].provider.identity().vendor;

            if (result.status === 'fulfilled') {
                return {
                    provider,
                    response: result.value
                };
            }

            return {
                provider,
                error: result.reason.message
            };
        });

        const confidenceEngine = new ConfidenceEngine();
        const confidence = confidenceEngine.analyze(results);
        const providers = results.map(result => ({
            provider: result.provider,
            status: result.error ? 'failed' : 'success',
            response: result.response ?? null,
            error: result.error ?? null
        }));
        const report = {
            capability: routing.capability,
            providers,
            providerCount: confidence.providerCount,
            successfulProviders: confidence.successfulProviders,
            failedProviders: confidence.failedProviders,
            confidence,
            executiveSummary: 'Pending synthesis'
        };
        const findingsEngine = new FindingsEngine();
        const findings = findingsEngine.extract({
            ...report,
            confidence: confidence.confidence
        });
        const beliefEngine = new BeliefEngine();
        const beliefs = beliefEngine.build(findings);
        const importanceEngine = new ImportanceEngine();
        const importance = importanceEngine.prioritize(beliefs);
        const synthesisEngine = new SynthesisEngine();
        const synthesis = synthesisEngine.synthesize({
            ...report,
            findings,
            beliefs,
            importance
        });

        return {
            request,
            capability: routing.capability,
            report: {
                providerCount: confidence.providerCount,
                successfulProviders: confidence.successfulProviders,
                failedProviders: confidence.failedProviders,
                confidence: confidence.confidence,
                agreement: confidence.agreement,
                providers,
                findings,
                beliefs,
                importance,
                executiveSummary: 'Pending synthesis',
                synthesis
            }
        };
    }
}