export class HandoffReviewEngine {
  reviewResearchToStorytelling({ researchResult, researchEvaluation }) {
    const findings = Array.isArray(researchResult?.findings)
      ? researchResult.findings
      : Array.isArray(researchResult?.report?.findings)
        ? researchResult.report.findings
        : [];
    const executiveSummary = String(researchResult?.report?.executiveSummary ?? '').trim();

    const missingInformation = [];
    if (findings.length === 0) missingInformation.push('Research findings are missing.');
    if (executiveSummary.length === 0) missingInformation.push('Executive summary is missing.');

    const weaknesses = this.lowScoringCategories({
      scores: researchEvaluation?.scores ?? {},
      threshold: 7,
      labelMap: {
        sourceQuality: 'Source Quality',
        evidenceStrength: 'Evidence Strength',
        storyPotential: 'Story Potential',
        novelty: 'Novelty',
        audienceInterest: 'Audience Interest',
        completeness: 'Completeness'
      }
    });

    const questions = [];
    if ((researchEvaluation?.scores?.novelty ?? 10) < 6) {
      questions.push('What non-obvious finding should anchor the documentary narrative?');
    }
    if ((researchEvaluation?.scores?.evidenceStrength ?? 10) < 7) {
      questions.push('Which claims require stronger corroboration before scripting?');
    }

    const recommendedImprovements = Array.isArray(researchEvaluation?.recommendations)
      ? [...researchEvaluation.recommendations]
      : [];

    const peerReview = this.buildStorytellingPeerReviewFromResearchReasoning({
      researchEvaluation,
      findings
    });

    const decision = this.resolveResearchPeerReviewDecision({
      overallScore: Number(researchEvaluation?.overallScore ?? 0),
      hasMissingInfo: missingInformation.length > 0,
      hasCriticalWeakness: Object.values(researchEvaluation?.scores ?? {}).some(score => Number(score) < 5),
      peerReview
    });

    return this.buildReview({
      handoff: 'RESEARCH_TO_STORYTELLING',
      decision,
      missingInformation,
      weaknesses,
      questions,
      recommendedImprovements,
      peerReview,
      coachingMode: true
    });
  }

  reviewStorytellingToVisualDirector({ scriptResult, storytellingEvaluation, request }) {
    const script = String(scriptResult?.script ?? '').trim();
    const sceneDescription = String(request?.sceneDescription ?? '').trim();

    const missingInformation = [];
    if (script.length === 0) missingInformation.push('Narrative script content is missing.');
    if (sceneDescription.length === 0) missingInformation.push('Scene description is missing for visual planning.');

    const weaknesses = this.lowScoringCategories({
      scores: storytellingEvaluation?.scores ?? {},
      threshold: 7,
      labelMap: {
        openingStrength: 'Opening Strength',
        curiosity: 'Curiosity',
        narrativeFlow: 'Narrative Flow',
        informationDensity: 'Information Density',
        audienceCommitment: 'Audience Commitment'
      }
    });

    const questions = [];
    if ((storytellingEvaluation?.scores?.informationDensity ?? 10) < 7) {
      questions.push('Which evidence moments should be visualized to improve information density?');
    }

    const recommendedImprovements = Array.isArray(storytellingEvaluation?.improvementRecommendations)
      ? [...storytellingEvaluation.improvementRecommendations]
      : [];

    const decision = this.resolveDecision({
      overallScore: Number(storytellingEvaluation?.overallScore ?? 0),
      hasMissingInfo: missingInformation.length > 0,
      hasCriticalWeakness: Object.values(storytellingEvaluation?.scores ?? {}).some(score => Number(score) < 5)
    });

    return this.buildReview({
      handoff: 'STORYTELLING_TO_VISUAL_DIRECTOR',
      decision,
      missingInformation,
      weaknesses,
      questions,
      recommendedImprovements
    });
  }

