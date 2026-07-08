export class SynthesisEngine {
    constructor() {}

    synthesize(report) {
        const strongestFinding = this.selectStrongestFinding(report.findings ?? []);
        const highestImportanceBelief = this.selectHighestImportanceBelief(report.importance ?? []);
        const readiness = report.decisionReadiness ?? {};
        const primaryTension = this.selectPrimaryTension(report.executiveTensions ?? []);

        const executiveSummary = [
            `Strongest finding: ${strongestFinding}.`,
            `Highest-importance belief: ${highestImportanceBelief}.`,
            `Readiness: ${readiness.status ?? 'UNKNOWN'}${readiness.rationale ? ` - ${readiness.rationale}` : ''}.`,
            `Primary executive tension: ${primaryTension}.`
        ].join(' ');

        return {
            capability: report.capability,
            providerCount: report.providers.length,
            confidence: report.confidence,
            agreement: report.confidence.agreement,
            executiveSummary,
            findings: [],
            conflicts: [],
            recommendations: []
        };
    }

    selectStrongestFinding(findings) {
        if (findings.length === 0) {
            return 'No findings available';
        }

        const sorted = [...findings].sort((a, b) => {
            const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);

            if (confidenceDelta !== 0) {
                return confidenceDelta;
            }

            return (a.id ?? '').localeCompare(b.id ?? '');
        });

        return sorted[0].statement ?? 'No finding statement available';
    }

    selectHighestImportanceBelief(importance) {
        if (importance.length === 0) {
            return 'No beliefs prioritized';
        }

        const rank = {
            high: 3,
            medium: 2,
            low: 1
        };

        const sorted = [...importance].sort((a, b) => {
            const importanceDelta = (rank[b.importance] ?? 0) - (rank[a.importance] ?? 0);

            if (importanceDelta !== 0) {
                return importanceDelta;
            }

            return (a.id ?? '').localeCompare(b.id ?? '');
        });

        return sorted[0].statement ?? 'No belief statement available';
    }

    selectPrimaryTension(executiveTensions) {
        if (executiveTensions.length === 0) {
            return 'No executive tension identified';
        }

        const rank = {
            high: 3,
            medium: 2,
            low: 1
        };

        const sorted = [...executiveTensions].sort((a, b) => {
            const importanceDelta = (rank[b.importance] ?? 0) - (rank[a.importance] ?? 0);

            if (importanceDelta !== 0) {
                return importanceDelta;
            }

            return (a.id ?? '').localeCompare(b.id ?? '');
        });
        const selected = sorted[0];

        if (!selected.description) {
            return selected.title ?? 'Unnamed executive tension';
        }

        return `${selected.title ?? 'Unnamed executive tension'} - ${selected.description}`;
    }
}