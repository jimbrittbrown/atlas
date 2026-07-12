# Module 1: Opening Hooks Evaluation Methodology

## Evaluation Goal
Measure opening-hook skill quality independently from full-documentary performance.

## Primary Metrics
1. openingStrength (critical)
- Measures immediacy of stakes and consequence framing.

2. curiosity
- Measures unresolved question pressure and continuation pull.

3. audienceCommitment
- Measures whether the hook gives a compelling reason to continue watching.

## Composite Hook Skill Score
Weighted formula:
- openingStrength: 55%
- curiosity: 25%
- audienceCommitment: 20%

HookSkillScore = 0.55 * openingStrength + 0.25 * curiosity + 0.20 * audienceCommitment

## Bands
- ELITE: HookSkillScore >= 9 and openingStrength >= 9
- DEVELOPING: HookSkillScore 7.0-8.99
- FAIL: HookSkillScore < 7 or openingStrength < 7

## Candidate Evaluation Record
Each hook evaluation includes:
- candidateId
- strategy
- hook text
- hookSkillScore
- storytelling category scores
- classification
- success analysis
- improvement recommendations

## Ranking Rules
1. Descending HookSkillScore
2. Descending openingStrength
3. Stable deterministic ID order

## Weakness Detection Rules
A weakness is counted when:
- openingStrength < 9
- curiosity < 9
- audienceCommitment < 9

Recurring weaknesses are sorted by frequency and mapped to coaching priority.

## Consistency Validation
The module validates capability maturation by requiring repeated elite outcomes over consecutive cycles, not a single best-case result.
