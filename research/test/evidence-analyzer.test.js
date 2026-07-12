import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceAnalyzer } from '../src/evidence-analyzer.js';

function analyze(input) {
  return new EvidenceAnalyzer().analyze(input);
}

test('analyzes object-form evidence and source arrays', () => {
  const result = analyze({
    evidence: [{ id: 'e-1' }, { id: 'e-2' }],
    sources: [{ id: 's-1' }],
  });

  assert.equal(result.confidence, 0.8);
  assert.equal(result.evidenceCount, 2);
  assert.equal(result.sourceCount, 1);
  assert.equal(result.summary, 'Initial evidence collection completed successfully.');
  assert.equal(result.readiness, 'READY_FOR_EXECUTIVE_REVIEW');
});

test('analyzes direct array-form evidence input', () => {
  const result = analyze([{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }]);

  assert.equal(result.confidence, 0.8);
  assert.equal(result.evidenceCount, 3);
  assert.equal(result.sourceCount, 0);
  assert.equal(result.summary, 'Initial evidence collection completed successfully.');
  assert.equal(result.readiness, 'READY_FOR_EXECUTIVE_REVIEW');
});

test('treats missing or malformed evidence and sources as empty collections', () => {
  const analyzer = new EvidenceAnalyzer();

  assert.doesNotThrow(() => analyzer.analyze());
  assert.doesNotThrow(() => analyzer.analyze(null));
  assert.doesNotThrow(() => analyzer.analyze({ evidence: 'invalid', sources: 'invalid' }));

  const missing = analyzer.analyze();
  const malformed = analyzer.analyze({ evidence: 'invalid', sources: 'invalid' });

  assert.equal(missing.evidenceCount, 0);
  assert.equal(missing.sourceCount, 0);
  assert.equal(malformed.evidenceCount, 0);
  assert.equal(malformed.sourceCount, 0);
});
