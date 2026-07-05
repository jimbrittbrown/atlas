import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasInstituteService } from '../src/atlas-institute-service.js';
import { KnowledgeCategory } from '../src/models.js';

test('records lessons, experiments, best practices, and failures', () => {
  const service = new AtlasInstituteService();

  const lesson = service.recordLesson({ title: 'Lesson A', summary: 'Summary A', content: 'Content A' });
  const experiment = service.recordExperiment({ title: 'Experiment A', summary: 'Summary E', content: 'Content E' });
  const bestPractice = service.recordBestPractice({ title: 'Best Practice A', summary: 'Summary B', content: 'Content B' });
  const failure = service.recordFailure({ title: 'Failure A', summary: 'Summary F', content: 'Content F' });

  assert.equal(lesson.category, KnowledgeCategory.LESSONS);
  assert.equal(experiment.category, KnowledgeCategory.EXPERIMENTS);
  assert.equal(bestPractice.category, KnowledgeCategory.BEST_PRACTICES);
  assert.equal(failure.category, KnowledgeCategory.FAILURES);
});

test('searches knowledge by category and text', () => {
  const service = new AtlasInstituteService();
  service.recordLesson({ title: 'AI Product Marketing', summary: 'Launch guidance', content: 'Use benchmark loops' });
  service.recordLesson({ title: 'Engineering Ops', summary: 'Stability guidance', content: 'Preserve contracts' });

  const byText = service.searchKnowledge({ text: 'marketing' });
  const byCategory = service.searchKnowledge({ category: KnowledgeCategory.LESSONS });

  assert.equal(byText.total, 1);
  assert.equal(byCategory.total, 2);
});

test('generates synthesized playbook and best practices from accumulated records', () => {
  const service = new AtlasInstituteService();
  service.recordExperiment({
    title: 'AI Product Marketing Experiment #1',
    summary: 'Video-first launch increased trials.',
    content: 'Experiment data content.',
  });
  service.recordBestPractice({
    title: 'Best practice from launch loops',
    summary: 'Run weekly iteration cadence.',
    content: 'Run weekly iteration cadence. Keep messaging anchored to user outcomes.',
  });
  service.recordLesson({
    title: 'Learning from campaign review',
    summary: 'Narrative consistency improved conversion.',
    content: 'Narrative consistency improved conversion.',
  });

  const playbook = service.generatePlaybook({ topic: 'AI Product Marketing', query: { text: 'launch' } });
  const bestPractices = service.generateBestPractices({ domain: 'AI Product Marketing' });

  assert.equal(playbook.title, 'Playbook: AI Product Marketing');
  assert.equal(playbook.guidance.length > 0, true);
  assert.equal(bestPractices.title, 'Current Best Practices: AI Product Marketing');
  assert.equal(bestPractices.guidance.length > 0, true);
});

test('recommends improvements from failures and experiments', () => {
  const service = new AtlasInstituteService();
  service.recordFailure({
    title: 'Failed rollout timing',
    summary: 'Launch occurred before readiness checklist completion.',
    content: 'Delay release until readiness checks pass.',
  });
  service.recordExperiment({
    title: 'Canary rollout experiment',
    summary: 'Progressive rollout reduced incidents.',
    content: 'Use percentage-based expansion by stage.',
  });

  const recommendations = service.recommendImprovements({ area: 'Release Management' });
  assert.equal(recommendations.title, 'Recommended Improvements: Release Management');
  assert.equal(recommendations.guidance.length, 2);
});

test('captures system knowledge from integrated Atlas services', () => {
  const service = new AtlasInstituteService({
    capabilityRegistryService: { listCapabilities: () => [{ metadata: { name: 'Control Center' } }] },
    approvalService: { getApprovalHistory: () => [{ id: 'ap1', status: 'APPROVED' }] },
    workerOrchestrationService: { getHistory: () => [{ id: 'assign-1', state: { value: 'COMPLETED' } }] },
    memoryService: { retrieve: () => ({ records: [{ id: 'mem-1' }] }) },
    metricsService: { retrieveMetrics: () => ({ records: [{ id: 'metric-1' }] }) },
    performanceService: { retrieveIntelligence: () => ({ records: [{ id: 'perf-1' }] }) },
  });

  const captured = service.captureSystemKnowledge({
    workflowId: 'wf-1700',
    requestId: 'req-1700',
    objective: 'Improve launch quality',
    controlCenterView: { overview: { workflowState: 'COMPLETED' } },
    executionResult: { execution: { executed: true } },
  });

  assert.equal(captured.length >= 6, true);
  assert.equal(service.getKnowledgeSummary().total >= captured.length, true);
});

test('returns standards and summary views', () => {
  const service = new AtlasInstituteService();
  service.recordBestPractice({ title: 'Reference style', summary: 'Use authoritative sources', content: 'Always cite source of truth' });
  service.recordLesson({ title: 'Engineering lesson', summary: 'Keep boundaries strict', content: 'No boundary collapse' });
  service.recordFailure({ title: 'Failure sample', summary: 'Missing checkpoint', content: 'Add checkpoint' });
  service.recordBestPractice({ title: 'Standards template', summary: 'Use review checklist', content: 'Checklist required' });
  service.manager.recordKnowledge({
    category: KnowledgeCategory.STANDARDS,
    title: 'Service release standard',
    summary: 'All releases need regression and review.',
    content: 'Run full regression and complete reviews.',
  });

  const standards = service.getStandards();
  const summary = service.getKnowledgeSummary();

  assert.equal(standards.total, 1);
  assert.equal(summary.total >= 5, true);
});
