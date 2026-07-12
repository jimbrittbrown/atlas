# Mission Planning Engine (Sprint 0)

## Purpose

Sprint 0 introduces a Mission Plan contract that is generated before mission execution and translated into the existing runtime workflow.

This creates a stable planning boundary between mission intake and execution while preserving current production behavior.

## Components Added

- Mission Plan contract: integration/src/runtime/mission-plan-contracts.js
- Mission Planning Engine service: integration/src/runtime/mission-planning-engine.js
- Runtime integration point: integration/src/runtime/mission-runtime-orchestrator.js (PLANNING stage)

## Mission Plan Contract

The Mission Plan includes:
- Mission objective
- Success metrics
- Constraints
- Selected strategy
- Confidence
- Required Directors
- Required certified capabilities (placeholder in Sprint 0)
- Provider preferences and fallbacks
- Execution phases
- Expected artifacts
- Approval requirements
- Risk assessment
- AEIS measurement hooks
- Translation payload for legacy pipeline compatibility

Validation is performed by validateMissionPlan before runtime plan translation.

## Runtime Flow

1. Mission enters runtime.
2. PLANNING stage generates a Mission Plan using MissionPlanningEngine.
3. Mission Plan is validated.
4. Planner translates Mission Plan into runtime plan fields:
   - launchPlan
   - executionPlan
   - executionInputs
5. Existing SCRIPTING -> QUALITY_REVIEW -> EXECUTIVE_REVIEW -> PUBLISHING pipeline continues unchanged.

## Placeholder Capability Selection (Sprint 0)

MissionPlanningEngine currently returns placeholder capability selections with explicit metadata:
- selectionMode: PLACEHOLDER
- source: MISSION_PLANNING_ENGINE_MOCK
- registryStatus: PENDING_REGISTRY_INTEGRATION

This keeps interfaces stable while deferring full Capability Registry implementation.

## Future Capability Registry Integration

Planned extension point:
- Replace selectRequiredCertifiedCapabilities() inside MissionPlanningEngine with a registry-backed selector.

Expected integration contract:
- Input: mission objective, strategy, constraints, risk profile.
- Output: certified capabilities with version, level, and status.

No runtime interface changes should be required because requiredCertifiedCapabilities is already part of Mission Plan.

## Future Director Profile Integration

Planned extension point:
- Replace selectRequiredDirectors() inside MissionPlanningEngine with Director Profile resolver logic.

Expected integration contract:
- Input: mission scope, selected capabilities, risk and approval requirements.
- Output: director profile IDs, authority boundaries, minimum competency levels.

No runtime interface changes should be required because requiredDirectors is already part of Mission Plan.

## AEIS Alignment

Mission Plan contains aeisMeasurementHooks so planning telemetry can be tracked as first-class mission evidence.

Initial hooks include:
- MISSION_PLAN_CREATED
- QUALITY_GATE_RESULT
- MISSION_TERMINAL_OUTCOME

## Test Coverage

- integration/test/mission-planning-engine.test.js
  - Valid Mission Plan generation and validation.
  - Legacy launch/execution plan compatibility translation.

- integration/test/mission-runtime-orchestrator.test.js
  - Runtime confirms Mission Plan exists before execution completes.

## Non-Goals In Sprint 0

- Full capability registry resolution logic.
- Full director profile authorization engine.
- Policy-driven provider arbitration beyond basic preference/fallback scaffolding.
