# Atlas Live Framer Integration v1

## Scope

This implementation enables live authenticated Framer integration in strict read-only mode.

Mission safety constraints enforced:

- No publish.
- No overwrite.
- No delete.
- No duplicate execution.
- Stop before destructive actions.

## Delivered Components

- Live Framer adapter: `integration/src/executive/framer-website-adapter.js`
- Server API client boundary: `integration/src/executive/framer-server-api-client.js`
- Authentication boundary: `integration/src/executive/framer-auth-client.js`
- Config/env contract: `integration/src/executive/framer-adapter-config.js`
- Error normalization: `integration/src/executive/framer-error-normalizer.js`
- Orchestrator provider integration: `integration/src/executive/website-provider-adapters.js`
- Mission runner/report: `integration/scripts/run-framer-live-integration-v1.js`

## Phase Coverage

### Phase 1: Authentication

- API key and project URL are read from environment variables.
- Credentials are never hardcoded.
- Validation fails safely when required values are missing.

### Phase 2: Connection Verification

- Adapter verifies connection and returns a structured capability report.
- Attempts to retrieve workspace, projects, and sites via capability probing.
- If methods are unavailable in current API context, returns limitations instead of unsafe assumptions.

### Phase 3: Read Operations

Implemented read operations:

- List projects (or connected project fallback)
- Read project metadata
- Read site information
- Read preview/publish metadata when available

### Phase 4: Duplicate Workflow (Prepare Only)

- Duplicate flow is prepared but never executed.
- Returns planned steps, required flags, and policy requirements.

### Phase 5: Website Orchestrator Integration

- Existing provider interface remains unchanged.
- `FramerWebsiteAdapter` delegates to `AtlasFramerWebsiteAdapter`.
- Read-only policy blocks write actions regardless of orchestrator path.

## Environment Variables

Required:

- `FRAMER_PROJECT_URL`
- `FRAMER_API_KEY`

Safety controls:

- `FRAMER_READ_ONLY=true`
- `FRAMER_LIVE_MODE=true`
- `FRAMER_DRY_RUN=false`
- `FRAMER_ALLOW_PREVIEW_PUBLISH=false`
- `FRAMER_ALLOW_PRODUCTION_DEPLOY=false`
- `FRAMER_ALLOW_PROJECT_DUPLICATION=false`

Optional tuning:

- `FRAMER_MAX_RETRIES`
- `FRAMER_RETRY_DELAY_MS`
- `FRAMER_REQUEST_TIMEOUT_MS`
- `FRAMER_EXTERNAL_AGENT_ENABLED`
- `FRAMER_PLUGIN_FALLBACK_ENABLED`

## CEO-Gated Setup Steps (Not Executed)

1. Approve a dedicated sandbox Framer project URL for integration verification.
2. Generate project-scoped Framer API key in Site Settings -> General.
3. Store credentials in Atlas secret manager (never commit to repo).
4. Set safety controls exactly as listed above.
5. Run: `node integration/scripts/run-framer-live-integration-v1.js`.
6. Review generated report in `review/framer-live-integration-v1-report.md`.
7. Keep write flags disabled until explicit CEO authorization for write-path testing.
