# Executive Mission Control API v1

## Purpose

Provide a secure executive control surface over existing mission orchestration sessions.

This API delegates control actions to the existing Executive Mission Orchestrator and its registered mission pipelines. It does not duplicate mission execution logic.

## Reused Architecture

- `ExecutiveMissionOrchestratorManager`
- Existing orchestrator state machine and pipeline registry
- Existing dashboard API auth, RBAC, router, rate limiter, response envelope, and normalized error handling
- Existing API audit boundaries for request-level observability

## Command Contracts

Every command request includes:

- `commandType`
- `missionId`
- `requestedBy`
- `requesterRole`
- `reason`
- `idempotencyKey`
- `expectedCurrentState`
- `rollbackTargetStage` (rollback only)
- `timestamp`
- `correlationId`

## Supported Commands

- `RETRY`
- `RESUME`
- `ROLLBACK`
- `CANCEL`
- `PAUSE`
- `FORCE_EXECUTIVE_REVIEW`

`FORCE_EXECUTIVE_REVIEW` only tightens governance by driving a session to `REVISION_REQUIRED`. It does not bypass approval gates.

## Role and Permission Model

Roles:

- CEO
- EXECUTIVE
- OPERATOR
- VIEWER

Command permissions:

- EXECUTIVE: retry, resume, pause
- CEO: all commands including high-risk rollback, cancel, and force-executive-review
- OPERATOR: no mission-control command permissions
- VIEWER: read-only mission-control projection only

## Governance Protections

- No publish/deploy authority is added.
- No destructive operation bypass is introduced.
- Invalid state transitions are rejected.
- Stale expected-state commands are rejected.
- Duplicate idempotency keys are rejected.
- Existing proposal and mission approval gates remain intact.

## Mission Control Endpoints

- `GET /api/v1/mission-control`
- `GET /api/v1/mission-control/:missionId`
- `POST /api/v1/mission-control/:missionId/retry`
- `POST /api/v1/mission-control/:missionId/resume`
- `POST /api/v1/mission-control/:missionId/rollback`
- `POST /api/v1/mission-control/:missionId/cancel`
- `POST /api/v1/mission-control/:missionId/pause`
- `POST /api/v1/mission-control/:missionId/force-executive-review`

## Mission Control Projection

Read-only projection includes:

- mission state
- current stage
- completion percentage
- available commands
- blocked commands and reasons
- recent command history
- recovery status
- warnings
- governance status

## Audit Model

Each command attempt records:

- command
- mission ID
- requester identity hash
- role
- result
- previous state
- resulting state
- rejection reason (if rejected)
- timestamp
- correlation ID

Secrets or raw tokens are never logged in command audit entries.

## Validation

- `node --test test/executive-mission-control-api-v1.test.js`
- `npm run executive:mission-control-api-v1`
