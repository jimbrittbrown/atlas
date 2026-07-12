# Governance Rules

## Core Rules
1. Intelligence layer must not modify website templates.
2. Intelligence layer must not perform website customization.
3. All extracted fields must include confidence scoring.
4. Low-confidence fields must be flagged as uncertain.
5. Missing logo or contact information must produce blocked findings.
6. Output package must remain compatible with Website Production System contracts.

## Data Integrity
1. Preserve raw business meaning while normalizing format.
2. Do not fabricate unavailable fields.
3. Keep extraction deterministic for the same input payload.

## Human-in-the-Loop
1. Any uncertain field should be reviewed before customization starts.
2. Blocked findings must be resolved before production handoff.
