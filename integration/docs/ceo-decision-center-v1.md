# CEO Decision Center v1

## Purpose

Provide a read-only executive decision workspace that consolidates:

- pending executive approvals
- blocked missions
- high-priority opportunities
- top risks
- recent decision history

No mission execution, deployment, publishing, or destructive actions are exposed.

## Reused Modules

- Executive Planning System
- Mission Control
- Customer Intake
- Mission Registry
- Website Builder abstractions (through existing dashboard manager context)
- Workforce Director
- Executive Dashboard API
- Executive Operations Dashboard

## New Components

- `ceo-decision-center-contracts.js`
- `ceo-decision-center-manager.js`
- `ceo-decision-center-dashboard-model.js`
- `ceo-decision-center-api.js`

## API Endpoint

- `GET /api/v1/ceo/decision-center`

Response includes:

- `executiveReviews`
- `blockedMissions`
- `opportunities`
- `risks`
- `decisionHistory`
- `dashboardHealth`
- `governance`

## Governance

- Read-only surface only.
- No execution workflows triggered.
- Existing approval contract remains external to this module.

## Extension Points

- Add additional risk feeds through dashboard manager adapters.
- Add richer decision history persistence adapters.
- Expand role-scoped projection for board-level view.

## Validation

- `node --test test/ceo-decision-center-v1.test.js`
- `npm run executive:ceo-decision-center-v1`
