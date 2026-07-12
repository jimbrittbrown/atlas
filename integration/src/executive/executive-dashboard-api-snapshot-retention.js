function parseIntWithDefault(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export class ExecutiveDashboardApiSnapshotRetention {
  constructor({
    registry,
    maxCount = parseIntWithDefault(process.env.ATLAS_DASHBOARD_SNAPSHOT_MAX_COUNT, 50),
    retentionDays = parseIntWithDefault(process.env.ATLAS_DASHBOARD_SNAPSHOT_RETENTION_DAYS, 30),
    now = () => Date.now()
  } = {}) {
    this.registry = registry;
    this.maxCount = maxCount;
    this.retentionDays = retentionDays;
    this.now = now;
  }

  getStatus() {
    return {
      enabled: true,
      maxCount: this.maxCount,
      retentionDays: this.retentionDays,
      persistence: 'IN_MEMORY_ADAPTER_READY'
    };
  }

  enforceOnWrite() {
    const snapshots = this.registry?.listSnapshots?.() ?? [];
    const cutoff = this.now() - (this.retentionDays * 24 * 60 * 60 * 1000);

    const retainedByAge = snapshots.filter((entry) => {
      const created = new Date(entry.createdAt).getTime();
      return Number.isFinite(created) && created >= cutoff;
    });

    retainedByAge.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const retained = retainedByAge.slice(Math.max(retainedByAge.length - this.maxCount, 0));

    if (Array.isArray(this.registry.snapshots)) {
      this.registry.snapshots = retained;
    }

    return {
      beforeCount: snapshots.length,
      afterCount: retained.length,
      maxCount: this.maxCount,
      retentionDays: this.retentionDays
    };
  }

  listSnapshotMetadata() {
    const snapshots = this.registry?.listSnapshots?.() ?? [];
    return snapshots
      .map((entry) => ({
        snapshotId: entry.snapshotId,
        createdAt: entry.createdAt,
        generatedAt: entry.snapshot?.generatedAt ?? null,
        dashboardStatus: entry.snapshot?.dashboardStatus ?? null,
        sectionStatus: {
          executiveOverview: Boolean(entry.snapshot?.executiveOverview),
          missionControl: Boolean(entry.snapshot?.missionControl),
          alerts: Boolean(entry.snapshot?.alerts)
        }
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  getSnapshotById(snapshotId) {
    const target = String(snapshotId ?? '').trim();
    if (!/^dash_\d+$/.test(target)) {
      return {
        found: false,
        reason: 'Invalid snapshot identifier format.',
        snapshot: null
      };
    }

    const snapshots = this.registry?.listSnapshots?.() ?? [];
    const entry = snapshots.find((item) => item.snapshotId === target) ?? null;

    if (!entry) {
      return {
        found: false,
        reason: 'Snapshot not found.',
        snapshot: null
      };
    }

    return {
      found: true,
      reason: null,
      snapshot: entry
    };
  }
}
