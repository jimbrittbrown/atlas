export class DecisionReadinessEngine {
    evaluate(findings, beliefs, importance) {
        const missingEvidence = [];

        if (!findings || findings.length === 0) {
            missingEvidence.push('findings');
        }

        if (!beliefs || beliefs.length === 0) {
            missingEvidence.push('beliefs');
        }

        if (!importance || importance.length === 0) {
            missingEvidence.push('importance');
        }

        if (missingEvidence.length > 0) {
            return {
                status: 'NOT_READY',
                rationale: 'Insufficient evidence to support an executive recommendation.',
                missingEvidence,
                criticalUnknowns: ['Executive evidence is incomplete.']
            };
        }

        const hasHighImportance = importance.some(item => item.importance === 'high');

        if (hasHighImportance) {
            return {
                status: 'READY_WITH_CONDITIONS',
                rationale: 'Evidence is sufficient, but high-importance beliefs require explicit executive review.',
                missingEvidence: [],
                criticalUnknowns: ['High-importance belief review is required before final recommendation.']
            };
        }

        return {
            status: 'READY',
            rationale: 'Evidence coverage is sufficient to support an executive recommendation.',
            missingEvidence: [],
            criticalUnknowns: []
        };
    }
}