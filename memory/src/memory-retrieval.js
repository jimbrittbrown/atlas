import { MemoryQuery } from './models.js';

export class MemoryRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  getById(recordId) {
    return this.repository.getById(recordId);
  }

  search(query = {}) {
    const searchQuery = query instanceof MemoryQuery ? query : new MemoryQuery(query);
    return this.repository.query(searchQuery);
  }
}
