import { PerformanceLogger } from './performance-logger.js';
import { PerformanceManager } from './performance-manager.js';
import { PerformanceQuery, PerformanceSnapshot } from './models.js';
import { PerformanceRecorder } from './performance-recorder.js';
import { PerformanceRepository } from './performance-repository.js';
import { PerformanceRetrieval } from './performance-retrieval.js';

export class PerformanceService {
  constructor({
    repository = new PerformanceRepository(),
    recorder = new PerformanceRecorder(),
    manager = null,
    retrieval = null,
    logger = new PerformanceLogger(),
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new PerformanceManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new PerformanceRetrieval(this.repository);
    this.logger = logger;
  }

  generateIntelligence(payload) {
    const record = this.manager.generate(payload);
    this.logger.log({
      message: 'Performance intelligence generated',
      workflowId: record.workflowId,
      requestId: record.requestId,
      status: record.status.value,
      timestamp: record.generatedAt,
    });
    return record;
  }

  recordExecution(payload) {
    return this.generateIntelligence(payload);
  }

  recordCapabilityResult(payload) {
    return this.generateIntelligence(payload);
  }

  retrieveIntelligence(query = {}) {
    const performanceQuery = query instanceof PerformanceQuery ? query : new PerformanceQuery(query);
    const result = this.retrieval.search(performanceQuery);
    this.logger.log({
      message: 'Performance intelligence retrieved',
      count: result.total,
      filters: {
        workflowId: performanceQuery.workflowId,
        requestId: performanceQuery.requestId,
        status: performanceQuery.status,
        tag: performanceQuery.tag,
      },
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  captureSnapshot(query = {}) {
    const performanceQuery = query instanceof PerformanceQuery ? query : new PerformanceQuery(query);
    const result = this.retrieval.search(performanceQuery);
    return new PerformanceSnapshot({ query: performanceQuery, result });
  }

  generatePerformanceReport(query = {}) {
    const result = this.retrieveIntelligence(query);
    const health = this.getCapabilityHealth(query);
    return {
      generatedAt: new Date().toISOString(),
      total: result.total,
      health,
      records: result.records,
    };
  }

  generateRecommendations(query = {}) {
    const result = this.retrieveIntelligence(query);
    return result.records.map((record) => ({
      workflowId: record.workflowId,
      requestId: record.requestId,
      recommendations: [...record.observations],
    }));
  }

  calculateConfidence(query = {}) {
    const result = this.retrieveIntelligence(query);
    const confidenceValues = result.records.flatMap((record) => record.signals.map((signal) => Number(signal.confidence ?? 0)));
    if (confidenceValues.length === 0) {
      return 0;
    }
    return confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length;
  }

  detectRegression(query = {}) {
    const result = this.retrieveIntelligence(query);
    if (result.records.length < 2) {
      return false;
    }

    const ordered = [...result.records].sort((a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime());
    const previous = ordered[ordered.length - 2];
    const latest = ordered[ordered.length - 1];
    return Number(latest.context.metricCount) < Number(previous.context.metricCount);
  }

  detectImprovement(query = {}) {
    const result = this.retrieveIntelligence(query);
    if (result.records.length < 2) {
      return false;
    }

    const ordered = [...result.records].sort((a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime());
    const previous = ordered[ordered.length - 2];
    const latest = ordered[ordered.length - 1];
    return Number(latest.context.metricCount) > Number(previous.context.metricCount);
  }

  getCapabilityHealth(query = {}) {
    const result = this.retrieveIntelligence(query);
    const generated = result.records.filter((record) => record.status.value === 'GENERATED').length;
    const failed = result.records.filter((record) => record.status.value === 'FAILED').length;
    const ratio = result.total === 0 ? 0 : generated / result.total;
    const status = failed > 0 ? 'AT_RISK' : ratio >= 0.9 ? 'HEALTHY' : 'DEGRADED';

    return {
      status,
      total: result.total,
      generated,
      failed,
      confidence: this.calculateConfidence(query),
    };
  }

  getHistory() {
    return this.retrieval.getHistory();
  }
}
