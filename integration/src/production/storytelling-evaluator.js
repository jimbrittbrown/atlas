import { CuriosityEngineeringCompetency } from './curiosity-engineering-competency.js';

export class StorytellingEvaluator {
  constructor({ minimumProfessionalScore = 7, minimumCriticalCategoryScore = 5 } = {}) {
    this.minimumProfessionalScore = minimumProfessionalScore;
    this.minimumCriticalCategoryScore = minimumCriticalCategoryScore;
    this.curiosityEngineeringCompetency = new CuriosityEngineeringCompetency();
  }

  evaluate(script) {
    const normalizedScript = String(script ?? '').trim();
    const curiosityEngineeringAssessment = this.curiosityEngineeringCompetency.assess(normalizedScript);

    const scores = {
      openingStrength: this.scoreOpeningStrength(normalizedScript),
      curiosity: curiosityEngineeringAssessment.curiosityScore,
      narrativeFlow: this.scoreNarrativeFlow(normalizedScript),
      informationDensity: this.scoreInformationDensity(normalizedScript),
      audienceCommitment: this.scoreAudienceCommitment(normalizedScript)
    };

    const overallRaw = (
      scores.openingStrength
      + scores.curiosity
      + scores.narrativeFlow
      + scores.informationDensity
      + scores.audienceCommitment
    ) / 5;

    const overallScore = Number(overallRaw.toFixed(1));
    const classification = this.classify(scores, overallScore);
    const improvementRecommendations = this.buildRecommendations(scores, curiosityEngineeringAssessment.reasoning);
    const evidence = this.buildEvidence(normalizedScript, scores);
    const diagnosis = this.buildDiagnosis({ scores, overallScore, classification });
    const revisedWorkPlan = this.buildRevisedWorkPlan(scores, curiosityEngineeringAssessment.reasoning);

    const score = {
      overall: overallScore,
      categoryScores: scores,
      classification
    };

    return {
      score,
      evidence,
      diagnosis,
      recommendedImprovements: improvementRecommendations,
      revisedWorkPlan,
      curiosityEngineeringReasoning: curiosityEngineeringAssessment.reasoning,
      curiosityEngineeringRationale: curiosityEngineeringAssessment.rationale,
      scores,
      overallScore,
      classification,
      improvementRecommendations
    };
  }

  scoreOpeningStrength(script) {
    if (script.length === 0) return 0;
    const opening = script.split(/\.|\n/).find(Boolean) ?? script;

    let score = 4;
    if (this.containsAny(opening, ['opening', 'tonight', 'imagine', 'what if', 'first'])) score += 2;
    if (this.containsAny(opening, ['risk', 'stakes', 'threat', 'consequence', 'discovery'])) score += 2;
    if (opening.length > 40) score += 1;
    if (opening.length > 90) score += 1;

    return this.clampScore(score);
  }

  scoreNarrativeFlow(script) {
    if (script.length === 0) return 0;

    let score = 3;
    if (this.containsAny(script, ['beat 1', 'beat 2', 'beat 3', 'beat-001', 'beat-002'])) score += 3;
    if (this.containsAny(script, ['then', 'next', 'after', 'finally'])) score += 2;

    const sentenceCount = script.split(/[.!?]+/).filter(part => part.trim().length > 0).length;
    if (sentenceCount >= 4) score += 1;
    if (sentenceCount >= 8) score += 1;

    return this.clampScore(score);
  }

  scoreInformationDensity(script) {
    if (script.length === 0) return 0;

    let score = 4;
    const words = script.split(/\s+/).filter(Boolean).length;

    if (words >= 80) score += 2;
    if (words >= 140) score += 1;

    if (this.containsAny(script, ['because', 'therefore', 'evidence', 'data', 'record'])) score += 2;
    if (this.containsAny(script, ['details', 'context', 'timeline'])) score += 1;

    return this.clampScore(score);
  }

  scoreAudienceCommitment(script) {
    if (script.length === 0) return 0;

    let score = 3;
    if (this.containsAny(script, ['opening hook', 'stay', 'watch', 'continue', 'next'])) score += 2;
    if (this.containsAny(script, ['stakes', 'consequence', 'risk', 'decision'])) score += 2;
    if (this.containsAny(script, ['twist', 'reveal', 'clue'])) score += 2;
    if (this.containsAny(script, ['subscribe', 'follow'])) score += 1;

    return this.clampScore(score);
  }

