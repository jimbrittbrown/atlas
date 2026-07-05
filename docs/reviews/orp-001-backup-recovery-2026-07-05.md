# ORP-001 - Backup & Recovery

Date: 2026-07-05
Status: COMPLETE
Program Authorization: APPROVED

## Objective
Define and verify Atlas operational-state backup and recovery readiness before first business launch.

## Deliverables
- Backup strategy
- Restore procedures
- RPO definition
- RTO definition
- Restore verification process
- Backup playbook
- Failure scenario review
- CEO recovery guide

## Scope
- Workflow state continuity expectations
- Approval and governance record recovery expectations
- Memory, metrics, performance, institute, and business-factory state recovery expectations
- Verification evidence for successful restore paths

## Operating Assumption
Atlas is currently split between:
- durable repository-backed institutional assets
- non-durable in-memory runtime service state

This means backup and recovery readiness for Atlas today depends on protecting the repository as the institutional source of truth while explicitly acknowledging that several runtime states are not yet durably restorable.

## 1. Backup Strategy

### What Is Backed Up
1. Atlas institutional repository contents:
- constitution
- docs
- knowledge
- policies
- Decision-Log
- Manifest
- workflows
- skills
- business-factory reusable templates/assets
- released service code and integration code

2. Git metadata:
- commit history
- tags
- release lineage

3. Recovery-critical operational documents:
- PRR documents
- ORP documents
- milestone and governance records

4. Secret and credential inventory metadata:
- credential inventory document
- secret location map
- rotation schedule references

5. Environment and deployment recovery references:
- host inventory
- VPS/provider account references
- repo remote definitions

### Backup Frequency
- Git remote push after every approved governance change or release event.
- Daily repository snapshot backup while ORP remains active.
- Weekly immutable archive of full repository state.
- Pre-change backup before any high-risk operational change.
- Pre-release backup before any business-launch authorization in the future.

### Storage Locations
- Primary: canonical git remote repository.
- Secondary: encrypted off-host archive storage.
- Tertiary: encrypted offline archive retained separately from primary infrastructure.

### Retention Policy
- Daily backups retained for 30 days.
- Weekly backups retained for 12 weeks.
- Monthly backups retained for 12 months.
- Milestone/release backups retained indefinitely.

### Encryption Requirements
- Off-host and offline backup archives must be encrypted at rest.
- Backup encryption keys must be stored separately from the backup payloads.
- Secret-bearing recovery materials must never be stored in plaintext alongside repository archives.

## 2. Recovery Strategy

### Recovery Process
1. Classify failure type.
2. Declare affected recovery scope.
3. Freeze non-essential writes.
4. Recover repository source of truth.
5. Recover secret access and credential inventory.
6. Reconstruct required operational environment.
7. Run restore verification checklist.
8. Resume operations only after verification succeeds.

### Recovery Ownership
- CEO: final recovery authorization for business-impacting incidents.
- Program owner / operations lead: recovery coordination.
- Repository custodian: restore repository source of truth.
- Security owner: restore credential access and validate secret posture.
- Executive owner: confirm operational readiness before resumption.

### Recovery Verification
- Recovery is incomplete until repository integrity is verified.
- Recovery is incomplete until credentials are validated.
- Recovery is incomplete until required governance artifacts are present.
- Recovery is incomplete until restore verification checklist passes.

### Disaster Recovery Workflow
1. Detect failure.
2. Classify severity.
3. Contain damage.
4. Restore institutional source of truth.
5. Restore operational access.
6. Verify recovery.
7. Record lessons for Atlas Institute.

## 3. Recovery Objectives

### RPO
- Repository and governance source-of-truth RPO: 24 hours maximum.
- Release/milestone/gating artifact RPO: 0 hours acceptable only through immediate post-change push discipline; otherwise 24 hours maximum.

Rationale:
- Atlas institutional knowledge is the highest-value asset.
- Daily snapshot + continuous git push discipline provides acceptable near-term protection without redesign.

### RTO
- Repository-only recovery RTO: 4 hours.
- Full operational coordination environment recovery RTO: 24 hours.

