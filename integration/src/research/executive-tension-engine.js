import { ExecutiveTension } from './executive-tension.js';

export class ExecutiveTensionEngine {
    identify(findings = [], beliefs = [], importance = [], decisionReadiness = null) {
        const requiresExecutiveReview =
            beliefs.length >= 2 ||
            decisionReadiness?.status === 'READY_WITH_CONDITIONS' ||
            decisionReadiness?.status === 'NOT_READY';

        if (!requiresExecutiveReview) {
            return [];
        }

        const importanceOrder = {
            high: 3,
            medium: 2,
            low: 1
        };
        const highestImportance = (importance.length > 0 ? importance : beliefs).reduce((current, item) => {
            const itemImportance = item.importance ?? 'low';

            if (importanceOrder[itemImportance] > importanceOrder[current]) {
                return itemImportance;
            }

            return current;
        }, 'low');
        const beliefIds = beliefs.map(belief => belief.id);
        const description = decisionReadiness?.status === 'NOT_READY'
            ? 'Executive evidence remains incomplete and requires coordinated evaluation.'
            : 'Multiple executive considerations require coordinated evaluation.';

        return [
            new ExecutiveTension(
                'executive-tension-review-required',
                'Executive Review Required',
                description,
                beliefIds,
                highestImportance,
                'open'
            )
        ];
    }
}
