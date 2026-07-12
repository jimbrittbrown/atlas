# Atlas Customer Intake & Mission Control v1

## Objective

Create the operating front-door above Website Division that handles customer intake, mission creation, mission launch routing, and executive dashboard projection.

## Delivered Components

- Contracts: `src/executive/customer-intake-mission-control-contracts.js`
- Customer registry: `src/executive/customer-registry.js`
- Mission registry: `src/executive/mission-registry.js`
- Intake engine: `src/executive/customer-intake-engine.js`
- Executive dashboard model: `src/executive/customer-intake-dashboard-model.js`
- Mission control facade: `src/executive/customer-intake-mission-control.js`
- Validation runner: `scripts/run-customer-intake-mission-control-v1.js`

## Customer Registry Schema

- customerId
- companyName
- contactName
- email
- phone
- website
- industry
- status
- createdDate
- lastUpdated

## Mission Registry Schema

- missionId
- customerId
- missionType
- currentStage
- assignedWorkforce
- progress
- executiveStatus
- startedDate
- completedDate

## Intake Engine Responsibilities

- Validate required fields
- Detect duplicate customers
- Create customer record
- Create mission record
- Generate globally unique IDs
- Route missions to Website Builder Mission when `missionType=WEBSITE_BUILD`
- Preserve provider abstraction and governance

## Executive Dashboard Model

Includes:

- totalCustomers
- activeMissions
- awaitingExecutiveReview
- completedMissions
- blockedMissions
- recentActivityFeed

## Governance

- CEO approval remains required before publish (enforced by downstream website mission governance)
- No destructive operations
- No publish path in intake layer
- Provider agnostic mission routing

## Validation

Run tests:

```bash
node --test test/customer-intake-mission-control.test.js
```

Run end-to-end validation report:

```bash
npm run customer-intake:mission-control-v1
```

Outputs:

- `review/customer-intake-mission-control-v1-report.json`
- `review/customer-intake-mission-control-v1-report.md`
