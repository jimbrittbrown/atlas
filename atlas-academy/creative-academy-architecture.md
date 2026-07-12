# Atlas Creative Academy Architecture

## Mission
Atlas Creative Academy improves professional storytelling capabilities through deliberate practice modules before those skills are applied to full documentary production.

## Scope Boundary
- Academy trains isolated skills, not full documentaries.
- Atlas Studios production pipeline remains unchanged.
- No new creative roles are introduced.

## System Layers
1. Skill Module Layer
- One module per capability (for example Opening Hooks, Curiosity Pacing, Reveal Timing).
- Each module has generation, scoring, diagnosis, coaching, and repeat loop.

2. Practice Runtime Layer
- Runs repeated controlled exercises on the same research package.
- Produces cycle-level score trend, weakness trend, and coaching progression.

3. Capability Ledger Layer
- Stores skill baselines, best exemplars, recurring weaknesses, and readiness flags.
- Exposes transfer artifacts for Atlas Studios handoff.

4. Transfer Bridge Layer
- Converts Academy outcomes into advisory constraints for production preparation.
- Starts as advisory-first, then can become gate-based after validation.

## Module Contract
Each Academy module must output:
- Candidate set generated from one source package.
- Ranked score table.
- Success/failure explanations per candidate.
- Recurring weakness summary.
- Coaching guidance for next cycle.
- Consistency status against target threshold.

## Module 1 Anchor
- Module: Opening Hooks
- Target capability: opening hooks that consistently score 9-10 on the Atlas Documentary Storytelling Gold Standard dimensions relevant to opening performance.
- Current implementation: integration/src/academy/opening-hook-training-workflow.js

## Governance Rules
- Academy modules do not rewrite production architecture.
- Academy modules do not alter scoring definitions.
- Academy modules do not bypass editorial integrity requirements.
- Skills must be validated in isolation before production transfer.

## Readiness Definition
A skill is Academy-ready for transfer when:
- Target score threshold is met for consecutive cycles.
- Recurring weakness frequency is reduced to low/none.
- Coaching guidance shifts from corrective to maintenance mode.
