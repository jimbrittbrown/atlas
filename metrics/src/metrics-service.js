import { MetricCategory, MetricQuery, MetricSnapshot } from './models.js';
import { MetricsAggregator } from './metrics-aggregator.js';
import { MetricsLogger } from './metrics-logger.js';
import { MetricsManager } from './metrics-manager.js';
import { MetricsRecorder } from './metrics-recorder.js';
import { MetricsRepository } from './metrics-repository.js';
import { MetricsRetrieval } from './metrics-retrieval.js';

export class MetricsService {
  constructor({
    repository = new MetricsRepository(),
    recorder = new MetricsRecorder(),
    manager = null,
    retrieval = null,
    aggregator = new MetricsAggregator(),
    logger = new MetricsLogger(),
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new MetricsManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new MetricsRetrieval(this.repository);
    this.aggregator = aggregator;
    this.logger = logger;
  }

  recordMetricEvent(payload) {
    const record = this.manager.record(payload);
    this.logger.log({
      message: 'Metric recorded',
      recordId: record.id,
      eventId: record.event.id,
      category: record.event.category.value,
      timestamp: record.recordedAt,
    });
    return record;
  }

  recordWorkflowTiming({ workflowId, requestId, phase = 'workflow', durationMs, metadata = {} }) {
    return this.recordMetricEvent({
      name: `workflow_timing_${phase}`,
      category: MetricCategory.WORKFLOW_METRICS,
      value: durationMs,
      unit: 'ms',
      status: 'measured',
      metadata: {
        workflowId,
        requestId,
        service: 'executive-service',
        operation: phase,
        source: 'integration',
        tags: ['workflow', 'timing', ...(metadata.tags ?? [])],
        ...metadata,
      },
    });
  }

  recordExecutionDuration({ workflowId, requestId, service, operation, durationMs, metadata = {} }) {
    return this.recordMetricEvent({
      name: `${service}_${operation}_duration`,
      category: MetricCategory.PERFORMANCE_TIMING,
      value: durationMs,
      unit: 'ms',
      status: 'measured',
      metadata: {
        workflowId,
        requestId,
        service,
        operation,
        source: 'integration',
        tags: ['duration', ...(metadata.tags ?? [])],
        ...metadata,
      },
    });
  }

  recordServiceOutcome({ workflowId, requestId, service, operation, success, retryCount = 0, metadata = {} }) {
    return this.recordMetricEvent({
      name: `${service}_${operation}_outcome`,
      category: MetricCategory.SERVICE_METRICS,
      value: success ? 1 : 0,
      unit: 'boolean',
      status: success ? 'success' : 'failure',
      retryCount,
      metadata: {
        workflowId,
        requestId,
        service,
        operation,
        source: 'integration',
        tags: ['service-outcome', ...(metadata.tags ?? [])],
        ...metadata,
      },
    });
  }

  recordWorkflowCompletion({ workflowId, requestId, completionStatus, durationMs, metadata = {} }) {
    return this.recordMetricEvent({
      name: 'workflow_completion',
      category: MetricCategory.INTEGRATION_METRICS,
      value: durationMs,
      unit: 'ms',
      status: completionStatus,
      metadata: {
        workflowId,
        requestId,
        service: 'integration-bridge',
        operation: 'workflow-completion',
        source: 'integration',
        tags: ['workflow-completion', ...(metadata.tags ?? [])],
        ...metadata,
      },
    });
  }

  recordProjectStatistic({ projectId, metricName, value, unit = 'count', metadata = {} }) {
    return this.recordMetricEvent({
      name: metricName,
      category: MetricCategory.PROJECT_METRICS,
      value,
      unit,
      status: 'recorded',
      metadata: {
        projectId,
        service: 'atlas',
        operation: 'project-statistic',
        source: 'metrics-service',
        tags: ['project-metric', ...(metadata.tags ?? [])],
        ...metadata,
      },
    });
  }

  recordOperationalKpi({ kpiName, value, unit = 'count', metadata = {} }) {
    return this.recordMetricEvent({
      name: kpiName,
      category: MetricCategory.SYSTEM_HEALTH,
      value,
      unit,
      status: 'recorded',
      metadata: {
        service: 'atlas',
        operation: 'operational-kpi',
        source: 'metrics-service',
        tags: ['kpi', ...(metadata.tags ?? [])],
        ...metadata,
      },
    });
  }

  retrieveMetrics(query = {}) {
    const metricQuery = query instanceof MetricQuery ? query : new MetricQuery(query);
    const result = this.retrieval.search(metricQuery);
    this.logger.log({
      message: 'Metrics retrieved',
      count: result.total,
      filters: {
        category: metricQuery.category?.value ?? null,
        workflowId: metricQuery.workflowId,
        requestId: metricQuery.requestId,
        service: metricQuery.service,
        status: metricQuery.status,
        tag: metricQuery.tag,
      },
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  aggregateMetrics(query = {}) {
    const metricQuery = query instanceof MetricQuery ? query : new MetricQuery(query);
    const result = this.retrieval.search(metricQuery);
    const summary = this.aggregator.summarize(result.records);
    this.logger.log({ message: 'Metrics aggregation generated', count: result.total, timestamp: new Date().toISOString() });
    return summary;
  }

  captureSnapshot(query = {}) {
    const metricQuery = query instanceof MetricQuery ? query : new MetricQuery(query);
    const summary = this.aggregateMetrics(metricQuery);
    return new MetricSnapshot({ query: metricQuery, summary });
  }

  getMetricHistory() {
    return this.retrieval.getHistory();
  }
}
