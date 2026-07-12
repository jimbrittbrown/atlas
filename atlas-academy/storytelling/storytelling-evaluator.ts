export interface StorytellingCategoryScores {
  openingStrength: number;
  curiosity: number;
  narrativeFlow: number;
  informationDensity: number;
  audienceCommitment: number;
}

export interface StorytellingEvaluationResult {
  scores: StorytellingCategoryScores;
  overallScore: number;
  classification: 'PASS' | 'CONDITIONAL' | 'FAIL';
  improvementRecommendations: string[];
}

export interface StorytellingEvaluatorConfig {
  minimumProfessionalScore?: number;
  minimumCriticalCategoryScore?: number;
}

const DEFAULT_CONFIG: Required<StorytellingEvaluatorConfig> = {
  minimumProfessionalScore: 7,
  minimumCriticalCategoryScore: 5
};

export class StorytellingEvaluator {
  private readonly config: Required<StorytellingEvaluatorConfig>;

  constructor(config: StorytellingEvaluatorConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  evaluate(script: string): StorytellingEvaluationResult {
    const normalizedScript = this.normalizeScript(script);

    const scores: StorytellingCategoryScores = {
      openingStrength: this.scoreOpeningStrength(normalizedScript),
      curiosity: this.scoreCuriosity(normalizedScript),
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
    const improvementRecommendations = this.buildRecommendations(scores);

    return {
      scores,
      overallScore,
      classification,
      improvementRecommendations
    };
  }

  private normalizeScript(script: string): string {
    return String(script ?? '').trim();
  }

  private scoreOpeningStrength(script: string): number {
    if (script.length === 0) return 0;
    const opening = script.split(/\.|\n/).find(Boolean) ?? script;

    let score = 4;
    if (this.containsAny(opening, ['opening', 'tonight', 'imagine', 'what if', 'first'])) score += 2;
    if (this.containsAny(opening, ['risk', 'stakes', 'threat', 'consequence', 'discovery'])) score += 2;
    if (opening.length > 40) score += 1;
    if (opening.length > 90) score += 1;

    return this.clampScore(score);
  }

  private scoreCuriosity(script: string): number {
    if (script.length === 0) return 0;

    let score = 3;
    const questionMarks = (script.match(/\?/g) ?? []).length;
    if (questionMarks >= 1) score += 2;
    if (questionMarks >= 2) score += 1;
    if (this.containsAny(script, ['mystery', 'unknown', 'unresolved', 'clue', 'truth'])) score += 2;
    if (this.containsAny(script, ['reveal', 'twist', 'next', 'discover'])) score += 2;

    return this.clampScore(score);
  }

  private scoreNarrativeFlow(script: string): number {
    if (script.length === 0) return 0;

    let score = 3;
    if (this.containsAny(script, ['act i', 'act ii', 'act iii'])) score += 3;
    if (this.containsAny(script, ['then', 'next', 'after', 'finally'])) score += 2;

    const sentenceCount = script.split(/[.!?]+/).filter(part => part.trim().length > 0).length;
    if (sentenceCount >= 4) score += 1;
    if (sentenceCount >= 8) score += 1;

    return this.clampScore(score);
  }

  private scoreInformationDensity(script: string): number {
    if (script.length === 0) return 0;

    let score = 4;
    const words = script.split(/\s+/).filter(Boolean).length;

    if (words >= 80) score += 2;
    if (words >= 140) score += 1;

    if (this.containsAny(script, ['because', 'therefore', 'evidence', 'data', 'record'])) score += 2;
    if (this.containsAny(script, ['details', 'context', 'timeline'])) score += 1;

    return this.clampScore(score);
  }

  private scoreAudienceCommitment(script: string): number {
    if (script.length === 0) return 0;

    let score = 3;
    if (this.containsAny(script, ['opening hook', 'stay', 'watch', 'continue', 'next'])) score += 2;
    if (this.containsAny(script, ['stakes', 'consequence', 'risk', 'decision'])) score += 2;
    if (this.containsAny(script, ['twist', 'reveal', 'clue'])) score += 2;
    if (this.containsAny(script, ['subscribe', 'follow'])) score += 1;

    return this.clampScore(score);
  }

  private classify(scores: StorytellingCategoryScores, overallScore: number): 'PASS' | 'CONDITIONAL' | 'FAIL' {
    const criticalFloor = this.config.minimumCriticalCategoryScore;
    const hasCriticalFailure = [
      scores.openingStrength,
      scores.narrativeFlow,
      scores.audienceCommitment
    ].some(score => score < criticalFloor);

    if (hasCriticalFailure || overallScore < 6) return 'FAIL';
    if (overallScore < this.config.minimumProfessionalScore) return 'CONDITIONAL';
    return 'PASS';
  }

  private buildRecommendations(scores: StorytellingCategoryScores): string[] {
    const recommendations: string[] = [];

    if (scores.openingStrength < 7) {
      recommendations.push('Strengthen the first 15 seconds with clearer stakes and a sharper opening hook.');
    }

    if (scores.curiosity < 7) {
      recommendations.push('Increase unresolved but meaningful questions that motivate continuation.');
    }

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

  private containsAny(text: string, tokens: string[]): boolean {
    const normalized = text.toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  private clampScore(score: number): number {
    return Math.max(0, Math.min(10, Math.round(score)));
  }
}
