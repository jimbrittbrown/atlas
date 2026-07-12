export interface ResearchCategoryScores {
  sourceQuality: number;
  evidenceStrength: number;
  storyPotential: number;
  novelty: number;
  audienceInterest: number;
  completeness: number;
}

export interface ResearchEvaluationResult {
  scores: ResearchCategoryScores;
  overallScore: number;
  classification: 'PASS' | 'CONDITIONAL' | 'FAIL';
  recommendations: string[];
}

export interface ResearchEvaluatorConfig {
  minimumProfessionalScore?: number;
  minimumCategoryScore?: number;
}

const DEFAULT_CONFIG: Required<ResearchEvaluatorConfig> = {
  minimumProfessionalScore: 7,
  minimumCategoryScore: 5
};

export class ResearchEvaluator {
  private readonly config: Required<ResearchEvaluatorConfig>;

  constructor(config: ResearchEvaluatorConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  evaluate(research: unknown): ResearchEvaluationResult {
    const normalized = this.normalizeResearch(research);

    const scores: ResearchCategoryScores = {
      sourceQuality: this.scoreSourceQuality(normalized),
      evidenceStrength: this.scoreEvidenceStrength(normalized),
      storyPotential: this.scoreStoryPotential(normalized),
      novelty: this.scoreNovelty(normalized),
      audienceInterest: this.scoreAudienceInterest(normalized),
      completeness: this.scoreCompleteness(normalized)
    };

    const overallRaw = (
      scores.sourceQuality
      + scores.evidenceStrength
      + scores.storyPotential
      + scores.novelty
      + scores.audienceInterest
      + scores.completeness
    ) / 6;

    const overallScore = Number(overallRaw.toFixed(1));

    return {
      scores,
      overallScore,
      classification: this.classify(scores, overallScore),
      recommendations: this.buildRecommendations(scores)
    };
  }

  private normalizeResearch(research: unknown): {
    findings: unknown[];
    providers: unknown[];
    executiveSummary: string;
  } {
    const report = (research as any)?.report ?? research ?? {};
    return {
      findings: Array.isArray((report as any).findings) ? (report as any).findings : [],
      providers: Array.isArray((report as any).providers) ? (report as any).providers : [],
      executiveSummary: String((report as any).executiveSummary ?? '')
    };
  }

  private scoreSourceQuality(input: { providers: unknown[] }): number {
    let score = 3;
    if (input.providers.length >= 1) score += 2;
    if (input.providers.length >= 2) score += 2;
    if (input.providers.length >= 3) score += 1;
    return this.clamp(score);
  }

  private scoreEvidenceStrength(input: { findings: unknown[]; executiveSummary: string }): number {
    let score = 3;
    if (input.findings.length >= 3) score += 2;
    if (input.findings.length >= 6) score += 2;
    if (this.containsAny(input.executiveSummary, ['evidence', 'data', 'record', 'verified', 'corroborated'])) score += 2;
    return this.clamp(score);
  }

  private scoreStoryPotential(input: { executiveSummary: string }): number {
    let score = 3;
    if (this.containsAny(input.executiveSummary, ['stake', 'conflict', 'turning point', 'consequence', 'impact'])) score += 3;
    if (this.containsAny(input.executiveSummary, ['character', 'institution', 'decision', 'pressure'])) score += 2;
    return this.clamp(score);
  }

  private scoreNovelty(input: { executiveSummary: string; findings: unknown[] }): number {
    let score = 3;
    if (this.containsAny(input.executiveSummary, ['unexpected', 'rare', 'new', 'non-obvious', 'contradiction'])) score += 3;
    if (input.findings.length >= 5) score += 1;
    return this.clamp(score);
  }

  private scoreAudienceInterest(input: { executiveSummary: string }): number {
    let score = 3;
    if (this.containsAny(input.executiveSummary, ['why this matters', 'audience', 'public', 'human', 'risk'])) score += 3;
    if (this.containsAny(input.executiveSummary, ['question', 'mystery', 'uncertain', 'what happens'])) score += 2;
    return this.clamp(score);
  }

  private scoreCompleteness(input: { findings: unknown[]; providers: unknown[]; executiveSummary: string }): number {
    let score = 3;
    if (input.findings.length > 0) score += 2;
    if (input.providers.length > 0) score += 2;
    if (input.executiveSummary.trim().length >= 80) score += 2;
    return this.clamp(score);
  }

  private classify(scores: ResearchCategoryScores, overallScore: number): 'PASS' | 'CONDITIONAL' | 'FAIL' {
    const categoryScores = Object.values(scores);
    if (categoryScores.some(value => value < this.config.minimumCategoryScore) || overallScore < 6) {
      return 'FAIL';
    }

    if (overallScore < this.config.minimumProfessionalScore) {
      return 'CONDITIONAL';
    }

    return 'PASS';
  }

  private buildRecommendations(scores: ResearchCategoryScores): string[] {
    const recommendations: string[] = [];

    if (scores.sourceQuality < 7) recommendations.push('Increase source diversity and source credibility before handoff.');
    if (scores.evidenceStrength < 7) recommendations.push('Strengthen claim-to-evidence linkage and corroboration.');
    if (scores.storyPotential < 7) recommendations.push('Extract higher-stakes findings with clearer narrative consequence.');
    if (scores.novelty < 6) recommendations.push('Expand investigation scope to surface non-obvious findings.');
    if (scores.audienceInterest < 7) recommendations.push('Improve audience relevance and curiosity framing in summary findings.');
    if (scores.completeness < 7) recommendations.push('Fill research coverage gaps before Storytelling handoff.');
    if (recommendations.length === 0) recommendations.push('Research quality is strong; continue iterative refinement with production feedback.');

    return recommendations;
  }

  private containsAny(text: string, tokens: string[]): boolean {
    const normalized = text.toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  private clamp(score: number): number {
    return Math.max(0, Math.min(10, Math.round(score)));
  }
}
