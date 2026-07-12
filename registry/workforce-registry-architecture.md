# Atlas Workforce Registry Architecture

## Purpose
Atlas Workforce Registry is the permanent source of truth for every AI specialist Atlas knows about, connected or not.

## Core Principle
Atlas does not hard-code preferred providers. Category hiring decisions must query Workforce Registry champion standings.

## Core Components
1. Specialist Record Schema
- Canonical specialist profile with benchmark, performance, employment, and historical fields.

2. Workforce Manager
- Handles specialist lifecycle: register, connect, benchmark state transitions, promotion/demotion, retirement.

3. Category Standing Engine
- Maintains current champion, runner-up, and other candidates for each category.

4. Workforce Dashboard Model
- Computes executive view across headcount, standings, schedule, and recent events.

5. Benchmark Scheduler
- Tracks benchmark cadence per category and produces due-category queue.

## Employment Status Lifecycle
- Candidate -> Connected -> Benchmarking -> Active -> Champion / Runner-up
- Champion / Runner-up -> Active (on demotion)
- Any status -> Retired / Deprecated (on retirement/deprecation)

## Initial Categories
- Research
- Long-form Writing
- Editing
- Fact Verification
- Narration
- Image Generation
- Video Generation
- Music
- Translation
- Coding
- Data Analysis
- Marketing Copy
- SEO
- Publishing
- Analytics

## Promotion / Demotion Rules
- Champion: highest benchmark score in category among benchmarked specialists.
- Runner-up: second highest benchmark score in category.
- Demotion: previous champion/runner-up becomes Active when surpassed.
- Protected statuses: Retired/Deprecated are excluded from promotion.

## Hiring Workflow
1. Query category standing.
2. Select current champion if available.
3. If no champion, return no-hire recommendation and trigger benchmarking.

## Retirement Workflow
- Retire for operational or strategic reasons.
- Deprecate for security/discontinuation/contract-ended reasons.
- Retirement disconnects specialist and stops active benchmark participation.

## Benchmark Scheduling Strategy
- Baseline cadence: every 30 days per category.
- Recalculate next due date after each benchmark completion.
- Workforce manager can list due categories for automated scheduling.

## Extensibility
- Category-agnostic model supports future specialist domains without framework redesign.
- Benchmark history and event log preserve executive auditability.
