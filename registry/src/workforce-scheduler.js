export class WorkforceScheduler {
  updateCategorySchedule({ snapshot, category, runAt = new Date().toISOString(), cadenceDays = 30 }) {
    if (!snapshot?.benchmarkSchedules?.[category]) {
      snapshot.benchmarkSchedules[category] = {
        cadence: `P${cadenceDays}D`,
        lastRunAt: null,
        nextRunDueAt: null,
        active: true
      };
    }

    const nextRunDueAt = this.addDays(runAt, cadenceDays);
    snapshot.benchmarkSchedules[category] = {
      ...snapshot.benchmarkSchedules[category],
      cadence: `P${cadenceDays}D`,
      lastRunAt: runAt,
      nextRunDueAt,
      active: true
    };

    return snapshot.benchmarkSchedules[category];
  }

  listDueCategories({ snapshot, now = new Date().toISOString() }) {
    const due = [];
    const nowEpoch = Date.parse(now);

    for (const [category, schedule] of Object.entries(snapshot?.benchmarkSchedules ?? {})) {
      if (!schedule?.active) continue;
      if (!schedule?.nextRunDueAt) {
        due.push(category);
        continue;
      }

      const dueEpoch = Date.parse(schedule.nextRunDueAt);
      if (!Number.isNaN(dueEpoch) && dueEpoch <= nowEpoch) {
        due.push(category);
      }
    }

    return due.sort((a, b) => a.localeCompare(b));
  }

  addDays(anchor, days) {
    const date = new Date(anchor);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString();
  }
}
