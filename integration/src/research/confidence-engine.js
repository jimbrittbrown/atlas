export class ConfidenceEngine {
    analyze(results) {
        const providerCount = results.length;
        const successfulProviders = results.filter(result => !result.error).length;
        const failedProviders = results.filter(result => Boolean(result.error)).length;
        const confidence = providerCount === 0 ? 0 : successfulProviders / providerCount;
        let agreement = 'partial';

        if (providerCount < 2) {
            agreement = 'insufficient';
        } else if (failedProviders === providerCount) {
            agreement = 'none';
        } else if (successfulProviders >= 2) {
            agreement = 'available';
        }

        return {
            providerCount,
            successfulProviders,
            failedProviders,
            confidence,
            agreement
        };
    }
}