# Atlas Strategic Ideas Registry v0.1

## Purpose

Atlas Strategic Ideas Registry v0.1 is a bounded institutional-memory service for recording strategic ideas and decisions so they are reviewed instead of forgotten. It stores opportunities, deferred initiatives, architecture backlog items, strategic decisions, lessons learned, and rejected ideas with durable history.

This registry is not the full Executive Knowledge Platform. It provides durable capture, governance-safe updates, and review-oriented queries using existing Atlas persistence patterns.

## Entry Types

- OPPORTUNITY
- NOT_YET
- STRATEGIC_DECISION
- ARCHITECTURE_BACKLOG
- PRODUCT_EVOLUTION
- LESSON_LEARNED
- REJECTED_IDEA

## Statuses

- CAPTURED
- EVALUATING
- DEFERRED
- PLANNED
- ACTIVE
- COMPLETED
- REJECTED
- ARCHIVED

## Status Transitions

Legal transitions:

- CAPTURED -> EVALUATING
- CAPTURED -> DEFERRED
- CAPTURED -> REJECTED
- EVALUATING -> DEFERRED
- EVALUATING -> PLANNED
- EVALUATING -> REJECTED
- DEFERRED -> EVALUATING
- DEFERRED -> PLANNED
- PLANNED -> ACTIVE
- ACTIVE -> COMPLETED
- Any non-completed state -> ARCHIVED when explicitly authorized

Rejected ideas may be reconsidered only via explicit reconsideration transition to EVALUATING with preserved rejection reason and append-only reconsideration history.

## Recording Guidance

Each entry should capture:

- why it matters
- current status
- why it is deferred or active
- prerequisites/dependencies
- suggested review trigger

Entry IDs and creation metadata are immutable. Updates require version-checked compare-and-set and append immutable history records.

## Decisions and Rejection Preservation

Decision, deferral, and rejection rationale are preserved in entry fields and append-only history records.

- rejection reason is never erased by reconsideration
- every change writes a history entry
- no hard-delete operation is provided
- archival preserves evidence and history

## Recommended Review Cadence

- brief monthly review
- deeper quarterly executive review
- dependency-triggered reconsideration when major platform milestones complete

## Relationship to Future Executive Knowledge Platform

Strategic Ideas Registry v0.1 is a foundational memory substrate for strategic capture and periodic review. The future Executive Knowledge Platform can build on this durable registry without replacing its historical evidence model.
