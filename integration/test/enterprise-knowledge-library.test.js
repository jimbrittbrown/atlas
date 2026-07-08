import test from 'node:test';
import assert from 'node:assert/strict';
import { EnterpriseKnowledgeLibrary } from '../src/enterprise-knowledge-library.js';
import { Playbook } from '../src/playbook.js';

test('playbook is registered in enterprise knowledge library', () => {
  const library = new EnterpriseKnowledgeLibrary();

  const playbooks = library.listPlaybooks();

  assert.equal(playbooks.length, 1);
  assert.equal(playbooks[0].playbookId, 'youtube-business');
  assert.equal(playbooks[0].title, 'YouTube Business Playbook v1.0');
  assert.equal(playbooks[0].version, '1.0');
});

test('lookup returns YouTube Business Playbook by id', () => {
  const library = new EnterpriseKnowledgeLibrary();

  const playbook = library.getPlaybook('youtube-business');

  assert.ok(playbook instanceof Playbook);
  assert.equal(playbook.playbookId, 'youtube-business');
  assert.equal(playbook.title, 'YouTube Business Playbook v1.0');
});

test('playbook structure is validated', () => {
  assert.throws(() => {
    new Playbook({
      playbookId: 'invalid',
      title: 'Invalid Playbook',
      version: '1.0',
      objective: '',
      phases: [],
      milestones: ['M1'],
      requiredWorkers: ['WORKER-1'],
      successCriteria: ['C1']
    });
  }, /Playbook requires a non-empty objective/);

  const library = new EnterpriseKnowledgeLibrary();
  const playbook = library.getPlaybook('youtube-business');

  assert.equal(typeof playbook.objective, 'string');
  assert.ok(Array.isArray(playbook.phases));
  assert.ok(Array.isArray(playbook.milestones));
  assert.ok(Array.isArray(playbook.requiredWorkers));
  assert.ok(Array.isArray(playbook.successCriteria));
  assert.ok(playbook.phases.length > 0);
  assert.ok(playbook.milestones.length > 0);
  assert.ok(playbook.requiredWorkers.length > 0);
  assert.ok(playbook.successCriteria.length > 0);
});
