# Atlas Manual Continuity Playbook

Date: 2026-07-05
Status: OPERATIONAL PLAYBOOK
Scope: Manual continuity procedures for launch-critical Atlas control-path outages

## Purpose
Define explicit manual fallback procedures for launch-critical conditions where the normal Atlas control path is unavailable but safe bounded continuity must still be governed.

## Continuity Rule
- Manual continuity is allowed only for bounded, explicitly authorized recovery and containment actions.
- Expansionary actions remain paused until the normal control path is restored and resumption gates are satisfied.
- Every manual continuity action must leave durable evidence for later review and delayed ingest.

## Approval Workflow Interruption

### Trigger
- Approval system is unavailable, stale, unreachable, or cannot provide trustworthy current decision state for a launch-critical path.

### Authority
- Executive authority may freeze approval-dependent execution immediately.
- CEO authority is required to authorize any temporary manual approval decision for launch-critical progression.

### Required Evidence
- Blocked item list with item owner and business impact.
- Last known trustworthy approval state.
- Reason the normal approval path is unavailable.
- Explicit manual decision record naming approver, timestamp, scope, and expiry.

### Manual Procedure
1. Freeze all approval-dependent execution.
2. Record blocked approvals and dependent work items in the incident record.
3. Classify whether the blocked path is containment-only or progression-capable.
4. If containment-only, continue only the minimum action needed to stop unsafe drift.
5. If launch-critical progression is requested, require explicit CEO manual approval with bounded scope and expiry.
6. Record the manual decision in a durable review artifact before execution resumes.
7. Restore the normal approval path and reconcile every manual decision against system state.

### Resumption Gates
- Normal approval path is restored and reachable.
- Manual decisions are reconciled to durable system evidence.
- No approval-dependent item remains in ambiguous state.
- Executive review confirms approval integrity is restored.

## Atlas Institute Unavailable

### Trigger
- Atlas Institute cannot accept, classify, or synthesize new learning artifacts during an incident or material operational event.

### Authority
- Executive authority may activate delayed-ingest mode.
- CEO authority is not required unless learning loss would materially affect an active launch decision.

### Required Evidence
- Incident or event identifier.
- Raw notes capturing what happened, why it mattered, and what changed operationally.
- Source evidence links or paths.
- Named delayed-ingest owner and expected ingest deadline.

### Manual Procedure
1. Declare delayed-ingest learning mode.
2. Continue only bounded safe operations that do not depend on live Institute synthesis.
3. Capture each material lesson in a durable manual record with source evidence references.
4. Mark each record as pending Institute ingest.
5. Preserve recommendations, decisions, and follow-up actions with named owners.
6. After Institute restoration, ingest every pending record and verify none were lost.

### Resumption Gates
- Atlas Institute is restored.
- All pending manual learning records are ingested or explicitly dispositioned.
- Executive review confirms no material lesson remains uncaptured.

## Metrics Unavailable

### Trigger
- Launch-critical metrics are unavailable, stale, or untrustworthy enough that normal operational signals cannot support safe continuation.

### Authority
- Executive authority may declare manual evidence mode and pause expansionary actions immediately.
- CEO authority is required before any launch-critical progression continues under degraded manual metrics.

### Required Evidence
- Time of metrics loss and affected metric domains.
- Minimum manual metrics snapshot covering workflows, approvals, workers, and launch blockers.
- Data source for each manual metric.
- Freshness timestamp and named recorder.

### Manual Procedure
1. Declare degraded manual evidence mode.
2. Pause expansionary or launch-critical actions until minimum manual metrics are captured.
3. Capture the minimum manual metrics set:
   - active workflows
   - pending approvals and oldest pending age
   - failed or stalled workers
   - current incident count and severity
   - launch blockers and rollback state
4. Record data source and freshness timestamp for every metric.
5. Use manual evidence only for bounded containment, rollback, or recovery decisions unless CEO authorizes narrower progression.
6. Restore primary metrics and compare restored values against manual records for drift.

### Resumption Gates
- Primary metrics path is restored.
- Metric freshness is re-verified.
- Manual evidence is reconciled against restored measurements.
- Executive review confirms launch-critical decisions no longer depend on degraded manual metrics.

## Evidence Handling Rule
- Manual continuity artifacts must be stored in repository-owned review evidence or incident records.
- Raw secret values are never recorded in manual continuity artifacts.

## Standardization Intent
This playbook is intended to become part of the Atlas Operating Manual after ORP maturity completion.