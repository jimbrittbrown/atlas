import { RegistryLogger } from './registry-logger.js';
import { RegistryManager } from './registry-manager.js';
import { CapabilityQuery } from './models.js';
import { RegistryRecorder } from './registry-recorder.js';
import { RegistryRepository } from './registry-repository.js';
import { RegistryRetrieval } from './registry-retrieval.js';
import { RegistryValidator } from './registry-validator.js';

export class CapabilityRegistryService {
  constructor({
    repository = new RegistryRepository(),
    recorder = new RegistryRecorder(),
    manager = null,
    retrieval = null,
    validator = new RegistryValidator(),
    logger = new RegistryLogger(),
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new RegistryManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new RegistryRetrieval(this.repository);
    this.validator = validator;
    this.logger = logger;
  }

  registerCapability(payload) {
    const record = this.manager.registerCapability(payload);
    this.logger.log({ message: 'Capability registered', capabilityName: record.metadata.name, version: record.metadata.version, timestamp: record.createdAt });
    return record;
  }

  updateCapability(name, updates) {
    const record = this.manager.updateCapability(name, updates);
    this.logger.log({ message: 'Capability updated', capabilityName: record.metadata.name, version: record.metadata.version, timestamp: record.updatedAt });
    return record;
  }

  getCapability(name) {
    return this.retrieval.getCapability(name);
  }

  listCapabilities() {
    return this.retrieval.listCapabilities();
  }

  getDependencies(name) {
    return this.retrieval.getDependencies(name);
  }

  getDependents(name) {
    return this.retrieval.getDependents(name);
  }

  getCapabilityVersion(name) {
    return this.retrieval.getCapabilityVersion(name);
  }

  getCapabilityStatus(name) {
    return this.retrieval.getCapabilityStatus(name);
  }

  searchCapabilities(query = {}) {
    const registryQuery = query instanceof CapabilityQuery ? query : new CapabilityQuery(query);
    return this.retrieval.searchCapabilities(registryQuery);
  }

  validateRegistry() {
    const result = this.validator.validate(this.retrieval.listCapabilities());
    this.logger.log({ message: 'Registry validation completed', valid: result.valid, issueCount: result.issues.length, timestamp: new Date().toISOString() });
    return result;
  }

  getHistory() {
    return this.retrieval.getHistory();
  }
}
