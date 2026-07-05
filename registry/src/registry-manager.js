export class RegistryManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  registerCapability(payload) {
    if (this.repository.getByName(payload.name)) {
      throw new Error(`Capability already registered: ${payload.name}`);
    }
    const record = this.recorder.buildRecord(payload);
    return this.repository.addRecord(record);
  }

  updateCapability(name, updates) {
    const existing = this.repository.getByName(name);
    if (!existing) {
      throw new Error(`Unknown capability: ${name}`);
    }
    const updated = this.recorder.updateRecord(existing, updates);
    return this.repository.updateRecord(updated);
  }
}
