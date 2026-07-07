import { EvidenceProvider } from './evidence-provider.js';

export class LiveEvidenceProvider extends EvidenceProvider {

    async collect(question) {

        console.log();
        console.log("--------------------------------");
        console.log("LIVE EVIDENCE REQUEST");
        console.log("--------------------------------");
        console.log(question);

        return {

            question,

            answer:
                "Awaiting live evidence provider integration.",

            confidence: 0.0,

            source:
                "Live Evidence Provider"

        };

    }

}
