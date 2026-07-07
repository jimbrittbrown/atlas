import { EvidenceBroker } from './evidence-broker.js';
import { ResearchQuestionGenerator } from './research-question-generator.js';

export class EvidenceCollector {
    constructor({
        questionGenerator = new ResearchQuestionGenerator(),
        evidenceBroker = new EvidenceBroker()
    } = {}) {
        this.questionGenerator = questionGenerator;
        this.evidenceBroker = evidenceBroker;
    }

    async collect(job, request = {}) {
        const questions = this.questionGenerator.generate(job, request);
        const evidence = [];

        for (const question of questions) {
            const results = await this.evidenceBroker.collect(question);

            if (Array.isArray(results)) {
                evidence.push(...results);
            } else if (results) {
                evidence.push(results);
            }
        }

        return evidence;
    }
}
