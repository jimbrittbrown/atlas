# Atlas Executive Operations Dashboard v1

## Purpose

Executive Operations Dashboard v1 provides a read-only CEO operations view across Atlas systems without replacing execution architecture.

## Architecture

The dashboard composes projection models on top of existing systems:

- Customer Intake and Mission Control
- Customer Registry
- Mission Registry
- Executive Planning System and Mission Portfolio Registry
- Workforce Director
- Website Builder mission orchestration and provider adapter abstraction

No workflow execution logic is duplicated.

## Ownership Separation

- Operations Loop owns operational telemetry aggregation: health, incidents, alerts, recovery posture, runtime loop metrics, queue pressure, and operational priority outcomes.
- Executive Operations Dashboard Manager owns projection composition only.
- Business domains remain source of truth for their state and are consumed read-only through projections.
- Dashboard composition must not mutate mission, customer, workforce, payment, website production, provider, or planning state.

Dependency direction:

- domain services
- read-only projections
- executive projection composer
- API and dashboard surfaces

## Reused Systems

- `customer-intake-mission-control.js`
- `customer-registry.js`
- `mission-registry.js`
- `executive-planning-system.js`
- `mission-portfolio-registry.js`
- `workforce-director.js`
- `website-builder-mission-manager.js`
- existing report artifacts under `review/`

## Dashboard Sections

Snapshot includes:

- executiveOverview
- ceoDecisionCenter
- missionControl
- workforce
- customerPipeline
- opportunityPortfolio
- providerHealth
- systemHealth
- activityFeed
- alerts
- generatedAt
- dataFreshness
- missingData
- limitations
- recommendedExecutiveActions

## Data Contracts

Core contracts and status enums are in:

- `executive-operations-dashboard-contracts.js`

Includes availability status values:

- AVAILABLE
- PARTIAL
- UNAVAILABLE
- NOT_CONNECTED
- NOT_CONFIGURED
- ESTIMATED

## Aggregation Flow

1. Gather read models from existing registries/managers.
2. Resolve required operations telemetry projection.
3. Resolve optional domain projections.
4. Build section projections independently.
5. Validate projection contracts, freshness, and duplicate identifiers.
6. Normalize missing/partial projection availability.
7. Normalize activity events and alerts.
8. Build data freshness and missing-data records.
9. Validate complete snapshot contract.
10. Save snapshot into adapter-ready snapshot registry.

## Projection Provider Contract

Projection composition is routed through one canonical registry boundary:

- `ExecutiveProjectionProviderRegistry`
- provider registration at runtime bootstrap via `createExecutiveProjectionProviderRegistry(...)`
- provider invocation through `invokeProvider(providerId, context)`

Canonical provider IDs:

- `operations.telemetry.provider` (required)
- `website.production.provider` (optional)
- `customer.portal.provider` (optional)

Each projection provider envelope returns:

- providerId
- projectionId
- projectionType
- contractVersion (`1.0.0`)
- status
- generatedAt
- timestamp
- aggregateMetrics
- warnings
- incidents
- source
- payload

Registration and invocation hardening rules:

- duplicate provider IDs are rejected
- duplicate projection ownership is rejected by default
- unsupported contract versions are rejected
- unknown provider resolution fails explicitly
- provider health failures are isolated and surfaced
- malformed projection payloads are rejected and surfaced
- stale projections are flagged using max-age freshness policy
- malformed timestamps fail safely and do not silently coerce freshness

Contracts are read-only and must never carry secrets or credentials.

Required projection:

- operations.telemetry.provider

Optional projections degrade safely when unavailable:

- website.production.provider
- customer.portal.provider

## Governance Boundaries

Dashboard is read-only and must not execute:

- publish
- deploy
- approve/reject
- delete/destructive writes
- provider writes

Governance confirmation fields are returned in snapshot response.

## Data Availability Rules

Missing or unavailable data is labeled explicitly. Dashboard does not silently coerce unknown values to zero where that would imply confirmed absence.

Failure handling rules:

- Required operations telemetry failure is fail-closed and visible as an error.
- Optional projection failure does not collapse the full dashboard snapshot.
- Malformed optional projection payloads are rejected and reported in missingData.
- Stale projection timestamps are reported in missingData.
- Duplicate projection identifiers fail snapshot generation.

## Activity Feed Model

Normalized events include:

- intake events
- mission events
- workforce assignment and blockers
- proposal audit and decisions
- provider warnings

Each event includes ID, timestamp, severity, category, source, links, and recommended action.

## Alert Model

Alert categories include blocked missions, overdue/stalled missions, capability gaps, provider failures, low-confidence and high-risk proposals, and CEO-action queues.

Severities:

- INFO
- WARNING
- HIGH
- CRITICAL

## Health Model

System health records are produced for:

- Atlas runtime
- Mission Control
- Customer Intake
- Mission Registry
- Workforce Director
- Executive Planning
- Website Builder
- Framer integration
- reporting system
- governance system

Each record includes status, last checked, warnings/errors, dependencies, readiness score, and recommended action.

## Future UI Integration

`executive-operations-dashboard.js` acts as a facade for future UI layers.

## Future API Integration

`executive-operations-dashboard-response-model.js` produces API-ready payloads. Next stage should expose authenticated read-only endpoints.

## Future Persistent Storage Integration

`dashboard-snapshot-registry.js` is adapter-ready and can be backed by SQL/document/event storage in future phases.

## Known Limitations

- Some provider health statuses depend on adapter configuration and may remain NOT_CONFIGURED.
- Revenue is represented as proposal-value estimates, not financial ledger data.
- Mission risk/confidence can rely on linked proposal telemetry where direct mission metrics are absent.

## Recommended Next Action

Add secure read-only API endpoints with role-based access and snapshot retention policies.

## Validation

Run tests:

```bash
node --test test/executive-operations-dashboard-v1.test.js
```

Run executable validation mission:

```bash
npm run executive:operations-dashboard-v1
```

Reports:

- `review/executive-operations-dashboard-v1-report.json`
- `review/executive-operations-dashboard-v1-report.md`
