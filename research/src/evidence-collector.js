import { ResearchEvidence, ResearchSource } from './models.js';

export class EvidenceCollector {
  constructor(provider) {
    this.provider = provider;
  }

  async collect(job, request) {
    if (!this.provider) {
      return [];
    }

    const evidence = await this.provider.provideEvidence(request);
    return evidence.map((item) => new ResearchEvidence(new ResearchSource(item.sourceName ?? 'unknown', item.uri ?? ''), item.summary ?? 'No summary provided', item.confidence ?? 0.5));
  }
}
