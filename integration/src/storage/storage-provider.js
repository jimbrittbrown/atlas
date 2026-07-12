export class StorageProvider {
  async initialize() {
    throw new Error('StorageProvider.initialize() must be implemented.');
  }

  initializeSync() {
    throw new Error('StorageProvider.initializeSync() must be implemented by sync-capable providers.');
  }

  async runMigrations() {
    throw new Error('StorageProvider.runMigrations() must be implemented.');
  }

  runMigrationsSync() {
    throw new Error('StorageProvider.runMigrationsSync() must be implemented by sync-capable providers.');
  }

  async listRecords() {
    throw new Error('StorageProvider.listRecords() must be implemented.');
  }

  listRecordsSync() {
    throw new Error('StorageProvider.listRecordsSync() must be implemented by sync-capable providers.');
  }

  async upsertRecord() {
    throw new Error('StorageProvider.upsertRecord() must be implemented.');
  }

  upsertRecordSync() {
    throw new Error('StorageProvider.upsertRecordSync() must be implemented by sync-capable providers.');
  }

  async deleteRecord() {
    throw new Error('StorageProvider.deleteRecord() must be implemented.');
  }

  deleteRecordSync() {
    throw new Error('StorageProvider.deleteRecordSync() must be implemented by sync-capable providers.');
  }

  async listEvents() {
    throw new Error('StorageProvider.listEvents() must be implemented.');
  }

  listEventsSync() {
    throw new Error('StorageProvider.listEventsSync() must be implemented by sync-capable providers.');
  }

  async appendEvent() {
    throw new Error('StorageProvider.appendEvent() must be implemented.');
  }

  appendEventSync() {
    throw new Error('StorageProvider.appendEventSync() must be implemented by sync-capable providers.');
  }

  async getMeta() {
    throw new Error('StorageProvider.getMeta() must be implemented.');
  }

  getMetaSync() {
    throw new Error('StorageProvider.getMetaSync() must be implemented by sync-capable providers.');
  }

  async setMeta() {
    throw new Error('StorageProvider.setMeta() must be implemented.');
  }

  setMetaSync() {
    throw new Error('StorageProvider.setMetaSync() must be implemented by sync-capable providers.');
  }

  async listMeta() {
    throw new Error('StorageProvider.listMeta() must be implemented.');
  }

  listMetaSync() {
    throw new Error('StorageProvider.listMetaSync() must be implemented by sync-capable providers.');
  }

  async close() {
    return undefined;
  }

  closeSync() {
    return undefined;
  }
}

export function supportsSyncStorage(provider) {
  return Boolean(
    provider
    && typeof provider.initializeSync === 'function'
    && typeof provider.listRecordsSync === 'function'
    && typeof provider.upsertRecordSync === 'function'
  );
}

export function safeInitializeProvider(provider) {
  if (!provider) return;
  if (supportsSyncStorage(provider)) {
    provider.initializeSync();
    return;
  }
  if (typeof provider.initialize === 'function') {
    void provider.initialize();
  }
}
