export interface ImageGenerationCategoryScores {
  promptFidelity: number;
  historicalAccuracy: number;
  sceneAccuracy: number;
  characterConsistency: number;
  visualQuality: number;
  documentaryStyleConsistency: number;
}

export interface ImageGenerationEvaluationResult {
  categoryScores: ImageGenerationCategoryScores;
  overallScore: number;
  evidence: string[];
  diagnosis: string;
  prescription: string[];
  expectedImprovement: string;
  classification: 'PASS' | 'CONDITIONAL' | 'FAIL';
}

export interface ImageGenerationEvaluationInput {
  evaluatedVisualPlan?: {
    sceneDescription?: string;
    artStyle?: string;
    evaluation?: {
      overallScore?: number;
      classification?: string;
    };
  };
  imageFiles?: string[];
  generatedScenes?: string[];
}

export class ImageGenerationEvaluator {
  evaluate(input: ImageGenerationEvaluationInput): ImageGenerationEvaluationResult {
    const normalized = this.normalize(input);

    const categoryScores: ImageGenerationCategoryScores = {
      promptFidelity: this.scorePromptFidelity(normalized),
      historicalAccuracy: this.scoreHistoricalAccuracy(normalized),
      sceneAccuracy: this.scoreSceneAccuracy(normalized),
      characterConsistency: this.scoreCharacterConsistency(normalized),
      visualQuality: this.scoreVisualQuality(normalized),
      documentaryStyleConsistency: this.scoreDocumentaryStyleConsistency(normalized)
    };

    const overallScore = Number((Object.values(categoryScores).reduce((a, b) => a + b, 0) / 6).toFixed(1));

    const evidence = this.buildEvidence(normalized, categoryScores);
    const diagnosis = this.buildDiagnosis(categoryScores, overallScore);
    const prescription = this.buildPrescription(categoryScores);
    const expectedImprovement = this.buildExpectedImprovement(categoryScores, overallScore);
    const classification = this.classify(categoryScores, overallScore);

    return {
      categoryScores,
      overallScore,
      evidence,
      diagnosis,
      prescription,
      expectedImprovement,
      classification
    };
  }

  private normalize(input: ImageGenerationEvaluationInput) {
    return {
      sceneDescription: String(input.evaluatedVisualPlan?.sceneDescription ?? ''),
      artStyle: String(input.evaluatedVisualPlan?.artStyle ?? ''),
      visualOverallScore: Number(input.evaluatedVisualPlan?.evaluation?.overallScore ?? 0),
      imageFiles: Array.isArray(input.imageFiles) ? input.imageFiles : [],
      generatedScenes: Array.isArray(input.generatedScenes) ? input.generatedScenes : []
    };
  }

  private scorePromptFidelity(data: ReturnType<ImageGenerationEvaluator['normalize']>): number {
    let score = 3;
    if (data.sceneDescription.length >= 30) score += 2;
    if (data.visualOverallScore >= 7) score += 2;
    if (data.generatedScenes.length > 0) score += 2;
    if (data.imageFiles.length > 0) score += 1;
    return this.clamp(score);
  }

  private scoreHistoricalAccuracy(data: ReturnType<ImageGenerationEvaluator['normalize']>): number {
    let score = 4;
    if (this.containsAny(data.sceneDescription, ['historical', 'archive', 'documented', 'period'])) score += 2;
    if (data.visualOverallScore >= 7) score += 2;
    if (data.imageFiles.length >= 2) score += 1;
    return this.clamp(score);
  }

  private scoreSceneAccuracy(data: ReturnType<ImageGenerationEvaluator['normalize']>): number {
    let score = 3;
    if (data.sceneDescription.length >= 50) score += 2;
    if (data.imageFiles.length >= 1) score += 2;
    if (data.generatedScenes.length >= 1) score += 2;
    if (data.generatedScenes.length >= 2) score += 1;
    return this.clamp(score);
  }

