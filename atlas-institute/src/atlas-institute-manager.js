import { KnowledgeCategory, KnowledgeSynthesis } from './models.js';

const firstSentence = (text) => String(text ?? '').split('.').map((s) => s.trim()).filter(Boolean)[0] ?? String(text ?? '');

export class AtlasInstituteManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  recordLesson(payload) {
    return this.repository.save(this.recorder.createLesson(payload));
  }

  recordExperiment(payload) {
    return this.repository.save(this.recorder.createExperiment(payload));
  }

  recordBestPractice(payload) {
    return this.repository.save(this.recorder.createBestPractice(payload));
  }

  recordFailure(payload) {
    return this.repository.save(this.recorder.createFailure(payload));
  }

  recordKnowledge(payload) {
    return this.repository.save(this.recorder.createRecord(payload));
  }

  search(query) {
    return this.repository.search(query);
  }

  generatePlaybook({ topic, query }) {
    const result = this.repository.search(query);
    const guidance = result.records.slice(0, 10).map((record) => `${record.title}: ${firstSentence(record.summary)}`);
    const references = result.records.map((record) => ({ id: record.id, title: record.title, category: record.category }));

    return new KnowledgeSynthesis({
      title: `Playbook: ${topic}`,
      guidance,
      references,
      metadata: { topic, recordCount: result.total },
    });
  }

  generateBestPractices({ domain, query }) {
    const lessons = this.repository.search({ ...query, category: KnowledgeCategory.LESSONS }).records;
    const experiments = this.repository.search({ ...query, category: KnowledgeCategory.EXPERIMENTS }).records;
    const bestPractices = this.repository.search({ ...query, category: KnowledgeCategory.BEST_PRACTICES }).records;

    const guidance = [
      ...bestPractices.map((record) => `${record.title}: ${firstSentence(record.content)}`),
      ...lessons.slice(0, 5).map((record) => `Lesson: ${record.title} -> ${firstSentence(record.summary)}`),
      ...experiments.slice(0, 5).map((record) => `Experiment: ${record.title} -> ${firstSentence(record.summary)}`),
    ];

    const references = [...bestPractices, ...lessons, ...experiments].map((record) => ({
      id: record.id,
      title: record.title,
      category: record.category,
      source: record.source,
    }));

    return new KnowledgeSynthesis({
      title: `Current Best Practices: ${domain}`,
      guidance: guidance.slice(0, 20),
      references,
      metadata: { domain, references: references.length },
    });
  }

  recommendImprovements({ area, query }) {
    const failures = this.repository.search({ ...query, category: KnowledgeCategory.FAILURES }).records;
    const experiments = this.repository.search({ ...query, category: KnowledgeCategory.EXPERIMENTS }).records;

    const guidance = [
      ...failures.slice(0, 8).map((record) => `Prevent recurrence: ${record.title} -> ${firstSentence(record.summary)}`),
      ...experiments.slice(0, 8).map((record) => `Scale winning pattern: ${record.title} -> ${firstSentence(record.summary)}`),
    ];

    return new KnowledgeSynthesis({
      title: `Recommended Improvements: ${area}`,
      guidance,
      references: [...failures, ...experiments].map((record) => ({ id: record.id, title: record.title, category: record.category })),
      metadata: { area, failureCount: failures.length, experimentCount: experiments.length },
    });
  }

  getStandards() {
    return this.repository.search({ category: KnowledgeCategory.STANDARDS });
  }

  getSummary() {
    const categories = Object.values(KnowledgeCategory);
    const byCategory = Object.fromEntries(categories.map((category) => [category, this.repository.search({ category }).total]));
    const total = this.repository.search({}).total;
    return { total, byCategory };
  }
}
