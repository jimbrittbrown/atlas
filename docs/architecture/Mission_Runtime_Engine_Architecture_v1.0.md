# Mission Runtime Engine Architecture Specification v1.0

## Status
Planning-only architecture specification.

## Purpose
The Mission Runtime Engine (MRE) is the canonical lifecycle orchestrator for Atlas missions.

Its purpose is to:
1. Receive executive mission intent and execute a governed, observable mission lifecycle.
2. Coordinate planning, research, production, quality, release packaging, and executive review stages.
3. Preserve deterministic mission state, event traceability, and evidence continuity.
4. Provide safe recovery and restart semantics for long-running operations.
5. Serve as the stable orchestration authority that implementation can evolve beneath.

## Non-Responsibilities
The MRE does not:
1. Replace domain engines (Research, Media, Quality, Publishing, Registry, Metrics).
2. Perform provider-specific business logic.
3. Redefine constitutional governance or executive authority.
4. Auto-approve executive decisions or auto-promote knowledge standards.
5. Operate as a content-generation model itself.
6. Directly own long-term analytics strategy beyond mission-scoped telemetry.

## Runtime Capability Composition

The runtime orchestrator resolves all required stage dependencies through a capability registry boundary.

### Ownership and Dependency Direction
1. The orchestrator owns lifecycle control and state transitions only.
2. Concrete capability construction is owned by runtime bootstrap composition.
3. Domain services are resolved from registry keys instead of direct in-stage construction.
4. Dependency flow is one direction: bootstrap -> capability registry -> mission runtime orchestrator.
5. Stage logic must consume resolved capabilities and must not instantiate domain defaults inside stage methods.

### Bootstrap Flow
1. Runtime bootstrap registers default capability instances and validators.
2. The orchestrator resolves required capabilities during construction.
3. Required capability keys include planning, workers, evaluators, admission, governance, and media timeline services.
4. Registry metadata and contract validation are applied before capability use.
5. Publishing worker remains policy-driven and optional, independent of required registry resolution.

### Fail-Closed Resolution Policy
1. Missing capability returns NOT_REGISTERED and blocks runtime construction.
2. Invalid capability configuration returns INVALID_CONFIGURATION and blocks runtime construction.
3. Unhealthy capability returns UNHEALTHY and blocks runtime construction.
4. Contract-violating capability returns INVALID_CONTRACT and blocks runtime construction.
5. Duplicate capability registration is rejected to prevent non-deterministic runtime behavior.

## Mission State Machine

### Canonical States
1. RECEIVED
2. PLANNING
3. RESEARCH
4. SCRIPTING
5. VOICE_GENERATION
6. IMAGE_GENERATION
7. TIMELINE_BUILD
8. MEDIA_RENDER
9. QUALITY_REVIEW
10. RC_PACKAGING
11. EXECUTIVE_REPORTING
12. LESSON_CAPTURE
13. KNOWLEDGE_CANDIDATE_CAPTURE
14. COUNCIL_RECOMMENDATION
15. READINESS_SUMMARY
16. READY_FOR_APPROVAL
17. APPROVED
18. PUBLISHING
19. COMPLETED
20. BLOCKED
21. FAILED
22. RECOVERING
23. CANCELLED

### Transition Rules
1. State transitions are explicit and append-only in mission history.
2. Forward-only progression is default.
3. Recovery paths may re-enter the last valid stage via RECOVERING.
4. BLOCKED requires an unblock condition and owner.
5. FAILED requires failure classification and recovery decision.
6. CANCELLED is terminal unless reopened by executive authority.
7. COMPLETED is terminal and immutable except for post-mission annotations.

### Terminal States
1. COMPLETED
2. FAILED
3. CANCELLED

## Runtime Context Contract
The Runtime Context is the canonical mission payload passed across all stages.

### Required Context Fields
1. missionId
2. operationId
3. businessId
4. requestId
5. missionObjective
6. missionClass
7. runtimeVersion
8. initiatedAt
9. initiatedBy
10. governanceProfileId
11. executionPolicy
12. state
13. currentStage
14. stageAttempts
15. checkpoints
16. artifacts
17. evidenceRefs
18. metricsRefs
19. qualityRefs
20. releaseCandidateRefs
21. executiveDecisionRefs
22. lessonsRefs
23. knowledgeCandidateRefs
24. riskRegister
25. failureLedger
26. correlationIds

### Context Principles
1. Backward-compatible evolution by additive fields.
2. Strong immutability for historical snapshots.
3. Stage-local outputs are merged through validated patches.
4. No stage may mutate protected governance fields directly.

## Stage Contract
Every stage conforms to one common contract.

### Stage Input
1. runtimeContext snapshot
2. stage configuration
3. dependency handles (adapters/services)
4. retry and timeout policy

### Stage Output
1. stageStatus: COMPLETED, BLOCKED, FAILED, SKIPPED
2. stageResult payload
3. emitted events
4. produced artifact references
5. produced evidence references
6. produced metrics references
7. checkpoint delta
8. next-state recommendation

### Stage Invariants
1. Idempotent re-execution with same input and policy.
2. Deterministic status classification.
3. Structured error output with category and retriable flag.
4. Bounded execution time by stage policy.

