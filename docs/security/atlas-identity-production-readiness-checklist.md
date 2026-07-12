# Atlas Identity Platform Production Readiness Checklist

## Security
- [ ] OIDC issuer/client credentials configured and validated.
- [ ] Production keyring configured with versioned keys.
- [ ] Development fallback encryption key not used in production.
- [ ] Global emergency disable tested.
- [ ] Fail-closed behavior verified for startup/config failures.

## Operations
- [ ] Rollout stage policy documented (`disabled`, `experimental`, `internal`, `beta`, `production`).
- [ ] Promotion and rollback approvals defined.
- [ ] Emergency disable operational owner assigned.

## Monitoring
- [ ] Login success rate monitored.
- [ ] Callback failure telemetry monitored.
- [ ] Refresh failure telemetry monitored.
- [ ] JWKS refresh and unknown-kid telemetry monitored.
- [ ] Provider outage and logout-failure telemetry monitored.

## Configuration
- [ ] `ATLAS_IDENTITY_PROVIDER=oidc` configured for rollout environments.
- [ ] `ATLAS_IDENTITY_OIDC_ROLLOUT_STAGE` set to intended stage.
- [ ] `ATLAS_IDENTITY_OIDC_CALLBACK_URLS` contains only HTTPS callbacks.
- [ ] Issuer URL and audience/client settings validated.

## Secrets
- [ ] OIDC client secret provisioned via managed secret workflow.
- [ ] Encryption keyring stored in approved secret custody system.
- [ ] Secret rotation schedule approved and tracked.

## Audit
- [ ] Required auth lifecycle events are emitted.
- [ ] Sensitive values are redacted in persisted audit payloads.
- [ ] Audit retention and access controls validated.

## Telemetry
- [ ] Provider-agnostic security telemetry endpoints verified.
- [ ] Alert thresholds and dashboards configured.
- [ ] Telemetry data retention policy confirmed.

## Testing
- [ ] Mission F focused tests green.
- [ ] Mission A-E regression suites green.
- [ ] Startup validation failure cases tested.

## Rollback
- [ ] Stage rollback tested (`production` -> `beta` -> `internal`).
- [ ] Provider disable tested (`disabled` stage and global emergency disable).
- [ ] Graceful degradation validated under provider outage.

## Disaster Recovery
- [ ] Runbook for identity outage recovery available.
- [ ] Incident response path and on-call ownership confirmed.
- [ ] Recovery-time and recovery-point expectations documented.
