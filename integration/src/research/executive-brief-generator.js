export class ExecutiveBriefGenerator {
    buildExecutiveSummary(report) {
        let summary;

        if (report.providerCount === 0) {
            summary = 'No providers were available.';
        } else if (report.failedProviders === 0 && report.providerCount > 0) {
            summary = 'All providers completed successfully.';
        } else if (report.successfulProviders > 0 && report.failedProviders > 0) {
            summary = 'The request completed with partial provider failures.';
        } else {
            summary = 'All providers failed.';
        }

        if (report.agreement) {
            summary = `${summary} Agreement status: ${report.agreement}.`;
        }

        return summary;
    }

    generate(report) {
        const executiveSummary = this.buildExecutiveSummary(report);
        const providerStatus = report.providers
            .map(provider => `${provider.provider}: ${provider.status}`)
            .join('\n');

        return [
            'Mission',
            report.capability,
            '',
            'Executive Summary',
            executiveSummary,
            '',
            'Provider Status',
            providerStatus,
            '',
            'Confidence',
            String(report.confidence),
            '',
            'Agreement',
            report.agreement,
            '',
            'Recommended Executive Action',
            'Review the current report and determine next steps.'
        ].join('\n');
    }
}