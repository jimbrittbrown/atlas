# Atlas Executive Planning & Mission Portfolio System v1

## Architecture

This layer sits above Mission Control and reuses existing execution systems:

- Mission Control (`customer-intake-mission-control.js`)
- Mission Registry (`mission-registry.js`)
- Workforce Director (`workforce-director.js`)
- Website Builder mission pipeline (`website-builder-mission-manager.js`)
- Existing provider abstraction and governance controls

Execution stack:

CEO/Customer/Division/Opportunity -> Proposal Intake -> Executive Planning Engine -> Portfolio Ranking -> Executive Decision -> Mission Conversion Bridge -> Mission Control -> Workforce Director -> Execution

## Data Model

Core modules:

- `executive-planning-contracts.js`
- `mission-portfolio-registry.js`
- `executive-planning-engine.js`
- `mission-portfolio-manager.js`
- `mission-conversion-bridge.js`
- `executive-planning-dashboard-model.js`
- `executive-planning-system.js`

Mission proposal minimum fields:

- proposalId
- sourceType
- sourceId
- customerId
- title
- description
- missionType
- requestedOutcome
- strategicObjective
- expectedBusinessValue
- urgency
- estimatedEffort
- estimatedCost
- estimatedDuration
- dependencies
- requiredCapabilities
- risks
- confidence
- createdAt
- updatedAt
- status

## Proposal Lifecycle

Statuses:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- REVISION_REQUIRED
- APPROVED
- DEFERRED
- REJECTED
- CONVERTED_TO_MISSION
- CANCELLED

Transitions are enforced by proposal state machine in `executive-planning-contracts.js`.

## Scoring Model

Deterministic weighted model (0..1 normalized score):

- strategicAlignment: 0.16
- expectedBusinessValue: 0.14
- urgency: 0.12
- confidence: 0.10
- feasibility: 0.10
- resourceAvailability: 0.10
- dependencyReadiness: 0.08
- risk: 0.08
- estimatedEffort: 0.04
- estimatedCost: 0.04
- timeToValue: 0.04

Overall score = weighted sum of each normalized signal.

## Priority Model

Bands:

- CRITICAL (>= 0.85)
- HIGH (>= 0.70)
- MEDIUM (>= 0.50)
- LOW (>= 0.35)
- HOLD (< 0.35 or blocking issues)

Recommended decisions:

- APPROVE
- APPROVE_WITH_CONDITIONS
- REVISION_REQUIRED
- DEFER
- REJECT

## Portfolio Ranking

Ranking is score-driven and includes:

- score-ordered proposals
- resource conflict detection
- dependency conflict detection
- capacity conflict detection
- prioritization history per proposal

## Workforce Integration

Planner queries Workforce Director for:

- available workers
- available capabilities
- current utilization/workload
- estimated start availability per capability

Planner output includes staffing recommendations and capacity conflict signals.

## Mission Conversion

Mission Conversion Bridge rules:

- Only convert when decision is APPROVE or APPROVE_WITH_CONDITIONS.
- Prevent duplicate conversion via idempotent proposal->mission map.
- WEBSITE_BUILD proposals route through Mission Control intake.
- Other mission types convert to Mission Registry pending routing records (still using Mission Control-owned registry path).
- Lineage preserved: proposalId, sourceType, sourceId, strategic priority, capabilities, effort, duration.

## Governance Rules

CEO approval required when any of:

- estimated cost >= threshold
- high aggregate risk
- requires publishing
- requires production deployment
- exceeds resource utilization limit
- creates new business division

Safety confirmations:

- No autonomous publish actions.
- No autonomous production deployment.
- Existing governance controls are preserved.

## Recovery Behavior

Supported:

- retry evaluation
- resume review
- re-evaluate proposal
- rollback proposal status
- cancel proposal
- structured failure logs
- full audit trail
- idempotent conversion guard

## Dashboard Contract

Projection includes:

- Total proposals
- Submitted
- Under review
- Approved
- Deferred
- Rejected
- Converted to missions
- Active missions
- Blocked missions
- Portfolio value estimate
- Portfolio cost estimate
- Average confidence
- Capacity utilization
- Top priority proposals
- Resource conflicts
- Dependency conflicts
- Recent decisions
- Recommended next executive actions

## Example Proposal

```json
{
  "sourceType": "CUSTOMER",
  "sourceId": "cust-001",
  "customerId": "cus_1001",
  "title": "Website Growth Platform Build",
  "missionType": "WEBSITE_BUILD",
  "requestedOutcome": "Increase inbound qualified leads.",
  "strategicObjective": "Grow customer acquisition pipeline.",
  "expectedBusinessValue": 92,
  "urgency": 87,
  "estimatedEffort": 32,
  "estimatedCost": 85000,
  "estimatedDuration": 45,
  "requiredCapabilities": ["COMPANY_RESEARCH", "BRAND_PACKAGE_GENERATION"],
  "confidence": 0.86,
  "status": "SUBMITTED"
}
```

## Example Executive Evaluation

```json
{
  "overallScore": 0.79,
  "priorityBand": "HIGH",
  "confidenceBand": "HIGH",
  "blockingIssues": [],
  "warnings": [],
  "recommendedDecision": "APPROVE_WITH_CONDITIONS",
  "recommendedExecutionOrder": 21,
  "recommendedMissionType": "WEBSITE_BUILD"
}
```

## Example Executive Decision

```json
{
  "proposalId": "prop_123",
  "decision": "APPROVE",
  "decidedBy": "CEO",
  "rationale": "Highest strategic return with available capacity.",
  "conditions": ["Keep sandbox-only execution"],
  "timestamp": "2026-07-11T00:00:00.000Z"
}
```

## Example Converted Mission Control Record

```json
{
  "missionId": "mis_abc",
  "customerId": "cus_1001",
  "missionType": "WEBSITE_BUILD",
  "currentStage": "MISSION_CREATED",
  "lineage": {
    "proposalId": "prop_123",
    "sourceType": "CUSTOMER",
    "sourceId": "cust-001"
  },
  "strategicPriority": "HIGH",
  "governance": {
    "publishAllowed": false,
    "productionDeploymentAllowed": false
  }
}
```

## Future Storage Adapter Path

`MissionPortfolioRegistry` is intentionally storage-agnostic and can accept future adapters (SQL, document store, event store) without changing planning contracts or manager interfaces.

## Validation

Run tests:

```bash
node --test test/executive-planning-system-v1.test.js
```

Run end-to-end planning runner:

```bash
npm run executive-planning:system-v1
```

Outputs:

- `review/executive-planning-system-v1-report.json`
- `review/executive-planning-system-v1-report.md`
