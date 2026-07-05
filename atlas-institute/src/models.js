export const KnowledgeCategory = Object.freeze({
  LESSONS: 'LESSONS',
  EXPERIMENTS: 'EXPERIMENTS',
  BEST_PRACTICES: 'BEST_PRACTICES',
  FAILURES: 'FAILURES',
  STANDARDS: 'STANDARDS',
  PLAYBOOKS: 'PLAYBOOKS',
  PROMPT_LIBRARY: 'PROMPT_LIBRARY',
  ARCHITECTURAL_DECISIONS: 'ARCHITECTURAL_DECISIONS',
  BUSINESS_KNOWLEDGE: 'BUSINESS_KNOWLEDGE',
});

export class KnowledgeRecord {
  constructor({
    id,
    category,
    title,
    summary,
    content,
    source = 'atlas-institute',
    metadata = {},
    tags = [],
    createdAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.category = category;
    this.title = title;
    this.summary = summary;
    this.content = content;
    this.source = source;
    this.metadata = metadata;
    this.tags = tags;
    this.createdAt = createdAt;
  }
}

export class KnowledgeQuery {
  constructor({
    category = null,
    text = null,
    tag = null,
    source = null,
  } = {}) {
    this.category = category;
    this.text = text;
    this.tag = tag;
    this.source = source;
  }
}

export class KnowledgeSynthesis {
  constructor({
    generatedAt = new Date().toISOString(),
    title,
    guidance = [],
    references = [],
    metadata = {},
  }) {
    this.generatedAt = generatedAt;
    this.title = title;
    this.guidance = guidance;
    this.references = references;
    this.metadata = metadata;
  }
}
