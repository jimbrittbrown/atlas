export class WorkforceDashboardModel {
  build(snapshot = {}) {
    const specialists = Array.isArray(snapshot?.specialists) ? snapshot.specialists : [];
    const byStatus = this.aggregateByField(specialists, 'currentEmploymentStatus');
    const byCategory = this.aggregateByField(specialists, 'category');

    return {
      meta: snapshot?.meta ?? {},
      totals: {
        specialists: specialists.length,
        champions: byStatus.Champion ?? 0,
        runnerUps: byStatus['Runner-up'] ?? 0,
        active: byStatus.Active ?? 0,
        candidates: byStatus.Candidate ?? 0,
        retired: byStatus.Retired ?? 0,
        deprecated: byStatus.Deprecated ?? 0
      },
      categoryStandings: snapshot?.categoryStandings ?? {},
      categoryCounts: byCategory,
      benchmarkSchedules: snapshot?.benchmarkSchedules ?? {},
      recentEvents: Array.isArray(snapshot?.eventHistory)
        ? snapshot.eventHistory.slice(0, 20)
        : []
    };
  }

  aggregateByField(records, field) {
    const counts = {};
    for (const item of records) {
      const key = String(item?.[field] ?? 'UNKNOWN');
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }
}
