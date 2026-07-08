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
        const recommendation = this.recommendationFor(decisionReadiness?.status);
        const traceability = this.buildTraceability({
            recommendation,
            findings,
            beliefs,
            importance
        });

        return {
            executiveSummary: synthesis.executiveSummary ?? 'No executive synthesis summary available.',
            recommendation,
            confidence,
            decisionReadiness,
            findings,
            beliefs,
            importance,
            executiveTensions,
            synthesis,
            traceability,
            authorityRequired: this.authorityFor(mission, decisionReadiness?.status)
        };
    }

    buildTraceability({ recommendation, findings, beliefs, importance }) {
        const findingById = new Map(findings.map(finding => [finding.id, finding]));
        const beliefById = new Map(beliefs.map(belief => [belief.id, belief]));
        const importanceRank = {
            high: 3,
            medium: 2,
            low: 1
        };
        const rankedBeliefIds = importance
            .filter(item => beliefById.has(item.id))
            .sort((a, b) => {
                const rankDelta = (importanceRank[b.importance] ?? 0) - (importanceRank[a.importance] ?? 0);

                if (rankDelta !== 0) {
                    return rankDelta;
                }

                return a.id.localeCompare(b.id);
            })
            .map(item => item.id);
        const fallbackBeliefIds = [...beliefById.keys()].sort((a, b) => a.localeCompare(b));
        const selectedBeliefIds = rankedBeliefIds.length > 0 ? rankedBeliefIds : fallbackBeliefIds;

        const recommendationToBeliefs = selectedBeliefIds.map(beliefId => {
            const belief = beliefById.get(beliefId);
            const supportingFindings = (belief?.supportingFindings ?? [])
                .map(findingId => findingById.get(findingId))
                .filter(Boolean)
                .map(finding => ({
                    findingId: finding.id,
                    statement: finding.statement,
                    evidence: (finding.supportingEvidence ?? []).map(evidence => ({
                        provider: evidence.provider ?? 'unknown-provider',
                        requestId: evidence.requestId ?? 'unknown-request-id',
                        sourceResponse: evidence.sourceResponse ?? null
                    }))
                }));

            return {
                beliefId,
                statement: belief?.statement ?? null,
                confidence: belief?.confidence ?? null,
                supportingFindings
            };
        });

        return {
            recommendation,
            recommendationToBeliefs
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