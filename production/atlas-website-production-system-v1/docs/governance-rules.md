# Governance Rules

## Core Rules
1. Approved templates only. Non-approved templates cannot enter customization.
2. Layout lock required. Customization cannot modify baseline page structure.
3. Logo protection enforced. Existing client logos cannot be overwritten unless explicit approval exists.
4. QA gate is mandatory. Delivery generation is blocked on any QA failure.
5. Required pages are non-optional based on template version contract.
6. All deliveries require full handoff artifacts.

## Change Control Rules
1. Template version increments are required for any structural template change.
2. Every template version must include approval metadata (`approvedBy`, `approvedAt`).
3. Data-model changes require backward-compatibility review.
4. Governance changes require an explicit versioned update in this rules document.

## Auditability Rules
1. Every customization job must have immutable IDs (`jobId`, `clientId`, `templateId`).
2. QA reports must preserve check-level evidence.
3. Delivery package records must include artifact paths for traceability.
4. Pipeline outcomes should be reproducible from stored inputs and version references.

## Exception Policy
- Any request to bypass layout lock, logo protection, or QA gating must be explicitly approved by production governance.
- Exceptions must be logged with reason, approver, timestamp, and duration.
