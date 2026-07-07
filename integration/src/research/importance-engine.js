export class ImportanceEngine {
    prioritize(beliefs) {
        const prioritized = beliefs.map(belief => {
            const copy = { ...belief };

            if (belief.confidence >= 0.8) {
                copy.importance = 'high';
            } else if (belief.confidence >= 0.5) {
                copy.importance = 'medium';
            } else {
                copy.importance = 'low';
            }

            return copy;
        });

        const order = {
            high: 0,
            medium: 1,
            low: 2
        };

        return prioritized.sort((a, b) => order[a.importance] - order[b.importance]);
    }
}