# Framer Adapter Integration Test Plan (No Live Credentials)

## Scope

Validate Atlas Framer adapter foundation without touching live Framer projects.

## Preconditions

- Keep `FRAMER_DRY_RUN=true`.
- Do not set production deploy policy flag (`FRAMER_ALLOW_PRODUCTION_DEPLOY=false`).
- Use mocked `connect` function for Server API tests.

## Test Categories

1. Configuration and policy parsing
- Valid env parsing for booleans and retry settings.
- Missing required config detection.

2. Auth boundary
- Missing API key fails with normalized auth error.
- Missing project URL fails with normalized validation error.

3. Server API boundary
- SDK load failure normalization.
- Retry on transient error.
- Unsupported method normalization.

4. Adapter contract compatibility
- Adapter exposes required methods:
  - `researchCompany`
  - `generateBrandPackage`
  - `selectTemplate`
  - `generateWebsite`
  - `publishWebsite`
  - `buildDeliveryPackage`

5. Governance
- Publish blocked when `ceoApproved=false`.
- Publish blocked when production deploy policy disabled.

6. Preview workflow
- Preview operation allowed in dry-run and returns synthetic preview deployment.
- Preview operation can be toggled off by policy.

7. Idempotency and resume safety
- Same payload and stage returns replay result.
- Failure normalization includes operation and stage for orchestrator recovery logs.

## Future Live Validation (Requires CEO Approval)

After CEO authorization and isolated project setup:

1. Connect to a dedicated sandbox Framer project URL.
2. Generate a scoped API key in Site Settings.
3. Run read-only smoke tests (`researchCompany`, project snapshot).
4. Run CMS read and limited write test on non-production collection.
5. Run preview publish and verify preview URL/deployment.
6. Do not run production deploy until explicit CEO release ticket is approved.
