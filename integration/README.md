# Atlas Integration Sprint 1

This package contains the initial integration boundary between the Executive Service and the Research Service.

## Responsibilities
- Preserve executive ownership of workflow state and routing.
- Preserve research ownership of research job state and report generation.
- Translate requests and responses at the service boundary only.

## Website Orchestrator v1
- Executive website mission pipeline implementation: `src/executive/website-orchestrator.js`.
- Contracts and state machine: `src/executive/website-orchestrator-contracts.js`.
- Provider-agnostic adapter registry: `src/executive/website-provider-adapters.js`.
- Executive dashboard projection: `src/executive/website-orchestrator-dashboard.js`.
- Architecture and workflow documentation: `docs/website-orchestrator-v1.md`.

## Framer Integration Discovery and Adapter v1
- Capability matrix (official-doc verified): `docs/framer-capability-matrix-v1.md`.
- Delivery summary and CEO-gated setup steps: `docs/framer-integration-discovery-and-adapter-v1.md`.
- Integration test plan: `docs/framer-adapter-integration-test-plan.md`.
- Adapter foundation: `src/executive/framer-website-adapter.js`.
- Server API boundary: `src/executive/framer-server-api-client.js`.
- Auth/config/error boundaries: `src/executive/framer-auth-client.js`, `src/executive/framer-adapter-config.js`, `src/executive/framer-error-normalizer.js`.
- Plugin/External Agent boundaries: `src/executive/framer-agent-boundaries.js`.

## Framer Live Integration v1
- Live read-only integration guide: `docs/framer-live-integration-v1.md`.
- Live verification runner and report generator: `scripts/run-framer-live-integration-v1.js`.
- Report output paths: `../review/framer-live-integration-v1-report.json`, `../review/framer-live-integration-v1-report.md`.

## Framer Live Authentication Setup v1
- CEO setup guide: `docs/framer-live-authentication-setup-v1.md`.
- Offline startup validation (no network): `npm run framer:validate-startup`.
- First live read-only connection test: `npm run framer:test-readonly-live`.

## Framer Read Engine v2
- Capability discovery and project-detail harvesting guide: `docs/framer-read-engine-v2.md`.
- Live capability report generator (read-only): `npm run framer:capability-report-v2`.
- Report output paths: `../review/framer-read-engine-v2-capability-report.json`, `../review/framer-read-engine-v2-capability-report.md`.

## Website Builder Mission v1
- Workflow, contracts, state machine, and recovery guide: `docs/website-builder-mission-v1.md`.
- Autonomous mission command: `npm run website:builder-mission-v1`.
- Report output paths: `../review/website-builder-mission-v1-report.json`, `../review/website-builder-mission-v1-report.md`.

## Website Demonstration Mission v1
- Demonstration orchestration and executive package guide: `docs/website-demonstration-mission-v1.md`.
- Demonstration mission command: `npm run website:demonstration-mission-v1`.
- Report output paths: `../review/website-demonstration-mission-v1-report.json`, `../review/website-demonstration-mission-v1-report.md`.

## Executive Review Package v1
- Executive review architecture and contract guide: `docs/website-executive-review-package-v1.md`.
- Executive review mission command: `npm run website:executive-review-package-v1`.
- Report output paths: `../review/website-executive-review-package-v1-report.json`, `../review/website-executive-review-package-v1-report.md`.

## Customer Intake & Mission Control v1
- Intake architecture, registries, dashboard, and routing guide: `docs/customer-intake-mission-control-v1.md`.
- Mission control validation command: `npm run customer-intake:mission-control-v1`.
- Report output paths: `../review/customer-intake-mission-control-v1-report.json`, `../review/customer-intake-mission-control-v1-report.md`.

## Workforce Director v1
- Workforce architecture, assignment model, dashboard, and governance guide: `docs/workforce-director-v1.md`.
- Workforce validation command: `npm run workforce:director-v1`.
- Report output paths: `../review/workforce-director-v1-report.json`, `../review/workforce-director-v1-report.md`.

## Executive Planning & Mission Portfolio System v1
- Executive planning architecture, scoring, governance, conversion, and dashboard guide: `docs/executive-planning-system-v1.md`.
- Executive planning validation command: `npm run executive-planning:system-v1`.
- Report output paths: `../review/executive-planning-system-v1-report.json`, `../review/executive-planning-system-v1-report.md`.

