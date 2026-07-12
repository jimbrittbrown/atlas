# Customer Portal v1 (Production Foundation)

## Purpose

Customer Portal v1 is the production intake application boundary for customer-submitted website requests. It creates and manages customer requests while reusing Atlas mission execution systems.

## Reused Architecture

- Mission Control
- Customer Registry
- Mission Registry
- Executive Planning System
- Workforce Director
- Website Builder Mission (execution delegated through existing managers)
- Executive Dashboard API auth/router/envelope stack
- Persistence layer (provider-backed meta/record state)
- Governance layer

## Governance Guarantees

The portal does not execute write-side production actions outside request management. It enforces:

- no publishing
- no deployment
- no production overwrite
- no destructive actions

Mission execution remains delegated to existing managers.

## Customer Authentication Foundation

v1 includes architecture scaffolding for:

- customer ID
- customer account
- customer session
- future Stripe linkage fields

No external auth provider is required in this phase.

## API Endpoints

- `GET /api/v1/customer/projects`
- `GET /api/v1/customer/project/:id`
- `POST /api/v1/customer/request`
- `POST /api/v1/customer/revision`
- `GET /api/v1/customer/downloads/:id`

All endpoints reuse existing manager and registry layers.

## Submission Flow

1. Validate customer intake payload.
2. Create/reuse customer via Customer Registry.
3. Create/reuse account and session records.
4. Create Mission Registry record with mission type `WEBSITE_BUILD`.
5. Route request into Mission Control + planning proposal context.
6. Persist request/account/session/revision state through provider-backed persistence.
7. Return confirmation with mission ID.

## Tracking and Revision

Mission tracking reuses Mission Registry and Workforce Director projection fields:

- current stage
- percent complete
- assigned workforce
- executive review status
- QA status
- blocked issues
- estimated finish

Revision requests create linked missions and maintain revision history per root mission.

## Downloads

Portal returns delivery references for:

- website package
- brand guide
- QA report
- executive review package
- delivery summary

## Frontend Foundation

The customer portal UX is implemented inside the existing executive dashboard frontend architecture with:

- React
- TypeScript
- Vite
- existing routing and shell layout
- existing card/status/error/loading patterns
- shared API client layer

## Tests

- `test/customer-portal.test.js`
- `test/customer-intake-api.test.js`
- `test/mission-routing.test.js`
- `apps/executive-dashboard/src/__tests__/customer-portal.test.tsx`
- `apps/executive-dashboard/src/__tests__/customer-dashboard.test.tsx`

## Validation

Run:

- `npm run executive:customer-portal:v1:validate`

Reports:

- `../review/customer-portal-report.json`
- `../review/customer-portal-report.md`
