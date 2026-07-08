import { Finding } from './finding.js';

export class FindingsEngine {
    extract(report) {
        const supportingProviders = (report.providers || []).map(provider => provider.provider);
        const supportingEvidence = this.buildSupportingEvidence(report);

        if (report.providerCount === 0) {
            return [
                new Finding(
                    'finding-no-providers',
                    'No providers were available for this request.',
                    'high',
                    report.confidence ?? 0.0,
                    supportingProviders,
                    supportingEvidence,
                    [],
                    [],
                    ['availability', 'providers']
                )
            ];
        }

        if (report.failedProviders === 0 && report.providerCount > 0) {
            return [
                new Finding(
                    'finding-all-providers-succeeded',
                    'All routed providers completed successfully.',
                    'medium',
                    report.confidence ?? 0.0,
                    supportingProviders,
                    supportingEvidence,
                    [],
                    [],
                    ['execution', 'success']
                )
            ];
        }

        if (report.successfulProviders > 0 && report.failedProviders > 0) {
            return [
                new Finding(
                    'finding-partial-provider-failures',
                    'The request completed with partial provider failures.',
                    'medium',
                    report.confidence ?? 0.0,
                    supportingProviders,
                    supportingEvidence,
                    [],
                    [],
                    ['execution', 'partial-failure']
                )
            ];
        }

        if (report.successfulProviders === 0 && report.failedProviders > 0) {
            return [
                new Finding(
                    'finding-all-providers-failed',
                    'All routed providers failed to complete the request.',
                    'high',
                    report.confidence ?? 0.0,
                    supportingProviders,
                    supportingEvidence,
                    [],
                    [],
                    ['execution', 'failure']
                )
            ];
        }

        return [];
    }

    buildSupportingEvidence(report) {
        const providers = report.providers || [];
        const requestId = report.requestId ?? 'unknown-request-id';

        if (providers.length === 0) {
            return [
                {
                    provider: 'system',
                    requestId,
                    sourceResponse: 'No provider responses were available for this request.'
                }
            ];
        }

        return providers.map(provider => ({
            provider: provider.provider ?? 'unknown-provider',
            requestId,
            sourceResponse: provider.response ?? provider.error ?? null
        }));
    }
}