## Executive Operations Dashboard v1
- Executive operations dashboard architecture and section contracts: `docs/executive-operations-dashboard-v1.md`.
- Dashboard validation command: `npm run executive:operations-dashboard-v1`.
- Report output paths: `../review/executive-operations-dashboard-v1-report.json`, `../review/executive-operations-dashboard-v1-report.md`.

## Executive Dashboard API v1
- Secure read-only executive dashboard API architecture and contracts: `docs/executive-dashboard-api-v1.md`.
- API test command: `node --test test/executive-dashboard-api-v1.test.js`.
- API validation command: `npm run executive:dashboard-api-v1`.
- Report output paths: `../review/executive-dashboard-api-v1-report.json`, `../review/executive-dashboard-api-v1-report.md`.

## CEO Decision Center v1
- CEO decision workspace architecture and contracts: `docs/ceo-decision-center-v1.md`.
- Test command: `node --test test/ceo-decision-center-v1.test.js`.
- Validation command: `npm run executive:ceo-decision-center-v1`.
- Report output paths: `../review/ceo-decision-center-v1-report.json`, `../review/ceo-decision-center-v1-report.md`.

## Executive Mission Orchestrator v1
- Orchestration architecture, lifecycle state machine, and recovery controls: `docs/executive-mission-orchestrator-v1.md`.
- Test command: `node --test test/executive-mission-orchestrator-v1.test.js`.
- Validation command: `npm run executive:mission-orchestrator-v1`.
- Report output paths: `../review/executive-mission-orchestrator-v1-report.json`, `../review/executive-mission-orchestrator-v1-report.md`.

## Executive Mission Control API v1
- Mission control contracts, RBAC, idempotency, and command audit architecture: `docs/executive-mission-control-api-v1.md`.
- Test command: `node --test test/executive-mission-control-api-v1.test.js`.
- Validation command: `npm run executive:mission-control-api-v1`.
- Report output paths: `../review/executive-mission-control-api-v1-report.json`, `../review/executive-mission-control-api-v1-report.md`.

## Executive Operations Loop v1
- COO-level operational heartbeat contracts, policy, recovery, and telemetry architecture: `docs/executive-operations-loop-v1.md`.
- Dry-run single cycle: `npm run executive:operations-cycle-v1:dry-run`.
- Live-policy single cycle: `npm run executive:operations-cycle-v1:live`.
- Continuous development loop: `npm run executive:operations-loop-v1`.
- Validation command: `npm run executive:operations-loop:v1:validate`.
- Report output paths: `../review/executive-operations-loop-v1-report.json`, `../review/executive-operations-loop-v1-report.md`.

## Persistent Operations Phase II
- Provider-based persistent storage architecture and startup recovery: `docs/persistent-operations-phase2.md`.
- Validation command: `npm run executive:persistent-operations:phase2:validate`.
- Report output paths: `../review/persistent-operations-phase2-report.json`, `../review/persistent-operations-phase2-report.md`.

## Website Production Manager v1
- Production QA and customer delivery package generation architecture: `docs/website-production-manager-v1.md`.
- Validation command: `npm run executive:website-production-manager:v1:validate`.
- Report output paths: `../review/website-production-manager-v1-report.json`, `../review/website-production-manager-v1-report.md`.

## Website Production Execution Pipeline v1
- Staged production execution architecture (orchestrator + QA + revision + delivery): `docs/website-production-execution-pipeline-v1.md`.
- Validation command: `npm run executive:website-production-execution-pipeline:v1:validate`.
- Report output paths: `../review/website-production-execution-pipeline-v1-report.json`, `../review/website-production-execution-pipeline-v1-report.md`.

## Website Business Launch Stack v1
- Atlas website business operating stack (public pages, intake, login, portal tracking, delivery controls, executive visibility): `docs/website-business-launch-stack-v1.md`.
- Validation command: `npm run executive:website-business-launch-stack:v1:validate`.
- Report output paths: `../review/website-business-launch-stack-v1-report.json`, `../review/website-business-launch-stack-v1-report.md`.

## Customer Portal v1
- Production customer intake foundation architecture: `docs/customer-portal-v1.md`.
- Validation command: `npm run executive:customer-portal:v1:validate`.
- Report output paths: `../review/customer-portal-report.json`, `../review/customer-portal-report.md`.

## Customer Identity & Secure Sessions v1
- Production customer authentication/session architecture and governance guide: `docs/customer-identity-secure-session-v1.md`.
- Validation command: `npm run executive:customer-identity-secure-session:v1:validate`.
- Report output paths: `../review/customer-identity-secure-session-v1-report.json`, `../review/customer-identity-secure-session-v1-report.md`.
