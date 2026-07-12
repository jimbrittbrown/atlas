# Midnight Archives Production Readiness

## Purpose
This checklist validates launch readiness for Midnight Archives without creating channels, publishing content, or storing secrets.

## Readiness Categories
- business
- brand
- providers
- credentials
- publishing safety
- assets
- knowledge
- dashboard
- executive approval

## Readiness States
- `READY` means all required checks pass.
- `READY_WITH_WARNINGS` means launch can proceed, but a non-blocking item needs attention.
- `BLOCKED` means launch must stop until the blocker is resolved.

## Operational Rules
1. The Midnight Archives business profile must exist.
2. The asset root and knowledge partition must be configured.
3. The provider registry must include YouTube, Google Cloud, Vertex AI, Gemini, and ElevenLabs.
4. The credential registry must report configured and missing status without exposing secret values.
5. Publishing mode must remain `NONE` unless explicitly enabled.
6. Default production upload visibility must be `PRIVATE`.
7. CEO approval is required before any publish action.
8. Brand package status must be tracked.
9. YouTube channel status must be tracked.
10. Dashboard readiness must remain available through the existing dashboard service contract.

## Recommended Process
1. Load the current business, provider, and credential registries.
2. Evaluate the production checklist.
3. Review any warnings or blockers.
4. Resolve blockers before enabling any publish path.

## Exit Criteria
The production readiness review is complete when the checklist reports `READY` or `READY_WITH_WARNINGS`, and any blocked publishing path is explicitly approved by the CEO.