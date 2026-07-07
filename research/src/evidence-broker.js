import { EvidenceProviderConfig } from './evidence-provider-config.js';
import { MockEvidenceProvider } from './mock-evidence-provider.js';
import { LiveEvidenceProvider } from './live-evidence-provider.js';

export class EvidenceBroker {

    constructor() {

        this.provider =
            EvidenceProviderConfig.mode === "live"
                ? new LiveEvidenceProvider()
                : new MockEvidenceProvider();

    }

    async collect(question) {

        return this.provider.collect(question);

    }

}
