# Atlas Website Orchestrator v1

## Purpose

Atlas Website Orchestrator v1 defines an executive mission pipeline that coordinates website intelligence, production, quality assurance, approval governance, publishing, and delivery packaging as one automated workflow.

## Workflow Stages

1. Prospect Approved
2. Company Research
3. Brand Package Generation
4. Template Selection
5. Website Generation
6. QA
7. Executive Preview
8. CEO Approval Gate
9. Publish
10. Delivery Package

All stages support recovery controls:

- Retry
- Resume
- Rollback
- Failure logging

## Mission State Machine

Supported mission states:

- WAITING
- RUNNING
- FAILED
- REVISION_REQUIRED
- READY_FOR_APPROVAL
- APPROVED
- PUBLISHED
- DELIVERED

State progression summary:

- WAITING -> RUNNING
- RUNNING -> READY_FOR_APPROVAL | REVISION_REQUIRED | FAILED
- READY_FOR_APPROVAL -> APPROVED | REVISION_REQUIRED | FAILED
- APPROVED -> PUBLISHED | FAILED
- PUBLISHED -> DELIVERED | FAILED

## Governance Rules

1. Publishing always requires CEO approval.
2. Website modifications preserve existing branding unless explicit branding-change approval is present.

## Provider-Agnostic Integration Architecture

The orchestrator resolves provider adapters through `WebsiteProviderAdapterRegistry` and does not depend on any single website provider implementation.

Prepared adapter types:

- FRAMER
- WEBFLOW
- WORDPRESS
- OTHER (specialist pool)

Required provider adapter contract methods:

- `researchCompany`
- `generateBrandPackage`
- `selectTemplate`
- `generateWebsite`
- `publishWebsite`
- `buildDeliveryPackage`

## Executive Dashboard Contract

The orchestrator exposes an executive dashboard payload with:

- Current stage
- Completion %
- Warnings
- Confidence
- Blocking issues
- Estimated completion

## Source Files

- `integration/src/executive/website-orchestrator-contracts.js`
- `integration/src/executive/website-provider-adapters.js`
- `integration/src/executive/website-orchestrator.js`
- `integration/src/executive/website-orchestrator-dashboard.js`
- `integration/test/website-orchestrator.test.js`
