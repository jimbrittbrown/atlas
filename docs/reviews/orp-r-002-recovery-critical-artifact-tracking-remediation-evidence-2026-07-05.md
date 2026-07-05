# ORP-R-002 Recovery-Critical Artifact Tracking Remediation Evidence

Date: 2026-07-05
Status: ACTIVE
Program Authorization: APPROVED
Remediation Scope: Recovery-critical artifact tracking only

## Purpose
Implement the minimum enforcement seam required to close the OVP-001 recovery-critical artifact durability gap.

## Priority Selection Decision
Selected remediation: ORP-R-002 (Recovery-critical artifact tracking)

Reasoning:
1. ORP-R priority order makes ORP-R-002 the next highest remediation after ORP-R-001.
2. OVP-001 failed specifically because required governance artifacts were not restorable from committed source-of-truth state.
3. Without artifact durability, backup/restore confidence remains structurally constrained.

## Smallest Architectural Seam Implemented
1. Added recovery-critical manifest:
- docs/recovery-critical-artifact-manifest.txt

2. Added deterministic validator:
- tools/validate-recovery-critical-artifacts.ps1

Validator behavior:
- Reads required artifact list from manifest.
- Verifies each artifact exists on disk.
- Verifies each artifact is tracked by git.
- Verifies each artifact is present in HEAD when RequireHead is enabled.
- Exits non-zero on any failure.

## Focused Validation (OVP-001 Scope Only)

Command:
- powershell -ExecutionPolicy Bypass -File ./tools/validate-recovery-critical-artifacts.ps1 -RequireHead

Result:
- Missing on disk: 0
- Not tracked by git: 10
- Not present in HEAD: 10

Interpretation:
- Artifact durability control is now implemented and executable.
- Current repository state still fails OVP-001 durability requirements because required artifacts are not yet in committed source-of-truth state.

## Governance Boundary Check
- No architecture redesign.
- No new core capability.
- No ownership boundary changes.
- No unrelated OVP workstream executed.

## Remediation Status Decision
ACTIVE

Reason:
- Enforcement seam is implemented.
- Gap closure requires moving required artifacts into tracked, committed HEAD state and re-running OVP-001 targeted validation.

## Next Required Action Within ORP-R-002
1. Promote all manifest-listed recovery-critical artifacts into tracked HEAD state.
2. Re-run validator with RequireHead.
3. Re-run OVP-001 targeted validation record and update decision.