## Event Model
The MRE is event-sourced at mission lifecycle level.

### Core Event Families
1. MISSION_RECEIVED
2. STATE_TRANSITIONED
3. STAGE_STARTED
4. STAGE_COMPLETED
5. STAGE_BLOCKED
6. STAGE_FAILED
7. STAGE_RETRIED
8. CHECKPOINT_CREATED
9. RECOVERY_STARTED
10. RECOVERY_COMPLETED
11. EXECUTIVE_GATE_EVALUATED
12. RC_CREATED
13. QUALITY_DECISION_RECORDED
14. COUNCIL_RECOMMENDATION_RECORDED
15. READINESS_RECORDED
16. MISSION_COMPLETED
17. MISSION_CANCELLED

### Event Requirements
1. Globally unique eventId.
2. missionId and stage identity.
3. timestamp and causal correlationId.
4. actor identity (system or executive role).
5. immutable payload and schema version.

## Checkpoint and Recovery Policy

### Checkpoint Policy
1. A checkpoint is created at stage boundary completion.
2. Additional checkpoints may be created inside long-running stages.
3. Checkpoints include:
1. state snapshot
2. artifact/evidence references
3. integrity hash
4. replay cursor

### Recovery Policy
1. Recovery starts from the latest valid checkpoint.
2. Recovery mode is explicit (RESUME, REPLAY_STAGE, ROLLBACK_STAGE).
3. Recovery decisions are policy-driven and auditable.
4. Maximum retry budget is stage-specific and mission-class aware.
5. Recovery that crosses executive gate boundaries requires gate re-evaluation.

## Executive Gates
Executive gates are governance checkpoints requiring structured decision evidence.

### Mandatory Gates
1. Gate A: Mission Admission
1. validates mission objective, business scope, and authority.
2. Gate B: Pre-Render Readiness
1. validates planning/research/script/asset prerequisites.
3. Gate C: Quality Gate
1. validates quality decision and unresolved high-severity issues.
4. Gate D: Release Candidate Gate
1. validates RC completeness and publishing readiness posture.
5. Gate E: Operational Readiness Gate
1. validates council recommendations and residual risk posture.

### Gate Outcomes
1. PASS
2. PASS_WITH_WAIVERS
3. HOLD
4. BLOCK

## Evidence, Metrics, and Knowledge Hooks

### Evidence Hooks
1. Every stage must emit evidence references for material outputs.
2. Evidence includes source context, method, confidence, and traceability.

### Metrics Hooks
1. Stage duration, retries, error class, and output quality indicators.
2. Mission-level KPIs: cycle time, pass rate, recovery frequency, blocker density.

### Knowledge Hooks
1. Capture candidate lessons automatically at mission close.
2. Generate knowledge candidates with confidence and domain owner.
3. Never auto-promote beyond candidate status without governance approval.

## Release Candidate Integration
1. RC package creation is a first-class stage, not a side effect.
2. RC contract includes:
1. mission summary
2. asset inventory
3. quality summary
4. technical validation
5. publishing readiness
6. executive approval section
7. lessons placeholder
3. RC identity is immutable and versioned.
4. RC package is required before operational readiness gate.

## Quality Intelligence Integration
1. Quality Intelligence is the canonical quality decision input for mission gating.
2. MRE must ingest:
1. overall score
2. category scores
3. issue set with severity
4. recommendations
5. review decision
3. Quality outcomes map to gate policy:
1. PASS -> proceed
2. REVISE -> hold until remediation
3. BLOCK -> blocked unless explicitly waived by authority

## Publishing Integration
1. Publishing is a governed stage that is disabled by default unless explicitly authorized.
2. The MRE supports publishing modes:
1. NONE
2. PRIVATE
3. SCHEDULED_PRIVATE
4. PUBLIC (future policy-controlled)
3. Publishing requires:
1. approved readiness state
2. metadata completeness
3. credential readiness evidence
4. policy compliance
4. Publishing outcomes must be recorded as mission events and evidence.

## Future Extension Points
1. Stage plug-ins with declared contract compatibility.
2. Policy plug-ins for mission class and business type.
3. Multi-business concurrent mission scheduling and fairness controls.
4. Adaptive retry policies informed by institutional knowledge.
5. Cross-mission dependency graph orchestration.
6. Human-in-the-loop intervention stage type.
7. Simulation mode for dry-run mission validation.
8. Autonomous recommendation refinement using historical outcomes.
9. Portfolio-level orchestration for shared resources.
10. Runtime schema version negotiation for backward compatibility.

## Constitutional Relationship
1. The MRE must operate under the Atlas Constitution and executive governance artifacts.
2. Runtime policy may refine behavior but may not violate constitutional principles.
3. In any conflict between runtime convenience and constitutional governance, constitutional governance prevails.

## Versioning and Stability
1. This document defines v1.0 canonical architecture intent.
2. Implementation may evolve, but state model, contract boundaries, and governance semantics must remain stable unless amended through constitutional process.

## Final Principle
Atlas missions must be executable, governable, recoverable, and learnable.

The Mission Runtime Engine is the permanent orchestration authority that guarantees those properties across years of platform evolution.
