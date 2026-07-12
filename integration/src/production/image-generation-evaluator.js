export class ImageGenerationEvaluator {
  evaluate(input = {}) {
    const data = this.normalize(input);

    const categoryScores = {
      promptFidelity: this.scorePromptFidelity(data),
      historicalAccuracy: this.scoreHistoricalAccuracy(data),
      sceneAccuracy: this.scoreSceneAccuracy(data),
      characterConsistency: this.scoreCharacterConsistency(data),
      visualQuality: this.scoreVisualQuality(data),
      documentaryStyleConsistency: this.scoreDocumentaryStyleConsistency(data)
    };

    const overallScore = Number((Object.values(categoryScores).reduce((a, b) => a + b, 0) / 6).toFixed(1));
    const evidence = this.buildEvidence(data, categoryScores);
    const diagnosis = this.buildDiagnosis(categoryScores, overallScore);
    const recommendedImprovements = this.buildPrescription(categoryScores);
    const revisedWorkPlan = this.buildRevisedWorkPlan(categoryScores);
    const expectedImprovement = this.buildExpectedImprovement(categoryScores, overallScore);
    const classification = this.classify(categoryScores, overallScore);

    const score = {
      overall: overallScore,
      categoryScores,
      classification
    };

    return {
      score,
      evidence,
      diagnosis,
      recommendedImprovements,
      revisedWorkPlan,
      categoryScores,
      overallScore,
      prescription: recommendedImprovements,
      expectedImprovement,
      classification
    };
  }

  normalize(input) {
    return {
      sceneDescription: String(input.evaluatedVisualPlan?.sceneDescription ?? ''),
      artStyle: String(input.evaluatedVisualPlan?.artStyle ?? ''),
      visualOverallScore: Number(input.evaluatedVisualPlan?.evaluation?.overallScore ?? 0),
      imageFiles: Array.isArray(input.imageFiles) ? input.imageFiles : [],
      generatedScenes: Array.isArray(input.generatedScenes) ? input.generatedScenes : []
    };
  }

  scorePromptFidelity(data) {
    let score = 3;
    if (data.sceneDescription.length >= 30) score += 2;
    if (data.visualOverallScore >= 7) score += 2;
    if (data.generatedScenes.length > 0) score += 2;
    if (data.imageFiles.length > 0) score += 1;
    return this.clamp(score);
  }

  scoreHistoricalAccuracy(data) {
    let score = 4;
    if (this.containsAny(data.sceneDescription, ['historical', 'archive', 'documented', 'period'])) score += 2;
    if (data.visualOverallScore >= 7) score += 2;
    if (data.imageFiles.length >= 2) score += 1;
    return this.clamp(score);
  }

  scoreSceneAccuracy(data) {
    let score = 3;
    if (data.sceneDescription.length >= 50) score += 2;
    if (data.imageFiles.length >= 1) score += 2;
    if (data.generatedScenes.length >= 1) score += 2;
    if (data.generatedScenes.length >= 2) score += 1;
    return this.clamp(score);
  }

  scoreCharacterConsistency(data) {
    let score = 4;
    if (data.imageFiles.length >= 2) score += 2;
    if (data.generatedScenes.length >= 2) score += 2;
    if (data.visualOverallScore >= 7) score += 1;
    return this.clamp(score);
  }

  scoreVisualQuality(data) {
    let score = 3;
    if (data.imageFiles.length >= 1) score += 2;
    if (data.imageFiles.length >= 3) score += 2;
    if (data.artStyle.length > 0) score += 2;
    if (data.visualOverallScore >= 7) score += 1;
    return this.clamp(score);
  }

  scoreDocumentaryStyleConsistency(data) {
    let score = 3;
    if (this.containsAny(data.artStyle, ['documentary', 'cinematic', 'realism'])) score += 3;
    if (data.visualOverallScore >= 7) score += 2;
    if (data.generatedScenes.length >= 2) score += 1;
    return this.clamp(score);
  }

  buildEvidence(data, scores) {
    return [
      `IMAGE_FILE_COUNT:${data.imageFiles.length}`,
      `GENERATED_SCENE_COUNT:${data.generatedScenes.length}`,
      `VISUAL_PLAN_SCORE:${data.visualOverallScore}`,
      `PROMPT_FIDELITY:${scores.promptFidelity}`,
      `SCENE_ACCURACY:${scores.sceneAccuracy}`
    ];
  }

  buildDiagnosis(scores, overallScore) {
    if (overallScore >= 7) {
      return 'Image generation execution is professional-ready and aligned with evaluated visual direction.';
    }

    if (overallScore >= 6) {
      return 'Image generation is usable but needs targeted corrections for consistency and fidelity.';
    }

    return 'Image generation quality is below professional threshold and requires corrective iteration.';
  }

  buildPrescription(scores) {
    const actions = [];

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

  buildRevisedWorkPlan(scores) {
    const plan = [];

    if (scores.promptFidelity < 7) {
      plan.push('Regenerate scenes with tighter adherence to evaluated visual directives.');
    }

    if (scores.historicalAccuracy < 7) {
      plan.push('Improve historical realism by enforcing era-accurate scene constraints.');
    }

    if (scores.sceneAccuracy < 7) {
      plan.push('Replace weak scene outputs with higher-fidelity scene executions.');
    }

    if (scores.characterConsistency < 7) {
      plan.push('Maintain subject continuity across generated scene sequence.');
    }

    if (scores.visualQuality < 7) {
      plan.push('Increase visual clarity and resolution readiness for video assembly.');
    }

    if (scores.documentaryStyleConsistency < 7) {
      plan.push('Strengthen documentary realism and reduce style drift across outputs.');
    }

    if (plan.length === 0) {
      plan.push('Maintain current image generation quality and monitor drift in downstream review.');
    }

    return plan;
  }

  buildExpectedImprovement(scores, overallScore) {
    const lowCategories = Object.entries(scores)
      .filter(([, value]) => value < 7)
      .map(([key]) => key);

    if (lowCategories.length === 0) {
      return 'Sustain current performance and target incremental gains in historical precision and style stability.';
    }

    return `Improvement expected in: ${lowCategories.join(', ')} after applying prescription actions.`;
  }

  classify(scores, overallScore) {
    if (Object.values(scores).some(score => score < 5) || overallScore < 6) return 'FAIL';
    if (overallScore < 7) return 'CONDITIONAL';
    return 'PASS';
  }

  containsAny(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  clamp(value) {
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}
