import { EvidenceProvider } from './evidence-provider.js';

export class MockEvidenceProvider extends EvidenceProvider {

    async collect(question) {

        return {

            question,

            answer:
                "Placeholder evidence pending live data integration.",

            confidence: 0.50,

            source:
                "Mock Evidence Provider"

        };

    }

}
