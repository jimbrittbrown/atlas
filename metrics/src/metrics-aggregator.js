import { MetricSummary } from './models.js';

export class MetricsAggregator {
  summarize(records) {
    const count = records.length;
    const totalValue = records.reduce((acc, record) => acc + Number(record.event.value), 0);
    const averageValue = count === 0 ? 0 : totalValue / count;

    const byCategory = {};
    const byStatus = {};
    let retryTotal = 0;

    for (const record of records) {
      const category = record.event.category.value;
      const status = record.event.status;
      byCategory[category] = (byCategory[category] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      retryTotal += Number(record.event.retryCount ?? 0);
    }

    return new MetricSummary({ count, totalValue, averageValue, byCategory, byStatus, retryTotal });
  }
}
