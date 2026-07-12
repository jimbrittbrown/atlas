import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveMissionOrchestratorPipelineRegistry } from '../src/executive/executive-mission-orchestrator-pipeline-registry.js';
import { MissionRuntimeOrchestrator } from '../src/runtime/mission-runtime-orchestrator.js';

function createCapabilityRegistryStub(overrides = {}) {
  return {
    resolveCapability(key) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }

      return {
        found: true,
        key,
        reason: null,
        status: 'READY',
        instance: {}
      };
    }
  };
}

test('capability registry rejects duplicate capability keys', () => {
  const registry = new ExecutiveMissionOrchestratorPipelineRegistry();

  registry.registerCapability({
    key: 'qualityReviewEngine',
    instance: {}
  });

  assert.throws(() => {
    registry.registerCapability({
      key: 'qualityReviewEngine',
      instance: {}
    });
  }, /already registered/i);
});

test('capability registry resolves unknown capability as fail-closed not registered', () => {
  const registry = new ExecutiveMissionOrchestratorPipelineRegistry();
  const resolution = registry.resolveCapability('unknownCapability');

  assert.equal(resolution.found, false);
  assert.equal(resolution.status, 'NOT_REGISTERED');
  assert.equal(typeof resolution.reason, 'string');
  assert.equal(resolution.instance, null);
});

test('capability registry rejects unhealthy capability instances', () => {
  const registry = new ExecutiveMissionOrchestratorPipelineRegistry();

  registry.registerCapability({
    key: 'missionPlanningEngine',
    instance: {},
    isHealthy: () => false
  });

  const resolution = registry.resolveCapability('missionPlanningEngine');
  assert.equal(resolution.found, false);
  assert.equal(resolution.status, 'UNHEALTHY');
  assert.equal(resolution.instance, null);
});

test('capability registry rejects invalid capability contracts', () => {
  const registry = new ExecutiveMissionOrchestratorPipelineRegistry();

  registry.registerCapability({
    key: 'storytellingEvaluator',
    instance: {},
    validate: () => ({
      isValid: false,
      reason: 'storytellingEvaluator.evaluate() is required.'
    })
  });

  const resolution = registry.resolveCapability('storytellingEvaluator');
  assert.equal(resolution.found, false);
  assert.equal(resolution.status, 'INVALID_CONTRACT');
  assert.equal(resolution.reason, 'storytellingEvaluator.evaluate() is required.');
  assert.equal(resolution.instance, null);
});

test('mission runtime orchestrator fails closed when required capability is unavailable', () => {
  const capabilityRegistry = createCapabilityRegistryStub({
    launchPlanGenerator: {
      found: false,
      key: 'launchPlanGenerator',
      status: 'NOT_REGISTERED',
      reason: 'Capability launchPlanGenerator is not registered.',
      instance: null
    }
  });

  assert.throws(() => {
    new MissionRuntimeOrchestrator({ capabilityRegistry });
  }, /launchPlanGenerator/);
});

test('mission runtime orchestrator uses injected improvement planner capability', () => {
  const plannerError = new Error('injected improvement planner invoked');
  const orchestrator = new MissionRuntimeOrchestrator({
    improvementPlanner: {
      planImprovements() {
        throw plannerError;
      }
    }
  });

  assert.throws(() => {
    orchestrator.buildImprovementPlan({
      executiveProducerPackage: {},
      executiveScriptReview: {},
      storytellingScorecard: {}
    });
  }, /injected improvement planner invoked/);
});

test('mission runtime orchestrator uses injected language realization validator capability', () => {
  let validatorCalled = false;
  const orchestrator = new MissionRuntimeOrchestrator({
    languageRealizationValidator: {
      validate() {
        validatorCalled = true;
        return {
          passed: true,
          issues: []
        };
      }
    }
  });

  const runtimeContext = {
    missionId: 'MIS-TEST-VALIDATOR',
    state: 'SCRIPTING',
    artifacts: {
      researchEvaluation: {
        researchPackage: {
          verifiedDocumentaryFacts: []
        }
      }
    },
    events: []
  };

  const validation = orchestrator.validateLanguageRealizationOutput({
    runtimeContext,
    scriptResult: {
      script: 'Opening Hook: validator injection test.'
    },
    stageLabel: 'INJECTION_TEST'
  });

  assert.equal(validatorCalled, true);
  assert.equal(validation.passed, true);
  assert.equal(runtimeContext.artifacts.languageRealizationValidation.passed, true);
  assert.equal(
    runtimeContext.events.some((event) => event.type === 'LANGUAGE_REALIZATION_VALIDATED'),
    true
  );
});
