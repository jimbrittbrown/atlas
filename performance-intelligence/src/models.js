export class PerformanceStatus {
  static READY = new PerformanceStatus('READY');
  static GENERATED = new PerformanceStatus('GENERATED');
  static FAILED = new PerformanceStatus('FAILED');

  static all() {
    return [PerformanceStatus.READY, PerformanceStatus.GENERATED, PerformanceStatus.FAILED];
  }

  static fromValue(value) {
    const status = PerformanceStatus.all().find((item) => item.value === value);
    if (!status) {
      throw new Error(`Unknown performance status: ${value}`);
    }
    return status;
  }

  constructor(value) {
    this.value = value;
  }
}

export class PerformanceSignal {
  constructor({ name, value, unit = 'count', source = 'atlas', confidence = 0.5 }) {
    this.name = name;
    this.value = value;
    this.unit = unit;
    this.source = source;
    this.confidence = confidence;
  }
}

export class PerformanceContext {
  constructor({ workflowId, requestId, executiveState, researchStatus, memoryRecordCount, metricCount, tags = [] }) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.executiveState = executiveState;
    this.researchStatus = researchStatus;
    this.memoryRecordCount = memoryRecordCount;
    this.metricCount = metricCount;
    this.tags = [...tags];
  }
}

export class PerformanceObservation {
  constructor({ title, detail, severity = 'info' }) {
    this.title = title;
    this.detail = detail;
    this.severity = severity;
  }
}

export class PerformanceAssessment {
  constructor({
    workflowId,
    requestId,
    status = PerformanceStatus.READY,
    signals = [],
    observations = [],
    summary = '',
    generatedAt = new Date().toISOString(),
  }) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.status = status;
    this.signals = signals;
    this.observations = observations;
    this.summary = summary;
    this.generatedAt = generatedAt;
  }
}

export class PerformanceQuery {
  constructor({ workflowId = null, requestId = null, status = null, tag = null } = {}) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.status = status;
    this.tag = tag;
  }
}

export class PerformanceResult {
  constructor({ records = [], total = 0 }) {
    this.records = records;
    this.total = total;
  }
}

export class PerformanceSnapshot {
  constructor({ capturedAt = new Date().toISOString(), query, result }) {
    this.capturedAt = capturedAt;
    this.query = query;
    this.result = result;
  }
}
