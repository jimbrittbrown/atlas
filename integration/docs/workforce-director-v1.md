# Atlas Workforce Director v1

## Objective

Establish a workforce assignment layer between Mission Control and execution divisions so missions receive specialist assignments before execution starts.

## Architecture

Mission Control -> Workforce Director -> Website Builder Mission -> Provider Adapter

The Workforce Director is provider agnostic and does not publish or deploy.

## Modules

- Workforce contracts: `src/executive/workforce-director-contracts.js`
- Website workforce roster: `src/executive/website-workforce-roster.js`
- Workforce registry: `src/executive/workforce-registry.js`
- Workforce director: `src/executive/workforce-director.js`
- Workforce dashboard model: `src/executive/workforce-dashboard-model.js`
- Website builder integration: `src/executive/website-builder-mission-manager.js`

## Workforce Registry Schema

Each worker record includes:

- workerId
- workerName
- division
- specialty
- capabilities
- status (`IDLE`, `BUSY`, `OFFLINE`)
- currentMission
- currentStage

## Website Workforce (Initial)

- Company Research Specialist
- Brand Strategy Specialist
- Messaging Specialist
- Website Architect
- Framer Production Specialist
- QA Specialist
- Executive Package Specialist

## Workforce Director Responsibilities

- Receive mission context (`missionId`, `missionType`)
- Determine required workers by mission type and stage
- Assign workers to stage plans
- Activate workers when a stage begins
- Track stage completion and release workers
- Detect unavailable workers
- Support retry and reassignment after stage failure
- Return assignment and dashboard telemetry to Mission Control

## Dashboard Model

The workforce dashboard reports:

- activeWorkers
- idleWorkers
- workerUtilization
- missionAssignments
- blockedWorkers
- currentWorkload

## Governance

- Provider agnostic by design
- CEO approval gate preserved in mission governance
- No publish capability added to workforce layer
- Existing Website Builder architecture preserved with additive assignment workflow

## Validation

Run workforce tests:

```bash
node --test test/workforce-director.test.js
```

Run website builder integration tests:

```bash
node --test test/website-builder-mission-manager.test.js
```

Run workforce director validation report:

```bash
npm run workforce:director-v1
```

Outputs:

- `review/workforce-director-v1-report.json`
- `review/workforce-director-v1-report.md`
