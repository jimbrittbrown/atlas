# Atlas Website Builder Mission v1

## Objective

Create Atlas's first autonomous website builder mission that executes end-to-end website production workflow against the Framer Sandbox project and stops before publishing.

## Workflow

1. Receive prospect URL
2. Run Website Intelligence Engine
3. Generate Brand Package
4. Select best Website Template
5. Generate complete customization package
6. Pass customization package into Website Production System
7. Generate Framer build instructions
8. Call Framer Adapter
9. Create or update sandbox project only
10. Stop automatically

## Governance and Safety

- Never publish
- Never deploy to production
- Never overwrite production
- CEO approval remains mandatory before any publishing action
- Provider abstraction remains intact

## Implementation Modules

- Mission contracts: `src/executive/website-builder-mission-contracts.js`
- Mission manager: `src/executive/website-builder-mission-manager.js`
- Workforce director: `src/executive/workforce-director.js`
- Workforce registry and roster: `src/executive/workforce-registry.js`, `src/executive/website-workforce-roster.js`
- Provider abstraction bridge: `src/executive/website-provider-adapters.js`
- Framer implementation hook: `src/executive/framer-website-adapter.js`

## Workforce Assignment Layer

Website Builder now requests stage assignments from Workforce Director before execution. The director:

- maps mission type to required specialties,
- assigns workers by stage,
- tracks stage activation/completion,
- detects unavailable workers,
- supports retry and reassignment when a stage fails,
- returns workforce telemetry in mission result payload.

## State Machine

Mission states:

- WAITING
- RUNNING
- REVISION_REQUIRED
- SANDBOX_UPDATED
- COMPLETED
- FAILED

Mission stops automatically after `SANDBOX_PROJECT_UPSERT` succeeds and transitions to `COMPLETED`.

## Recovery Handling

Supported recovery operations:

- retry stage
- resume mission
- rollback mission to selected stage
- structured failure log per stage

## Progress Reporting

Mission manager returns progress snapshot including:

- current stage
- completion percentage
- estimated completion
- warnings
- blocking issues
- governance status

## Validation

Run tests:

```bash
node --test test/website-builder-mission-manager.test.js
```

Run live mission validation report:

```bash
node scripts/run-website-builder-mission-v1.js
```

Outputs:

- `review/website-builder-mission-v1-report.json`
- `review/website-builder-mission-v1-report.md`
