export interface VisualCategoryScores {
  storyRelevance: number;
  historicalAccuracy: number;
  emotionalImpact: number;
  visualContinuity: number;
  cinematicComposition: number;
  sceneQuality: number;
}

export interface VisualEvaluationResult {
  scores: VisualCategoryScores;
  overallScore: number;
  classification: 'PASS' | 'CONDITIONAL' | 'FAIL';
  recommendations: string[];
}

export interface VisualPlanInput {
  sceneDescription?: string;
  artStyle?: string;
  scriptSummary?: string;
  historicalContextNotes?: string[];
  continuityNotes?: string[];
  emotionalTarget?: string;
}

export class VisualEvaluator {
  evaluate(plan: VisualPlanInput): VisualEvaluationResult {
    const normalized = this.normalizePlan(plan);

    const scores: VisualCategoryScores = {
      storyRelevance: this.scoreStoryRelevance(normalized),
      historicalAccuracy: this.scoreHistoricalAccuracy(normalized),
      emotionalImpact: this.scoreEmotionalImpact(normalized),
      visualContinuity: this.scoreVisualContinuity(normalized),
      cinematicComposition: this.scoreCinematicComposition(normalized),
      sceneQuality: this.scoreSceneQuality(normalized)
    };

    const overall = Number(((
      scores.storyRelevance
      + scores.historicalAccuracy
      + scores.emotionalImpact
      + scores.visualContinuity
      + scores.cinematicComposition
      + scores.sceneQuality
    ) / 6).toFixed(1));

    return {
      scores,
      overallScore: overall,
      classification: this.classify(scores, overall),
      recommendations: this.buildRecommendations(scores)
    };
  }

  private normalizePlan(plan: VisualPlanInput): Required<VisualPlanInput> {
    return {
      sceneDescription: String(plan.sceneDescription ?? ''),
      artStyle: String(plan.artStyle ?? ''),
      scriptSummary: String(plan.scriptSummary ?? ''),
      historicalContextNotes: Array.isArray(plan.historicalContextNotes) ? plan.historicalContextNotes : [],
      continuityNotes: Array.isArray(plan.continuityNotes) ? plan.continuityNotes : [],
      emotionalTarget: String(plan.emotionalTarget ?? '')
    };
  }

  private scoreStoryRelevance(plan: Required<VisualPlanInput>): number {
    let score = 3;
    if (plan.sceneDescription.length >= 40) score += 2;
    if (this.containsAny(plan.sceneDescription, ['stake', 'conflict', 'evidence', 'moment', 'event'])) score += 3;
    if (plan.scriptSummary.length >= 40) score += 2;
    return this.clamp(score);
  }

  private scoreHistoricalAccuracy(plan: Required<VisualPlanInput>): number {
    let score = 3;
    if (plan.historicalContextNotes.length >= 1) score += 3;
    if (plan.historicalContextNotes.length >= 2) score += 2;
    if (this.containsAny(plan.sceneDescription, ['archive', 'period', 'historical', 'documented', 'recorded'])) score += 1;
    return this.clamp(score);
  }

  private scoreEmotionalImpact(plan: Required<VisualPlanInput>): number {
    let score = 3;
    if (plan.emotionalTarget.length > 0) score += 3;
    if (this.containsAny(plan.sceneDescription, ['tension', 'fear', 'hope', 'loss', 'pressure'])) score += 2;
    if (this.containsAny(plan.artStyle, ['cinematic', 'documentary', 'dramatic'])) score += 1;
    return this.clamp(score);
  }

  private scoreVisualContinuity(plan: Required<VisualPlanInput>): number {
    let score = 3;
    if (plan.continuityNotes.length >= 1) score += 3;
    if (plan.continuityNotes.length >= 2) score += 2;
    if (this.containsAny(plan.sceneDescription, ['same location', 'timeline', 'sequence'])) score += 1;
    return this.clamp(score);
  }

  private scoreCinematicComposition(plan: Required<VisualPlanInput>): number {
    let score = 3;
    if (this.containsAny(plan.sceneDescription, ['close-up', 'wide shot', 'framing', 'depth', 'foreground', 'background'])) score += 4;
    if (this.containsAny(plan.artStyle, ['cinematic', 'composition', 'high contrast', 'natural light'])) score += 2;
    return this.clamp(score);
  }

  private scoreSceneQuality(plan: Required<VisualPlanInput>): number {
    let score = 3;
    if (plan.sceneDescription.length >= 80) score += 3;
    if (plan.artStyle.length > 0) score += 2;
    if (plan.scriptSummary.length > 0) score += 2;
    return this.clamp(score);
  }

  private classify(scores: VisualCategoryScores, overallScore: number): 'PASS' | 'CONDITIONAL' | 'FAIL' {
    const hasCriticalFailure = Object.values(scores).some(score => score < 5);
    if (hasCriticalFailure || overallScore < 6) return 'FAIL';
    if (overallScore < 7) return 'CONDITIONAL';
    return 'PASS';
  }

  private buildRecommendations(scores: VisualCategoryScores): string[] {
    const recommendations: string[] = [];
    if (scores.storyRelevance < 7) recommendations.push('Strengthen scene narrative function and story-beat linkage.');
    if (scores.historicalAccuracy < 7) recommendations.push('Add explicit historical context notes and period-specific constraints.');
    if (scores.emotionalImpact < 7) recommendations.push('Clarify emotional target and supporting visual tone cues.');
    if (scores.visualContinuity < 7) recommendations.push('Add continuity notes for timeline, location, and visual language consistency.');
    if (scores.cinematicComposition < 7) recommendations.push('Specify stronger framing and composition directives for viewer focus.');
    if (scores.sceneQuality < 7) recommendations.push('Increase scene plan specificity before image generation.');
    if (recommendations.length === 0) recommendations.push('Visual plan quality is strong; continue iterating with production feedback.');
    return recommendations;
  }

  private containsAny(text: string, tokens: string[]): boolean {
    const normalized = text.toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}
