# Executive Operations Loop v1

## Purpose

Provide a COO-level operational heartbeat for Atlas that inspects existing systems, prioritizes operational work, performs only explicitly authorized safe actions, and generates executive visibility without bypassing governance.

## Telemetry Ownership

- Operations Loop is the owner of normalized operational telemetry.
- Dashboard projection layers consume operations telemetry read-only.
- Operations telemetry includes system health posture, active incidents, recovery state, priority outcomes, queue pressure, provider availability summaries, and runtime loop metrics.
- Operations telemetry does not own business-domain state.

## Reused Architecture

- Customer Intake and Mission Control
- Customer Registry
- Mission Registry
- Executive Planning System and Mission Portfolio Registry
- Workforce Director
- Website Builder Mission Manager via Executive Mission Orchestrator
- Executive Operations Dashboard
- CEO Decision Center
- Executive Mission Orchestrator
- Executive Mission Control Manager/API surface
- Provider health adapter and dashboard provider model
- Existing dashboard API auth, RBAC, envelopes, rate limiting, and normalization

## Loop Contracts

The loop defines explicit contracts for:

- loop states
- cycle states
- operational findings
- recommended actions
- executable safe actions
- blocked actions
- executive alerts
- cycle results
- loop configuration
- telemetry and health records

## Loop States

- `STOPPED`
- `STARTING`
- `RUNNING`
- `SLEEPING`
- `PAUSED`
- `DEGRADED`
- `STOPPING`
- `FAILED`

## Cycle States

- `PENDING`
- `INSPECTING`
- `PLANNING`
- `EXECUTING_SAFE_ACTIONS`
- `REPORTING`
- `COMPLETED`
- `COMPLETED_WITH_WARNINGS`
- `FAILED`

## Systems Inspected Per Cycle

- customers without routed missions
- pending or unresolved proposals
- active, blocked, failed, paused, and timed-out orchestrator sessions
- missions awaiting executive review
- workforce capacity and unavailable specialists
- provider health degradation
- website production queue load
- stale activity and overdue operational records
- dashboard alerts and missing telemetry markers

## Safe Operational Action Policy

Permitted v1 automatic actions are limited to reversible or read-only operations such as:

- refresh dashboard snapshot
- refresh provider-health telemetry
- retry eligible mission recovery through existing mission-control/orchestrator interfaces
- resume eligible paused missions through existing mission-control/orchestrator interfaces
- request reversible workforce reassignment through Workforce Director
- mark stale records for review
- generate alerts and CEO escalation records

The loop never automatically:

- publishes a website
- deploys to production
- overwrites production projects
- deletes records or projects
- spends money
- purchases services
- creates external accounts
- bypasses approval gates

## Governance

Every action passes through an explicit policy evaluator returning:

- allowed
- denied
- requiresExecutiveApproval
- reason
- governingRule
- riskLevel
- requiredRole
- recommendedNextAction

## Storage Boundary

A v1 in-memory adapter provides storage for:

- loop state
- cycle history
- alerts
- recovery history
- dedupe keys
- heartbeats
- metrics

The interface is adapter-ready for later persistent storage.

## Dashboard and API Integration

- Snapshot integration adds `operationsLoop` to the Executive Operations Dashboard payload.
- Read-only endpoint: `GET /api/v1/operations-loop`
- Viewer, Executive, and CEO may read loop status.
- No public control commands are added for the loop in v1.

## Scripts

- `node scripts/run-executive-operations-cycle-v1.js`
- `node scripts/run-executive-operations-loop-v1.js`
- `node scripts/run-executive-operations-loop-v1-validation.js`

## Validation

- `node --test test/executive-operations-loop-v1.test.js`
- `npm run executive:operations-loop:v1:validate`
