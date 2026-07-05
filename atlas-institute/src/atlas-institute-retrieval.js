import { KnowledgeQuery } from './models.js';

export class AtlasInstituteRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  searchKnowledge(query = {}) {
    const knowledgeQuery = query instanceof KnowledgeQuery ? query : new KnowledgeQuery(query);
    return this.repository.search(knowledgeQuery);
  }

  getHistory() {
    return this.repository.getHistory();
  }
}
