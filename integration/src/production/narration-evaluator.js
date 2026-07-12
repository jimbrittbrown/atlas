export class NarrationEvaluator {
  evaluate(plan = {}) {
    const normalized = this.normalize(plan);

    const categoryScores = {
      naturalFlow: this.scoreNaturalFlow(normalized),
      emotionalDelivery: this.scoreEmotionalDelivery(normalized),
      pacing: this.scorePacing(normalized),
      clarity: this.scoreClarity(normalized),
      listenerEngagement: this.scoreListenerEngagement(normalized)
    };

    const overallScore = Number(((
      categoryScores.naturalFlow
      + categoryScores.emotionalDelivery
      + categoryScores.pacing
      + categoryScores.clarity
      + categoryScores.listenerEngagement
    ) / 5).toFixed(1));

    const scores = {
      ...categoryScores,
      overallNarrationQuality: Math.max(0, Math.min(10, Math.round(overallScore)))
    };

    const diagnosis = this.buildDiagnosis(scores, overallScore);
    const recommendedImprovements = this.buildImprovements(scores);
    const classification = this.classify(scores, overallScore);
    const evidence = this.buildEvidence(normalized, scores);
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
      recommendedImprovements,
      revisedWorkPlan,
      scores,
      overallScore,
      diagnosis,
      recommendedImprovements,
      classification
    };
  }

  normalize(plan) {
    return {
      narrationText: String(plan.narrationText ?? ''),
      voiceStyle: String(plan.voiceStyle ?? ''),
      emphasisTargets: Array.isArray(plan.emphasisTargets) ? plan.emphasisTargets : [],
      pauseHints: Array.isArray(plan.pauseHints) ? plan.pauseHints : [],
      pronunciationNotes: Array.isArray(plan.pronunciationNotes) ? plan.pronunciationNotes : []
    };
  }

  scoreNaturalFlow(plan) {
    let score = 3;
    if (plan.narrationText.length >= 120) score += 2;
    if (this.containsAny(plan.narrationText, ['then', 'however', 'meanwhile', 'as a result'])) score += 2;
    if (this.containsAny(plan.voiceStyle, ['documentary', 'conversational', 'cinematic'])) score += 2;
    return this.clamp(score);
  }

  scoreEmotionalDelivery(plan) {
    let score = 3;
    if (plan.emphasisTargets.length >= 1) score += 2;
    if (plan.emphasisTargets.length >= 3) score += 1;
    if (this.containsAny(plan.narrationText, ['risk', 'loss', 'hope', 'pressure', 'consequence'])) score += 2;
    if (this.containsAny(plan.voiceStyle, ['dramatic', 'measured', 'empathetic'])) score += 2;
    return this.clamp(score);
  }

  scorePacing(plan) {
    let score = 3;
    if (plan.pauseHints.length >= 1) score += 2;
    if (plan.pauseHints.length >= 3) score += 2;
    const sentenceCount = plan.narrationText.split(/[.!?]+/).filter(Boolean).length;
    if (sentenceCount >= 4) score += 2;
    return this.clamp(score);
  }

  scoreClarity(plan) {
    let score = 3;
    if (plan.pronunciationNotes.length >= 1) score += 2;
    if (plan.pronunciationNotes.length >= 3) score += 1;
    if (this.containsAny(plan.narrationText, ['evidence', 'documented', 'record', 'timeline'])) score += 2;
    if (plan.narrationText.length >= 80) score += 2;
    return this.clamp(score);
  }

  scoreListenerEngagement(plan) {
    let score = 3;
    if (this.containsAny(plan.narrationText, ['why this matters', 'what happens next', 'the question is'])) score += 3;
    if (this.containsAny(plan.narrationText, ['but', 'yet', 'still', 'until'])) score += 2;
    if (plan.emphasisTargets.length >= 2) score += 1;
    return this.clamp(score);
  }

  buildDiagnosis(scores, overall) {
    if (overall >= 7) return 'Narration plan is professional-ready with strong pacing and engagement foundations.';
    if (overall >= 6) return 'Narration plan is partially ready but requires targeted improvements before final voice generation.';
    return 'Narration plan quality is below professional threshold and requires revision prior to audio generation.';
  }

  buildImprovements(scores) {
    const improvements = [];
    if (scores.naturalFlow < 7) improvements.push('Refine line transitions so delivery sounds more natural and less segmented.');
    if (scores.emotionalDelivery < 7) improvements.push('Add clearer emotional emphasis targets aligned to narrative stakes.');
    if (scores.pacing < 7) improvements.push('Insert strategic pause hints around dense or high-stakes narration lines.');
    if (scores.clarity < 7) improvements.push('Improve pronunciation notes and articulation planning for key terms.');
    if (scores.listenerEngagement < 7) improvements.push('Increase listener continuation cues and narrative momentum language.');
    if (improvements.length === 0) improvements.push('Narration plan quality is strong; maintain pattern and validate against listener metrics.');
    return improvements;
  }

  buildEvidence(plan, scores) {
    return [
      `NARRATION_TEXT_LENGTH:${plan.narrationText.length}`,
      `EMPHASIS_TARGET_COUNT:${plan.emphasisTargets.length}`,
      `PAUSE_HINT_COUNT:${plan.pauseHints.length}`,
      `PRONUNCIATION_NOTE_COUNT:${plan.pronunciationNotes.length}`,
      `PACING:${scores.pacing}`
    ];
  }

  buildRevisedWorkPlan(scores) {
    const plan = [];

    if (scores.naturalFlow < 7) {
      plan.push('Refine phrasing transitions to improve natural spoken flow.');
    }

    if (scores.emotionalDelivery < 7) {
      plan.push('Increase emphasis on high-stakes phrases and reduce flat delivery segments.');
    }

    if (scores.pacing < 7) {
      plan.push('Slow pacing in dense sections and add strategic pauses before key reveals.');
    }

    if (scores.clarity < 7) {
      plan.push('Improve articulation guidance and pronunciation notes for critical terms.');
    }

    if (scores.listenerEngagement < 7) {
      plan.push('Increase listener continuation cues and narrative momentum language.');
    }

    if (plan.length === 0) {
      plan.push('Maintain current narration quality and apply micro-adjustments from listener analytics.');
    }

    return plan;
  }

  classify(scores, overall) {
    const critical = [
      scores.naturalFlow,
      scores.pacing,
      scores.clarity,
      scores.listenerEngagement
    ];

    if (critical.some(score => score < 5) || overall < 6) return 'FAIL';
    if (overall < 7) return 'CONDITIONAL';
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
