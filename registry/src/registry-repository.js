import { CapabilityResult } from './models.js';

export class RegistryRepository {
  constructor() {
    this.records = [];
    this.history = [];
  }

  addRecord(record) {
    this.records.push(record);
    this.history.push({
      action: 'REGISTERED',
      capabilityName: record.metadata.name,
      version: record.metadata.version,
      timestamp: record.createdAt,
    });
    return record;
  }

  updateRecord(record) {
    const index = this.records.findIndex((item) => item.id === record.id);
    if (index < 0) {
      throw new Error(`Unknown capability record: ${record.id}`);
    }
    this.records[index] = record;
    this.history.push({
      action: 'UPDATED',
      capabilityName: record.metadata.name,
      version: record.metadata.version,
      timestamp: record.updatedAt,
    });
    return record;
  }

  getByName(name) {
    return this.records.find((record) => record.metadata.name === name) ?? null;
  }

  list() {
    return [...this.records];
  }

  search(query) {
    const searchTerm = (query.search ?? '').toLowerCase();
    const filtered = this.records.filter((record) => {
      const metadata = record.metadata;
      if (query.owner && metadata.owner !== query.owner) {
        return false;
      }
      if (query.status && metadata.status.value !== query.status) {
        return false;
      }
      if (query.dependency && !metadata.dependencies.some((dependency) => dependency.name === query.dependency)) {
        return false;
      }
      if (query.tag && !metadata.documentation.operational.includes(query.tag)) {
        return false;
      }
      if (searchTerm) {
        const haystack = [metadata.name, metadata.purpose, metadata.owner, ...metadata.publicInterfaces.map((item) => item.name)].join(' ').toLowerCase();
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });

    return new CapabilityResult({ records: filtered, total: filtered.length });
  }

  getHistory() {
    return [...this.history];
  }
}
