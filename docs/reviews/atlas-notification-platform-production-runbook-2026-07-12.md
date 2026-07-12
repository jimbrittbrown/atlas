# Atlas Notification Platform Production Runbook

Date: 2026-07-12
Scope: Atlas Notification Platform v1.0 (event intake, intent policy, composition, delivery orchestration, email channel, webhook channel, reliability, governance, observability)
Audience: Executive operations, on-call operators, release authority, security reviewers

## 1. Startup

1. Validate environment and provider readiness.
2. Confirm email provider startup readiness from Notification Email Provider Factory.
3. Confirm webhook provider startup readiness from Notification Webhook Provider Factory.
4. Confirm webhook signing key readiness and endpoint policy readiness.
5. Confirm storage connectivity and migration readiness.
6. Confirm dashboard projection provider health, including notification observability provider.
7. Confirm emergency-disable flags are set to expected values for rollout stage.

Startup gate is PASS only when all required startup checks are ready and no fail-startup condition is active.

## 2. Shutdown

1. Stop ingestion of new domain events at the boundary.
2. Allow in-flight dispatch attempts to complete where safe.
3. Persist final queue/dead-letter/recovery telemetry snapshots.
4. Record shutdown audit event with reason and owner.
5. Verify no unintended write paths continue after shutdown.

## 3. Deployment

1. Deploy only signed and approved release artifact.
2. Execute startup gate checks before traffic enablement.
3. Enable traffic gradually and monitor queue depth, dispatch failures, and policy suppressions.
4. Verify cross-tenant denial telemetry remains stable (no unexpected spikes).
5. Verify observability freshness and projection status are AVAILABLE or known PARTIAL with accepted reason.

## 4. Rollback

Use the dedicated rollback procedure document:
- Atlas Notification Platform Rollback Procedure (2026-07-12)

Rollback trigger criteria include severe reliability failure, governance bypass evidence, or cross-tenant isolation risk.

## 5. Provider Outage

1. Detect outage from provider health and dispatcher telemetry.
2. Confirm classification path (retryable for outage/timeouts, terminal for permanent rejection).
3. Validate queue growth and retry/backoff behavior remain bounded.
4. If outage persists, consider emergency disable and rollback criteria.
5. Record incident and executive status update.

## 6. Retry Exhaustion

1. Monitor reliability retry exhaustion rate and dead-letter backlog.
2. Confirm exhausted jobs transition to terminal/dead-letter path.
3. Verify no infinite retry loop and no duplicate customer communication.
4. Escalate to incident management when dead-letter backlog crosses threshold.

## 7. Dead-Letter Handling

1. Review dead-letter backlog and failure classes.
2. Confirm dead-letter records include correlation linkage and retention metadata.
3. Confirm no dead-letter duplication and no dead-letter omission.
4. Coordinate remediation action through executive governance path.

## 8. Emergency Disable

1. Apply emergency disable flags for affected provider/channel.
2. Verify fail-closed startup readiness and dispatch behavior.
3. Confirm no bypass through local/dev adapters in production.
4. Record emergency action in audit trail and incident record.

## 9. Recovery

1. Trigger restart recovery path after abnormal interruption.
2. Verify stale lease recovery, interrupted dispatch handling, and reconciliation findings.
3. Confirm CAS safety and deterministic repair behavior.
4. Validate post-recovery queue and terminal state consistency.

## 10. Operational Health Review

Review at minimum:
1. Delivery health (queued, dispatching, retrying, failed, dead-letter, delivered).
2. Provider health (availability, latency, failure class trends).
3. Governance health (approval backlog, suppressions, denials, policy failures).
4. Reliability health (retry success rate, exhaustion rate, recovery/reconciliation signals).
5. Template health (fallback frequency, render failures, unresolved placeholders).
6. Observability freshness and incident projection quality.

## 11. Certification Status

Current platform certification must be checked against the latest certification report before production promotion.

Minimum certification state for production promotion:
1. No unresolved Critical blockers.
2. No unresolved High blockers affecting security, isolation, or reproducibility.
3. Full regression suite green for notification platform scope.

## 12. Release Checklist

1. Required implementation and certification files are tracked and reproducible from clean checkout.
2. Notification regression suite passes.
3. Focused certification remediation suite passes.
4. Provider startup readiness checks pass.
5. Governance and isolation checks pass.
6. Observability redaction/freshness checks pass.
7. Runbook and rollback procedure reviewed and acknowledged by release owner.
8. Executive release authority approval recorded.
