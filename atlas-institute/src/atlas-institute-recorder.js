import { KnowledgeCategory, KnowledgeRecord } from './models.js';

const nextId = () => `knowledge-${Math.random().toString(36).slice(2, 10)}`;

export class AtlasInstituteRecorder {
  createRecord({ category, title, summary, content, source, metadata = {}, tags = [] }) {
    if (!category) {
      throw new Error('Knowledge category is required');
    }
    if (!title || !summary || !content) {
      throw new Error('Knowledge title, summary, and content are required');
    }

    return new KnowledgeRecord({
      id: nextId(),
      category,
      title,
      summary,
      content,
      source,
      metadata,
      tags,
    });
  }

  createLesson(payload) {
    return this.createRecord({ ...payload, category: KnowledgeCategory.LESSONS });
  }

  createExperiment(payload) {
    return this.createRecord({ ...payload, category: KnowledgeCategory.EXPERIMENTS });
  }

  createBestPractice(payload) {
    return this.createRecord({ ...payload, category: KnowledgeCategory.BEST_PRACTICES });
  }

  createFailure(payload) {
    return this.createRecord({ ...payload, category: KnowledgeCategory.FAILURES });
  }
}
