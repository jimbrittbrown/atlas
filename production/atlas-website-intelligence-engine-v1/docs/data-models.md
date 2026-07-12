# Data Models

## Company Research Module
- `websiteUrl`
- `companyName`
- `logo`
  - `assetId`
  - `assetPath`
  - `sourceUrl`
- `primaryColors[]`
- `contactInformation`
  - `phone`
  - `email`
  - `website`
  - `address`
- `serviceList[]`
- `serviceAreas[]`
- `existingMessaging`
- `certifications[]`
- `financingOptions[]`
- `existingReviews[]`
  - `source`
  - `reviewer`
  - `rating`
  - `quote`
  - `reviewUrl`
- `socialLinks`
- `images[]`
  - `assetId`
  - `assetPath`
  - `sourceUrl`
  - `caption`

## Confidence Engine Output
- `aggregateScore` (0.00-1.00)
- `aggregateBand` (HIGH|MEDIUM|LOW)
- `scores[]`
  - `field`
  - `score`
  - `band`
  - `uncertain`
- `uncertainFields[]`

## Brand Asset Package (Production Compatible)
- `clientId`
- `companyName`
- `logoAsset`
- `brandColors[]`
- `contactInformation`
- `serviceAreas[]`
- `services[]`
- `existingReviews[]`
- `certificationsLicenses[]`
- `financingOptions[]`
- `existingPhotography[]`
- `socialLinks`
- `notes`

## Asset Validation Report
- `requiredAssetFields[]`
- `missingAssets[]`
- `findings[]`
  - `field`
  - `severity`
  - `message`
- `isComplete`
- `blocked`

## Executive Summary
- `businessOverview`
- `brandStrengths[]`
- `missingAssets[]`
- `customizationReadinessScore` (0-100)
- `readinessClassification` (READY|CONDITIONAL|NOT_READY)
