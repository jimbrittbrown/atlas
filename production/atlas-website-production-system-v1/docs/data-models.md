# Data Models

## Website Template Registry Entry
- `templateId`: canonical template identifier (example: `ROOFING_V1`).
- `templateFamily`: industry or category family.
- `displayName`: human-readable template name.
- `industry`: target vertical.
- `status`: DRAFT | APPROVED | DEPRECATED.
- `activeVersion`: current version to use for production.
- `versionHistory[]`:
  - `version`
  - `approvedAt`
  - `approvedBy`
  - `releaseNotes`
  - `templatePath`
  - `requiredPages[]`
  - `status`
  - `layoutLockHash`
  - `metadata`

## Client Branding Package
- `clientId`
- `companyName`
- `existingLogo`
  - `assetId`
  - `assetPath`
  - `assetType`
  - `overwriteApproved`
- `brandColors[]`
- `contactInformation`
  - `phone`
  - `email`
  - `website`
  - `address`
- `serviceAreas[]`
- `services[]`
- `existingReviews[]`
  - `source`
  - `reviewer`
  - `rating`
  - `quote`
- `certificationsLicenses[]`
- `financingOptions[]`
- `existingPhotography[]`
  - `assetId`
  - `assetPath`
  - `caption`
  - `approved`

## Website Customization Job
- `jobId`
- `clientId`
- `templateId`
- `templateVersion`
- `brandingPackageId`
- `preserveLayout` (must be true)
- `requestedLogoOverwrite`
- `replacementMap` (content mapping set)
- `status`: PENDING | IN_PROGRESS | COMPLETE | BLOCKED
- `generatedArtifactPath`

## Website QA Report
- `qaReportId`
- `jobId`
- `clientId`
- `templateId`
- `status`: PASS | WARN | FAIL
- `checks[]`
  - `name`
  - `status`
  - `findings[]`
  - `evidence`

Required check names:
- `NO_PLACEHOLDERS`
- `BRANDING_CONSISTENCY`
- `CONTACT_CONSISTENCY`
- `CTA_CONSISTENCY`
- `RESPONSIVE_READINESS`
- `MISSING_ASSETS`
- `BROKEN_LINKS`
- `REQUIRED_PAGES_PRESENT`

## Delivery Package
- `deliveryId`
- `clientId`
- `jobId`
- `websitePackagePath`
- `qaReportPath`
- `launchChecklistPath`
- `clientHandoffSummaryPath`
- `status`: READY | BLOCKED | DELIVERED
- `deliveredAt`