  reviewVisualDirectorToImageGeneration({ evaluatedVisualPlan }) {
    const visualEvaluation = evaluatedVisualPlan?.evaluation ?? {};
    const sceneDescription = String(evaluatedVisualPlan?.sceneDescription ?? '').trim();
    const artStyle = String(evaluatedVisualPlan?.artStyle ?? '').trim();

    const missingInformation = [];
    if (sceneDescription.length === 0) missingInformation.push('Evaluated scene description is missing.');
    if (artStyle.length === 0) missingInformation.push('Evaluated art style is missing.');

    const weaknesses = this.lowScoringCategories({
      scores: visualEvaluation?.scores ?? {},
      threshold: 7,
      labelMap: {
        storyRelevance: 'Story Relevance',
        historicalAccuracy: 'Historical Accuracy',
        emotionalImpact: 'Emotional Impact',
        visualContinuity: 'Visual Continuity',
        cinematicComposition: 'Cinematic Composition',
        sceneQuality: 'Scene Quality'
      }
    });

    const questions = [];
    if ((visualEvaluation?.scores?.historicalAccuracy ?? 10) < 7) {
      questions.push('Which historical constraints must be enforced in generation prompts?');
    }
    if ((visualEvaluation?.scores?.visualContinuity ?? 10) < 7) {
      questions.push('What continuity anchors should persist across all generated scenes?');
    }

    const recommendedImprovements = Array.isArray(visualEvaluation?.recommendations)
      ? [...visualEvaluation.recommendations]
      : [];

    const decision = this.resolveDecision({
      overallScore: Number(visualEvaluation?.overallScore ?? 0),
      hasMissingInfo: missingInformation.length > 0,
      hasCriticalWeakness: Object.values(visualEvaluation?.scores ?? {}).some(score => Number(score) < 5)
    });

    return this.buildReview({
      handoff: 'VISUAL_DIRECTOR_TO_IMAGE_GENERATION',
      decision,
      missingInformation,
      weaknesses,
      questions,
      recommendedImprovements
    });
  }

  resolveDecision({ overallScore, hasMissingInfo, hasCriticalWeakness }) {
    if (hasMissingInfo || hasCriticalWeakness || overallScore < 6) {
      return 'REQUEST_REVISIONS';
    }

    if (overallScore < 7) {
      return 'ACCEPT_WITH_RECOMMENDATIONS';
    }

    return 'ACCEPT';
  }

  resolveResearchPeerReviewDecision({ overallScore, hasMissingInfo, hasCriticalWeakness, peerReview }) {
    const hasExplicitRevisionNeed = (
      Array.isArray(peerReview?.factsLackingStoryValue) && peerReview.factsLackingStoryValue.length > 0
    ) || (
      Array.isArray(peerReview?.factsShouldBeRemoved) && peerReview.factsShouldBeRemoved.length > 0
    ) || (
      Array.isArray(peerReview?.additionalInformationNeeded) && peerReview.additionalInformationNeeded.length > 0
    );

    if (hasMissingInfo || hasCriticalWeakness || overallScore < 6 || hasExplicitRevisionNeed) {
      return 'REQUEST_RESEARCH_REVISION';
    }

    if (overallScore < 7) {
      return 'ACCEPT_WITH_RECOMMENDATIONS';
    }

    return 'ACCEPT';
  }

  lowScoringCategories({ scores, threshold, labelMap }) {
    return Object.entries(scores)
      .filter(([, value]) => Number(value) < threshold)
      .map(([key, value]) => `${labelMap[key] ?? key}: ${Number(value)}`);
  }

  buildReview({ handoff, decision, missingInformation, weaknesses, questions, recommendedImprovements, peerReview = null, coachingMode = false }) {
    return {
      handoff,
      decision,
      missingInformation,
      weaknesses,
      questions,
      recommendedImprovements,
      peerReview,
      structuredFeedback: {
        coachingMode,
        revisionRequested: decision === 'REQUEST_REVISIONS' || decision === 'REQUEST_RESEARCH_REVISION',
        priority: (decision === 'REQUEST_REVISIONS' || decision === 'REQUEST_RESEARCH_REVISION') ? 'HIGH' : decision === 'ACCEPT_WITH_RECOMMENDATIONS' ? 'MEDIUM' : 'LOW',
        summary: this.buildSummary(decision, missingInformation, weaknesses),
        actionItems: (decision === 'REQUEST_REVISIONS' || decision === 'REQUEST_RESEARCH_REVISION')
          ? this.buildActionItems(missingInformation, weaknesses, recommendedImprovements)
          : [...recommendedImprovements]
      }
    };
  }