Rationale:
- Atlas is not yet authorized to launch businesses, so a 24-hour full operational recovery target is acceptable during ORP.
- Faster repository restoration is required because governance and knowledge are the current source of truth.

## 4. Restore Verification

### Restore Testing Procedure
1. Restore repository into clean isolated workspace.
2. Verify commit history, tags, and milestone artifacts.
3. Verify constitution, blueprint, principles, traceability, and ORP artifacts are present.
4. Verify secret inventory and recovery references are available.
5. Run baseline test suite where practical after restore.
6. Record restore result and gaps.

### Operational Rule
A backup is not valid until a restore has succeeded and been documented.

### Restore Testing Cadence
- Monthly restore verification during ORP.
- Mandatory restore verification before first business launch authorization.
- Mandatory restore verification after major infrastructure change.

## 5. Failure Scenarios

### Repository Corruption
- Recovery path: restore latest clean repository archive and validate git lineage.
- Risk: High institutional impact.

### Database Loss
- Current condition: Atlas repo itself does not yet define a durable database-backed state model for core services; runtime state is largely in-memory.
- Recovery path: restore repository and reconstruct operations from durable artifacts only.
- Risk: Critical because runtime records may be unrecoverable.

### Memory Corruption
- Recovery path: restore repository source of truth and any durable records; reconstitute learning/governance state from institutional artifacts.
- Risk: High for operational continuity.

### Lost API Credentials
- Recovery path: revoke/rotate credentials, restore from secure credential inventory and secret source references.
- Risk: Critical if sole access path is lost.

### VPS Failure
- Recovery path: provision replacement host, restore repository, restore credential access, rehydrate environment, verify.
- Risk: High.

### Local Machine Loss
- Recovery path: restore from remote repo + encrypted off-host archive + credential inventory.
- Risk: Medium to High depending on role concentration.

### Cloud Provider Outage
- Recovery path: fail to alternate storage/archive and alternate compute/coordination environment.
- Risk: High.

## 6. Risk Assessment

### ORP-001-RA-1
- Description: Repository-backed institutional knowledge is recoverable, but multiple runtime services remain in-memory only.
- Risk Level: CRITICAL
- Recommended Resolution: define durable state export/persistence procedure before business launch.
- Estimated Priority: P0
- Confidence: HIGH

### ORP-001-RA-2
- Description: No demonstrated restore drill evidence exists yet.
- Risk Level: HIGH
- Recommended Resolution: execute first full restore verification and record results before ORP-002 closeout.
- Estimated Priority: P0
- Confidence: HIGH

### ORP-001-RA-3
- Description: Credential recovery depends on external secret custody practices not yet formalized in Atlas artifacts.
- Risk Level: HIGH
- Recommended Resolution: complete ORP-003 credential inventory and rotation baseline before launch authorization.
- Estimated Priority: P0
- Confidence: HIGH

## 7. Remaining Weaknesses
- Runtime service state is not yet durably restorable.
- Restore drills are defined but not yet evidenced in this workstream.
- Alternate-host and cloud-outage procedures are defined at policy level, not yet reheated through simulation.
- Secret inventory and custody controls still depend on ORP-003 completion.

## 8. Confidence Level
MEDIUM

Rationale:
- Atlas institutional source-of-truth recovery is now clearly defined.
- Atlas runtime state recovery remains partially unresolved due to in-memory service state.

## 9. Recommendation
Proceed to ORP-002.

Rationale:
- ORP-001 has produced the required operational framework and surfaced the remaining recovery blockers clearly.
- Remaining closure depends on adjacent operational workstreams, not additional architecture design.

## Acceptance Criteria
- Atlas backup strategy documented with scope, ownership, and schedule.
- Restore procedures documented step-by-step.
- RPO explicitly defined.
- RTO explicitly defined.
- Restore verification procedure documented and repeatable.
- Backup playbook produced.
- CEO recovery guide produced.

## Source PRR Findings
- RR-1
- IR-1

## Non-Goals
- No persistence-layer redesign in this document.
- No implementation beyond approved operational hardening tasks.
