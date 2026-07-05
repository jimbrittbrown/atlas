export class MetricCategory {
  static WORKFLOW_METRICS = new MetricCategory('Workflow Metrics');
  static SERVICE_METRICS = new MetricCategory('Service Metrics');
  static RESEARCH_METRICS = new MetricCategory('Research Metrics');
  static MEMORY_METRICS = new MetricCategory('Memory Metrics');
  static INTEGRATION_METRICS = new MetricCategory('Integration Metrics');
  static ERROR_METRICS = new MetricCategory('Error Metrics');
  static PERFORMANCE_TIMING = new MetricCategory('Performance Timing');
  static SYSTEM_HEALTH = new MetricCategory('System Health');
  static PROJECT_METRICS = new MetricCategory('Project Metrics');

  static all() {
    return [
      MetricCategory.WORKFLOW_METRICS,
      MetricCategory.SERVICE_METRICS,
      MetricCategory.RESEARCH_METRICS,
      MetricCategory.MEMORY_METRICS,
      MetricCategory.INTEGRATION_METRICS,
      MetricCategory.ERROR_METRICS,
      MetricCategory.PERFORMANCE_TIMING,
      MetricCategory.SYSTEM_HEALTH,
      MetricCategory.PROJECT_METRICS,
    ];
  }

  static fromValue(value) {
    const category = MetricCategory.all().find((item) => item.value === value);
    if (!category) {
      throw new Error(`Unknown metric category: ${value}`);
    }
    return category;
  }

  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export class MetricMetadata {
  constructor({
    workflowId = null,
    requestId = null,
    projectId = null,
    service = 'atlas',
    operation = 'unspecified',
    source = 'atlas',
    tags = [],
  } = {}) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.projectId = projectId;
    this.service = service;
    this.operation = operation;
    this.source = source;
    this.tags = [...tags];
  }
}

export class MetricEvent {
  constructor({
    id,
    name,
    category,
    value,
    unit = 'count',
    status = 'recorded',
    retryCount = 0,
    metadata = new MetricMetadata(),
    timestamp = new Date().toISOString(),
  }) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.value = value;
    this.unit = unit;
    this.status = status;
    this.retryCount = retryCount;
    this.metadata = metadata;
    this.timestamp = timestamp;
  }
}

export class MetricRecord {
  constructor({ id, event, recordedAt = new Date().toISOString() }) {
    this.id = id;
    this.event = event;
    this.recordedAt = recordedAt;
  }
}

export class MetricQuery {
  constructor({
    category = null,
    workflowId = null,
    requestId = null,
    service = null,
    status = null,
    tag = null,
    fromTimestamp = null,
    toTimestamp = null,
  } = {}) {
    this.category = category;
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.service = service;
    this.status = status;
    this.tag = tag;
    this.fromTimestamp = fromTimestamp;
    this.toTimestamp = toTimestamp;
  }
}

export class MetricResult {
  constructor({ records = [], total = 0 }) {
    this.records = records;
    this.total = total;
  }
}

export class MetricSummary {
  constructor({ count = 0, totalValue = 0, averageValue = 0, byCategory = {}, byStatus = {}, retryTotal = 0 } = {}) {
    this.count = count;
    this.totalValue = totalValue;
    this.averageValue = averageValue;
    this.byCategory = byCategory;
    this.byStatus = byStatus;
    this.retryTotal = retryTotal;
  }
}

export class MetricSnapshot {
  constructor({ capturedAt = new Date().toISOString(), query, summary }) {
    this.capturedAt = capturedAt;
    this.query = query;
    this.summary = summary;
  }
}
