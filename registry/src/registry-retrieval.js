import { CapabilityQuery } from './models.js';

export class RegistryRetrieval {
  constructor(repository) {
    this.repository = repository;
  }

  getCapability(name) {
    return this.repository.getByName(name);
  }

  listCapabilities() {
    return this.repository.list();
  }

  searchCapabilities(query = {}) {
    const registryQuery = query instanceof CapabilityQuery ? query : new CapabilityQuery(query);
    return this.repository.search(registryQuery);
  }

  getDependencies(name) {
    const record = this.getCapability(name);
    if (!record) {
      throw new Error(`Unknown capability: ${name}`);
    }
    return [...record.metadata.dependencies];
  }

  getDependents(name) {
    return this.repository.list().filter((record) => record.metadata.dependencies.some((dependency) => dependency.name === name));
  }

  getCapabilityVersion(name) {
    const record = this.getCapability(name);
    if (!record) {
      throw new Error(`Unknown capability: ${name}`);
    }
    return record.metadata.version;
  }

  getCapabilityStatus(name) {
    const record = this.getCapability(name);
    if (!record) {
      throw new Error(`Unknown capability: ${name}`);
    }
    return record.metadata.status;
  }

  getHistory() {
    return this.repository.getHistory();
  }
}
