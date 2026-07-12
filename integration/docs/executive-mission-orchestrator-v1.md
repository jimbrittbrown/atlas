# Executive Mission Orchestrator v1

## Purpose

Provide a recovery-aware executive orchestration layer above existing mission systems.

This module coordinates approved mission proposals into existing execution managers without duplicating mission logic.

## Design Principles

- Composition over duplication: route into existing Mission Control, Executive Planning, Workforce, and Website Builder systems.
- Read-only governance surface: dashboard/API projections do not execute publish/deploy or destructive actions.
- Explicit lifecycle: state machine defines valid transitions and terminal conditions.
- Recovery-first: retry, resume, rollback, timeout, and cancel operations are first-class session actions.

## New Components

- `executive-mission-orchestrator-contracts.js`
- `executive-mission-orchestrator-pipeline-registry.js`
- `executive-mission-orchestrator-manager.js`
- `executive-mission-orchestrator-dashboard-model.js`
- `executive-mission-orchestrator-api.js`

## Lifecycle States

- `QUEUED`
- `VALIDATING`
- `ROUTING`
- `RUNNING`
- `REVISION_REQUIRED`
- `WAITING_RETRY`
- `PAUSED`
- `ROLLED_BACK`
- `TIMED_OUT`
- `CANCELLED`
- `COMPLETED`
- `FAILED`

## Recovery Actions

- `RETRY`
- `RESUME`
- `ROLLBACK`
- `TIMEOUT`
- `CANCEL`

## API Endpoint

- `GET /api/v1/mission-orchestrator`

Returns a read-only projection of orchestration sessions:

- `totalSessions`
- `runningSessions`
- `blockedSessions`
- `averageCompletion`
- `records` (stage, workers, completion, eta, blockers, confidence)
- `workforce`
- `governance`

## Governance Guarantees

- No publish/deploy calls are exposed via the endpoint.
- No destructive operations are exposed.
- Mission execution remains delegated to existing mission managers.
- Approval gates remain enforced by existing proposal and mission contracts.

## Validation

- `node --test test/executive-mission-orchestrator-v1.test.js`
- `npm run executive:mission-orchestrator-v1`
