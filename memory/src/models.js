export class MemoryCategory {
  static EXECUTIVE_DECISIONS = new MemoryCategory('Executive Decisions');
  static RESEARCH = new MemoryCategory('Research');
  static PROJECTS = new MemoryCategory('Projects');
  static WORKFLOWS = new MemoryCategory('Workflows');
  static BUSINESSES = new MemoryCategory('Businesses');
  static LESSONS_LEARNED = new MemoryCategory('Lessons Learned');
  static ARCHITECTURE = new MemoryCategory('Architecture');
  static IMPLEMENTATIONS = new MemoryCategory('Implementations');
  static APPROVALS = new MemoryCategory('Approvals');
  static METRICS_REFERENCES = new MemoryCategory('Metrics References');

  static all() {
    return [
      MemoryCategory.EXECUTIVE_DECISIONS,
      MemoryCategory.RESEARCH,
      MemoryCategory.PROJECTS,
      MemoryCategory.WORKFLOWS,
      MemoryCategory.BUSINESSES,
      MemoryCategory.LESSONS_LEARNED,
      MemoryCategory.ARCHITECTURE,
      MemoryCategory.IMPLEMENTATIONS,
      MemoryCategory.APPROVALS,
      MemoryCategory.METRICS_REFERENCES,
    ];
  }

  static fromValue(value) {
    const category = MemoryCategory.all().find((item) => item.value === value);
    if (!category) {
      throw new Error(`Unknown memory category: ${value}`);
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

export class MemoryMetadata {
  constructor({ workflowId = null, requestId = null, source = 'atlas', createdBy = 'system', tags = [] } = {}) {
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.source = source;
    this.createdBy = createdBy;
    this.tags = [...tags];
  }
}

export class MemoryReference {
  constructor({ referenceType, referenceId, location = '' }) {
    this.referenceType = referenceType;
    this.referenceId = referenceId;
    this.location = location;
  }
}

export class MemoryEntry {
  constructor({ id, title, summary, content, category, references = [], metadata = new MemoryMetadata(), createdAt = new Date().toISOString() }) {
    this.id = id;
    this.title = title;
    this.summary = summary;
    this.content = content;
    this.category = category;
    this.references = [...references];
    this.metadata = metadata;
    this.createdAt = createdAt;
  }
}

export class MemoryRecord {
  constructor({ id, entry, auditTrail = [], recordedAt = new Date().toISOString() }) {
    this.id = id;
    this.entry = entry;
    this.auditTrail = [...auditTrail];
    this.recordedAt = recordedAt;
  }
}

export class MemoryQuery {
  constructor({ category = null, workflowId = null, requestId = null, tag = null, referenceType = null } = {}) {
    this.category = category;
    this.workflowId = workflowId;
    this.requestId = requestId;
    this.tag = tag;
    this.referenceType = referenceType;
  }
}

export class MemoryResult {
  constructor({ records = [], total = 0 }) {
    this.records = records;
    this.total = total;
  }
}
