# Atlas Operations Playbook

Date: 2026-07-05
Status: OPERATIONAL PLAYBOOK
Scope: Reusable operational procedure set for Atlas abnormal and steady-state operations

## Purpose
Provide the reusable Atlas operations playbook that governs startup, operation, shutdown, restart, degraded mode, rollback, recovery, and verification.

## Startup
- Verify repository source of truth.
- Verify credential access.
- Verify no blocking incidents.
- Verify operational visibility minimums.

## Normal Operation
- Monitor workflows, approvals, workers, and business state.
- Watch for stalled, rejected, or repeated-failure conditions.
- Ensure learning capture for material outcomes.

## Shutdown
- Stop non-essential new work.
- Record pending work and incident state.
- Perform safe stop and capture restart notes.

## Restart
- Confirm reason for restart.
- Validate source of truth and access.
- Reconcile pending work after restart.

## Degraded Mode
- Continue only explicitly safe, bounded functions.
- Pause business launch expansionary paths.
- Default to no-go when operational certainty is missing.
- Activate the manual continuity playbook when approvals, Atlas Institute intake, or metrics become unavailable.

## Rollback
- Revert to last-known-good operational state.
- Re-verify visibility, governance, and operational controls.
- Record root cause and recovery evidence.

## Recovery Verification
- Control Center minimums verified.
- Approval path verified.
- Worker path verified.
- Business state visibility verified.
- Learning capture continuity verified.
- Manual continuity artifacts reconciled to restored normal control paths.

## Standardization Intent
This playbook is intended to become part of the Atlas Operating Manual after the ORP maturity path is complete.
