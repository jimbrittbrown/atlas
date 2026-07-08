export class ExecutiveDecisionPackageGenerator {
    generate({
        mission,
        findings = [],
        beliefs = [],
        importance = [],
        decisionReadiness,
        executiveTensions = [],
        synthesis = {}
    }) {
        const confidence = beliefs.length === 0
            ? 0
            : Math.round(
                (beliefs.reduce((total, belief) => total + (belief.confidence ?? 0), 0) / beliefs.length) * 100
            );

        return {
            executiveSummary: synthesis.executiveSummary ?? 'Synthesis not yet implemented.',
            recommendation: this.recommendationFor(decisionReadiness?.status),
            confidence,
            decisionReadiness,
            findings,
            beliefs,
            importance,
            executiveTensions,
            synthesis,
            authorityRequired: this.authorityFor(mission, decisionReadiness?.status)
        };
    }

    recommendationFor(status) {
        if (status === 'READY') {
            return 'READY_FOR_EXECUTIVE_REVIEW';
        }

        if (status === 'READY_WITH_CONDITIONS') {
            return 'REVIEW_REQUIRED_BEFORE_EXECUTIVE_DECISION';
        }

        return 'NOT_READY_FOR_EXECUTIVE_DECISION';
    }

    authorityFor(mission, status) {
        if (status === 'READY') {
            return 'CEO Strategic Approval';
        }

        if (mission?.decisionClass === 'Strategic') {
            return 'CEO Strategic Approval Required Before Proceeding';
        }

        return 'CEO Review Required';
    }
}