  private scoreCharacterConsistency(data: ReturnType<ImageGenerationEvaluator['normalize']>): number {
    let score = 4;
    if (data.imageFiles.length >= 2) score += 2;
    if (data.generatedScenes.length >= 2) score += 2;
    if (data.visualOverallScore >= 7) score += 1;
    return this.clamp(score);
  }

  private scoreVisualQuality(data: ReturnType<ImageGenerationEvaluator['normalize']>): number {
    let score = 3;
    if (data.imageFiles.length >= 1) score += 2;
    if (data.imageFiles.length >= 3) score += 2;
    if (data.artStyle.length > 0) score += 2;
    if (data.visualOverallScore >= 7) score += 1;
    return this.clamp(score);
  }

  private scoreDocumentaryStyleConsistency(data: ReturnType<ImageGenerationEvaluator['normalize']>): number {
    let score = 3;
    if (this.containsAny(data.artStyle, ['documentary', 'cinematic', 'realism'])) score += 3;
    if (data.visualOverallScore >= 7) score += 2;
    if (data.generatedScenes.length >= 2) score += 1;
    return this.clamp(score);
  }

  private buildEvidence(data: ReturnType<ImageGenerationEvaluator['normalize']>, scores: ImageGenerationCategoryScores): string[] {
    return [
      `IMAGE_FILE_COUNT:${data.imageFiles.length}`,
      `GENERATED_SCENE_COUNT:${data.generatedScenes.length}`,
      `VISUAL_PLAN_SCORE:${data.visualOverallScore}`,
      `PROMPT_FIDELITY:${scores.promptFidelity}`,
      `SCENE_ACCURACY:${scores.sceneAccuracy}`
    ];
  }

  private buildDiagnosis(scores: ImageGenerationCategoryScores, overallScore: number): string {
    if (overallScore >= 7) {
      return 'Image generation execution is professional-ready and aligned with evaluated visual direction.';
    }

    if (overallScore >= 6) {
      return 'Image generation is usable but needs targeted corrections for consistency and fidelity.';
    }

    return 'Image generation quality is below professional threshold and requires corrective iteration.';
  }

  private buildPrescription(scores: ImageGenerationCategoryScores): string[] {
    const actions: string[] = [];

    if (scores.promptFidelity < 7) actions.push('Tighten prompt mapping to evaluated visual plan fields.');
    if (scores.historicalAccuracy < 7) actions.push('Add stronger historical constraints in scene execution metadata.');
    if (scores.sceneAccuracy < 7) actions.push('Increase scene-detail specificity before generation.');
    if (scores.characterConsistency < 7) actions.push('Introduce continuity controls for recurring subjects.');
    if (scores.visualQuality < 7) actions.push('Improve quality safeguards for output resolution and visual readability.');
    if (scores.documentaryStyleConsistency < 7) actions.push('Enforce documentary style anchors across generated scene set.');

    if (actions.length === 0) {
      actions.push('Maintain current execution profile and monitor quality drift across missions.');
    }

    return actions;
  }

  private buildExpectedImprovement(scores: ImageGenerationCategoryScores, overallScore: number): string {
    const lowCategories = Object.entries(scores)
      .filter(([, value]) => value < 7)
      .map(([key]) => key);

    if (lowCategories.length === 0) {
      return 'Sustain current performance and target incremental gains in historical precision and style stability.';
    }

    return `Improvement expected in: ${lowCategories.join(', ')} after applying prescription actions.`;
  }

  private classify(scores: ImageGenerationCategoryScores, overallScore: number): 'PASS' | 'CONDITIONAL' | 'FAIL' {
    if (Object.values(scores).some(score => score < 5) || overallScore < 6) return 'FAIL';
    if (overallScore < 7) return 'CONDITIONAL';
    return 'PASS';
  }

  private containsAny(text: string, tokens: string[]): boolean {
    const normalized = text.toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}
