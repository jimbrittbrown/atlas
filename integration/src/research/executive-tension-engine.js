import { ExecutiveTension } from './executive-tension.js';

export class ExecutiveTensionEngine {
    identify(beliefs) {
        if (beliefs.length < 2) {
            return [];
        }

        const importanceOrder = {
            high: 3,
            medium: 2,
            low: 1
        };
        const highestImportance = beliefs.reduce((current, belief) => {
            if (importanceOrder[belief.importance] > importanceOrder[current]) {
                return belief.importance;
            }

            return current;
        }, 'low');

        return [
            new ExecutiveTension(
                'executive-tension-review-required',
                'Executive Review Required',
                'Multiple executive beliefs require coordinated evaluation.',
                beliefs.map(belief => belief.id),
                highestImportance,
                'open'
            )
        ];
    }
}
