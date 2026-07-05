# Changelog

## [Unreleased]

### Added
- Implemented the Atlas Executive Service as an orchestration-only kernel.
- Added explicit workflow models, collaborator interfaces, dedicated orchestration modules, and unit tests.

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
