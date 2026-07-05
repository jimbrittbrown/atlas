import { ApprovalQuery } from './models.js';

export class ApprovalRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  search(query = {}) {
    const approvalQuery = query instanceof ApprovalQuery ? query : new ApprovalQuery(query);
    return this.repository.query(approvalQuery);
  }

  getHistory() {
    return this.repository.getHistory();
  }
}
