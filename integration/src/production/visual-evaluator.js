export class VisualEvaluator {
  evaluate(plan = {}) {
    const normalized = this.normalizePlan(plan);

    const scores = {
      storyRelevance: this.scoreStoryRelevance(normalized),
      historicalAccuracy: this.scoreHistoricalAccuracy(normalized),
      emotionalImpact: this.scoreEmotionalImpact(normalized),
      visualContinuity: this.scoreVisualContinuity(normalized),
      cinematicComposition: this.scoreCinematicComposition(normalized),
      sceneQuality: this.scoreSceneQuality(normalized)
    };

    const overallScore = Number(((
      scores.storyRelevance
      + scores.historicalAccuracy
      + scores.emotionalImpact
      + scores.visualContinuity
      + scores.cinematicComposition
      + scores.sceneQuality
    ) / 6).toFixed(1));

    const classification = this.classify(scores, overallScore);
    const recommendations = this.buildRecommendations(scores);
    const evidence = this.buildEvidence(normalized, scores);
    const diagnosis = this.buildDiagnosis({ scores, overallScore, classification });
    const revisedWorkPlan = this.buildRevisedWorkPlan(scores);

    const score = {
      overall: overallScore,
      categoryScores: scores,
      classification
    };

    return {
      score,
      evidence,
      diagnosis,
      recommendedImprovements: recommendations,
      revisedWorkPlan,
      scores,
      overallScore,
      classification,
      recommendations
    };
  }

  normalizePlan(plan) {
    return {
      sceneDescription: String(plan.sceneDescription ?? ''),
      artStyle: String(plan.artStyle ?? ''),
      scriptSummary: String(plan.scriptSummary ?? ''),
      historicalContextNotes: Array.isArray(plan.historicalContextNotes) ? plan.historicalContextNotes : [],
      continuityNotes: Array.isArray(plan.continuityNotes) ? plan.continuityNotes : [],
      emotionalTarget: String(plan.emotionalTarget ?? '')
    };
  }

  scoreStoryRelevance(plan) {
    let score = 3;
    if (plan.sceneDescription.length >= 40) score += 2;
    if (this.containsAny(plan.sceneDescription, ['stake', 'conflict', 'evidence', 'moment', 'event'])) score += 3;
    if (plan.scriptSummary.length >= 40) score += 2;
    return this.clamp(score);
  }

  scoreHistoricalAccuracy(plan) {
    let score = 3;
    if (plan.historicalContextNotes.length >= 1) score += 3;
    if (plan.historicalContextNotes.length >= 2) score += 2;
    if (this.containsAny(plan.sceneDescription, ['archive', 'period', 'historical', 'documented', 'recorded'])) score += 1;
    return this.clamp(score);
  }

  scoreEmotionalImpact(plan) {
    let score = 3;
    if (plan.emotionalTarget.length > 0) score += 3;
    if (this.containsAny(plan.sceneDescription, ['tension', 'fear', 'hope', 'loss', 'pressure'])) score += 2;
    if (this.containsAny(plan.artStyle, ['cinematic', 'documentary', 'dramatic'])) score += 1;
    return this.clamp(score);
  }

  scoreVisualContinuity(plan) {
    let score = 3;
    if (plan.continuityNotes.length >= 1) score += 3;
    if (plan.continuityNotes.length >= 2) score += 2;
    if (this.containsAny(plan.sceneDescription, ['same location', 'timeline', 'sequence'])) score += 1;
    return this.clamp(score);
  }

  scoreCinematicComposition(plan) {
    let score = 3;
    if (this.containsAny(plan.sceneDescription, ['close-up', 'wide shot', 'framing', 'depth', 'foreground', 'background'])) score += 4;
    if (this.containsAny(plan.artStyle, ['cinematic', 'composition', 'high contrast', 'natural light'])) score += 2;
    return this.clamp(score);
  }

  scoreSceneQuality(plan) {
    let score = 3;
    if (plan.sceneDescription.length >= 80) score += 3;
    if (plan.artStyle.length > 0) score += 2;
    if (plan.scriptSummary.length > 0) score += 2;
    return this.clamp(score);
  }

  classify(scores, overallScore) {
    const hasCriticalFailure = Object.values(scores).some(score => score < 5);
    if (hasCriticalFailure || overallScore < 6) return 'FAIL';
    if (overallScore < 7) return 'CONDITIONAL';
    return 'PASS';
  }

  buildRecommendations(scores) {
    const recommendations = [];
    if (scores.storyRelevance < 7) recommendations.push('Strengthen scene narrative function and story-beat linkage.');
    if (scores.historicalAccuracy < 7) recommendations.push('Add explicit historical context notes and period-specific constraints.');
    if (scores.emotionalImpact < 7) recommendations.push('Clarify emotional target and supporting visual tone cues.');
    if (scores.visualContinuity < 7) recommendations.push('Add continuity notes for timeline, location, and visual language consistency.');
    if (scores.cinematicComposition < 7) recommendations.push('Specify stronger framing and composition directives for viewer focus.');
    if (scores.sceneQuality < 7) recommendations.push('Increase scene plan specificity before image generation.');
    if (recommendations.length === 0) recommendations.push('Visual plan quality is strong; continue iterating with production feedback.');
    return recommendations;
  }

  buildEvidence(plan, scores) {
    return [
      `SCENE_DESCRIPTION_LENGTH:${plan.sceneDescription.length}`,
      `HISTORICAL_NOTES_COUNT:${plan.historicalContextNotes.length}`,
      `CONTINUITY_NOTES_COUNT:${plan.continuityNotes.length}`,
      `STORY_RELEVANCE:${scores.storyRelevance}`,
      `CINEMATIC_COMPOSITION:${scores.cinematicComposition}`
    ];
  }

  buildDiagnosis({ scores, overallScore, classification }) {
    if (classification === 'PASS') {
      return 'Visual plan quality is strong and suitable for image generation execution.';
    }

    const weakest = Object.entries(scores)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .slice(0, 2)
      .map(([key]) => key)
      .join(', ');

    return `Visual plan quality is ${classification.toLowerCase()} at overall score ${overallScore}; weakest dimensions: ${weakest}.`;
  }

  buildRevisedWorkPlan(scores) {
    const plan = [];

    if (scores.storyRelevance < 7) {
      plan.push('Replace weak scene concepts with scenes tied directly to narrative stakes.');
    }

    if (scores.historicalAccuracy < 7) {
      plan.push('Add stricter historical constraints and documented context anchors.');
    }

    if (scores.emotionalImpact < 7) {
      plan.push('Increase emotional reinforcement through lighting, scale, and framing choices.');
    }

    if (scores.visualContinuity < 7) {
      plan.push('Improve continuity notes to keep visual language stable across scenes.');
    }

    if (scores.cinematicComposition < 7) {
      plan.push('Strengthen composition directives (focus hierarchy, framing, depth).');
    }

    if (scores.sceneQuality < 7) {
      plan.push('Increase scene specification detail before image generation.');
    }

    if (plan.length === 0) {
      plan.push('Maintain current visual quality and refine scene-level specificity incrementally.');
    }

    return plan;
  }

  containsAny(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  clamp(value) {
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}
