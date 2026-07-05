import {
  CapabilityDependency,
  CapabilityDocumentation,
  CapabilityInterface,
  CapabilityMetadata,
  CapabilityRecord,
  CapabilityStatus,
  CapabilityVersion,
} from './models.js';

export class RegistryRecorder {
  buildRecord(payload) {
    const requiredFields = ['name', 'version', 'purpose', 'owner'];
    for (const field of requiredFields) {
      if (!payload[field]) {
        throw new Error(`Capability metadata requires ${field}`);
      }
    }

    const now = new Date().toISOString();
    const dependencies = (payload.dependencies ?? []).map((dependency) => new CapabilityDependency(dependency));
    const publicInterfaces = (payload.publicInterfaces ?? []).map((item) => new CapabilityInterface(item));
    const releaseHistory = (payload.releaseHistory ?? []).map((entry) => new CapabilityVersion(entry));

    const metadata = new CapabilityMetadata({
      ...payload,
      dependencies,
      publicInterfaces,
      status: payload.status instanceof CapabilityStatus ? payload.status : CapabilityStatus.fromValue(payload.status ?? 'PLANNED'),
      documentation: payload.documentation instanceof CapabilityDocumentation
        ? payload.documentation
        : new CapabilityDocumentation(payload.documentation ?? {}),
      releaseHistory,
      updatedAt: now,
    });

    return new CapabilityRecord({
      id: `capability-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateRecord(existing, updates) {
    const now = new Date().toISOString();
    const merged = {
      ...existing.metadata,
      ...updates,
      dependencies: (updates.dependencies ?? existing.metadata.dependencies).map((dependency) => new CapabilityDependency(dependency)),
      publicInterfaces: (updates.publicInterfaces ?? existing.metadata.publicInterfaces).map((item) => new CapabilityInterface(item)),
      documentation: new CapabilityDocumentation(updates.documentation ?? existing.metadata.documentation),
      status: updates.status
        ? updates.status instanceof CapabilityStatus
          ? updates.status
          : CapabilityStatus.fromValue(updates.status)
        : existing.metadata.status,
      releaseHistory: (updates.releaseHistory ?? existing.metadata.releaseHistory).map((entry) => new CapabilityVersion(entry)),
      updatedAt: now,
    };

    existing.metadata = new CapabilityMetadata(merged);
    existing.updatedAt = now;
    return existing;
  }
}
