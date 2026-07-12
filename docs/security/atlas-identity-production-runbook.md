# Atlas Identity Platform Production Runbook

## Scope
This runbook covers operational rollout for the Atlas Identity Platform (OIDC provider path), including rollout controls, startup validation, rollback safety, outage response, and key management.

## Preconditions
- `ATLAS_IDENTITY_PROVIDER=oidc`
- `ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE` set to one of: `disabled`, `experimental`, `internal`, `beta`, `production`
- `ATLAS_IDENTITY_OIDC_ISSUER_URL`, `ATLAS_IDENTITY_OIDC_CLIENT_ID`, `ATLAS_IDENTITY_OIDC_CLIENT_SECRET` configured
- `ATLAS_IDENTITY_OIDC_CALLBACK_URLS` configured with HTTPS callback URLs
- `ATLAS_AUTH_ENCRYPTION_KEY_VERSION` configured
- `ATLAS_AUTH_ENCRYPTION_KEYRING_JSON` configured (production keyring)
- `ATLAS_IDENTITY_GLOBAL_EMERGENCY_DISABLE=false`

## First Deployment
1. Deploy with `ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE=disabled`.
2. Verify startup readiness from auth health projection and confirm no startup validation failures.
3. Confirm audit and telemetry are receiving events in staging traffic simulation.
4. Promote stage to `experimental` for controlled traffic.

## Provider Onboarding
1. Validate issuer metadata endpoint and JWKS endpoint reachability.
2. Add provider callback URLs to `ATLAS_IDENTITY_OIDC_CALLBACK_URLS`.
3. Configure client credentials and verify startup passes in non-production.
4. Run callback, refresh, and logout federation test suite before exposure.

## Production Promotion
1. Promote stage in sequence: `experimental` -> `internal` -> `beta` -> `production`.
2. At each stage, verify:
   - callback success rate
   - refresh failures trend
   - provider outage telemetry
   - unknown-kid event volume
3. Pause promotion if failure rate or outage telemetry exceeds baseline.

## Rollback
1. Roll stage back one level (for example, `production` -> `beta`).
2. If impact persists, set `ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE=disabled`.
3. For emergency containment, set `ATLAS_IDENTITY_GLOBAL_EMERGENCY_DISABLE=true`.
4. Confirm provider is blocked and requests fail closed.

## Emergency Provider Disable
1. Set `ATLAS_IDENTITY_GLOBAL_EMERGENCY_DISABLE=true`.
2. Restart service.
3. Validate startup readiness shows emergency disable state and provider blocked.
4. Route incident response to identity on-call and security incident commander.

## Key Rotation Procedure
1. Add new key material in `ATLAS_AUTH_ENCRYPTION_KEYRING_JSON` under a new version.
2. Set `ATLAS_AUTH_ENCRYPTION_KEY_VERSION` to the new version.
3. Deploy and verify startup readiness and callback path health.
4. Keep prior key version in keyring until in-flight transaction windows expire.
5. Remove retired key version after verification window.

## Outage Recovery
1. Identify outage category:
   - discovery failure
   - JWKS retrieval failure
   - token endpoint timeout/failure
   - logout endpoint failure
2. Confirm telemetry signals (`provider_outage`, `refresh_failure`, callback failure trends).
3. If sustained outage, disable provider rollout stage or use global emergency disable.
4. Recover by restoring provider connectivity and gradually re-promoting rollout stage.

## Incident Response
1. Trigger severity classification based on auth impact and blast radius.
2. Freeze rollout promotions.
3. Enable kill switch if fail-open risk is detected.
4. Capture audit trail and telemetry snapshots for forensics.
5. Publish status updates and recovery ETA.
6. Run post-incident review with remediation tasks.
