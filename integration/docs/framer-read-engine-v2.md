# Framer Read Engine v2

## Objective

Expand Atlas Framer integration from connection-only verification to comprehensive read-only project intelligence.

Read Engine v2 performs capability discovery and metadata collection across all detectable Framer read surfaces while preserving strict safety controls.

## Safety Invariants

- `FRAMER_READ_ONLY=true` is mandatory.
- No publish execution.
- No content write or mutation.
- No project duplication execution.
- No deletion.

## Read Surface Categories

Read Engine v2 discovers and probes these categories where available:

- projectMetadata
- pageMetadata
- cmsCollections
- assets
- images
- styles
- components
- variables
- fonts
- navigation
- publishingMetadata
- analyticsMetadata

Each category records:

- supported endpoints (callable methods)
- unsupported endpoints (not exposed or not callable in current context)
- limitations (contextual restrictions, missing methods, argument requirements)

## Runtime Components

- Client capability engine: `src/executive/framer-server-api-client.js`
- Adapter read aggregation: `src/executive/framer-website-adapter.js`
- Provider integration bridge: `src/executive/website-provider-adapters.js`
- Orchestrator auto-gather path: `src/executive/website-orchestrator.js`
- Capability report script: `scripts/run-framer-read-engine-v2-capability-report.js`

## Commands

From `integration/`:

```bash
npm run framer:capability-report-v2
```

Outputs:

- `review/framer-read-engine-v2-capability-report.json`
- `review/framer-read-engine-v2-capability-report.md`

## Orchestrator Integration

During `COMPANY_RESEARCH`, the orchestrator now automatically captures full project details when the selected provider exposes `readAllProjectDetails()`.

Artifacts:

- `mission.artifacts.projectDetails`
- `mission.artifacts.companyResearch.projectDetails`

This keeps the provider interface backward-compatible while enabling richer Framer intelligence for downstream stages.

## Recommended Future Write Operations (CEO-gated)

Read Engine v2 report includes forward recommendations only (not executed):

- Controlled CMS upsert workflow after CEO write authorization
- Policy-gated preview publish flow in sandbox branch
- CEO-approved production deploy workflow with explicit ticket evidence
- Asset replacement workflow with idempotency checkpoints
- Project duplication and branch promotion workflow after governance approval
