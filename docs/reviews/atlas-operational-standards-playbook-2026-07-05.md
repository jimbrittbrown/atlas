# Atlas Operational Standards Playbook

Date: 2026-07-05
Status: OPERATIONAL PLAYBOOK
Scope: Reusable standards framework for Atlas operational decision-making

## Purpose
Provide the reusable playbook that defines how Atlas judges operational health using measurable standards.

## Health States
- Healthy
- Warning
- Critical
- Recovery

## Decision Rule
Operational decisions should be based on measurable evidence rather than subjective judgment.

## Required Standard Families
- Service health standards
- SLOs
- SLIs
- Alert thresholds
- Error budgets
- Minimum operational dashboard standards

## Mandatory Operational Dashboard Panels
- Businesses
- Workers
- Active workflows
- Pending approvals
- Alerts
- Metrics
- Revenue
- Institute recommendations

## Escalation Rule
When launch-critical SLOs or error budgets are breached, expansionary actions pause until required decision authorities review the condition.

## Manual Continuity Rule
- Approval interruption triggers manual approval continuity only for bounded containment or explicitly authorized launch-critical progression.
- Atlas Institute outage triggers delayed-ingest learning mode until manual records are ingested after restoration.
- Metrics outage triggers manual evidence mode before any launch-critical progression continues.

## Standardization Intent
This playbook is intended to become part of the Atlas Operating Manual.
