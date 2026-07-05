export class BusinessFactoryRepository {
  constructor() {
    this.businesses = [];
    this.history = [];
  }

  create(record) {
    this.businesses.push(record);
    this.history.push({ type: 'created', businessId: record.id, state: record.state, timestamp: new Date().toISOString() });
    return record;
  }

  update(record) {
    const index = this.businesses.findIndex((item) => item.id === record.id);
    if (index === -1) {
      throw new Error(`Unknown business: ${record.id}`);
    }
    this.businesses[index] = record;
    this.history.push({ type: 'updated', businessId: record.id, state: record.state, timestamp: new Date().toISOString() });
    return record;
  }

  getById(businessId) {
    return this.businesses.find((item) => item.id === businessId) ?? null;
  }

  list() {
    return [...this.businesses];
  }

  getHistory() {
    return [...this.history];
  }
}
