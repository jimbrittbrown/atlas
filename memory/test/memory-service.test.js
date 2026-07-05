import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryService } from '../src/memory-service.js';
import { MemoryCategory } from '../src/models.js';

test('records memory entries and preserves audit history', () => {
  const service = new MemoryService();
  const record = service.recordExecutiveDecision({
    title: 'CEO approval',
    summary: 'Work order approved',
    content: 'Approved for implementation.',
    metadata: { workflowId: 'wf-100', requestId: 'req-100', tags: ['approval'] },
    references: [{ referenceType: 'workflow', referenceId: 'wf-100' }],
  });

  assert.equal(record.entry.category.value, MemoryCategory.EXECUTIVE_DECISIONS.value);
  assert.equal(service.getAuditHistory().length, 1);
});

test('retrieves by category and workflow metadata', () => {
  const service = new MemoryService();
  service.recordResearchReport({
    title: 'Research complete',
    summary: 'Evidence compiled',
    content: '{"report":"ready"}',
    metadata: { workflowId: 'wf-200', requestId: 'req-200', tags: ['research'] },
    references: [{ referenceType: 'workflow', referenceId: 'wf-200' }],
  });
  service.recordProjectHistory({
    title: 'Project closeout',
    summary: 'Project archived',
    content: 'Completed and archived',
    metadata: { workflowId: 'wf-201', requestId: 'req-201', tags: ['project'] },
    references: [{ referenceType: 'workflow', referenceId: 'wf-201' }],
  });

  const categoryResult = service.retrieve({ category: MemoryCategory.RESEARCH });
  const workflowResult = service.retrieve({ workflowId: 'wf-200' });

  assert.equal(categoryResult.total, 1);
  assert.equal(workflowResult.total, 1);
  assert.equal(workflowResult.records[0].entry.metadata.requestId, 'req-200');
});

test('supports tag and reference queries', () => {
  const service = new MemoryService();
  service.recordLessonLearned({
    title: 'Integration lesson',
    summary: 'Keep ownership boundaries strict',
    content: 'Executive owns workflow, memory owns storage.',
    metadata: { workflowId: 'wf-300', requestId: 'req-300', tags: ['lessons', 'integration'] },
    references: [{ referenceType: 'workflow', referenceId: 'wf-300' }],
  });

  const byTag = service.retrieve({ tag: 'integration' });
  const byReferenceType = service.retrieve({ referenceType: 'workflow' });

  assert.equal(byTag.total, 1);
  assert.equal(byReferenceType.total, 1);
});

test('fails when required memory fields are missing', () => {
  const service = new MemoryService();
  assert.throws(() => {
    service.recordImplementationHistory({
      title: '',
      summary: 'Missing title should fail',
      content: 'invalid',
    });
  }, /requires title, summary, and content/);
});

test('logs recording and retrieval operations', () => {
  const service = new MemoryService();
  service.recordWorkflowHistory({
    title: 'Workflow archive',
    summary: 'Workflow completed',
    content: 'Workflow transitioned to completed state',
    metadata: { workflowId: 'wf-400', requestId: 'req-400', tags: ['workflow'] },
  });
  service.retrieve({ workflowId: 'wf-400' });

  assert.equal(service.logger.getEntries().length, 2);
});
