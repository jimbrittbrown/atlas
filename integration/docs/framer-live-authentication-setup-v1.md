# Framer Live Authentication Setup v1

## 1. Current Framer Integration Module Inspection

Primary runtime modules:

- `integration/src/executive/framer-adapter-config.js`
- `integration/src/executive/framer-auth-client.js`
- `integration/src/executive/framer-server-api-client.js`
- `integration/src/executive/framer-website-adapter.js`
- `integration/src/executive/website-provider-adapters.js`

Startup validation module (offline only):

- `integration/src/executive/framer-startup-validator.js`

Mission scripts:

- `integration/scripts/validate-framer-startup-config-v1.js`
- `integration/scripts/run-framer-readonly-connection-test-v1.js`

## 2. Exact CEO Setup Checklist

1. Approve use of a dedicated Framer sandbox project for Atlas integration verification.
2. In Framer Site Settings -> General (for that sandbox project), generate a project-scoped API key.
3. Store credentials in Atlas secret manager (not in git, not in files, not in chat).
4. Configure Atlas runtime environment variables exactly as shown below.
5. Run offline startup validation command.
6. If offline validation passes, run live read-only connection test.
7. Review generated reports under `review/`.
8. Keep write/publish/duplicate flags disabled until a separate CEO write authorization exists.

## 3. Environment Variable Placement and Ownership

All variables must be set in the Atlas runtime secret/environment layer (VPS deployment environment), not hardcoded.

Recommended placement:

- Production-like VPS runtime: secret manager -> process environment injection
- Local operator shell (temporary testing): exported env vars in shell session
- CI (if applicable): protected encrypted repository/environment secrets

Variables:

- `FRAMER_PROJECT_URL`: required, Framer project URL for the approved sandbox
- `FRAMER_API_KEY`: required, project-scoped API key from Framer Site Settings
- `FRAMER_READ_ONLY`: required, must be `true`
- `FRAMER_LIVE_MODE`: required, `true` for live connection test
- `FRAMER_DRY_RUN`: required, `false` for live connection test
- `FRAMER_ALLOW_PREVIEW_PUBLISH`: required, must be `false`
- `FRAMER_ALLOW_PRODUCTION_DEPLOY`: required, must be `false`
- `FRAMER_ALLOW_PROJECT_DUPLICATION`: required, must be `false`

## 4. Commands

### A. Startup Validation (No Network Requests)

From `integration/`:

```bash
npm run framer:validate-startup
```

What it verifies offline:

- Required environment variables exist
- API key format is syntactically valid
- Project URL format is syntactically valid
- Configuration policy is complete and safe

Outputs:

- `review/framer-startup-validation-v1.json`
- `review/framer-startup-validation-v1.md`

### B. First Live Read-Only Connection Test

From `integration/`:

```bash
npm run framer:test-readonly-live
```

What it does:

- Authenticates to Framer using environment credentials
- Reads workspace/project/site info via safe capability probes
- Returns success/failure with explicit warnings/limitations
- Does not publish, modify, overwrite, delete, or duplicate

Outputs:

- `review/framer-readonly-connection-test-v1.json`
- `review/framer-readonly-connection-test-v1.md`

## 5. Step-by-Step CEO Guide

1. In Framer, open the approved sandbox project.
2. Go to Site Settings -> General.
3. Generate a new Framer Server API key.
4. Store `FRAMER_API_KEY` and `FRAMER_PROJECT_URL` in Atlas secret manager.
5. Set required safety variables:
   - `FRAMER_READ_ONLY=true`
   - `FRAMER_LIVE_MODE=true`
   - `FRAMER_DRY_RUN=false`
   - `FRAMER_ALLOW_PREVIEW_PUBLISH=false`
   - `FRAMER_ALLOW_PRODUCTION_DEPLOY=false`
   - `FRAMER_ALLOW_PROJECT_DUPLICATION=false`
6. In Atlas integration workspace, run:
   - `npm run framer:validate-startup`
7. If the result is PASS, run:
   - `npm run framer:test-readonly-live`
8. Review reports in `review/` and confirm:
   - Authentication succeeded
   - Read operations succeeded (or explicit capability limitations are documented)
   - No write/publish actions were attempted

## 6. Non-Goals and Safety

- No publishing
- No project modification
- No project duplication
- No deletion
- No overwrite

If any command indicates write-capable flags are enabled, stop immediately and reset flags to safe values before retrying.
