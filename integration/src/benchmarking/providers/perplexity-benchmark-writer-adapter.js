import { PerplexityDocumentaryWriterAdapter } from '../../external-writer/providers/perplexity-documentary-writer-adapter.js';

export class PerplexityBenchmarkWriterAdapter extends PerplexityDocumentaryWriterAdapter {
  modelIdentity() {
    return this.model;
  }
}
