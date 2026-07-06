# ECP-003 Direct Custody Recovery Follow-On Evidence

Date: 2026-07-05
Status: COMPLETE
Program Authorization: APPROVED WITH DIRECTION
Workstream Type: Narrow evidence follow-on only

## Executive Direction Applied
- CEO decision: Option 2 authorized.
- Constraint: run one narrowly scoped follow-on direct custody recovery drill only.
- Non-goals: no credential-system redesign, no scope expansion, no fabricated authoritative-vault evidence.

## Purpose
Determine whether the remaining ECP-003 direct custody recovery gaps can be closed through additional operational evidence available from the current delegated host session.

## Follow-On Drill Artifact
- Lab root: `C:\Atlas\Projects\ecp-003-direct-custody-follow-on-20260706T020255Z`
- Summary: `C:\Atlas\Projects\ecp-003-direct-custody-follow-on-20260706T020255Z\evidence\direct-custody-follow-on-summary.json`

## Validation Result

### Structural drill-package validation
- command: `powershell -ExecutionPolicy Bypass -File .\tools\validate-direct-custody-recovery-follow-on-drill.ps1 -EvidenceRoot C:\Atlas\Projects\ecp-003-direct-custody-follow-on-20260706T020255Z\evidence`
- result: PASS
- summary: required files=3, errors=0

## Follow-On Drill Summary
- Prior direct recovery baseline: `C:\Atlas\Projects\ecp-003-credential-operations-20260706T015304Z\evidence`
- Overall follow-on result: `PARTIAL PASS`
- Recommended ECR-R3 status: `KEEP OPEN`
- Direct recovery pass count: `1`
- Direct recovery partial count: `2`
- Direct recovery fail count: `3`
- Class-level closures achieved: `1`

## Host-Side Evidence Added
1. Live OpenClaw profile metadata showed an approved local gateway auth token path in `~/.openclaw/openclaw.json` without exposing the token value.
2. Live OpenClaw profile metadata showed a concrete auth-profile reference for provider access in addition to the already-known runtime `models.json` surface.
3. The delegated host session still had no 1Password CLI session, no GitHub CLI authenticated session, no GitHub-scoped credential-manager target, and no direct vault/account session for infrastructure, archives, or recovery-key custody.

## Class-Level Outcome Changes

### 1. Service environment / channel secrets
Decision: PASS

Reason:
- The follow-on drill confirmed that the live OpenClaw profile contains a direct local gateway-auth token path in approved runtime configuration.
- This closes the earlier host-side gap that existed when only adjacent runtime files were observed.
- The token value was not disclosed or copied into evidence.

### 2. Repository access
Decision: PARTIAL PASS

Reason:
- The host still proves a concrete OpenClaw Git remote path.
- The host did not prove a GitHub-scoped credential-manager target, SSH identity, or direct secure-store retrieval event that would demonstrate recoverable authenticated write access.

### 3. Provider / model API credentials
Decision: PARTIAL PASS

Reason:
- The host now shows concrete provider-adjacent auth-profile references in addition to the runtime `models.json` surface.
- No direct retrieval from GitHub Actions, 1Password, local `.env` custody, or another authoritative provider-secret store was available in this session.

### 4. VPS / infrastructure
Decision: FAIL

Reason:
- No authoritative VPS account, host, or vault session was available from the delegated host session.

### 5. Backup / archive
Decision: FAIL

Reason:
- No authoritative archive-access or backup-vault session was available from the delegated host session.

### 6. Emergency recovery / decryption material
Decision: FAIL

Reason:
- No recovery-key or decryption-material custody session was available from the delegated host session.

## What The Follow-On Drill Proved
1. The service-environment/channel class now has direct local host-side recovery evidence, not just adjacent runtime evidence.
2. Provider/model API custody evidence is slightly stronger because auth-profile references are now directly observed on the host.
3. Vault-backed classes still cannot be closed from this delegated session without authoritative custody-system access.

## What The Follow-On Drill Did Not Prove
1. That repository-access credentials can be recovered from a provider-specific secure store and used to restore authenticated write access.
2. That VPS / infrastructure custody can be directly recovered from its authoritative vault or platform account.
3. That backup / archive custody can be directly recovered from its authoritative store.
4. That provider/model API secrets can be directly recovered from GitHub Actions, 1Password, local `.env` custody, or equivalent authoritative stores.
5. That emergency recovery / decryption material can be directly recovered from its authoritative custody system.

## Certification Impact
- ECR-R3 remains OPEN.

Reason:
- One host-side local recovery gap closed for service-environment/channel secrets.
- Repository access remains only partial.
- Three vault-backed classes remain direct-recovery FAIL states.
- The certification blocker therefore remains unresolved at launch-critical scope.

## Confidence Impact
- Prior whole-system operational confidence: 69/100
- Current whole-system operational confidence after the follow-on drill: 70/100

Rationale:
- Confidence improved slightly because a previously partial credential class now has direct host-side recovery evidence.
- Confidence remains materially constrained because authoritative custody recovery is still unproven for repository write access, VPS/infrastructure, backup/archive, provider secret stores, and emergency decryption custody.

## Required Next Step
Continue with the Evidence Closure Plan.

Reason:
- The approved narrow follow-on drill has been completed.
- The remaining gaps persist and now require either later executive-authorized authoritative-custody access or acceptance that ECR-R3 remains open while other ECP workstreams proceed.