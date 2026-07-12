# Atlas Framer Integration Discovery and Adapter v1

## Scope and Safety Guardrails

This delivery intentionally stops before any live project mutation or publishing.

- No real credentials are used in code or tests.
- No production deployment is executed.
- No existing RidgeLine or Atlas Web Framer projects are modified.
- Adapter defaults to `FRAMER_DRY_RUN=true` and `FRAMER_ALLOW_PRODUCTION_DEPLOY=false`.

## Phase 1: Capability Discovery Outcome

See full matrix in:

- `integration/docs/framer-capability-matrix-v1.md`

Summary:

- Server-side authentication from VPS is supported via Framer Server API project-scoped keys.
- Preview workflow is supported (`publish`) without production deploy (`deploy`).
- Production deploy can be gated by Atlas CEO policy.
- CMS and many editor methods are available through Plugin API and documented as shared by Server API, but should be capability-probed because Server API reference explicitly lists only extra/different methods.
- Framer states Server API is non-transactional, so Atlas must implement retries, checkpoints, and idempotency.
- External Agent support is official and does not require a separate Framer MCP server.

## Phase 2: Adapter Foundation Delivered

Core files:

- `integration/src/executive/framer-adapter-config.js`
- `integration/src/executive/framer-auth-client.js`
- `integration/src/executive/framer-error-normalizer.js`
- `integration/src/executive/framer-server-api-client.js`
- `integration/src/executive/framer-agent-boundaries.js`
- `integration/src/executive/framer-website-adapter.js`
- `integration/src/executive/website-provider-adapters.js` (Framer registration)
- `integration/test/framer-website-adapter.test.js`
- `integration/docs/framer-adapter-integration-test-plan.md`

Adapter contract compatibility (existing Website Orchestrator contract):

- `researchCompany`
- `generateBrandPackage`
- `selectTemplate`
- `generateWebsite`
- `publishWebsite`
- `buildDeliveryPackage`

Additional foundation capabilities:

- `createPreview` (non-production preview operation)
- Error normalization with retryability hints
- Retry-aware Server API connection wrapper
- Idempotency cache keyed by stage + payload signature
- Plugin and External Agent task boundaries for operations that may require editor context

## Exact Credential and Setup Steps Requiring CEO Action

These steps are intentionally not executed in this phase.

1. CEO approval ticket for Framer sandbox integration
- Approve a dedicated non-production Framer sandbox project URL for Atlas integration.
- Approve scope: read project metadata, CMS sync tests, preview publish only.

2. Framer API key creation (project-scoped)
- In Framer Site Settings -> General for the approved sandbox project, generate a Server API key.
- Store key in approved secret manager (never commit).

3. VPS secret provisioning
- Set `FRAMER_PROJECT_URL` and `FRAMER_API_KEY` only in secure runtime secret storage.
- Set policy flags:
  - `FRAMER_DRY_RUN=false` for sandbox validation only
  - `FRAMER_ALLOW_PREVIEW_PUBLISH=true`
  - `FRAMER_ALLOW_PRODUCTION_DEPLOY=false` (must remain false)

4. External Agent bridge authorization (if used)
- Run `npx @framer/agent setup` on the approved operator machine.
- Connect with `/framer` and authorize only the approved sandbox project.
- Confirm branch-based workflow and merge controls.

5. Controlled validation run
- Execute read-only and preview-only integration checks.
- Archive logs and capability probe results for CEO review.

6. Separate CEO production release approval
- A second explicit CEO approval is required before setting `FRAMER_ALLOW_PRODUCTION_DEPLOY=true` in any environment.
- Without this approval, production deploy remains blocked by adapter policy.