  buildSummary(decision, missingInformation, weaknesses) {
    if (decision === 'ACCEPT') {
      return 'Handoff accepted with no blocking issues.';
    }

    if (decision === 'ACCEPT_WITH_RECOMMENDATIONS') {
      return 'Handoff accepted with targeted recommendations to improve downstream quality.';
    }

    if (decision === 'REQUEST_RESEARCH_REVISION') {
      return `Storytelling requests research revision as coaching: ${missingInformation.length} missing information item(s), ${weaknesses.length} weakness(es), and fact-level story-worthiness adjustments.`;
    }

    return `Handoff requires revisions due to ${missingInformation.length} missing information item(s) and ${weaknesses.length} weakness(es).`;
  }

  buildStorytellingPeerReviewFromResearchReasoning({ researchEvaluation, findings }) {
    const judgments = Array.isArray(researchEvaluation?.storyWorthinessReasoning?.findingJudgments)
      ? researchEvaluation.storyWorthinessReasoning.findingJudgments
      : [];

    const factsLackingStoryValue = judgments
      .filter(judgment => Number(judgment?.storyWorthinessScore ?? 0) < 6)
      .map(judgment => this.toFactReference(judgment));

    const factsShouldBecomeOpeningCandidates = judgments
      .filter(judgment => judgment?.decision === 'OPENING_CANDIDATE')
      .map(judgment => this.toFactReference(judgment));

    const factsCreateCuriosity = judgments
      .filter(judgment => Number(judgment?.dimensions?.audienceCuriosityValue ?? 0) >= 7)
      .map(judgment => this.toFactReference(judgment));

    const factsShouldBeRemoved = judgments
      .filter(judgment => judgment?.decision === 'EXCLUDE' || Number(judgment?.storyWorthinessScore ?? 0) <= 4)
      .map(judgment => this.toFactReference(judgment));

    const additionalInformationNeeded = this.deriveAdditionalInformationRequests({
      judgments,
      findings
    });

    return {
      factsLackingStoryValue,
      factsShouldBecomeOpeningCandidates,
      factsCreateCuriosity,
      factsShouldBeRemoved,
      additionalInformationNeeded
    };
  }

  deriveAdditionalInformationRequests({ judgments, findings }) {
    const requests = [];

    const highEmotionWeakEvidence = judgments.filter(judgment => {
      const emotional = Number(judgment?.dimensions?.emotionalSignificance ?? 0);
      const evidence = Number(judgment?.evidenceStrength ?? 0);
      return emotional >= 7 && evidence <= 4;
    });

    if (highEmotionWeakEvidence.length > 0) {
      requests.push('Add corroborated evidence for high-emotion claims before narrative escalation.');
    }

    const lowCentralRelevance = judgments.filter(
      judgment => Number(judgment?.dimensions?.centralQuestionRelevance ?? 0) < 5
    );
    if (lowCentralRelevance.length > 0) {
      requests.push('Provide facts that connect directly to the documentary central question.');
    }

    const thinCoverage = !Array.isArray(findings) || findings.length < 3;
    if (thinCoverage) {
      requests.push('Expand fact set with additional high-curiosity and high-conflict findings.');
    }

    return requests;
  }

  toFactReference(judgment) {
    return {
      findingId: judgment?.findingId ?? null,
      findingText: judgment?.findingText ?? '',
      reason: judgment?.reasoning ?? 'No explicit reasoning provided.'
    };
  }

  buildActionItems(missingInformation, weaknesses, recommendedImprovements) {
    const items = [];

    missingInformation.forEach(item => {
      items.push(`Provide missing information: ${item}`);
    });

    weaknesses.forEach(item => {
      items.push(`Address weakness: ${item}`);
    });

    recommendedImprovements.forEach(item => {
      items.push(item);
    });

    return items;
  }
}
