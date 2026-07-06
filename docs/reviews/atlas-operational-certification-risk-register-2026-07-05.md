# Atlas Operational Certification Risk Register

Date: 2026-07-05
Status: ACTIVE
Purpose: Remaining-risk register for Executive Certification Review ECR-001

| Risk ID | Risk | Level | Certification Impact | Evidence | Required Closure |
| --- | --- | --- | --- | --- | --- |
| ECR-R1 | Launch-critical runtime state remains insufficiently durable/restorable beyond governance artifact HEAD durability; ECP-001 classified unresolved classes as workflow, approval, worker execution, metric history, and business lifecycle state, and ECP-002 confirmed the drill still does not close those class-level gaps. | CRITICAL | Certification blocker | docs/reviews/atlas-production-readiness-review-prr-2026-07-05.md; docs/reviews/ovp-001-revalidation-after-orp-r-002-2026-07-05.md; docs/reviews/ecp-001-runtime-state-restoration-proof-2026-07-05.md; docs/reviews/ecp-002-restore-drill-execution-2026-07-05.md | Demonstrate runtime-state restoration procedure and record restore evidence. |
| ECR-R3 | Rotation and revocation now have drill evidence, and a narrow follow-on drill closed the local host-side service-environment/channel gap, but repository access remains partial and direct custody recovery is still unexercised for VPS, backup/archive, and emergency decryption custody. | HIGH | Certification blocker | docs/reviews/ovp-002-revalidation-after-orp-r-003-2026-07-05.md; docs/reviews/ecp-003-credential-operations-evidence-2026-07-05.md; docs/reviews/ecp-003-direct-custody-follow-on-evidence-2026-07-05.md | Execute direct operator-led recovery against authoritative custody systems for repository write access and the unresolved vault-backed classes. |
| ECR-R8 | Mission Control still depends on upstream signal trustworthiness and summary-level evidence. | MEDIUM | Acceptable residual risk after blockers close | docs/reviews/ovp-004-revalidation-after-orp-r-005-2026-07-05.md | Maintain upstream signal verification and monitoring. |
| ECR-R9 | Manual continuity procedures depend on disciplined operator evidence capture in degraded mode. | MEDIUM | Acceptable residual risk after blockers close | docs/reviews/ovp-003-revalidation-after-orp-r-004-2026-07-05.md | Preserve runbook discipline and review gates. |
| ECR-R10 | Local validation clone remote configuration was absent during OVP-002 supporting checks. | LOW | Not a certification blocker | docs/reviews/ovp-002-revalidation-after-orp-r-003-2026-07-05.md | Set canonical remote as operational hygiene follow-on. |

## Register Summary
- CRITICAL blockers: 1
- HIGH blockers: 1
- MEDIUM acceptable-after-closure risks: 2
- LOW non-blocking risks: 1

## Executive Rule
Operational Certification should not be recommended while any CRITICAL blocker remains unresolved or while mandatory certification workstreams remain unexecuted.