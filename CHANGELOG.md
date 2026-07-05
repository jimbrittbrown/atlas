# Changelog

## [Unreleased]

### Added
- Implemented the Atlas Executive Service as an orchestration-only kernel.
- Added explicit workflow models, collaborator interfaces, dedicated orchestration modules, and unit tests.

## [Worker Orchestration Service v1.0] - 2026-07-05

### Added
- Introduced the Worker Orchestration Service module for worker discovery, selection, dispatch, coordination, retry handling, failure handling, execution-state tracking, and completion reporting.
- Enforced registry-mediated discovery and replaceable worker model through orchestration contracts.
- Enforced execution boundary that workers handle assigned responsibilities only while strategic intent remains in the Executive layer.
- Added Executive -> Research -> Memory -> Metrics -> Performance Intelligence -> Approval -> Registry -> Worker Orchestration integration bridge and adapter.
- Added unit and integration tests for discovery, assignment, staged coordination, retry/failure behavior, and governance-gated execution.
- Finalized release under Capability Release 009 governance approval.

## [Capability Registry Service v1.0] - 2026-07-05

### Added
- Introduced the Capability Registry Service module as the authoritative metadata catalog for Atlas capabilities, dependencies, ownership, versions, interfaces, and release references.
- Added required public interface operations for capability registration, updates, retrieval, dependency/dependent discovery, status/version queries, search, and registry validation.
- Added Executive -> Research -> Memory -> Metrics -> Performance Intelligence -> Approval -> Registry integration bridge and adapter while preserving existing ownership boundaries.
- Added unit and integration tests for metadata handling, dependency graph lookup, discovery behavior, validation checks, and full-chain registry synchronization.

## [Approval Service v1.0] - 2026-07-05

### Added
- Introduced the Approval Service module as Atlas governance authorization layer with policy validation, decision recording, and approval history retrieval.
- Added explicit approval domain models, interface contracts, and dependency-injected service components.
- Added Executive -> Research -> Memory -> Metrics -> Performance Intelligence -> Approval integration bridge and adapter while preserving existing service ownership boundaries.
- Added unit and integration tests for request handling, approval/rejection decisions, policy validation, authorization status, and full workflow governance integration.

## [Performance Intelligence Service v1.0] - 2026-07-05

### Added
- Introduced the Performance Intelligence Service module to generate structured cross-service intelligence artifacts from Executive, Research, Memory, and Metrics outcomes.
- Added explicit performance domain models, interface contracts, service components, and retrieval/snapshot capabilities.
- Added Executive -> Research -> Memory -> Metrics -> Performance Intelligence integration bridge and adapter without redesigning existing services.
- Added unit and integration tests validating intelligence generation, retrieval, failure-path handling, and end-to-end workflow integration.

## [Metrics Service v1.0] - 2026-07-05

### Added
- Introduced the Metrics Service module as the Atlas authoritative measurement system with metric recording, retrieval, history preservation, and descriptive aggregation.
- Added explicit metric domain models, metrics service interface contracts, and modular components for recording, retrieval, logging, and aggregation.
- Added Executive -> Research -> Memory -> Metrics integration bridge and adapter to record measurable outcomes while preserving service ownership boundaries.
- Added unit and integration tests for metric recording, retrieval, aggregation, workflow metrics, integration metrics, logging, metadata, and error handling.

## [Memory Service v1.0] - 2026-07-05

### Added
- Introduced the Memory Service module as Atlas organizational memory with immutable record storage, category-based retrieval, and complete audit history.
- Added explicit memory domain models, storage/retrieval collaborators, and service interface contracts for future integrations.
- Added Executive -> Research -> Memory integration bridge and adapter to persist completed research and workflow history without changing service ownership.
- Added unit and integration tests for recording, retrieval, category assignment, metadata handling, logging, and failure propagation.

## [Integration Sprint 1] - 2026-07-05

### Added
- Introduced the Atlas Integration Sprint 1 bridge layer between the Executive Service and the Research Service.
- Added integration components for request translation, response translation, workflow coordination, research service adaptation, and integration logging.
- Added integration tests covering handoff, state coordination, reporting, and translation behavior.

## [Executive Service v1.0] - 2026-07-05

### Added
- Introduced the Executive Service module with workflow creation, state management, routing, logging, and notification orchestration.
- Added explicit workflow models and interface-based collaborator boundaries.
- Added unit tests covering workflow creation, transitions, routing, and logging.

## [Research Service v1.0] - 2026-07-05

### Added
- Introduced the Research Service module for research job orchestration, evidence collection, report generation, and structured logging.
- Added explicit research models, state-machine-based lifecycle handling, and unit tests for job lifecycle and report generation.
