export class BusinessFactoryRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  getBusinessStatus(businessId) {
    const business = this.repository.getById(businessId);
    if (!business) {
      throw new Error(`Unknown business: ${businessId}`);
    }
    return business;
  }

  getProductionHistory() {
    return this.repository.getHistory();
  }
}
