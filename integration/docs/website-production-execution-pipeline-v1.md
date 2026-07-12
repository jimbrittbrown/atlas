# Website Production Execution Pipeline v1

## Mission
Complete the production phase between Website Builder and Customer Delivery by executing a governed production pipeline with staged orchestration, QA, revision routing, delivery artifact generation, and executive checkpointing.

## Architecture
- Production Orchestrator: `src/executive/website-production-execution-orchestrator.js`
- QA Engine: `src/executive/website-production-qa-engine.js`
- Revision Engine: `src/executive/website-production-revision-engine.js`
- Delivery Package Generator: `src/executive/website-production-delivery-package-generator.js`
- Manager integration entrypoint: `src/executive/website-production-manager.js`

## Pipeline Stages
1. RECEIVE_SANDBOX_PROJECT
2. QUALITY_ASSURANCE
3. REVISION_CYCLE
4. DELIVERY_PACKAGE
5. AWAIT_GOVERNANCE_APPROVAL

## QA Engine Coverage
- Required page verification
- Navigation verification
- Branding consistency
- Responsive layout verification
- Missing asset detection
- Broken component detection
- Screenshot capture task generation
- QA scoring gate

## Revision Loop
- Auto-routes revision tasks when QA fails.
- Re-runs QA after revision routing attempts.
- Captures retry count and revision history.
- Stops at governance checkpoint; does not auto-publish.

## Delivery Package Contents
- Website package metadata
- Asset references and screenshot references
- QA report
- Revision history
- Deployment instructions (approval-first)
- Customer delivery summary
- Executive review package

## Governance Rules
- Publish blocked inside pipeline execution.
- Deploy blocked inside pipeline execution.
- Destructive operations blocked inside pipeline execution.
- Final execution state is `AWAITING_CEO_APPROVAL`.

## Dashboard and Operations Loop Telemetry
Website production projection now includes:
- `stage`
- `qaStatus`
- `issuesRemaining`
- `workerAssignments`
- `estimatedCompletion`
- `qualityScore`
- `deliveryReadiness`

Operations loop ingests this telemetry and emits production queue findings for pending revisions.

## Validation
- Unit/integration tests:
  - `node --test test/website-production-manager-v1.test.js test/website-production-execution-pipeline-v1.test.js`
- Full validation runner:
  - `npm run executive:website-production-execution-pipeline:v1:validate`
- Report outputs:
  - `../review/website-production-execution-pipeline-v1-report.json`
  - `../review/website-production-execution-pipeline-v1-report.md`
