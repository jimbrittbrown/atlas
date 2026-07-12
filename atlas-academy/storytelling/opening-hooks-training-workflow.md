# Module 1: Opening Hooks Training Workflow

## Objective
Train Atlas to produce documentary openings that consistently score 9-10 for opening-hook performance before full-documentary use.

## Training Input
- One fixed research package per training run.
- Same package reused across cycles to isolate skill growth from topic variance.

## Workflow
1. Generate hook candidates
- Produce multiple opening hooks from the same research package.
- Use varied strategies: consequence-first, unresolved accountability, timeline pressure, human stakes, evidence gap.

2. Score each hook
- Evaluate each candidate with the storytelling scoring system.
- Compute hook skill score with emphasis on openingStrength, curiosity, and audienceCommitment.

3. Explain outcomes
- For each candidate, output success/failure analysis:
  - Why the opening worked.
  - Why the opening failed.
  - Which sub-scores limited performance.

4. Rank hooks
- Sort all candidates by hook skill score.
- Preserve tie-breaker on openingStrength, then deterministic ID order.

5. Detect recurring weaknesses
- Aggregate weakness frequencies for openingStrength, curiosity, and audienceCommitment.
- Classify coaching priority from recurrence intensity.

6. Produce coaching guidance
- Output drill-based coaching instructions linked to the top weakness category.
- Include exemplar pattern from the best-performing hook.

7. Repeat cycle
- Run the same workflow again on the same research package.
- Stop only when target score consistency is achieved or max cycles reached.

## Stop Conditions
- CONSISTENT_TARGET_ACHIEVED: top hook score >= target for required consecutive cycles.
- MAX_CYCLES_REACHED: target consistency not achieved within cycle budget.

## Output Artifacts Per Cycle
- rankedHooks
- topHook
- recurringWeaknesses
- coachingGuidance
- cycle score report

## Implementation
- Runtime class: integration/src/academy/opening-hook-training-workflow.js
- Test coverage: integration/test/opening-hook-training-workflow.test.js
