import { StorytellingEvaluator } from '../production/storytelling-evaluator.js';

export class OpeningHookTrainingWorkflow {
  constructor({
    storytellingEvaluator = null,
    targetHookScore = 9,
    consistencyTarget = 3,
    maxTrainingCycles = 12,
    candidateCount = 6
  } = {}) {
    this.storytellingEvaluator = storytellingEvaluator ?? new StorytellingEvaluator();
    this.targetHookScore = Number.isFinite(targetHookScore) ? targetHookScore : 9;
    this.consistencyTarget = Number.isFinite(consistencyTarget) ? consistencyTarget : 3;
    this.maxTrainingCycles = Number.isFinite(maxTrainingCycles) ? maxTrainingCycles : 12;
    this.candidateCount = Number.isFinite(candidateCount) ? candidateCount : 6;
  }

  runTrainingCycle({ researchPackage = {}, cycle = 1 } = {}) {
    const candidates = this.generateHookCandidates({ researchPackage, cycle });
    const evaluated = candidates.map(candidate => this.evaluateHookCandidate({ candidate }));
    const ranked = this.rankHookEvaluations(evaluated);
    const recurringWeaknesses = this.identifyRecurringWeaknesses(ranked);
    const coachingGuidance = this.buildCoachingGuidance({ recurringWeaknesses, ranked });

    return {
      cycle,
      candidateCount: ranked.length,
      rankedHooks: ranked,
      topHook: ranked[0] ?? null,
      recurringWeaknesses,
      coachingGuidance
    };
  }

  runUntilConsistentTarget({ researchPackage = {} } = {}) {
    const cycleHistory = [];
    let consistentPasses = 0;

    for (let cycle = 1; cycle <= this.maxTrainingCycles; cycle += 1) {
      const cycleResult = this.runTrainingCycle({ researchPackage, cycle });
      cycleHistory.push(cycleResult);

      const topScore = Number(cycleResult?.topHook?.hookSkillScore ?? 0);
      if (topScore >= this.targetHookScore) {
        consistentPasses += 1;
      } else {
        consistentPasses = 0;
      }

      if (consistentPasses >= this.consistencyTarget) {
        return this.buildTrainingReport({
          cycleHistory,
          stopReason: 'CONSISTENT_TARGET_ACHIEVED',
          consistencyTarget: this.consistencyTarget
        });
      }
    }

    return this.buildTrainingReport({
      cycleHistory,
      stopReason: 'MAX_CYCLES_REACHED',
      consistencyTarget: this.consistencyTarget
    });
  }

  buildTrainingReport({ cycleHistory = [], stopReason = 'MAX_CYCLES_REACHED', consistencyTarget = 3 } = {}) {
    const firstCycleTopScore = Number(cycleHistory?.[0]?.topHook?.hookSkillScore ?? 0);
    const finalCycleTopScore = Number(cycleHistory?.[cycleHistory.length - 1]?.topHook?.hookSkillScore ?? 0);
    const recurringWeaknesses = this.identifyRecurringWeaknessesAcrossCycles(cycleHistory);

    return {
      module: 'Atlas Creative Academy - Module 1: Opening Hooks',
      trainingScope: 'Opening hooks only',
      stopReason,
      cyclesCompleted: cycleHistory.length,
      targetHookScore: this.targetHookScore,
      consistencyTarget,
      initialTopHookScore: firstCycleTopScore,
      finalTopHookScore: finalCycleTopScore,
      scoreDelta: Number((finalCycleTopScore - firstCycleTopScore).toFixed(2)),
      recurringWeaknesses,
      cycleHistory,
      transferPlan: this.buildIntegrationTransferPlan({ finalCycle: cycleHistory[cycleHistory.length - 1] ?? null })
    };
  }

  normalizeResearchPackage(researchPackage = {}) {
    const highestStoryValueFacts = Array.isArray(researchPackage?.highestStoryValueFacts)
      ? researchPackage.highestStoryValueFacts
      : [];
    const verifiedDocumentaryFacts = Array.isArray(researchPackage?.verifiedDocumentaryFacts)
      ? researchPackage.verifiedDocumentaryFacts
      : [];

    return {
      summary: String(researchPackage?.summary ?? '').trim(),
      highestStoryValueFacts,
      verifiedDocumentaryFacts
    };
  }

  collectEvidenceAnchors(researchPackage = {}) {
    const normalized = this.normalizeResearchPackage(researchPackage);

    const fromHighestValue = normalized.highestStoryValueFacts
      .map(item => String(item?.findingText ?? item?.fact ?? item?.claim ?? '').trim())
      .filter(Boolean);

    const fromVerified = normalized.verifiedDocumentaryFacts
      .map(item => String(item?.fact ?? item?.findingText ?? '').trim())
      .filter(Boolean);

    const merged = [...fromHighestValue, ...fromVerified];

    if (merged.length > 0) {
      return merged.slice(0, 8);
    }

    const summary = normalized.summary;
    if (summary.length > 0) {
      return [summary];
    }

    return ['Institutional decisions created consequences that became visible too late.'];
  }

