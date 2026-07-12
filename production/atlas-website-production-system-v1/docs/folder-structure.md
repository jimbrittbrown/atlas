# Folder Structure

## Recommended Layout

- `production/atlas-website-production-system-v1/`
- `production/atlas-website-production-system-v1/contracts/`
- `production/atlas-website-production-system-v1/seed-data/`
- `production/atlas-website-production-system-v1/docs/`
- `production/atlas-website-production-system-v1/test/`

## Scale-Ready Expansion

- `templates/`
  - `roofing/v1/`
  - `roofing/v2/`
  - `solar/v1/`
- `clients/`
  - `CLIENT_A/branding-package.json`
  - `CLIENT_A/customization-jobs/`
  - `CLIENT_A/qa-reports/`
  - `CLIENT_A/delivery/`
- `artifacts/`
  - `websites/`
  - `qa/`
  - `checklists/`
  - `handoff/`

## Current v1 Scope
The current package defines architecture and validation contracts only.
Template rendering and deployment executors can be added in future versions without breaking the existing data contracts.
