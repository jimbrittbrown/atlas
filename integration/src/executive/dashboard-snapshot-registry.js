import { appendEvent, loadEventList } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class DashboardSnapshotRegistry {
  constructor({ storageAdapter, storageProvider, now, namespace = 'executive.dashboard-snapshot-registry' } = {}) {
    this.storageAdapter = storageAdapter ?? storageProvider ?? null;
    this.now = now;
    this.namespace = namespace;
    this.snapshots = loadEventList({ provider: this.storageAdapter, namespace: this.namespace });
  }

  saveSnapshot(snapshot) {
    const entry = {
      snapshotId: `dash_${this.snapshots.length + 1}`,
      createdAt: isoNow(this.now),
      snapshot
    };

    this.snapshots.push(entry);
    appendEvent({ provider: this.storageAdapter, namespace: this.namespace, key: entry.snapshotId, value: entry });
    return entry;
  }

  getLatestSnapshot() {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  listSnapshots() {
    return this.snapshots.slice();
  }
}
