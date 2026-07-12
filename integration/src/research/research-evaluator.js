import { SourceQualityCompetency } from './source-quality-competency.js';
import { StoryWorthinessCompetency } from './story-worthiness-competency.js';
import { ResearchWorkflowV1 } from './research-workflow-v1.js';

export class ResearchEvaluator {
  constructor({ minimumProfessionalScore = 7, minimumCategoryScore = 5 } = {}) {
    this.minimumProfessionalScore = minimumProfessionalScore;
    this.minimumCategoryScore = minimumCategoryScore;
    this.sourceQualityCompetency = new SourceQualityCompetency();
    this.storyWorthinessCompetency = new StoryWorthinessCompetency();
    this.researchWorkflowV1 = new ResearchWorkflowV1();
  }

  evaluate(research) {
    const normalized = this.normalizeResearch(research);
    const sourceQualityAssessment = this.sourceQualityCompetency.assess(normalized);
    const storyWorthinessAssessment = this.storyWorthinessCompetency.assess(normalized);
    const researchPackage = this.researchWorkflowV1.build({
      normalizedResearch: normalized,
      sourceQualityAssessment,
      storyWorthinessAssessment
    });

    const scores = {
      sourceQuality: sourceQualityAssessment.sourceQualityScore,
      evidenceStrength: this.scoreEvidenceStrength(normalized),
      storyPotential: storyWorthinessAssessment.storyPotentialScore,
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
      sourceQualityReasoning: sourceQualityAssessment.reasoning,
      sourceQualityRationale: sourceQualityAssessment.rationale,
      storyWorthinessReasoning: storyWorthinessAssessment.reasoning,
      storyWorthinessRationale: storyWorthinessAssessment.rationale,
      researchPackage,
      scores,
      overallScore,
      classification,
      recommendations
    };
  }

  normalizeResearch(research) {
    const report = research?.report ?? research ?? {};

    return {
      findings: Array.isArray(report.findings) ? report.findings : [],
      providers: Array.isArray(report.providers) ? report.providers : [],
      executiveSummary: String(report.executiveSummary ?? '')
    };
  }

  scoreEvidenceStrength(input) {
    let score = 3;
    if (input.findings.length >= 3) score += 2;
    if (input.findings.length >= 6) score += 2;
    if (this.containsAny(input.executiveSummary, ['evidence', 'data', 'record', 'verified', 'corroborated'])) score += 2;
    return this.clamp(score);
  }

  scoreNovelty(input) {
    let score = 3;
    if (this.containsAny(input.executiveSummary, ['unexpected', 'rare', 'new', 'non-obvious', 'contradiction'])) score += 3;
    if (input.findings.length >= 5) score += 1;
    return this.clamp(score);
  }

  scoreAudienceInterest(input) {
    let score = 3;
    if (this.containsAny(input.executiveSummary, ['why this matters', 'audience', 'public', 'human', 'risk'])) score += 3;
    if (this.containsAny(input.executiveSummary, ['question', 'mystery', 'uncertain', 'what happens'])) score += 2;
    return this.clamp(score);
  }

  scoreCompleteness(input) {
    let score = 3;
    if (input.findings.length > 0) score += 2;
    if (input.providers.length > 0) score += 2;
    if (input.executiveSummary.trim().length >= 80) score += 2;
    return this.clamp(score);
  }

  classify(scores, overallScore) {
    const categoryScores = Object.values(scores);

    if (categoryScores.some(value => value < this.minimumCategoryScore) || overallScore < 6) {
      return 'FAIL';
    }

    if (overallScore < this.minimumProfessionalScore) {
      return 'CONDITIONAL';
    }

    return 'PASS';
  }

  buildRecommendations(scores) {
    const recommendations = [];

    if (scores.sourceQuality < 7) recommendations.push('Increase source diversity and source credibility before handoff.');
    if (scores.evidenceStrength < 7) recommendations.push('Strengthen claim-to-evidence linkage and corroboration.');
    if (scores.storyPotential < 7) recommendations.push('Extract higher-stakes findings with clearer narrative consequence.');
    if (scores.novelty < 6) recommendations.push('Expand investigation scope to surface non-obvious findings.');
    if (scores.audienceInterest < 7) recommendations.push('Improve audience relevance and curiosity framing in summary findings.');
    if (scores.completeness < 7) recommendations.push('Fill research coverage gaps before Storytelling handoff.');
    if (recommendations.length === 0) recommendations.push('Research quality is strong; continue iterative refinement with production feedback.');

    return recommendations;
  }

  buildEvidence(input, scores) {
    return [
      `PROVIDER_COUNT:${input.providers.length}`,
      `FINDING_COUNT:${input.findings.length}`,
      `SOURCE_QUALITY:${scores.sourceQuality}`,
      `EVIDENCE_STRENGTH:${scores.evidenceStrength}`,
      `NOVELTY:${scores.novelty}`
    ];
  }

  buildDiagnosis({ scores, overallScore, classification }) {
    if (classification === 'PASS') {
      return 'Research package is strong and suitable for storytelling handoff with minor iterative refinements.';
    }

    const weakest = Object.entries(scores)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .slice(0, 2)
      .map(([key]) => key)
      .join(', ');

    return `Research quality is ${classification.toLowerCase()} at overall score ${overallScore}; weakest dimensions: ${weakest}.`;
  }

  buildRevisedWorkPlan(scores) {
    const plan = [];

    if (scores.sourceQuality < 7) {
      plan.push('Replace weak sources with higher-credibility sources before handoff.');
    }

    if (scores.evidenceStrength < 7) {
      plan.push('Add stronger corroborated evidence for each core claim.');
    }

    if (scores.storyPotential < 7) {
      plan.push('Extract more compelling facts that increase narrative stakes.');
    }

    if (scores.novelty < 6) {
      plan.push('Expand research scope to surface non-obvious documentary angles.');
    }

    if (scores.audienceInterest < 7) {
      plan.push('Reframe findings to emphasize why the audience should care now.');
    }

    if (scores.completeness < 7) {
      plan.push('Fill missing research coverage before Storytelling begins.');
    }

    if (plan.length === 0) {
      plan.push('Maintain current research quality and deepen source triangulation for resilience.');
    }

    return plan;
  }

  containsAny(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  clamp(score) {
    return Math.max(0, Math.min(10, Math.round(score)));
  }
}
