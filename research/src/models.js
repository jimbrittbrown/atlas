export class ResearchStatus {
  static NEW = new ResearchStatus('NEW');
  static QUEUED = new ResearchStatus('QUEUED');
  static RUNNING = new ResearchStatus('RUNNING');
  static COLLECTING_EVIDENCE = new ResearchStatus('COLLECTING_EVIDENCE');
  static ANALYZING = new ResearchStatus('ANALYZING');
  static GENERATING_REPORT = new ResearchStatus('GENERATING_REPORT');
  static COMPLETED = new ResearchStatus('COMPLETED');
  static FAILED = new ResearchStatus('FAILED');
  static PAUSED = new ResearchStatus('PAUSED');
  static WAITING_FOR_INPUT = new ResearchStatus('WAITING_FOR_INPUT');
  static CANCELLED = new ResearchStatus('CANCELLED');

  static all() {
    return [
      ResearchStatus.NEW,
      ResearchStatus.QUEUED,
      ResearchStatus.RUNNING,
      ResearchStatus.COLLECTING_EVIDENCE,
      ResearchStatus.ANALYZING,
      ResearchStatus.GENERATING_REPORT,
      ResearchStatus.COMPLETED,
      ResearchStatus.FAILED,
      ResearchStatus.PAUSED,
      ResearchStatus.WAITING_FOR_INPUT,
      ResearchStatus.CANCELLED,
    ];
  }

  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export class ResearchRequest {
  constructor(id, objective, context = {}, createdAt = new Date().toISOString()) {
    this.id = id;
    this.objective = objective;
    this.context = context;
    this.createdAt = createdAt;
  }
}

export class ResearchJob {
  constructor(id, request, status = ResearchStatus.NEW, createdAt = new Date().toISOString()) {
    this.id = id;
    this.request = request;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = createdAt;
    this.evidence = [];
    this.findings = [];
    this.sources = [];
  }
}

export class ResearchEvidence {
  constructor(source, summary, confidence = 0.5) {
    this.source = source;
    this.summary = summary;
    this.confidence = confidence;
  }
}

export class ResearchSource {
  constructor(name, uri = '') {
    this.name = name;
    this.uri = uri;
  }
}

export class ResearchFinding {
  constructor(title, detail, confidence = 0.5) {
    this.title = title;
    this.detail = detail;
    this.confidence = confidence;
  }
}

export class ResearchResult {
  constructor(jobId, status, evidence = [], findings = []) {
    this.jobId = jobId;
    this.status = status;
    this.evidence = evidence;
    this.findings = findings;
  }
}

export class ResearchReport {
  constructor(jobId, summary, objective, evidence, findings, sources, risks, unknowns, confidenceEstimate, recommendedNextSteps) {
    this.jobId = jobId;
    this.executiveSummary = summary;
    this.objective = objective;
    this.evidence = evidence;
    this.findings = findings;
    this.supportingSources = sources;
    this.risks = risks;
    this.unknowns = unknowns;
    this.confidenceEstimate = confidenceEstimate;
    this.recommendedNextSteps = recommendedNextSteps;
  }
}
