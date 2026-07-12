# Atlas Executive Dashboard API v1

## Purpose

Provide a secure, authenticated, read-only API interface for the Executive Operations Dashboard snapshot and section projections.

## Architecture

The API layer reuses existing dashboard systems and adds:

- auth boundary
- role authorization
- rate limiting
- request routing
- response envelope normalization
- audit logging
- snapshot retention policy
- API health projection

Core files:

- `executive-dashboard-api-contracts.js`
- `executive-dashboard-api-auth.js`
- `executive-dashboard-api-authorizer.js`
- `executive-dashboard-api-rate-limiter.js`
- `executive-dashboard-api-router.js`
- `executive-dashboard-api-service.js`
- `executive-dashboard-api-response.js`
- `executive-dashboard-api-audit-log.js`
- `executive-dashboard-api-health.js`
- `executive-dashboard-api-snapshot-retention.js`

## Authentication

v1 uses service tokens from environment variables only.

Supported variables:

- `ATLAS_DASHBOARD_API_TOKEN` (default CEO token)
- `ATLAS_DASHBOARD_API_TOKEN_CEO` (optional)
- `ATLAS_DASHBOARD_API_TOKEN_EXECUTIVE` (optional)
- `ATLAS_DASHBOARD_API_TOKEN_OPERATOR` (optional)
- `ATLAS_DASHBOARD_API_TOKEN_AUDITOR` (optional)
- `ATLAS_DASHBOARD_API_TOKEN_READ_ONLY_SERVICE` (optional)

Security notes:

- no hardcoded tokens
- constant-time token comparison
- failed auth responses are generic
- tokens are never returned

## Role Permissions

- CEO: full read visibility
- EXECUTIVE: overview, decisions, missions, portfolio, customers, providers, system health, alerts, metadata, health, snapshots
- OPERATOR: missions, workforce, provider health, system health, activity, alerts, metadata, health
- AUDITOR: snapshots, health, metadata, activity, system health, governance-focused read model
- READ_ONLY_SERVICE: complete machine-readable dashboard snapshot, health, metadata

## Endpoint Catalog

- `GET /api/v1/dashboard`
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/decisions`
- `GET /api/v1/dashboard/missions`
- `GET /api/v1/dashboard/workforce`
- `GET /api/v1/dashboard/customers`
- `GET /api/v1/dashboard/opportunities`
- `GET /api/v1/dashboard/providers`
- `GET /api/v1/dashboard/system-health`
- `GET /api/v1/dashboard/activity`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/snapshots`
- `GET /api/v1/dashboard/snapshots/:snapshotId`
- `GET /api/v1/dashboard/health`
- `GET /api/v1/dashboard/metadata`

## Request Contracts

Request object is transport-agnostic:

```json
{
  "method": "GET",
  "path": "/api/v1/dashboard/missions",
  "query": {
    "state": "ACTIVE",
    "page": 1,
    "pageSize": 25
  },
  "headers": {
    "authorization": "Bearer <token>",
    "x-client-id": "client-1"
  },
  "clientId": "client-1"
}
```

## Response Envelope

All responses use a normalized envelope:

- success
- status
- requestId
- timestamp
- data
- pagination
- dataFreshness
- warnings
- limitations
- error

Error codes:

- UNAUTHORIZED
- FORBIDDEN
- NOT_FOUND
- INVALID_REQUEST
- RATE_LIMITED
- DATA_UNAVAILABLE
- INTERNAL_ERROR

## Filtering and Pagination

Reusable validation and pagination include:

- allow-list filter validation
- unsupported filter rejection
- deterministic stable sorting
- max page size enforcement
- safe defaults

## Rate Limiting

In-memory deterministic limiter:

- `ATLAS_DASHBOARD_API_RATE_LIMIT_REQUESTS`
- `ATLAS_DASHBOARD_API_RATE_LIMIT_WINDOW_MS`

Adapter-ready for distributed implementation later.

## Audit Logging

Each audit record includes:

- auditEventId
- requestId
- timestamp
- authenticatedRole
- endpoint
- operation
- success
- responseCategory
- sanitized filters
- clientIdentityHash
- durationMs
- warnings
- deniedReason

Never logs raw tokens/secrets.

## Redaction

Role-aware redaction includes:

- token non-disclosure
- sanitized report references
- auditor-safe customer masking for decision-center references
- normalized internal errors without stack traces

## Snapshot Retention

Policy wrapper over dashboard snapshot registry:

- configurable max count (`ATLAS_DASHBOARD_SNAPSHOT_MAX_COUNT`)
- configurable age (`ATLAS_DASHBOARD_SNAPSHOT_RETENTION_DAYS`)
- metadata listing
- safe ID lookup (`dash_<number>`)
- no deletion during read requests

## Governance

API is strictly read-only and does not execute approvals, publishing, deployment, mission creation, assignment, provider writes, or destructive operations.

## Dependency Guards

Domain-specific API surfaces require explicit dependency injection at service construction. The API must not instantiate fallback business-domain managers.

Required injected managers by route family:

- `/api/v1/customer/*` and `/api/v1/payments/webhook/stripe` require `customerPortalManager`
- `/api/v1/website-production` requires `websiteProductionManager`
- `/api/v1/mission-control` and `/api/v1/mission-control/:missionId/*` require `missionControlManager`

If a required dependency is missing, API responds with `503 DATA_UNAVAILABLE` and a normalized read-only error envelope.

## Local Validation

Run tests:

```bash
node --test test/executive-dashboard-api-v1.test.js
```

Run executable validation mission:

```bash
npm run executive:dashboard-api-v1
```

Outputs:

- `review/executive-dashboard-api-v1-report.json`
- `review/executive-dashboard-api-v1-report.md`

## Future Server Integration

Service is framework-agnostic and can be mounted into Node HTTP, Express, Fastify, or Atlas-native transports.

## Future Visual Dashboard Integration

Future UI should consume API envelope contract and use role-scoped views only.

## Future Persistent Storage

Snapshot retention, rate limiting, and audit logging are adapter-ready for persistent/distributed backends.

## Known Limitations

- In-memory limiter and retention in v1.
- Env token auth in v1 (managed secrets recommended for production).
- No external listener bound in validation mode (in-process harness only).

## CEO Setup Instructions

1. Set `ATLAS_DASHBOARD_API_TOKEN` in secure environment configuration.
2. Optionally set role-specific tokens.
3. Set retention and rate-limit env vars for your environment profile.
4. Run `npm run executive:dashboard-api-v1` to validate configuration.

## Recommended Next Action

Mount the API service into a secured HTTP boundary with managed secret retrieval, TLS, distributed rate limiting, and persistent audit/snapshot storage.
