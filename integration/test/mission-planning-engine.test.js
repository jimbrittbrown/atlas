import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionPlanningEngine } from '../src/runtime/mission-planning-engine.js';
import { validateMissionPlan } from '../src/runtime/mission-plan-contracts.js';

test('MissionPlanningEngine generates a valid strongly typed mission plan', () => {
  const missionPlanningEngine = new MissionPlanningEngine({
    launchPlanGenerator: {
      generate() {
        return {
          phases: [{ name: 'Phase 1' }]
        };
      }
    },
    executionPlanGenerator: {
      generate() {
        return {
          tasks: [{ id: 'TASK-001' }]
        };
      }
    }
  });

  const missionPlan = missionPlanningEngine.generateMissionPlan({
    request: {
      requestId: 'REQ-PLAN-001',
      objective: 'Validate mission planning contract',
      businessName: 'Atlas Test Business',
      audience: 'Builders',
      decisionPackage: { confidence: 82 }
    },
    runtimeContext: {
      missionId: 'MISSION-PLAN-001',
      requestId: 'REQ-PLAN-001',
      missionObjective: 'Validate mission planning contract'
    }
  });

  const validation = validateMissionPlan(missionPlan);

  assert.equal(validation.isValid, true);
  assert.equal(missionPlan.missionId, 'MISSION-PLAN-001');
  assert.equal(missionPlan.objective.missionObjective, 'Validate mission planning contract');
  assert.equal(Array.isArray(missionPlan.requiredDirectors), true);
  assert.equal(missionPlan.requiredDirectors.length > 0, true);
  assert.equal(Array.isArray(missionPlan.requiredCertifiedCapabilities), true);
  assert.equal(missionPlan.requiredCertifiedCapabilities.length > 0, true);
  assert.equal(missionPlan.requiredCertifiedCapabilities[0].registryStatus, 'PENDING_REGISTRY_INTEGRATION');
  assert.equal(Array.isArray(missionPlan.executionPhases), true);
  assert.equal(missionPlan.executionPhases.length > 0, true);
  assert.equal(Array.isArray(missionPlan.expectedArtifacts), true);
  assert.equal(missionPlan.expectedArtifacts.length > 0, true);
  assert.equal(Array.isArray(missionPlan.aeisMeasurementHooks.hooks), true);
  assert.equal(missionPlan.aeisMeasurementHooks.hooks.length > 0, true);
  assert.equal(typeof missionPlan.translation.launchPlan, 'object');
  assert.equal(typeof missionPlan.translation.executionPlan, 'object');
});

test('MissionPlanningEngine preserves provided launch and execution plans for pipeline compatibility', () => {
  const missionPlanningEngine = new MissionPlanningEngine();

  const missionPlan = missionPlanningEngine.generateMissionPlan({
    request: {
      requestId: 'REQ-PLAN-002',
      objective: 'Use precomputed plans',
      plan: {
        launchPlan: {
          phases: [{ name: 'Precomputed Launch Phase' }]
        },
        executionPlan: {
          tasks: [{ id: 'TASK-PRECOMP-001' }]
        }
      }
    },
    runtimeContext: {
      missionId: 'MISSION-PLAN-002',
      requestId: 'REQ-PLAN-002',
      missionObjective: 'Use precomputed plans'
    }
  });

  const runtimePlan = missionPlanningEngine.translateMissionPlanToRuntimePlan(missionPlan);

  assert.equal(runtimePlan.launchPlan.phases[0].name, 'Precomputed Launch Phase');
  assert.equal(runtimePlan.executionPlan.tasks[0].id, 'TASK-PRECOMP-001');
});