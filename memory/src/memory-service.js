import { MemoryCategory, MemoryQuery } from './models.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryManager } from './memory-manager.js';
import { MemoryRecorder } from './memory-recorder.js';
import { MemoryRepository } from './memory-repository.js';
import { MemoryRetrieval } from './memory-retrieval.js';

export class MemoryService {
  constructor({
    repository = new MemoryRepository(),
    recorder = new MemoryRecorder(),
    manager = null,
    retrieval = null,
    logger = new MemoryLogger(),
  } = {}) {
    this.repository = repository;
    this.recorder = recorder;
    this.manager = manager ?? new MemoryManager(this.repository, this.recorder);
    this.retrieval = retrieval ?? new MemoryRetrieval(this.repository);
    this.logger = logger;
  }

  recordCompletedInformation(payload) {
    const record = this.manager.record(payload);
    this.logger.log({ recordId: record.id, category: record.entry.category.value, message: 'Memory record stored', timestamp: record.recordedAt });
    return record;
  }

  recordWorkflowHistory({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.WORKFLOWS, title, summary, content, metadata, references });
  }

  recordExecutiveDecision({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.EXECUTIVE_DECISIONS, title, summary, content, metadata, references });
  }

  recordResearchReport({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.RESEARCH, title, summary, content, metadata, references });
  }

  recordExecutiveSummary({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.PROJECTS, title, summary, content, metadata, references });
  }

  recordProjectHistory({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.PROJECTS, title, summary, content, metadata, references });
  }

  recordLessonLearned({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.LESSONS_LEARNED, title, summary, content, metadata, references });
  }

  recordImplementationHistory({ title, summary, content, metadata = {}, references = [] }) {
    return this.recordCompletedInformation({ category: MemoryCategory.IMPLEMENTATIONS, title, summary, content, metadata, references });
  }

  retrieve(query = {}) {
    const memoryQuery = query instanceof MemoryQuery ? query : new MemoryQuery(query);
    const result = this.retrieval.search(memoryQuery);
    this.logger.log({
      message: 'Memory retrieval executed',
      filters: {
        category: memoryQuery.category?.value ?? null,
        workflowId: memoryQuery.workflowId,
        requestId: memoryQuery.requestId,
        tag: memoryQuery.tag,
        referenceType: memoryQuery.referenceType,
      },
      count: result.total,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  getAuditHistory() {
    return this.repository.getAuditHistory();
  }
}
