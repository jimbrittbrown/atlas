# Website Production Manager v1

## Purpose

Atlas Website Production Manager v1 accepts completed Framer sandbox projects and produces a governance-safe customer delivery package without publishing, deploying, or destructive actions.

## Reused Architecture

- Mission Control
- Executive Planning
- Executive Dashboard
- Website Executive Review Package generator
- Website Builder Mission pipeline
- Workforce Director
- Persistent storage provider boundary
- Operations Loop

## QA Coverage

The manager performs automated production QA checks for:

- required page verification
- navigation verification
- branding consistency checks
- responsive layout verification
- missing asset detection
- broken component detection
- screenshot capture task generation
- QA scoring

## Delivery Package

Each review produces a customer delivery package that contains:

- executive summary
- completed website overview
- QA results
- screenshot references
- recommended revisions
- confidence score
- delivery checklist

## Governance

v1 is read-only and package-generation only:

- no publish
- no deploy
- no destructive actions
- no production overwrite
- stop state is always `AWAITING_CEO_APPROVAL`

## API and Dashboard

- Dashboard snapshot includes `websiteProduction`.
- Read-only endpoint: `GET /api/v1/website-production`.
- Viewer, Executive, and CEO roles can read website production status.

## Validation

- Tests: `node --test test/website-production-manager-v1.test.js`
- Validation runner: `npm run executive:website-production-manager:v1:validate`
- Report output paths:
  - `../review/website-production-manager-v1-report.json`
  - `../review/website-production-manager-v1-report.md`
