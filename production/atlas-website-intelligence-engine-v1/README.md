# Atlas Website Intelligence Engine v1

## Objective
Build the intelligence layer that prepares client data for the Website Production System.

This package performs research extraction, confidence scoring, asset validation, and executive summarization.

It does not customize websites.

## Outputs
1. Company Research Module
2. Brand Asset Package (compatible with Website Production System)
3. Asset Validation Report
4. Confidence Engine Report
5. Executive Summary

## Main Files
- `contracts/website-intelligence-contracts.js`
- `website-intelligence-engine-manager.js`
- `seed-data/sample-company-research-input.json`
- `seed-data/sample-intelligence-output.json`
- `docs/architecture.md`
- `docs/data-models.md`
- `docs/workflow.md`
- `docs/governance-rules.md`

## Compatibility
The generated `brandAssetPackage` aligns with the Website Production System branding payload shape:
- `companyName`
- `logoAsset`
- `brandColors`
- `contactInformation`
- `serviceAreas`
- `services`
- `existingReviews`
- `certificationsLicenses`
- `financingOptions`
- `existingPhotography`

## Guardrail
Logo overwrite is always defaulted to `false` in the generated brand asset package.
