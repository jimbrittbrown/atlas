import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestTranslator } from '../src/request-translator.js';
import { ResponseTranslator } from '../src/response-translator.js';

test('translates executive requests into research requests', () => {
  const translator = new RequestTranslator();
  const request = { id: 'req-3', objective: 'Review', context: { org: 'atlas' } };
  const result = translator.translate(request);

  assert.equal(result.id, 'req-3');
  assert.equal(result.objective, 'Review');
  assert.deepEqual(result.context, { org: 'atlas' });
});

test('translates research results into integration responses', () => {
  const translator = new ResponseTranslator();
  const result = translator.translate({ status: 'completed', report: 'report', evidence: ['e1'], metadata: { score: 1 } }, 'wf-3');

  assert.equal(result.workflowId, 'wf-3');
  assert.equal(result.status, 'completed');
  assert.equal(result.report, 'report');
  assert.deepEqual(result.evidence, ['e1']);
});
