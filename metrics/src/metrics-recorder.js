import { MetricCategory, MetricEvent, MetricMetadata, MetricRecord } from './models.js';

export class MetricsRecorder {
  buildRecord({
    name,
    category,
    value,
    unit = 'count',
    status = 'recorded',
    retryCount = 0,
    metadata = {},
    timestamp = new Date().toISOString(),
  }) {
    if (!name) {
      throw new Error('Metric event requires a name');
    }
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      throw new Error('Metric event requires a numeric value');
    }

    const metricCategory = category instanceof MetricCategory ? category : MetricCategory.fromValue(category);
    const now = new Date().toISOString();
    const eventId = `metric-event-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const recordId = `metric-record-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const event = new MetricEvent({
      id: eventId,
      name,
      category: metricCategory,
      value: Number(value),
      unit,
      status,
      retryCount,
      metadata: new MetricMetadata(metadata),
      timestamp,
    });

    return new MetricRecord({ id: recordId, event, recordedAt: now });
  }
}
