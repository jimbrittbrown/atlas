export class ExecutiveReviewEngine {
    review(decisionPackage, ceoQuestions = []) {
        const responses = [];
        const investigationRequests = [];

        ceoQuestions.forEach((question, index) => {
            const answer = this.answerFromPackage(decisionPackage, question);

            if (answer !== null) {
                responses.push({
                    question,
                    answer,
                    source: 'decision-package'
                });

                return;
            }

            const requestId = `INVREQ-${String(index + 1).padStart(3, '0')}`;

            responses.push({
                question,
                answer: null,
                source: 'investigation-required'
            });
            investigationRequests.push({
                id: requestId,
                question,
                objective: question,
                rationale: 'CEO question is not directly answered by the Executive Decision Package.'
            });
        });

        const additionalInvestigationRequired = investigationRequests.length > 0;

        return {
            responses,
            updatedRecommendation: additionalInvestigationRequired
                ? 'REQUIRES_ADDITIONAL_INVESTIGATION'
                : decisionPackage.recommendation,
            additionalInvestigationRequired,
            investigationRequests
        };
    }

    answerFromPackage(decisionPackage, question) {
        const normalizedQuestion = String(question).toLowerCase();

        if (normalizedQuestion.includes('recommendation')) {
            return decisionPackage.recommendation ?? null;
        }

        if (normalizedQuestion.includes('confidence')) {
            return decisionPackage.confidence ?? null;
        }

        if (normalizedQuestion.includes('authority') || normalizedQuestion.includes('approval')) {
            return decisionPackage.authorityRequired ?? null;
        }

        if (normalizedQuestion.includes('readiness')) {
            return decisionPackage.decisionReadiness?.status ?? null;
        }

        if (normalizedQuestion.includes('summary')) {
            return decisionPackage.executiveSummary ?? null;
        }

        if (normalizedQuestion.includes('findings')) {
            return Array.isArray(decisionPackage.findings)
                ? `${decisionPackage.findings.length} findings available`
                : null;
        }

        return null;
    }
}