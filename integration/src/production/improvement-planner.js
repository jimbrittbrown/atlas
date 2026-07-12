export class ImprovementPlanner {
  planImprovements({
    executiveProducerPackage = null,
    executiveScriptReview = null,
    storytellingScorecard = null,
    goldStandard = null,
    previousRevisionHistory = []
  } = {}) {
    const revisionRequests = Array.isArray(executiveScriptReview?.editorReview?.revisionRequests)
      ? executiveScriptReview.editorReview.revisionRequests
      : [];

    const scorecard = this.normalizeStorytellingScorecard(storytellingScorecard);
    const executiveObjectives = this.buildExecutiveProducerObjectives({
      scorecard,
      executiveProducerPackage,
      previousRevisionHistory
    });
    const approvedExecutiveIssueTypes = new Set(
      executiveObjectives.map(objective => String(objective?.issueType ?? '').trim().toLowerCase()).filter(Boolean)
    );

    const issueFrequency = this.countIssueFrequency(previousRevisionHistory);
    const editorialWeaknesses = revisionRequests.map(request => {
      const issueType = String(request?.issueType ?? 'unknown').trim().toLowerCase();
      const baseImpact = this.estimateBaseImpact(issueType);
      const recurrenceBoost = issueFrequency.get(issueType) ?? 0;
      const scorecardPenalty = this.scorecardPenalty({ issueType, storytellingScorecard: scorecard });
      const expectedQualityGain = Number((baseImpact + recurrenceBoost + scorecardPenalty).toFixed(2));

      return {
        objectiveType: 'EDITORIAL',
        source: 'EXECUTIVE_SCRIPT_EDITOR',
        issueType,
        targetCategory: this.issueTypeToCategory(issueType),
        currentScore: this.resolveCategoryScore(this.issueTypeToCategory(issueType), scorecard),
        targetScore: 8,
        scoreGap: Number((8 - this.resolveCategoryScore(this.issueTypeToCategory(issueType), scorecard)).toFixed(2)),
        expectedQualityGain,
        problem: this.problemStatement(issueType, request),
        rootCause: this.rootCauseStatement(issueType, executiveProducerPackage),
        recommendedAction: this.recommendedAction(issueType),
        successMetric: this.successMetric(issueType)
      };
    });

    const filteredEditorialWeaknesses = editorialWeaknesses.filter(objective => {
      const issueType = String(objective?.issueType ?? '').trim().toLowerCase();
      if (!issueType) return false;
      if (approvedExecutiveIssueTypes.size === 0) return false;
      if (approvedExecutiveIssueTypes.has(issueType)) return true;
      return false;
    });

    const prioritizedObjectives = [...executiveObjectives, ...filteredEditorialWeaknesses]
      .sort((a, b) => b.expectedQualityGain - a.expectedQualityGain)
      .filter((objective, index, arr) => {
        const key = `${objective.issueType}:${objective.targetCategory}`;
        return arr.findIndex(item => `${item.issueType}:${item.targetCategory}` === key) === index;
      })
      .slice(0, 3)
      .map((objective, index) => ({
        priority: index + 1,
        ...objective
      }));

    const primaryObjective = prioritizedObjectives[0] ?? null;
    const unresolvedObjectives = prioritizedObjectives.filter(objective => String(objective?.status ?? 'UNRESOLVED') !== 'RESOLVED');
    const productionReadiness = this.evaluateProductionReadiness({ scorecard, unresolvedObjectiveCount: unresolvedObjectives.length });

    return {
      planner: 'ImprovementPlanner',
      goldStandardReference: goldStandard?.name ?? 'Atlas Documentary Storytelling Gold Standard',
      optimizationAuthority: 'EXECUTIVE_PRODUCER_SCORE',
      optimizationQuestion: this.buildOptimizationQuestion(primaryObjective),
      singleHighestImpactChange: primaryObjective
        ? String(primaryObjective.recommendedAction ?? '').trim() || String(primaryObjective.problem ?? '').trim()
        : 'No higher-impact strategic change identified.',
      primaryObjective,
      objectiveCount: prioritizedObjectives.length,
      unresolvedObjectiveCount: unresolvedObjectives.length,
      unresolvedObjectives,
      productionReadiness,
      prioritizedObjectives
    };
  }

  normalizeStorytellingScorecard(storytellingScorecard = null) {
    const scores = storytellingScorecard?.scores ?? storytellingScorecard?.categoryScores ?? {};
    return {
      overallScore: Number(storytellingScorecard?.overallScore ?? 0),
      scores: {
        openingStrength: Number(scores?.openingStrength ?? 0),
        curiosity: Number(scores?.curiosity ?? 0),
        narrativeFlow: Number(scores?.narrativeFlow ?? 0),
        informationDensity: Number(scores?.informationDensity ?? 0),
        audienceCommitment: Number(scores?.audienceCommitment ?? 0)
      }
    };
  }

  buildExecutiveProducerObjectives({ scorecard, executiveProducerPackage = null, previousRevisionHistory = [] }) {
    const issueFrequency = this.countIssueFrequency(previousRevisionHistory);
    const cycleCount = Number(executiveProducerPackage?.cycleCount ?? 0);
    const categoryDescriptors = [
      {
        category: 'openingStrength',
        issueType: 'weak-storytelling',
        problem: 'Opening does not establish stakes fast enough to maximize first-15-second retention.',
        action: 'Rewrite opening beat with a concrete consequence and unresolved accountability question in the first two lines.',
        successMetric: 'Opening strength score increases by at least +1.0 in next Executive Producer review.'
      },
      {
        category: 'curiosity',
        issueType: 'pacing-problem',
        problem: 'Curiosity pressure drops because reveals are delivered before enough tension accumulates.',
        action: 'Delay one major reveal and add one unresolved question that creates forward pressure into the next beat.',
        successMetric: 'Curiosity score increases by at least +1.0 and no early-reveal warning persists.'
      },
      {
        category: 'narrativeFlow',
        issueType: 'weak-storytelling',
        problem: 'Narrative progression is not escalating consequence with enough clarity between beats.',
        action: 'Resequence one middle section so each paragraph ends with unresolved consequence driving the next.',
        successMetric: 'Narrative flow score increases by at least +0.8 in next Executive Producer review.'
      },
      {
        category: 'audienceCommitment',
        issueType: 'ending-impact',
        problem: 'Ending does not sustain unresolved accountability long enough to maximize post-viewer commitment.',
        action: 'Rewrite closing cadence to end on one concrete unresolved accountability question.',
        successMetric: 'Audience commitment score increases by at least +0.8 and ending-impact concern is removed.'
      },
      {
        category: 'informationDensity',
        issueType: 'abstraction-overload',
        problem: 'Information density is underperforming because claims are not consistently tied to actor-decision-outcome evidence.',
        action: 'Replace one abstract section with specific actors, decisions, and measured consequences.',
        successMetric: 'Information density score increases by at least +0.8 with no abstraction-overload concern.'
      }
    ];

    return categoryDescriptors
      .map(descriptor => {
        const currentScore = this.resolveCategoryScore(descriptor.category, scorecard);
        const targetScore = 8;
        const scoreGap = Number((targetScore - currentScore).toFixed(2));
        const recurrenceBoost = issueFrequency.get(String(descriptor.issueType).toLowerCase()) ?? 0;
        const cycleBoost = cycleCount > 1 ? Number((cycleCount * 0.3).toFixed(2)) : 0;
        const expectedQualityGain = Number((Math.max(0, scoreGap) * 1.4 + recurrenceBoost + cycleBoost).toFixed(2));

        return {
          objectiveType: 'EXECUTIVE_PRODUCER',
          source: 'EXECUTIVE_PRODUCER',
          issueType: descriptor.issueType,
          targetCategory: descriptor.category,
          currentScore,
          targetScore,
          scoreGap,
          expectedQualityGain,
          problem: descriptor.problem,
          rootCause: this.executiveRootCause(descriptor.category, cycleCount),
          recommendedAction: descriptor.action,
          successMetric: descriptor.successMetric,
          status: currentScore >= targetScore ? 'RESOLVED' : 'UNRESOLVED'
        };
      })
      .filter(objective => objective.status === 'UNRESOLVED')
      .sort((a, b) => b.expectedQualityGain - a.expectedQualityGain)
      .slice(0, 3);
  }

  executiveRootCause(category, cycleCount = 0) {
    const map = {
      openingStrength: 'Opening framing introduces context before high-stakes consequence is fully visible.',
      curiosity: 'Reveal timing and question cadence are not yet optimized for sustained uncertainty.',
      narrativeFlow: 'Beat transitions carry facts forward, but escalation pressure is not consistently compounding.',
      informationDensity: 'Narrative compression is replacing concrete actor-decision-outcome evidence in key beats.',
      audienceCommitment: 'Closing cadence resolves language before accountability tension reaches peak resonance.'
    };

    const base = map[category] ?? 'Executive producer strategic objective requires targeted structural revision.';
    if (cycleCount <= 1) return base;
    return `${base} This weakness has persisted across ${cycleCount} review cycles.`;
  }

  evaluateProductionReadiness({ scorecard, unresolvedObjectiveCount = 0 }) {
    const overallScore = Number(scorecard?.overallScore ?? 0);
    const readyByScore = overallScore >= 8;
    const isReady = readyByScore && unresolvedObjectiveCount === 0;

    return {
      isReady,
      targetOverallScore: 8,
      currentOverallScore: overallScore,
      unresolvedObjectiveCount,
      rationale: isReady
        ? 'Executive Producer score target reached and no unresolved strategic objectives remain.'
        : 'Continue iterative optimization on Executive Producer strategic objectives before production approval.'
    };
  }

  buildOptimizationQuestion(primaryObjective = null) {
    if (!primaryObjective) {
      return 'What single change is most likely to increase the Executive Producer score? No high-impact objective detected.';
    }

    return `What single change is most likely to increase the Executive Producer score? ${primaryObjective.recommendedAction}`;
  }

  resolveCategoryScore(category, scorecard = null) {
    const scores = scorecard?.scores ?? {};
    return Number(scores?.[category] ?? 0);
  }

  issueTypeToCategory(issueType = '') {
    const normalized = String(issueType ?? '').trim().toLowerCase();
    const mapping = {
      'weak-storytelling': 'narrativeFlow',
      'pacing-problem': 'curiosity',
      'ending-impact': 'audienceCommitment',
      'weak-emotional-impact': 'audienceCommitment',
      'abstraction-overload': 'informationDensity',
      'production-note-language': 'narrativeFlow',
      'narration-authenticity': 'narrativeFlow',
      'repetition': 'narrativeFlow'
    };

    return mapping[normalized] ?? 'narrativeFlow';
  }

  countIssueFrequency(previousRevisionHistory = []) {
    const counts = new Map();

    previousRevisionHistory.forEach(cycle => {
      const feedback = Array.isArray(cycle?.editorFeedback) ? cycle.editorFeedback : [];
      feedback.forEach(item => {
        const key = String(item?.issueType ?? '').trim().toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });

    return counts;
  }

  estimateBaseImpact(issueType) {
    const impactMap = {
      'production-note-language': 3.6,
      'weak-storytelling': 3.4,
      'weak-emotional-impact': 3.2,
      'abstraction-overload': 2.8,
      'pacing-problem': 3,
      'immersion-problem': 3,
      'narration-authenticity': 3.4,
      'ending-impact': 3.1,
      'repetition': 1.6,
      'sentence-flow': 1.4,
      'wording': 1.2,
      'grammar': 1
    };

    return impactMap[issueType] ?? 1;
  }

  scorecardPenalty({ issueType, storytellingScorecard = null }) {
    const scores = storytellingScorecard?.scores ?? storytellingScorecard?.categoryScores ?? {};

    if (issueType === 'weak-storytelling' || issueType === 'pacing-problem') {
      const flow = Number(scores?.narrativeFlow ?? 7);
      return flow < 7 ? 0.8 : 0;
    }

    if (issueType === 'weak-emotional-impact') {
      const commitment = Number(scores?.audienceCommitment ?? 7);
      return commitment < 7 ? 0.7 : 0;
    }

    if (issueType === 'production-note-language' || issueType === 'narration-authenticity') {
      return 0.6;
    }

    if (issueType === 'ending-impact') {
      const curiosity = Number(scores?.curiosity ?? 7);
      return curiosity < 7 ? 0.6 : 0;
    }

    return 0;
  }

  problemStatement(issueType, request = {}) {
    const fallback = String(request?.diagnosis ?? request?.reason ?? 'Editorial weakness requires focused correction.').trim();

    const map = {
      'production-note-language': 'Narration still leaks planning or directive language that breaks publication voice.',
      'weak-storytelling': 'Story progression is not converting evidence into compelling consequence.',
      'weak-emotional-impact': 'Emotional progression does not fully track with turning-point stakes.',
      'abstraction-overload': 'Paragraphs remain too conceptual and under-specify actors, decisions, and outcomes.',
      'pacing-problem': 'Narrative pacing loses pressure between reveals and weakens retention.',
      'immersion-problem': 'Audience immersion is disrupted by language that sounds procedural rather than lived.',
      'narration-authenticity': 'Documentary voice consistency drops below gold-standard naturalness.',
      'ending-impact': 'Final movement does not yet deliver a durable unresolved consequence.'
    };

    return map[issueType] ?? fallback;
  }

  rootCauseStatement(issueType, executiveProducerPackage = null) {
    const cycleCount = Number(executiveProducerPackage?.cycleCount ?? 0);

    const common = {
      'production-note-language': 'Planning-to-language translation still preserves internal framing tokens.',
      'weak-storytelling': 'Scene-level causality is present but escalation hierarchy is inconsistent.',
      'weak-emotional-impact': 'Emotional beats are implied, not fully rendered in consequence language.',
      'abstraction-overload': 'High-level interpretation is outrunning concrete event framing.',
      'pacing-problem': 'Transitions do not consistently convert payoff into next-scene pressure.',
      'immersion-problem': 'Narrative phrasing occasionally shifts into analyst perspective instead of scene experience.',
      'narration-authenticity': 'Voice constraints are not yet fully enforced across all revision passes.',
      'ending-impact': 'Resolution cadence closes language before thematic aftershock is secured.'
    };

    const base = common[issueType] ?? 'Root cause requires a targeted revision objective.';
    if (cycleCount <= 1) return base;

    return `${base} This weakness has persisted across ${cycleCount} review cycles.`;
  }

  recommendedAction(issueType) {
    const map = {
      'production-note-language': 'Rewrite flagged passages into direct scene-based narration without directives.',
      'weak-storytelling': 'Re-sequence beat language so each segment raises consequence and narrows uncertainty.',
      'weak-emotional-impact': 'Recompose affected passages with explicit human consequence tied to evidence.',
      'abstraction-overload': 'Replace abstract claims with actor-decision-outcome phrasing in the same beat.',
      'pacing-problem': 'Tighten transitions so each paragraph closes with unresolved pressure into the next.',
      'immersion-problem': 'Convert process-like lines into observational documentary language anchored in scene reality.',
      'narration-authenticity': 'Normalize voice against Atlas documentary voice constraints before editor handoff.',
      'ending-impact': 'Rebuild ending cadence so final lines leave a concrete unresolved accountability question.',
      'repetition': 'Consolidate repeated rhetorical structures and preserve only strongest phrasing once.'
    };

    return map[issueType] ?? 'Apply a focused revision limited to the approved weakness objective.';
  }

  successMetric(issueType) {
    const map = {
      'production-note-language': '0 planning/instructional phrases detected in realization validation and editorial review.',
      'weak-storytelling': 'Narrative flow score increases by at least +1.0 and producer critique removes storyline-blocking note.',
      'weak-emotional-impact': 'Audience commitment score increases by at least +1.0 with no emotional-progression warning.',
      'abstraction-overload': 'No abstraction-overload requests in next editorial cycle.',
      'pacing-problem': 'Curiosity and narrative-flow scores each increase by at least +0.5.',
      'immersion-problem': 'No immersion-related revision requests in subsequent cycle.',
      'narration-authenticity': 'Narrator voice authenticity remains true with no authenticity flags.',
      'ending-impact': 'Ending-impact request removed and ending feels earned check remains true.',
      'repetition': 'Repetition requests reduced to zero in next editorial cycle.'
    };

    return map[issueType] ?? 'Weakness category is absent from next executive script review cycle.';
  }
}
