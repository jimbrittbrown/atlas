# ECP-003 Credential Operations Evidence

Date: 2026-07-05
Status: COMPLETE
Program Authorization: APPROVED
Workstream Type: Evidence closure only

## Certification Blocker Addressed
- ECR-R3: Live credential rotation/revocation and direct custody recovery remain unexercised.

## Workstream Setup

### Evidence Required
1. Rotation exercise evidence.
2. Revocation exercise evidence.
3. Direct custody recovery exercise evidence for launch-critical credential classes.
4. Durable drill package that can be revalidated structurally.

### Validation Method
Execute a deterministic credential-operations drill that records live-like rotation and revocation scenarios plus host-observed direct-recovery coverage by credential class, then validate the evidence package structure.

### Expected Confidence Increase
+2 to +4

### Dependencies
- Existing custody register.
- Existing security baseline.
- Existing API key policy.
- Existing incident and recovery playbooks.

### Exit Criteria
Record whether credential operations evidence now satisfies certification requirements and preserve the exact remaining gaps if it does not.

## Drill Artifact
- Lab root: `C:\Atlas\Projects\ecp-003-credential-operations-20260706T015304Z`
- Summary: `C:\Atlas\Projects\ecp-003-credential-operations-20260706T015304Z\evidence\credential-operations-summary.json`

## Drill Execution Summary
- Atlas repository source: `C:\Atlas\Projects\atlas-repo`
- Atlas source branch: `master`
- Atlas source HEAD: `e4b4773989db78c8203fbc9cd9df03eb6c853023`
- OpenClaw runtime repository source: `C:\Atlas\Projects\openclaw`
- OpenClaw source branch: `main`
- OpenClaw source HEAD: `4d5dac1836831af71a27bfd1306c0ade08d306ad`
- Rotation result: `PASS`
- Revocation result: `PASS`
- Direct recovery pass count: `0`
- Direct recovery partial count: `3`
- Direct recovery fail count: `3`
- Overall drill result: `PARTIAL PASS`

## Validation Result

### Structural drill-package validation
- command: `powershell -ExecutionPolicy Bypass -File .\tools\validate-credential-operations-drill.ps1 -EvidenceRoot C:\Atlas\Projects\ecp-003-credential-operations-20260706T015304Z\evidence`
- result: PASS
- summary: required files=5, errors=0

## Operation Findings

### 1. Rotation exercise
Decision: PASS

Reason:
- A live-like provider/model API credential rotation rehearsal was executed using opaque custody references.
- The drill advanced from `atlas/custody/provider-model-api@2026-q2` to `atlas/custody/provider-model-api@2026-q3` without exposing raw secret values.
- The scenario preserved the required operational sequence: declare compromise, mint replacement, update mapping, revoke old reference, and verify replacement-only active state.

### 2. Revocation exercise
Decision: PASS

Reason:
- A live-like service-environment/channel revocation rehearsal was executed using opaque custody references.
- The drill exercised the disable-and-replace decision path, incident ownership capture, and replacement-only resumption gate.
- The scenario preserved the no-secrets-in-evidence rule.

### 3. Direct custody recovery exercise
Decision: PARTIAL PASS

Reason:
- Three classes showed some host-observed custody surface evidence without exposing contents:
  1. `repository-access`: the paired OpenClaw runtime repository exposes an actual configured remote path.
  2. `provider-model-api`: provider-adjacent runtime surface `models.json` exists on the host.
  3. `service-environment-channel`: local OpenClaw runtime paths `agent\plugins` and `openclaw-agent.sqlite` exist on the host.
- Three classes had no direct recovery path available in-session beyond repository documentation:
  1. `vps-infrastructure`
  2. `backup-archive`
  3. `emergency-recovery-decryption`

## Coverage By Credential Class

### 1. Repository access
Decision: PARTIAL PASS

Observed evidence:
- OpenClaw runtime repository has a configured `origin` remote.

Gap:
- No direct secure-store target retrieval or authenticated push-path recovery was exercised from this host session.

### 2. VPS / infrastructure
Decision: FAIL

Observed evidence:
- Repository-owned vault reference only.

Gap:
- No live host, account, or vault retrieval path for infrastructure custody was accessible in this session.

### 3. Backup / archive
Decision: FAIL

Observed evidence:
- Repository-owned archive custody reference only.

Gap:
- No direct archive credential or backup-access retrieval path was exercised in this session.

### 4. Provider / model API credentials
Decision: PARTIAL PASS

Observed evidence:
- Local runtime `models.json` path present on host.

Gap:
- No direct retrieval from 1Password, GitHub Actions, or another authoritative provider custody surface was exercised in this session.

### 5. Service environment / channel secrets
Decision: PARTIAL PASS

Observed evidence:
- Local runtime `agent\plugins` path present on host.
- Local runtime `openclaw-agent.sqlite` path present on host.

Gap:
- The dedicated `~/.openclaw/credentials` path was absent, so direct channel-secret retrieval was not exercised.

### 6. Emergency recovery / decryption material
Decision: FAIL

Observed evidence:
- Repository-owned vault references only.

Gap:
- No direct recovery or decryption material retrieval path was accessible in this session.

## Workstream Decision
Credential operations evidence is **PARTIALLY SATISFIED**.

## What The Drill Proved
1. Atlas now has durable evidence that live-like rotation and revocation exercises can be executed without leaking secrets into repository evidence.
2. Atlas can record class-by-class direct recovery coverage using actual host-visible custody surfaces rather than policy text alone.
3. Direct custody recovery is no longer a fully untested category; it is now explicitly split between partially evidenced local/runtime classes and still-unexercised vault-backed classes.

## What The Drill Did Not Prove
1. That repository-access credentials can be directly recovered from a secure store and used to restore authenticated write access.
2. That VPS / infrastructure custody can be directly recovered from its authoritative vault or account system.
3. That backup / archive custody can be directly recovered from its authoritative store.
4. That provider/model API custody can be directly recovered from 1Password, GitHub Actions, or equivalent authoritative custody.
5. That channel/runtime secrets can be directly recovered from a dedicated secret store path.
6. That emergency recovery / decryption material can be directly recovered from its authoritative custody system.

## Certification Impact
- ECR-R3 remains OPEN.

Reason:
- Rotation and revocation evidence now exist.
- Direct custody recovery remains incomplete for half of the launch-critical credential classes and remains entirely unexercised against the vault-backed classes that matter most for high-severity recovery.

## Confidence Impact
- Prior whole-system operational confidence: 67/100
- Current whole-system operational confidence after ECP-003: 69/100

Rationale:
- Confidence increased because security operations now include real drill evidence for rotation and revocation plus explicit host-observed recovery coverage.
- Confidence remains materially constrained because direct custody recovery still lacks decisive proof for VPS, archive, and decryption classes.

## Remaining Certification Blockers After ECP-003
1. ECR-R1 runtime-state restoration proof remains open.
2. ECR-R3 direct custody recovery remains incomplete for vault-backed classes.
3. ECR-R4 full-scope OVP-003 cumulative rerun remains absent.
4. ECR-R5 OVP-005 remains unexecuted.
5. ECR-R6 OVP-006 remains unexecuted.
6. ECR-R7 Mission Control implementation sealing remains incomplete.

## Executive Decision Needed
Further progress on ECR-R3 now requires executive direction.

Reason:
- Closing the blocker would require direct operator access to authoritative vault or platform custody systems that were not available in this delegated session.
- Proceeding further without that authority would either fabricate evidence or over-claim current access, both of which would violate certification discipline.