# Architecture

## Objective
Transform a single approved website template into a controlled, repeatable multi-client delivery system.

## High-Level Architecture

### 1) Website Template Registry
- Stores approved templates and version history.
- Controls active version selection per template family.
- Locks baseline layout structure through `layoutLockHash`.

### 2) Client Branding Package
- Stores all client-specific business data required for customization:
  - Company name
  - Existing logo
  - Brand colors
  - Contact information
  - Service areas
  - Services
  - Existing reviews
  - Certifications and licenses
  - Financing options
  - Existing photography

### 3) Website Customization Engine
- Applies branding package onto an approved template version.
- Preserves template layout and page structure (`preserveLayout=true`).
- Replaces business-specific content only.
- Blocks any logo replacement unless explicit approval exists.

### 4) Website QA Engine
Validates delivery readiness through mandatory checks:
- No placeholder content remains.
- Branding consistency.
- Contact information consistency.
- CTA consistency.
- Responsive readiness.
- Missing assets.
- Broken links.
- Required pages present.

### 5) Delivery Package Generator
Produces final delivery artifacts:
- Website package
- QA report
- Launch checklist
- Client handoff summary

## Service Boundaries
- Registry boundary: template metadata and version governance only.
- Branding boundary: client inputs and asset references only.
- Customization boundary: mapping and content substitution only.
- QA boundary: validation, defect reporting, and pass/fail gate.
- Delivery boundary: packaging and handoff artifact creation.

## Scaling Model
- Multi-template support through template IDs and version history.
- Multi-client support through isolated branding package records.
- Multi-delivery support through job IDs, QA report IDs, and delivery IDs.
- Governance-first operation with strict stage gates before delivery.
