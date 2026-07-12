# Atlas Web Technical Requirements

## Scope
Provider-neutral production requirements for website specialist execution. No tool, platform, or account selection is included.

## Responsive Design
- Must render correctly on desktop, tablet, and mobile breakpoints.
- No horizontal scrolling at standard viewport widths.
- Core CTA remains visible and accessible across breakpoints.

## Accessibility
- Meet WCAG 2.1 AA baseline for contrast, keyboard navigation, semantics, and focus visibility.
- Form fields require explicit labels and accessible error messaging.
- Images require meaningful alt text where informational.

## Form Validation and Submission
- Client-side and server-side validation readiness.
- Clear error states and correction hints.
- Confirmation state after successful submission.
- Spam-protection readiness (honeypot, captcha-ready, or equivalent non-provider-specific mechanism).

## CRM Handoff Readiness
- Form payload structure must support downstream CRM mapping.
- Field names and validation schema must be documented.
- Submission timestamp and source metadata must be capturable.

## Analytics Integration Readiness
- Event naming plan must be implementable without platform lock-in.
- Key events: CTA click, proof interaction, form start, form submit, form error, contact interaction.
- Data layer or equivalent structured event contract should be ready.

## SEO Fundamentals
- Unique page titles and meta descriptions.
- Heading hierarchy per page.
- Clean URL structure.
- Indexability controls and canonical readiness.
- Structured internal linking between core pages.

## Social Metadata
- Open Graph and Twitter/X card readiness for each primary page.
- Default share image and page-specific override support.

## Performance
- Core page experience optimized for fast first load on mobile.
- Control layout shift and heavy script usage.
- Defer non-critical assets.

## Image Optimization
- Responsive image sizing and modern formats where supported.
- Compression pipeline readiness.
- Lazy-load non-critical media.

## Security
- HTTPS-ready deployment requirement.
- Basic security headers readiness.
- Form endpoints protected against common abuse patterns.

## Privacy and Cookies
- Privacy statement presence required.
- Cookie handling mechanism required if tracking technologies trigger consent obligations.
- No hidden data collection language.

## Domain Connection Readiness
- DNS and SSL readiness requirements documented.
- Rollback plan required for go-live.

## Maintainability
- Reusable section/component structure.
- Clear content ownership model.
- Update-friendly architecture for non-technical content edits.

## Content Editing Readiness
- Editable text, media, and CTA labels without code change.
- Content model must support Demonstration Projects updates and disclosure consistency.

## Browser Testing
- Validate current and recent major versions of Chrome, Safari, Edge, Firefox.
- Validate iOS and Android mobile browser behavior.
- Resolve critical rendering and interaction discrepancies before approval.

## Hard Constraints
- No provider account setup.
- No integrations connected.
- No publishing.
- No production deployment.