  generateHookCandidates({ researchPackage = {}, cycle = 1 } = {}) {
    const anchors = this.collectEvidenceAnchors(researchPackage);
    const lead = anchors[0] ?? 'A high-stakes institutional decision changed everything.';
    const support = anchors[1] ?? 'Warnings were visible before the outcome became irreversible.';

    const templates = [
      {
        strategy: 'consequence-first',
        compose: () => `${lead} The consequence arrived before the public understood the cause. What was ignored when the warning was still small?`
      },
      {
        strategy: 'unresolved-accountability',
        compose: () => `${lead} By the time officials responded, the cost had already spread. Who chose delay, and why did that choice survive scrutiny?`
      },
      {
        strategy: 'timeline-pressure',
        compose: () => `${support} The timeline looked manageable until one decision compressed every margin. Which moment made disaster mathematically likely?`
      },
      {
        strategy: 'human-stakes',
        compose: () => `${lead} This was never only about systems. It was about people paying for decisions they did not make. What did leadership know before the point of no return?`
      },
      {
        strategy: 'evidence-gap',
        compose: () => `${lead} The documents were clear, the signals were visible, and the risk was measurable. So why did action come after consequence instead of before it?`
      },
      {
        strategy: 'counterfactual',
        compose: () => `${support} One earlier decision could have changed the ending. Which warning would have mattered if it had been treated as non-negotiable?`
      },
      {
        strategy: 'narrative-contrast',
        compose: () => `${lead} Public language promised control while private evidence described escalating fragility. Where did that contradiction first become undeniable?`
      },
      {
        strategy: 'curiosity-gap',
        compose: () => `${lead} Everyone saw the event. Fewer people saw the sequence that made it unavoidable. What was set in motion long before the headline moment?`
      }
    ];

    const selected = templates.slice(0, Math.max(2, this.candidateCount));

    return selected.map((template, index) => ({
      candidateId: `HOOK-${String(cycle).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      strategy: template.strategy,
      hook: this.cleanHook(template.compose())
    }));
  }

  evaluateHookCandidate({ candidate = {} } = {}) {
    const hook = String(candidate?.hook ?? '').trim();
    const storytelling = this.storytellingEvaluator.evaluate(hook);
    const scores = storytelling?.scores ?? {};

    const hookSkillScore = Number((
      Number(scores?.openingStrength ?? 0) * 0.55
      + Number(scores?.curiosity ?? 0) * 0.25
      + Number(scores?.audienceCommitment ?? 0) * 0.2
    ).toFixed(2));

    return {
      candidateId: candidate?.candidateId ?? null,
      strategy: candidate?.strategy ?? 'unknown',
      hook,
      hookSkillScore,
      storytellingScores: scores,
      overallStorytellingScore: Number(storytelling?.overallScore ?? 0),
      classification: this.classifyHookSkill({ hookSkillScore, scores }),
      successAnalysis: this.explainHookOutcome({ hookSkillScore, scores, hook }),
      improvementRecommendations: this.buildHookImprovementRecommendations({ scores, storytelling })
    };
  }

  classifyHookSkill({ hookSkillScore = 0, scores = {} } = {}) {
    if (Number(scores?.openingStrength ?? 0) < 7) return 'FAIL';
    if (hookSkillScore >= 9) return 'ELITE';
    if (hookSkillScore >= 7) return 'DEVELOPING';
    return 'FAIL';
  }

  explainHookOutcome({ hookSkillScore = 0, scores = {}, hook = '' } = {}) {
    const reasons = [];

    if (Number(scores?.openingStrength ?? 0) >= 9) {
      reasons.push('Opening establishes immediate stakes with strong documentary authority.');
    } else if (Number(scores?.openingStrength ?? 0) >= 7) {
      reasons.push('Opening is clear but still lacks elite-level immediacy or consequence framing.');
    } else {
      reasons.push('Opening does not establish high-stakes relevance fast enough.');
    }

    if (Number(scores?.curiosity ?? 0) >= 8) {
      reasons.push('Curiosity is sustained through unresolved accountability pressure.');
    } else {
      reasons.push('Curiosity gap is not yet strong enough to force continuation.');
    }

    if (Number(scores?.audienceCommitment ?? 0) >= 8) {
      reasons.push('Audience commitment is reinforced with continuation motive.');
    } else {
      reasons.push('Continuation reason is present but not yet durable at professional level.');
    }

    if (hook.length < 120) {
      reasons.push('Hook may be too short to establish both consequence and unresolved question.');
    }

    reasons.push(`Composite opening-hook skill score: ${hookSkillScore}.`);

    return reasons;
  }

  buildHookImprovementRecommendations({ scores = {}, storytelling = {} } = {}) {
    const recommendations = [];

    if (Number(scores?.openingStrength ?? 0) < 9) {
      recommendations.push('Move consequence language into the first sentence and increase immediacy.');
    }

    if (Number(scores?.curiosity ?? 0) < 9) {
      recommendations.push('Introduce one unresolved accountability question that cannot be answered immediately.');
    }

    if (Number(scores?.audienceCommitment ?? 0) < 9) {
      recommendations.push('Add a concrete reason the audience must keep watching beyond the opening line.');
    }

    const generic = Array.isArray(storytelling?.improvementRecommendations)
      ? storytelling.improvementRecommendations
      : [];

    return [...recommendations, ...generic].slice(0, 5);
  }

  rankHookEvaluations(evaluations = []) {
    return [...evaluations].sort((left, right) => {
      const scoreDelta = Number(right?.hookSkillScore ?? 0) - Number(left?.hookSkillScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;

      const openingDelta = Number(right?.storytellingScores?.openingStrength ?? 0)
        - Number(left?.storytellingScores?.openingStrength ?? 0);
      if (openingDelta !== 0) return openingDelta;

      return String(left?.candidateId ?? '').localeCompare(String(right?.candidateId ?? ''));
    }).map((item, index) => ({
      rank: index + 1,
      ...item
    }));
  }

  identifyRecurringWeaknesses(rankedEvaluations = []) {
    const weaknessCounts = new Map();

    rankedEvaluations.forEach(item => {
      const scores = item?.storytellingScores ?? {};
      if (Number(scores?.openingStrength ?? 0) < 9) {
        weaknessCounts.set('openingStrength', (weaknessCounts.get('openingStrength') ?? 0) + 1);
      }
      if (Number(scores?.curiosity ?? 0) < 9) {
        weaknessCounts.set('curiosity', (weaknessCounts.get('curiosity') ?? 0) + 1);
      }
      if (Number(scores?.audienceCommitment ?? 0) < 9) {
        weaknessCounts.set('audienceCommitment', (weaknessCounts.get('audienceCommitment') ?? 0) + 1);
      }
    });

    return [...weaknessCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, frequency]) => ({
        category,
        frequency,
        weakness: this.weaknessSummary(category),
        coachingPriority: frequency >= Math.ceil(Math.max(1, rankedEvaluations.length * 0.5)) ? 'HIGH' : 'MEDIUM'
      }));
  }

  identifyRecurringWeaknessesAcrossCycles(cycleHistory = []) {
    const counts = new Map();

    cycleHistory.forEach(cycle => {
      const weaknesses = Array.isArray(cycle?.recurringWeaknesses) ? cycle.recurringWeaknesses : [];
      weaknesses.forEach(item => {
        const key = String(item?.category ?? '').trim();
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + Number(item?.frequency ?? 0));
      });
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, totalFrequency]) => ({
        category,
        totalFrequency,
        weakness: this.weaknessSummary(category)
      }));
  }

  buildCoachingGuidance({ recurringWeaknesses = [], ranked = [] } = {}) {
    const best = ranked[0] ?? null;
    const weakest = recurringWeaknesses[0] ?? null;

    const drills = [];
    if (weakest?.category === 'openingStrength') {
      drills.push('Rewrite the first sentence 5 times using consequence-first framing with no setup preamble.');
    }
    if (weakest?.category === 'curiosity') {
      drills.push('Generate 5 unresolved accountability questions and retain only those that imply non-obvious consequence.');
    }
    if (weakest?.category === 'audienceCommitment') {
      drills.push('Add one explicit continuation reason tied to stakes escalation, not stylistic suspense.');
    }

    if (drills.length === 0) {
      drills.push('Preserve top hook structure and run one variation pass focused on sharper factual specificity.');
    }

    return {
      focusWeakness: weakest?.category ?? 'none',
      exemplarHookId: best?.candidateId ?? null,
      exemplarPattern: best ? `Use ${best.strategy} strategy with direct consequence and unresolved accountability.` : null,
      drills,
      nextCycleInstruction: 'Generate a new hook set from the same research package and re-score for 9-10 consistency.'
    };
  }

  buildIntegrationTransferPlan({ finalCycle = null } = {}) {
    const topHook = finalCycle?.topHook ?? null;
    const weaknesses = Array.isArray(finalCycle?.recurringWeaknesses) ? finalCycle.recurringWeaknesses : [];

    return {
      intent: 'Transfer validated opening-hook patterns into Atlas Studios pre-production constraints without pipeline redesign.',
      handoffArtifacts: [
        'openingHookExemplarSet',
        'openingHookFailurePatterns',
        'openingHookCoachingChecklist',
        'openingHookScoringTrend'
      ],
      recommendedGate: 'Before full-script composition, require opening hook candidate score >= 9 in Academy module.',
      exemplarHook: topHook?.hook ?? null,
      unresolvedSkillRisks: weaknesses.map(item => item.category),
      rolloutMode: 'advisory-first'
    };
  }

  weaknessSummary(category) {
    const map = {
      openingStrength: 'Openings are not consistently consequence-first with immediate stakes.',
      curiosity: 'Hooks resolve too much too early and fail to sustain unresolved pressure.',
      audienceCommitment: 'Hooks do not consistently create a compelling continuation promise.'
    };

    return map[category] ?? 'Opening hook weakness requires focused deliberate practice.';
  }

  cleanHook(text = '') {
    return String(text ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:?])/g, '$1')
      .trim();
  }
}
