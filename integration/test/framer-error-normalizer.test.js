import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFramerError } from '../src/executive/framer-error-normalizer.js';

test('framer diagnostics classify invalid api key', () => {
  const error = normalizeFramerError(new Error('Invalid API key provided'), { stage: 'CONNECTION', operation: 'verifyConnection' });
  assert.equal(error.code, 'FRAMER_INVALID_API_KEY');
});

test('framer diagnostics classify project access denial', () => {
  const error = normalizeFramerError(new Error('API key does not have access to this project'), { stage: 'CONNECTION', operation: 'verifyConnection' });
  assert.equal(error.code, 'FRAMER_PROJECT_ACCESS_DENIED');
});

test('framer diagnostics classify project url mismatch', () => {
  const error = normalizeFramerError(new Error('Project not found for project URL'), { stage: 'CONNECTION', operation: 'verifyConnection' });
  assert.equal(error.code, 'FRAMER_PROJECT_URL_MISMATCH');
});

test('framer diagnostics classify publish permission failure', () => {
  const error = normalizeFramerError(new Error('Publish permission not allowed for this key'), { stage: 'PUBLISH', operation: 'publishWebsite' });
  assert.equal(error.code, 'FRAMER_PUBLISH_PERMISSION_DENIED');
});
