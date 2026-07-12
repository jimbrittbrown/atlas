export class ExecutiveOperationsDashboard {
  constructor({ manager } = {}) {
    this.manager = manager ?? null;
  }

  generateSnapshot({ filters = {} } = {}) {
    if (!this.manager || typeof this.manager.buildSnapshot !== 'function') {
      throw new Error('Dashboard manager is not configured. Inject manager during bootstrap.');
    }
    return this.manager.buildSnapshot({ filters });
  }

  getLatestSnapshot() {
    return this.manager?.snapshotRegistry?.getLatestSnapshot?.() ?? null;
  }

  listSnapshots() {
    return this.manager?.snapshotRegistry?.listSnapshots?.() ?? [];
  }
}
