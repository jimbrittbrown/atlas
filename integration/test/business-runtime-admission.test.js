import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessRuntimeAdmission } from '../business-runtime-admission.js';

test('SYSTEM_INTERNAL admission succeeds', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL'
    }
  });

  assert.equal(result.admitted, true);
  assert.equal(result.runtimeBusinessContext.businessId, 'SYSTEM_INTERNAL');
  assert.equal(result.runtimeBusinessContext.missionType, 'SYSTEM_INTERNAL');
  assert.equal(result.runtimeBusinessContext.publishingMode, 'NONE');
});

test('MIDNIGHT_ARCHIVES admission succeeds as production-ready non-publishing profile', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'MIDNIGHT_ARCHIVES'
    }
  });

  assert.equal(result.admitted, true);
  assert.equal(result.runtimeBusinessContext.businessId, 'MIDNIGHT_ARCHIVES');
  assert.equal(result.runtimeBusinessContext.productionProfileId, 'cinematic_horror_landscape_v1');
  assert.equal(result.runtimeBusinessContext.publishingMode, 'NONE');
});

test('admission rejects unknown business', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'UNKNOWN_BUSINESS'
    }
  });

  assert.equal(result.admitted, false);
  assert.equal(result.errors[0].code, 'UNKNOWN_BUSINESS');
});

test('admission rejects invalid profile (branding)', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL',
      brandingProfile: 'INVALID_BRAND'
    }
  });

  assert.equal(result.admitted, false);
  assert.equal(result.errors[0].code, 'INVALID_BRANDING_PROFILE');
});

test('admission rejects missing quality profile', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL',
      qualityProfileId: ''
    }
  });

  assert.equal(result.admitted, false);
  assert.equal(result.errors[0].code, 'MISSING_QUALITY_PROFILE');
});

test('admission rejects missing credential profile', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL',
      credentialProfileId: ''
    }
  });

  assert.equal(result.admitted, false);
  assert.equal(result.errors[0].code, 'MISSING_CREDENTIAL_PROFILE');
});

test('admission normalizes publishing NONE', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL',
      publishingMode: 'none'
    }
  });

  assert.equal(result.admitted, true);
  assert.equal(result.runtimeBusinessContext.publishingMode, 'NONE');
});

test('admission supports publishing PRIVATE', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'MIDNIGHT_ARCHIVES',
      publishingMode: 'private'
    }
  });

  assert.equal(result.admitted, true);
  assert.equal(result.runtimeBusinessContext.publishingMode, 'PRIVATE');
});

test('admission rejects invalid publishing mode', () => {
  const admission = new BusinessRuntimeAdmission();
  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL',
      publishingMode: 'PUBLIC'
    }
  });

  assert.equal(result.admitted, false);
  assert.equal(result.errors[0].code, 'INVALID_PUBLISHING_MODE');
});

test('runtime business context normalization includes required fields and diagnostics', () => {
  const admission = new BusinessRuntimeAdmission({
    now: (() => {
      let value = 1700000000000;
      return () => {
        value += 10;
        return value;
      };
    })()
  });

  const result = admission.admit({
    request: {
      businessId: 'SYSTEM_INTERNAL',
      featureFlags: {
        transitions: true
      }
    }
  });

  assert.equal(result.admitted, true);
  assert.equal(typeof result.runtimeBusinessContext.businessId, 'string');
  assert.equal(typeof result.runtimeBusinessContext.businessName, 'string');
  assert.equal(typeof result.runtimeBusinessContext.businessFamily, 'string');
  assert.equal(typeof result.runtimeBusinessContext.missionType, 'string');
  assert.equal(typeof result.runtimeBusinessContext.productionProfileId, 'string');
  assert.equal(typeof result.runtimeBusinessContext.publishingMode, 'string');
  assert.equal(typeof result.runtimeBusinessContext.credentialProfileId, 'string');
  assert.equal(typeof result.runtimeBusinessContext.qualityProfileId, 'string');
  assert.equal(typeof result.runtimeBusinessContext.knowledgePartition, 'string');
  assert.equal(typeof result.runtimeBusinessContext.executiveCouncilProfile, 'string');
  assert.equal(typeof result.runtimeBusinessContext.budgetProfile, 'string');
  assert.equal(typeof result.runtimeBusinessContext.brandingProfile, 'string');
  assert.equal(typeof result.runtimeBusinessContext.defaultPolicies, 'object');
  assert.equal(typeof result.runtimeBusinessContext.featureFlags, 'object');

  assert.equal(typeof result.diagnostics.admissionStart, 'string');
  assert.equal(typeof result.diagnostics.admissionEnd, 'string');
  assert.equal(typeof result.diagnostics.admissionDuration, 'number');
  assert.equal(typeof result.diagnostics.selectedBusiness, 'string');
  assert.equal(typeof result.diagnostics.selectedProfiles, 'object');
  assert.equal(Array.isArray(result.diagnostics.validationResults), true);
  assert.equal(Array.isArray(result.diagnostics.warnings), true);
});
