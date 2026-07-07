import { DecisionFrame } from './decision-frame.js';

export class DecisionFramingEngine {
    build(mission) {
        return new DecisionFrame(
            mission.missionId,
            mission.objective,
            mission.objective,
            'Long-Term Enterprise Value',
            [
                'Sustainable Cash Flow',
                'Strategic Capability',
                'Strategic Optionality'
            ],
            [
                'CEO approval required'
            ],
            [
                'Supports Atlas Constitution',
                'Improves enterprise value'
            ]
        );
    }
}