  classify(scores, overallScore) {
    const hasCriticalFailure = [
      scores.openingStrength,
      scores.narrativeFlow,
      scores.audienceCommitment
    ].some(score => score < this.minimumCriticalCategoryScore);

    if (hasCriticalFailure || overallScore < 6) return 'FAIL';
    if (overallScore < this.minimumProfessionalScore) return 'CONDITIONAL';
    return 'PASS';
  }

  buildRecommendations(scores, curiosityReasoning = {}) {
    const recommendations = [];

    if (scores.openingStrength < 7) {
      recommendations.push('Strengthen the first 15 seconds with clearer stakes and a sharper opening hook.');
    }

    if (scores.curiosity < 7) {
      recommendations.push('Increase unresolved but meaningful questions that motivate continuation.');
    }

    const rewrites = Array.isArray(curiosityReasoning.sectionsShouldBeRewritten)
      ? curiosityReasoning.sectionsShouldBeRewritten
      : [];
    rewrites.forEach(section => {
      recommendations.push(`Rewrite ${section.sceneId}: ${section.rewriteReason}`);
    });

    const earlyReveals = Array.isArray(curiosityReasoning.revealsTooEarly)
      ? curiosityReasoning.revealsTooEarly
      : [];
    earlyReveals.forEach(section => {
      recommendations.push(`Delay reveal in ${section.sceneId}: ${section.reason}`);
    });

    const questionInsertions = Array.isArray(curiosityReasoning.questionsShouldBeIntroduced)
      ? curiosityReasoning.questionsShouldBeIntroduced
      : [];
    questionInsertions.forEach(section => {
      recommendations.push(`Add guiding question in ${section.sceneId}: ${section.reason}`);
    });

    if (scores.narrativeFlow < 7) {
      recommendations.push('Improve narrative transitions so each section clearly progresses from the prior beat.');
    }

    if (scores.informationDensity < 6) {
      recommendations.push('Increase useful context and evidence without overloading pacing.');
    }

    if (scores.audienceCommitment < 7) {
      recommendations.push('Add explicit continuation reasons in each segment to sustain audience commitment.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain current structure and continue incremental improvements based on retention data.');
    }

    return recommendations;
  }

  buildEvidence(script, scores) {
    const wordCount = String(script).split(/\s+/).filter(Boolean).length;

    return [
      `SCRIPT_WORD_COUNT:${wordCount}`,
      `OPENING_STRENGTH:${scores.openingStrength}`,
      `CURIOSITY:${scores.curiosity}`,
      `NARRATIVE_FLOW:${scores.narrativeFlow}`,
      `AUDIENCE_COMMITMENT:${scores.audienceCommitment}`
    ];
  }

  buildDiagnosis({ scores, overallScore, classification }) {
    if (classification === 'PASS') {
      return 'Storytelling quality is production-ready with strong narrative momentum.';
    }

    const weakest = Object.entries(scores)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .slice(0, 2)
      .map(([key]) => key)
      .join(', ');

    return `Storytelling quality is ${classification.toLowerCase()} at overall score ${overallScore}; weakest dimensions: ${weakest}.`;
  }

  buildRevisedWorkPlan(scores, curiosityReasoning = {}) {
    const plan = [];

    if (scores.openingStrength < 7) {
      plan.push('Rewrite opening to sharpen stakes and immediate relevance.');
    }

    if (scores.curiosity < 7) {
      plan.push('Delay major reveal and increase unresolved curiosity cues.');
    }

    const retentionRiskScene = curiosityReasoning.sceneMostLikelyToLoseAudience;
    if (retentionRiskScene && retentionRiskScene.sceneId) {
      plan.push(`Rewrite ${retentionRiskScene.sceneId} first to prevent curiosity collapse.`);
    }

    if (scores.narrativeFlow < 7) {
      plan.push('Reorder transitions to improve continuity between narrative beats.');
    }

    if (scores.informationDensity < 6) {
      plan.push('Add high-value evidence details where narrative context is thin.');
    }

    if (scores.audienceCommitment < 7) {
      plan.push('Insert stronger continuation hooks at scene boundaries.');
    }

    if (plan.length === 0) {
      plan.push('Maintain current story structure and perform targeted micro-edits for pacing.');
    }

    return plan;
  }

  containsAny(text, tokens) {
    const normalized = text.toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  clampScore(score) {
    return Math.max(0, Math.min(10, Math.round(score)));
  }
}
