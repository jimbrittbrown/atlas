import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistryService } from '../src/capability-registry-service.js';

test('registers and retrieves a capability with required metadata', () => {
  const service = new CapabilityRegistryService();
  const record = service.registerCapability({
    name: 'Capability Registry Service',
    version: 'v1.0',
    purpose: 'Catalog Atlas capabilities',
    owner: 'Registry',
    dependencies: [{ name: 'Approval Service', version: 'v1.0' }],
    publicInterfaces: [{ name: 'registerCapability' }, { name: 'searchCapabilities' }],
    releaseTag: 'capability-registry-service-v1.0',
    commitHash: 'abc1234',
    status: 'IMPLEMENTED',
    documentation: {
      architecture: 'docs/reviews/capability-registry-v1-self-architecture-review.md',
      changelogReference: 'CHANGELOG.md',
      traceabilityReference: 'docs/implementation-traceability-matrix.md',
    },
    changelogReference: 'CHANGELOG.md',
    traceabilityReference: 'docs/implementation-traceability-matrix.md',
    testStatus: 'PASS',
    releaseHistory: [{ version: 'v1.0', releaseTag: 'capability-registry-service-v1.0', commitHash: 'abc1234' }],
  });

  const fetched = service.getCapability('Capability Registry Service');
  assert.equal(record.metadata.name, 'Capability Registry Service');
  assert.equal(fetched.metadata.owner, 'Registry');
});

test('updates capability metadata and reports version/status', () => {
  const service = new CapabilityRegistryService();
  service.registerCapability({
    name: 'Registry',
    version: 'v0.9',
    purpose: 'Catalog',
    owner: 'Registry',
    publicInterfaces: [{ name: 'listCapabilities' }],
    releaseTag: 'registry-v0.9',
    commitHash: 'commit-1',
    status: 'IN_DEVELOPMENT',
    changelogReference: 'CHANGELOG.md',
    traceabilityReference: 'docs/implementation-traceability-matrix.md',
    testStatus: 'PASS',
  });

  service.updateCapability('Registry', {
    version: 'v1.0',
    status: 'RELEASED',
    releaseTag: 'registry-v1.0',
    commitHash: 'commit-2',
  });

  assert.equal(service.getCapabilityVersion('Registry'), 'v1.0');
  assert.equal(service.getCapabilityStatus('Registry').value, 'RELEASED');
});

test('returns dependencies and dependents', () => {
  const service = new CapabilityRegistryService();
  service.registerCapability({
    name: 'Service A',
    version: 'v1.0',
    purpose: 'A',
    owner: 'A Team',
    dependencies: [],
    publicInterfaces: [{ name: 'a' }],
    releaseTag: 'a-v1',
    commitHash: 'a1',
    status: 'RELEASED',
    changelogReference: 'CHANGELOG.md',
    traceabilityReference: 'docs/implementation-traceability-matrix.md',
    testStatus: 'PASS',
  });
  service.registerCapability({
    name: 'Service B',
    version: 'v1.0',
    purpose: 'B',
    owner: 'B Team',
    dependencies: [{ name: 'Service A', version: 'v1.0' }],
    publicInterfaces: [{ name: 'b' }],
    releaseTag: 'b-v1',
    commitHash: 'b1',
    status: 'RELEASED',
    changelogReference: 'CHANGELOG.md',
    traceabilityReference: 'docs/implementation-traceability-matrix.md',
    testStatus: 'PASS',
  });

  const deps = service.getDependencies('Service B');
  const dependents = service.getDependents('Service A');

  assert.equal(deps.length, 1);
  assert.equal(dependents.length, 1);
  assert.equal(dependents[0].metadata.name, 'Service B');
});

test('supports listing and search', () => {
  const service = new CapabilityRegistryService();
  service.registerCapability({
    name: 'Alpha Capability',
    version: 'v1.0',
    purpose: 'Alpha purpose',
    owner: 'Core',
    publicInterfaces: [{ name: 'alpha' }],
    releaseTag: 'alpha-v1',
    commitHash: 'alpha1',
    status: 'IMPLEMENTED',
    changelogReference: 'CHANGELOG.md',
    traceabilityReference: 'docs/implementation-traceability-matrix.md',
    testStatus: 'PASS',
  });
  service.registerCapability({
    name: 'Beta Capability',
    version: 'v1.0',
    purpose: 'Beta purpose',
    owner: 'Core',
    dependencies: [{ name: 'Alpha Capability', version: 'v1.0' }],
    publicInterfaces: [{ name: 'beta' }],
    releaseTag: 'beta-v1',
    commitHash: 'beta1',
    status: 'IMPLEMENTED',
    changelogReference: 'CHANGELOG.md',
    traceabilityReference: 'docs/implementation-traceability-matrix.md',
    testStatus: 'PASS',
  });

  const all = service.listCapabilities();
  const search = service.searchCapabilities({ search: 'beta' });
  assert.equal(all.length, 2);
  assert.equal(search.total, 1);
  assert.equal(search.records[0].metadata.name, 'Beta Capability');
});

test('validates registry completeness and reports issues', () => {
  const service = new CapabilityRegistryService();
  service.registerCapability({
    name: 'Validation Target',
    version: 'v1.0',
    purpose: 'Validate',
    owner: 'Core',
    publicInterfaces: [{ name: 'validateRegistry' }],
    releaseTag: '',
    commitHash: '',
    status: 'IMPLEMENTED',
    changelogReference: '',
    traceabilityReference: '',
    testStatus: '',
  });

  const result = service.validateRegistry();
  assert.equal(result.valid, false);
  assert.equal(result.issues.length > 0, true);
});
