import { MemoryCategory, MemoryEntry, MemoryMetadata, MemoryRecord, MemoryReference } from './models.js';

export class MemoryRecorder {
  buildRecord({ category, title, summary, content, metadata = {}, references = [] }) {
    if (!title || !summary || !content) {
      throw new Error('Memory entry requires title, summary, and content');
    }

    const categoryModel = category instanceof MemoryCategory ? category : MemoryCategory.fromValue(category);
    const recordId = `mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const entryId = `${recordId}-entry`;
    const now = new Date().toISOString();

    const normalizedReferences = references.map((reference) => new MemoryReference(reference));
    const entry = new MemoryEntry({
      id: entryId,
      title,
      summary,
      content,
      category: categoryModel,
      references: normalizedReferences,
      metadata: new MemoryMetadata(metadata),
      createdAt: now,
    });

    return new MemoryRecord({
      id: recordId,
      entry,
      auditTrail: [{ action: 'CREATED', timestamp: now }],
      recordedAt: now,
    });
  }
}
