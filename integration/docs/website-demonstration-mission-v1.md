# Atlas Website Demonstration Mission v1

## Objective

Run Atlas end-to-end demonstration workflow against a real public website URL, execute sandbox-only website build orchestration, and produce an executive review package while preserving all governance controls.

## Mission Flow

1. Receive website URL
2. Website Intelligence Engine researches business
3. Generate Executive Intelligence Report
4. Generate Brand Package
5. Select optimal Website Template
6. Generate complete Website Customization Package
7. Execute Website Builder Mission
8. Produce Framer Sandbox build instructions
9. Stop automatically before publish
10. Generate Executive Review Package

## Governance Rules Preserved

- No publish
- No deploy
- No destructive operations
- Stop before publish
- CEO approval remains required before any publishing path

## Delivered Modules

- Demonstration mission contracts: `src/executive/website-demonstration-mission-contracts.js`
- Demonstration mission manager: `src/executive/website-demonstration-mission-manager.js`
- Executive review package generator: `src/executive/website-demonstration-review-package-generator.js`
- Validation runner: `scripts/run-website-demonstration-mission-v1.js`

## Executive Review Package Fields

- Business Summary
- Existing Website Analysis
- Brand Package
- Messaging Strategy
- Selected Template
- Screenshot references
- Customization Summary
- Sandbox execution summary
- QA report
- Confidence score
- CEO approval recommendation

## Validation

Run tests:

```bash
node --test test/website-demonstration-mission-manager.test.js
```

Run mission validation:

```bash
npm run website:demonstration-mission-v1
```

Outputs:

- `review/website-demonstration-mission-v1-report.json`
- `review/website-demonstration-mission-v1-report.md`

Optional target URL:

```bash
ATLAS_DEMO_WEBSITE_URL=https://www.example.com npm run website:demonstration-mission-v1
```
