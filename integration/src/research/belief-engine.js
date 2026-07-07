import { Belief } from './belief.js';

export class BeliefEngine {
    build(findings) {
        return findings.map(finding => new Belief(
            `belief-${finding.id}`,
            finding.statement,
            finding.confidence,
            [finding.id],
            'proposed'
        ));
    }
}
