export class DocumentaryWritingGovernanceScorer {
  score({ providerResult = {}, governance = {}, input = {} } = {}) {
    const storytelling = governance?.storytellingEvaluation ?? {};
    const editorial = governance?.editorialReview ?? {};
    const factual = governance?.factualReview ?? {};
    const result = providerResult?.result ?? {};

    const hook = this.normalizeScore(storytelling?.scores?.openingStrength ?? storytelling?.score?.categoryScores?.openingStrength);
    const curiosity = this.normalizeScore(storytelling?.scores?.curiosity ?? storytelling?.score?.categoryScores?.curiosity);
    const narrativeFlow = this.normalizeScore(storytelling?.scores?.narrativeFlow ?? storytelling?.score?.categoryScores?.narrativeFlow);
    const informationDensity = this.normalizeScore(storytelling?.scores?.informationDensity ?? storytelling?.score?.categoryScores?.informationDensity);
    const audienceCommitment = this.normalizeScore(storytelling?.scores?.audienceCommitment ?? storytelling?.score?.categoryScores?.audienceCommitment);

    const documentaryVoice = this.scoreDocumentaryVoice({ screenplay: result?.screenplay, editorial });
    const factualPreservation = this.normalizeScore((Number(factual?.mappingRate ?? 0) * 10));
    const goldStandardCompliance = this.scoreGoldStandardCompliance({ storytelling, factual });
    const estimatedNarrationQuality = this.scoreEstimatedNarrationQuality({ result, input });
    const overallExecutiveProducerScore = this.normalizeScore(storytelling?.overallScore ?? storytelling?.score?.overall ?? 0);

    return {
      hook,
      curiosity,
      narrativeFlow,
      documentaryVoice,
      informationDensity,
      audienceCommitment,
      factualPreservation,
      goldStandardCompliance,
      estimatedNarrationQuality,
      overallExecutiveProducerScore,
      weaknesses: this.collectWeaknesses({
        hook,
        curiosity,
        narrativeFlow,
        documentaryVoice,
        informationDensity,
        audienceCommitment,
        factualPreservation,
        goldStandardCompliance,
        estimatedNarrationQuality,
        editorial,
        storytelling,
        factual
      })
    };
  }

  scoreDocumentaryVoice({ screenplay = '', editorial = {} } = {}) {
    const text = String(screenplay ?? '');
    if (text.trim().length === 0) return 0;

    const penalties = [
      /\bthe audience should\b/gi,
      /\bthis documentary\b/gi,
      /\bemotional journey\b/gi,
      /\bwe are telling\b/gi
    ];

    let score = 8;
    for (const pattern of penalties) {
      const matches = text.match(pattern);
      if (matches?.length) {
        score -= Math.min(3, matches.length);
      }
    }

    const narratorVoiceAuthentic = Boolean(editorial?.reviewChecklist?.narratorVoiceAuthentic);
    if (!narratorVoiceAuthentic) {
      score -= 2;
    }

    return this.normalizeScore(score);
  }

  scoreGoldStandardCompliance({ storytelling = {}, factual = {} } = {}) {
    const overall = this.normalizeScore(storytelling?.overallScore ?? storytelling?.score?.overall ?? 0);
    const classification = String(storytelling?.classification ?? storytelling?.score?.classification ?? '').toUpperCase();
    const factualPass = String(factual?.status ?? '').toUpperCase() === 'PASS';

    let score = overall;
    if (classification === 'PASS') score += 1;
    if (classification === 'FAIL') score -= 1;
    if (!factualPass) score -= 1;

    return this.normalizeScore(score);
  }

  scoreEstimatedNarrationQuality({ result = {}, input = {} } = {}) {
    const runtime = Number(result?.estimatedNarrationRuntime?.seconds ?? 0);
    const targetRuntime = Number(input?.targetRuntime ?? 0);

    if (runtime <= 0 || targetRuntime <= 0) {
      return 5;
    }

    const deltaRatio = Math.abs(runtime - targetRuntime) / targetRuntime;
    if (deltaRatio <= 0.1) return 9;
    if (deltaRatio <= 0.2) return 8;
    if (deltaRatio <= 0.35) return 7;
    if (deltaRatio <= 0.5) return 6;

    return 4;
  }

  collectWeaknesses(scores) {
    const weaknessMap = [
      ['hook', scores.hook],
      ['curiosity', scores.curiosity],
      ['narrativeFlow', scores.narrativeFlow],
      ['documentaryVoice', scores.documentaryVoice],
      ['informationDensity', scores.informationDensity],
      ['audienceCommitment', scores.audienceCommitment],
      ['factualPreservation', scores.factualPreservation],
      ['goldStandardCompliance', scores.goldStandardCompliance],
      ['estimatedNarrationQuality', scores.estimatedNarrationQuality]
    ];

    const weak = weaknessMap
      .filter(([, value]) => Number(value) < 7)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map(([key, value]) => ({ category: key, score: value }));

    const editorialRequests = Array.isArray(scores?.editorial?.revisionRequests)
      ? scores.editorial.revisionRequests.slice(0, 5).map(item => String(item?.issueType ?? '').trim()).filter(Boolean)
      : [];

    const suggestions = Array.isArray(scores?.storytelling?.recommendedImprovements)
      ? scores.storytelling.recommendedImprovements.slice(0, 5)
      : [];

    return {
      weakCategories: weak,
      editorialIssueTypes: editorialRequests,
      recommendationSignals: suggestions,
      factualStatus: scores?.factual?.status ?? 'UNKNOWN'
    };
  }

  normalizeScore(value) {
    const numeric = Number(value ?? 0);
    if (Number.isNaN(numeric)) return 0;
    const clamped = Math.max(0, Math.min(10, numeric));
    return Number(clamped.toFixed(2));
  }
}
