# Atlas Website Production System v1

## Purpose
Build a repeatable production system that turns one approved demonstration website template into a scalable client-delivery engine.

This package defines production architecture only. It does not generate or deploy website UI directly.

## Included Components
1. Website Template Registry
2. Client Branding Package
3. Website Customization Engine
4. Website QA Engine
5. Delivery Package Generator

## System Modules
- `contracts/website-production-system-contracts.js`
  - Canonical data models and validation contracts.
- `website-production-system-manager.js`
  - Pipeline orchestration for registry, branding, customization, QA, and delivery.
- `seed-data/website-template-registry.json`
  - Initial approved template registry entry with Roofing v1.
- `docs/architecture.md`
  - Production architecture and service boundaries.
- `docs/data-models.md`
  - Data model definitions and field-level semantics.
- `docs/workflow.md`
  - End-to-end workflow and phase gates.
- `docs/folder-structure.md`
  - Folder structure for scale.
- `docs/governance-rules.md`
  - Governance and change-control constraints.

## How To Use
1. Register or update approved templates in the registry.
2. Ingest client branding package with required business inputs.
3. Generate customization plan with layout lock enabled.
4. Run QA checks and block delivery if any check fails.
5. Generate delivery package when QA passes.

## Key Constraint
Client logos must never be overwritten unless explicit approval is recorded in the branding package (`existingLogo.overwriteApproved=true`).
