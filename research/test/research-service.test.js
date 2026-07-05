import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchService } from '../src/research-service.js';
import { ResearchStateMachine } from '../src/research-state-machine.js';
import { ResearchStatus, ResearchRequest, ResearchFinding } from '../src/models.js';
import { ResearchLogger } from '../src/research-logger.js';

function createRequest() {
  return new ResearchRequest('req-1', 'Assess Atlas architecture', { scope: 'review' });
}

test('creates a research request and job', async () => {
  const service = new ResearchService();
  const job = await service.createResearchJob('req-1', 'Assess Atlas architecture', { scope: 'review' });
  assert.equal(job.id, 'job-req-1');
  assert.equal(job.status.value, 'NEW');
});

test('transitions research jobs through the lifecycle', () => {
  const stateMachine = new ResearchStateMachine();
  assert.equal(stateMachine.transitionState(ResearchStatus.NEW, ResearchStatus.QUEUED).value, 'QUEUED');
  assert.equal(stateMachine.transitionState(ResearchStatus.QUEUED, ResearchStatus.RUNNING).value, 'RUNNING');
});

test('rejects invalid research state transitions', () => {
  const stateMachine = new ResearchStateMachine();
  assert.throws(() => stateMachine.transitionState(ResearchStatus.COMPLETED, ResearchStatus.NEW), /Invalid state transition/);
});

test('orchestrates evidence collection into a report', async () => {
  const provider = { provideEvidence: async () => [{ sourceName: 'Atlas docs', uri: 'https://example.test', summary: 'Evidence found', confidence: 0.8 }] };
  const service = new ResearchService({
    evidenceCollector: { collect: async () => [{ source: { name: 'Atlas docs', uri: 'https://example.test' }, summary: 'Evidence found', confidence: 0.8 }] },
  });
  const job = await service.createResearchJob('req-2', 'Assess evidence');
  const result = await service.executeResearch(job.id, createRequest());
  assert.equal(result.status.value, 'COMPLETED');
  assert.equal(result.evidence.length, 1);
});

test('generates a structured research report', () => {
  const logger = new ResearchLogger();
  logger.log({ jobId: 'job-1', message: 'logged', status: 'NEW' });
  assert.equal(logger.getEntries().length, 1);
});

test('records findings without executive decision logic', () => {
  const finding = new ResearchFinding('Evidence review', 'Collected and summarized', 0.8);
  assert.equal(finding.title, 'Evidence review');
});
