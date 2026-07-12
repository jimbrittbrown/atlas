export class ResearchWorkflowV1 {
  build({ normalizedResearch = {}, sourceQualityAssessment = {}, storyWorthinessAssessment = {} } = {}) {
    const findings = Array.isArray(normalizedResearch?.findings) ? normalizedResearch.findings : [];
    const providers = Array.isArray(normalizedResearch?.providers) ? normalizedResearch.providers : [];
    const sourceClassifications = Array.isArray(sourceQualityAssessment?.reasoning?.sourceClassification?.classifications)
      ? sourceQualityAssessment.reasoning.sourceClassification.classifications
      : [];
    const rejectedSources = Array.isArray(sourceQualityAssessment?.reasoning?.rejectionCriteria?.rejectedSources)
      ? sourceQualityAssessment.reasoning.rejectionCriteria.rejectedSources
      : [];
    const rejectedSourceNames = new Set(rejectedSources.map(entry => String(entry?.source ?? '').toLowerCase()));

    const acceptedSources = sourceClassifications
      .filter(entry => !rejectedSourceNames.has(String(entry?.source ?? '').toLowerCase()))
      .map(entry => ({
        source: entry.source,
        type: entry.type,
        reason: entry.rationale ?? 'Accepted: source quality is sufficient for documentary use.'
      }));

    const normalizedRejectedSources = rejectedSources.map(entry => ({
      source: entry.source,
      reason: entry.reason ?? 'Rejected by source quality threshold.'
    }));

    const findingJudgments = Array.isArray(storyWorthinessAssessment?.reasoning?.findingJudgments)
      ? storyWorthinessAssessment.reasoning.findingJudgments
      : [];

    const topOpeningCandidates = findingJudgments
      .filter(judgment => judgment?.decision === 'OPENING_CANDIDATE')
      .map(judgment => this.toFindingRecord(judgment));

    const fallbackOpeningCandidates = this.buildFallbackOpeningCandidates({
      findings,
      verifiedDocumentaryFacts: []
    });
    const resolvedOpeningCandidates = [...topOpeningCandidates, ...fallbackOpeningCandidates]
      .filter((entry, index, arr) => {
        const key = String(entry?.findingId ?? entry?.findingText ?? '').toLowerCase();
        return key.length > 0 && arr.findIndex(item => String(item?.findingId ?? item?.findingText ?? '').toLowerCase() === key) === index;
      })
      .slice(0, 12);

    const highestStoryValueFacts = [...findingJudgments]
      .filter(judgment => Number(judgment?.storyWorthinessScore ?? 0) >= 7 && judgment?.decision !== 'EXCLUDE')
      .sort((left, right) => Number(right?.storyWorthinessScore ?? 0) - Number(left?.storyWorthinessScore ?? 0))
      .map(judgment => this.toFindingRecord(judgment));

    const verifiedDocumentaryFacts = this.buildVerifiedDocumentaryFacts({
      findingJudgments,
      findings
    });
    const resolvedHighestStoryValueFacts = this.buildResolvedHighestStoryValueFacts({
      highestStoryValueFacts,
      verifiedDocumentaryFacts
    });
    const majorEventTimeline = this.buildMajorEventTimeline({
      findings,
      verifiedDocumentaryFacts,
      centralQuestion: storyWorthinessAssessment?.reasoning?.centralQuestion
    });
    const majorPeopleAndOrganizations = this.buildMajorPeopleAndOrganizations({
      findings,
      verifiedDocumentaryFacts,
      providers
    });
    const causeAndEffectRelationships = this.buildCauseAndEffectRelationships({
      findings,
      verifiedDocumentaryFacts
    });
    const majorTurningPoints = this.buildMajorTurningPoints({
      findings,
      verifiedDocumentaryFacts,
      majorEventTimeline
    });
    const contradictionsAndCompetingViewpoints = this.buildContradictionsAndCompetingViewpoints({
      findings,
      sourceQualityAssessment,
      storyWorthinessAssessment
    });
    const strongEndingInsights = this.buildStrongEndingInsights({
      findings,
      verifiedDocumentaryFacts,
      centralQuestion: storyWorthinessAssessment?.reasoning?.centralQuestion
    });
    const majorClaimConfidenceScores = this.buildMajorClaimConfidenceScores({
      verifiedDocumentaryFacts,
      sourceQualityAssessment,
      findingJudgments
    });

    const corroborationSummary = this.buildCorroborationSummary({
      findingJudgments,
      sourceQualityAssessment
    });

    const outstandingResearchGaps = this.buildOutstandingResearchGaps({
      normalizedResearch,
      sourceQualityAssessment,
      storyWorthinessAssessment,
      highestStoryValueFacts,
      topOpeningCandidates: resolvedOpeningCandidates,
      corroborationSummary
    });

    const confidence = {
      level: String(sourceQualityAssessment?.confidence?.level ?? 'LOW'),
      score: Number(sourceQualityAssessment?.confidence?.score ?? 0),
      rationale: String(sourceQualityAssessment?.confidence?.conclusion ?? 'Evidence confidence unavailable.')
    };

    const dossierReadiness = this.buildDocumentaryDossierReadiness({
      verifiedDocumentaryFacts,
      topOpeningCandidates: resolvedOpeningCandidates,
      highestStoryValueFacts: resolvedHighestStoryValueFacts,
      majorEventTimeline,
      majorPeopleAndOrganizations,
      causeAndEffectRelationships,
      majorTurningPoints,
      contradictionsAndCompetingViewpoints,
      strongEndingInsights,
      majorClaimConfidenceScores,
      sourceClassifications,
      outstandingResearchGaps
    });

    const documentaryJudgmentBriefing = this.buildDocumentaryJudgmentBriefing({
      centralQuestion: storyWorthinessAssessment?.reasoning?.centralQuestion,
      findingJudgments,
      topOpeningCandidates: resolvedOpeningCandidates,
      highestStoryValueFacts: resolvedHighestStoryValueFacts,
      majorTurningPoints,
      causeAndEffectRelationships,
      contradictionsAndCompetingViewpoints,
      strongEndingInsights,
      majorClaimConfidenceScores
    });

    const evidenceReasoningMatrix = this.buildEvidenceReasoningMatrix({
      verifiedDocumentaryFacts,
      highestStoryValueFacts: resolvedHighestStoryValueFacts,
      contradictionsAndCompetingViewpoints,
      outstandingResearchGaps,
      documentaryJudgmentBriefing,
      centralQuestion: storyWorthinessAssessment?.reasoning?.centralQuestion
    });

    const editorialResearchBrief = this.buildEditorialResearchBrief({
      centralQuestion: storyWorthinessAssessment?.reasoning?.centralQuestion,
      topOpeningCandidates: resolvedOpeningCandidates,
      highestStoryValueFacts: resolvedHighestStoryValueFacts,
      majorTurningPoints,
      causeAndEffectRelationships,
      contradictionsAndCompetingViewpoints,
      strongEndingInsights,
      documentaryJudgmentBriefing,
      outstandingResearchGaps,
      evidenceReasoningMatrix
    });

    return {
      workflowVersion: '1.0.0',
      centralQuestion: String(storyWorthinessAssessment?.reasoning?.centralQuestion ?? ''),
      sourcesRejected: normalizedRejectedSources,
      sourcesAccepted: acceptedSources,
      sourceClassifications: sourceClassifications.map(entry => ({
        source: entry?.source ?? null,
        type: entry?.type ?? 'UNKNOWN',
        rationale: entry?.rationale ?? 'Source classification provided by Source Quality evaluation.'
      })),
      corroborationSummary,
      verifiedDocumentaryFacts,
      topOpeningCandidates: resolvedOpeningCandidates,
      highestStoryValueFacts: resolvedHighestStoryValueFacts,
      majorEventTimeline,
      majorPeopleAndOrganizations,
      causeAndEffectRelationships,
      majorTurningPoints,
      contradictionsAndCompetingViewpoints,
      strongEndingInsights,
      majorClaimConfidenceScores,
      evidenceReasoningMatrix,
      documentaryJudgmentBriefing,
      editorialResearchBrief,
      confidenceLevel: confidence,
      outstandingResearchGaps,
      dossierReadiness,
      summary: {
        candidateSourceCount: sourceClassifications.length,
        acceptedSourceCount: acceptedSources.length,
        rejectedSourceCount: normalizedRejectedSources.length,
        verifiedDocumentaryFactCount: verifiedDocumentaryFacts.length,
        openingCandidateCount: resolvedOpeningCandidates.length,
        highestStoryValueFactCount: resolvedHighestStoryValueFacts.length,
        majorEventCount: majorEventTimeline.length,
        majorPeopleAndOrganizationCount: majorPeopleAndOrganizations.length,
        causeEffectRelationshipCount: causeAndEffectRelationships.length,
        majorTurningPointCount: majorTurningPoints.length,
        contradictionCount: contradictionsAndCompetingViewpoints.length,
        endingInsightCount: strongEndingInsights.length,
        majorClaimConfidenceCount: majorClaimConfidenceScores.length,
        verifiedFactCategoryCount: evidenceReasoningMatrix['VERIFIED FACT'].length,
        supportedInterpretationCount: evidenceReasoningMatrix['SUPPORTED INTERPRETATION'].length,
        competingInterpretationsCount: evidenceReasoningMatrix['COMPETING INTERPRETATIONS'].length,
        openQuestionCount: evidenceReasoningMatrix['OPEN QUESTION'].length,
        documentaryJudgmentQuestionCount: 10,
        editorialResearchBriefGenerated: editorialResearchBrief.length > 0,
        dossierReadyForStorytelling: dossierReadiness.isReady
      }
    };
  }

  buildEvidenceReasoningMatrix({
    verifiedDocumentaryFacts,
    highestStoryValueFacts,
    contradictionsAndCompetingViewpoints,
    outstandingResearchGaps,
    documentaryJudgmentBriefing,
    centralQuestion
  }) {
    const verifiedFacts = (Array.isArray(verifiedDocumentaryFacts) ? verifiedDocumentaryFacts : [])
      .slice(0, 8)
      .map(entry => ({
        statement: this.toCleanSentence(String(entry?.fact ?? '').trim(), ''),
        confidenceLabel: String(entry?.confidenceLabel ?? 'MEDIUM'),
        confidenceScore: Number(entry?.confidenceScore ?? 0)
      }))
      .filter(entry => entry.statement.length > 0);

    const supportedInterpretations = (Array.isArray(highestStoryValueFacts) ? highestStoryValueFacts : [])
      .slice(0, 6)
      .map(entry => ({
        statement: this.toInterpretationLine(String(entry?.findingText ?? '').trim()),
        supportBasis: this.toCleanSentence(String(entry?.reason ?? '').trim(), 'Derived from converging evidence across multiple verified signals.')
      }))
      .filter(entry => entry.statement.length > 0);

    const competingInterpretations = (Array.isArray(contradictionsAndCompetingViewpoints) ? contradictionsAndCompetingViewpoints : [])
      .slice(0, 6)
      .map(entry => ({
        statement: this.toCompetingInterpretationLine(String(entry?.viewpointSummary ?? '').trim()),
        tension: 'Multiple plausible explanations remain active in the record.'
      }))
      .filter(entry => entry.statement.length > 0);

    const openQuestions = [];
    const unresolved = this.toOpenQuestion(String(documentaryJudgmentBriefing?.unansweredQuestionToKeepViewersWatching ?? '').trim());
    if (unresolved.length > 0) {
      openQuestions.push({ question: unresolved, reason: 'The available evidence does not yet close this question decisively.' });
    }

    (Array.isArray(outstandingResearchGaps) ? outstandingResearchGaps : [])
      .slice(0, 3)
      .forEach(gap => {
        openQuestions.push({
          question: this.toOpenQuestion(String(gap ?? '').trim()),
          reason: 'Additional reporting is required before claiming certainty.'
        });
      });

    const central = this.toOpenQuestion(String(centralQuestion ?? '').trim());
    if (central.length > 0) {
      openQuestions.push({
        question: central,
        reason: 'This remains the governing question that structures unresolved evidence.'
      });
    }

    return {
      'VERIFIED FACT': verifiedFacts,
      'SUPPORTED INTERPRETATION': supportedInterpretations,
      'COMPETING INTERPRETATIONS': competingInterpretations,
      'OPEN QUESTION': openQuestions
        .filter(entry => entry.question.length > 0)
        .filter((entry, index, arr) => arr.findIndex(row => row.question.toLowerCase() === entry.question.toLowerCase()) === index)
        .slice(0, 6)
    };
  }

  buildEditorialResearchBrief({
    centralQuestion,
    topOpeningCandidates,
    highestStoryValueFacts,
    majorTurningPoints,
    causeAndEffectRelationships,
    contradictionsAndCompetingViewpoints,
    strongEndingInsights,
    documentaryJudgmentBriefing,
    outstandingResearchGaps,
    evidenceReasoningMatrix
  }) {
    const documentaryTheme = this.resolveDocumentaryTheme(centralQuestion);

    const storyCore = this.buildDirectorAnswerStoryCore({ documentaryTheme });
    const whyWorthIt = this.buildDirectorAnswerWhyWorthIt({ documentaryTheme });
    const beginningBelief = this.buildDirectorAnswerBeginningBelief({ documentaryTheme });
    const halfwayRealization = this.buildDirectorAnswerHalfwayRealization();
    const understandingShift = this.buildDirectorAnswerUnderstandingShift();
    const emotionalJourney = this.buildDirectorAnswerEmotionalJourney();
    const singleIdea = this.buildDirectorAnswerSingleIdea();
    const ruinMistake = this.buildDirectorAnswerRuinMistake();
    const writerAvoid = this.buildDirectorAnswerWriterAvoid();
    const afterCredits = this.buildDirectorAnswerAfterCredits({ documentaryTheme });

    return [
      'Editorial Research Brief',
      '',
      'Senior Executive Research Director:',
      '',
      'You already know the material. This brief is not about what we found. It is about the film we need to make from it.',
      '',
      `1. What story are we really telling? ${storyCore}`,
      '',
      `2. Why is this story worth six minutes of someone\'s life? ${whyWorthIt}`,
      '',
      `3. What should the audience believe at the beginning? ${beginningBelief}`,
      '',
      `4. What should they realize halfway through? ${halfwayRealization}`,
      '',
      `5. What should completely change their understanding? ${understandingShift}`,
      '',
      `6. What emotional journey should they experience? ${emotionalJourney}`,
      '',
      `7. What single idea must never be lost while writing? ${singleIdea}`,
      '',
      `8. What mistake would ruin this documentary? ${ruinMistake}`,
      '',
      `9. What should the writer avoid? ${writerAvoid}`,
      '',
      `10. What should the audience still be thinking about after the credits? ${afterCredits}`,
      '',
      'Award-winning Documentary Writer:',
      '',
      'Understood. I will write for consequence, not chronology. I will write for clarity, not noise. I will make every line earn the next line.'
    ].join('\n');
  }

  buildDirectorAnswerStoryCore({ documentaryTheme }) {
    return `We are telling a story about how ordinary institutional logic can produce extraordinary human consequences. The frame is ${documentaryTheme}, but the deeper story is how systems drift into danger while everyone still sounds reasonable.`;
  }

  buildDirectorAnswerWhyWorthIt({ documentaryTheme }) {
    return `Because this is not a history lesson; it is a survival lesson. In six minutes, the audience should recognize patterns from ${documentaryTheme} that still shape decisions made around them right now.`;
  }

  buildDirectorAnswerBeginningBelief({ documentaryTheme }) {
    return `At the beginning, they should believe this was an unfortunate but contained episode tied to a specific moment in ${documentaryTheme}. We start where most people are: informed, but falsely reassured.`;
  }

  buildDirectorAnswerHalfwayRealization() {
    return 'Halfway through, they should realize this was never one isolated failure. It was a chain reaction built from incentives, blind spots, and decisions that looked defensible in the short term.';
  }

  buildDirectorAnswerUnderstandingShift() {
    return 'Their understanding should flip from event-thinking to system-thinking. The documentary works when the audience stops asking who failed first and starts asking why failure became structurally likely.';
  }

  buildDirectorAnswerEmotionalJourney() {
    return 'Move them from curiosity to tension, from tension to recognition, and from recognition to sober urgency. The final feeling should not be panic. It should be lucid responsibility.';
  }

  buildDirectorAnswerSingleIdea() {
    return 'Never lose this: when incentives reward denial, intelligence alone does not prevent collapse.';
  }

  buildDirectorAnswerRuinMistake() {
    return 'The documentary is ruined if we turn it into a timeline recital. If it becomes a sequence of things that happened instead of a story about why they happened, we lose the audience and the truth.';
  }

  buildDirectorAnswerWriterAvoid() {
    return 'Avoid courtroom tone, avoid technical grandstanding, avoid easy villains, and avoid false certainty. Keep interpretation honest and language human. Let complexity breathe, but never let it blur the stakes.';
  }

  buildDirectorAnswerAfterCredits({ documentaryTheme }) {
    return `After the credits, they should be asking one question: if the same structural pressures are visible again in different form, what are we refusing to see this time? That is how ${documentaryTheme} becomes present tense for them.`;
  }

  buildEvidenceDistinctionParagraph({ evidenceReasoningMatrix }) {
    const verified = evidenceReasoningMatrix?.['VERIFIED FACT']?.[0]?.statement ?? '';
    const interpretation = evidenceReasoningMatrix?.['SUPPORTED INTERPRETATION']?.[0]?.statement ?? '';
    const competing = evidenceReasoningMatrix?.['COMPETING INTERPRETATIONS']?.[0]?.statement ?? '';
    const openQuestion = evidenceReasoningMatrix?.['OPEN QUESTION']?.[0]?.question ?? '';

    const known = verified.length > 0
      ? `Treat ${verified} as established by the strongest available record.`
      : 'Treat high-corroboration claims as established by the strongest available record.';
    const inferred = interpretation.length > 0
      ? `Frame ${interpretation} as a supported interpretation, not as settled proof.`
      : 'Frame causal inferences as supported interpretations, not as settled proof.';
    const debated = competing.length > 0
      ? `When interpretations conflict, explicitly stage the debate: ${competing}`
      : 'When interpretations conflict, explicitly stage the debate rather than forcing false closure.';
    const unresolved = openQuestion.length > 0
      ? `Keep this unresolved question active through the final act: ${openQuestion}`
      : 'Keep one unresolved question active through the final act to preserve intellectual honesty.';

    return `${known} ${inferred} ${debated} ${unresolved}`;
  }

  resolveDocumentaryTheme(centralQuestion) {
    const normalized = this.normalizeTopicStatement(centralQuestion);
    if (normalized.length > 0) {
      return `${normalized.toLowerCase()} and the institutional choices that turned fragility into systemic consequence`;
    }

    return 'how institutional incentives and delayed accountability transform warning signs into systemic crisis';
  }

  normalizeTopicStatement(text) {
    const normalized = String(text ?? '')
      .replace(/\bevidence highlights.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized.length === 0) return '';
    return normalized.replace(/[.?!]+$/, '');
  }

  toInterpretationLine(text) {
    const cleaned = this.toCleanSentence(text, 'The available evidence supports a broader systemic explanation than any single-event account.');
    if (/\b(suggests|indicates|points to|supports the interpretation that)\b/i.test(cleaned)) {
      return cleaned;
    }

    return `The evidence supports the interpretation that ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  }

  toCompetingInterpretationLine(text) {
    const cleaned = this.toCleanSentence(text, 'There are competing explanations for both causation and accountability in the current record.');
    if (/\b(competing|contested|disputed|contradict)\b/i.test(cleaned)) {
      return cleaned;
    }

    return `A competing interpretation argues that ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  }

  toOpenQuestion(text) {
    const cleaned = this.toCleanSentence(text, 'What evidence is still missing before the strongest conclusion can be defended?')
      .replace(/^if\s+/i, '')
      .trim();

    if (cleaned.endsWith('?')) return cleaned;
    return `${cleaned.replace(/[.]+$/, '')}?`;
  }

  toMisconceptionLine(text) {
    const cleaned = this.toCleanSentence(text, 'A common misconception is that this story can be explained by one bad actor instead of a repeated system pattern.');
    if (/^a common misconception\b/i.test(cleaned)) {
      return cleaned;
    }

    return `A common misconception is this: ${cleaned}`;
  }

  normalizeClosingQuestion({ unansweredRaw, documentaryTheme }) {
    const normalized = this.toCleanSentence(unansweredRaw, '').replace(/\s+/g, ' ').trim();
    if (normalized.length > 0 && normalized.includes('?')) {
      return normalized;
    }

    return `When the documentary ends, viewers should still be asking this: who is accountable now for the same structural risks at the center of ${documentaryTheme}?`;
  }

  buildEmotionalJourneyParagraph({ majorTurningPoints, causeAndEffectRelationships }) {
    const turningPointLead = this.toCleanSentence(
      String(majorTurningPoints?.[0]?.description ?? '').trim(),
      'Begin with unease as early warning signals appear inside institutions.'
    );
    const causeLead = this.toCleanSentence(
      String(causeAndEffectRelationships?.[0]?.evidenceSnippet ?? '').trim(),
      'Move into urgency as each decision narrows the system into fewer safe outcomes.'
    );

    return `${turningPointLead} Then move from tension into recognition by showing how avoidable choices compounded. ${causeLead} End in sober resolve, where viewers understand both the human cost and the unfinished accountability.`;
  }

  buildScreenTimeParagraph({ highestStoryValueFacts, causeAndEffectRelationships }) {
    const topFacts = (Array.isArray(highestStoryValueFacts) ? highestStoryValueFacts : [])
      .slice(0, 3)
      .map(item => this.toCleanSentence(String(item?.findingText ?? '').trim(), ''))
      .filter(Boolean);

    const strongestCausal = this.toCleanSentence(
      String(causeAndEffectRelationships?.[0]?.evidenceSnippet ?? '').trim(),
      ''
    );

    if (topFacts.length === 0 && strongestCausal.length === 0) {
      return 'Prioritize the facts that expose causal links between incentives, hidden fragility, and public consequence; those are the spine of the film.';
    }

    const stitched = [...topFacts];
    if (strongestCausal.length > 0) stitched.push(strongestCausal);

    return `Spend the most time on the evidence that proves cause-and-effect under pressure: ${stitched.slice(0, 3).join(' ')} These are the facts that convert complexity into narrative clarity.`;
  }

  buildDelayedFactsParagraph({ documentaryJudgmentBriefing, majorTurningPoints, outstandingResearchGaps }) {
    const delayed = Array.isArray(documentaryJudgmentBriefing?.delayedForMaximumCuriosity)
      ? documentaryJudgmentBriefing.delayedForMaximumCuriosity
      : [];
    const delayedText = delayed
      .slice(0, 2)
      .map(item => this.toCleanSentence(String(item?.findingText ?? '').trim(), ''))
      .filter(Boolean)
      .join(' ');

    const lateTurningPoint = this.toCleanSentence(String(majorTurningPoints?.[Math.max((majorTurningPoints?.length ?? 1) - 1, 0)]?.description ?? '').trim(), '');
    const gapSignal = this.toCleanSentence(String(outstandingResearchGaps?.[0] ?? '').trim(), '');

    if (delayedText.length === 0 && lateTurningPoint.length === 0) {
      return 'Delay the most explanatory evidence until after the audience has felt uncertainty long enough to ask the right question.';
    }

    return `Hold back selected high-impact evidence until the midpoint, especially where it re-frames motive or responsibility: ${delayedText || lateTurningPoint} ${gapSignal ? `Use remaining uncertainty (${gapSignal.toLowerCase()}) as controlled tension rather than confusion.` : ''}`.trim();
  }

  toCleanSentence(text, fallback) {
    const normalized = String(text ?? '')
      .replace(/\b(?:FINDING|OPEN|TURN|CONTR|ENDING|CLAIM|EVENT|CAUSE-EFFECT)-\d+\b/gi, '')
      .replace(/\bevidence highlights[^.]*\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized.length === 0) return String(fallback ?? '').trim();
    if (/[.!?]$/.test(normalized)) return normalized;
    return `${normalized}.`;
  }

  buildDocumentaryJudgmentBriefing({
    centralQuestion,
    findingJudgments,
    topOpeningCandidates,
    highestStoryValueFacts,
    majorTurningPoints,
    causeAndEffectRelationships,
    contradictionsAndCompetingViewpoints,
    strongEndingInsights,
    majorClaimConfidenceScores
  }) {
    const sortedJudgments = [...(Array.isArray(findingJudgments) ? findingJudgments : [])]
      .sort((left, right) => Number(right?.storyWorthinessScore ?? 0) - Number(left?.storyWorthinessScore ?? 0));

    const strongestOpening = topOpeningCandidates[0] ?? this.toFindingRecord(sortedJudgments[0] ?? null);

    const mostSurprisingFact = this.pickJudgmentByDimension({
      judgments: sortedJudgments,
      dimension: 'surprise'
    });

    const misconceptionToCorrect = contradictionsAndCompetingViewpoints[0] ?? null;

    const delayedForCuriosity = sortedJudgments
      .filter(judgment => judgment?.decision === 'INCLUDE' || judgment?.decision === 'SUPPORTING')
      .sort((left, right) => Number(right?.dimensions?.audienceCuriosityValue ?? 0) - Number(left?.dimensions?.audienceCuriosityValue ?? 0))
      .slice(0, 5)
      .map(judgment => this.toFindingRecord(judgment));

    const emotionalEngagementFacts = sortedJudgments
      .filter(judgment => Number(judgment?.dimensions?.emotionalSignificance ?? 0) >= 7)
      .slice(0, 6)
      .map(judgment => this.toFindingRecord(judgment));

    const endingFacts = this.resolveEndingFacts({
      strongEndingInsights,
      highestStoryValueFacts,
      majorClaimConfidenceScores
    });

    const backgroundOnlyFacts = sortedJudgments
      .filter(judgment => judgment?.decision === 'SUPPORTING_NOT_CENTRAL' || judgment?.decision === 'EXCLUDE')
      .slice(0, 6)
      .map(judgment => this.toFindingRecord(judgment));

    const unansweredQuestion = this.buildUnansweredQuestion({
      centralQuestion,
      contradictionsAndCompetingViewpoints,
      causeAndEffectRelationships,
      strongEndingInsights
    });

    return {
      editorialMode: 'Senior Documentary Research Briefing',
      summary: 'Research Specialist judgment package optimized for documentary writing decisions, not raw search output.',
      singleStrongestOpening: strongestOpening,
      mostSurprisingFact: mostSurprisingFact ? this.toFindingRecord(mostSurprisingFact) : null,
      misconceptionToCorrect: misconceptionToCorrect
        ? {
          contradictionId: misconceptionToCorrect.contradictionId ?? null,
          viewpointSummary: misconceptionToCorrect.viewpointSummary ?? ''
        }
        : null,
      centralMystery: String(centralQuestion ?? '').trim(),
      majorTurningPoints,
      emotionalEngagementFacts,
      delayedForMaximumCuriosity: delayedForCuriosity,
      endingFacts,
      backgroundOnlyFacts,
      unansweredQuestionToKeepViewersWatching: unansweredQuestion,
      questionCoverage: {
        strongestOpeningAnswered: Boolean(strongestOpening?.findingText),
        surpriseAnswered: Boolean(mostSurprisingFact?.findingText),
        misconceptionAnswered: Boolean(misconceptionToCorrect?.viewpointSummary),
        centralMysteryAnswered: String(centralQuestion ?? '').trim().length > 0,
        turningPointsAnswered: majorTurningPoints.length > 0,
        emotionalFactsAnswered: emotionalEngagementFacts.length > 0,
        delayStrategyAnswered: delayedForCuriosity.length > 0,
        endingAnswered: endingFacts.length > 0,
        backgroundFilterAnswered: backgroundOnlyFacts.length > 0,
        unansweredQuestionProvided: unansweredQuestion.length > 0
      }
    };
  }

  pickJudgmentByDimension({ judgments, dimension }) {
    const rows = Array.isArray(judgments) ? judgments : [];
    if (rows.length === 0) return null;

    return [...rows]
      .sort((left, right) => Number(right?.dimensions?.[dimension] ?? 0) - Number(left?.dimensions?.[dimension] ?? 0))[0] ?? null;
  }

  resolveEndingFacts({ strongEndingInsights, highestStoryValueFacts, majorClaimConfidenceScores }) {
    const fromInsights = (Array.isArray(strongEndingInsights) ? strongEndingInsights : []).map((insight, index) => ({
      findingId: insight?.insightId ?? `ENDING-FACT-${String(index + 1).padStart(3, '0')}`,
      findingText: String(insight?.insight ?? '').trim(),
      storyWorthinessScore: 8,
      decision: 'ENDING_PRIORITY',
      reason: String(insight?.whyItMatters ?? 'Ending insight prioritized for final documentary act.')
    }));

    const highConfidenceClaims = (Array.isArray(majorClaimConfidenceScores) ? majorClaimConfidenceScores : [])
      .filter(claim => Number(claim?.confidenceScore ?? 0) >= 7)
      .slice(0, 4)
      .map(claim => ({
        findingId: claim?.claimId ?? null,
        findingText: String(claim?.claim ?? '').trim(),
        storyWorthinessScore: Number(claim?.confidenceScore ?? 7),
        decision: 'ENDING_PRIORITY',
        reason: String(claim?.confidenceRationale ?? 'High-confidence ending claim.')
      }));

    return [...fromInsights, ...(Array.isArray(highestStoryValueFacts) ? highestStoryValueFacts : []), ...highConfidenceClaims]
      .filter((entry, index, arr) => {
        const key = String(entry?.findingId ?? entry?.findingText ?? '').toLowerCase();
        return key.length > 0 && arr.findIndex(item => String(item?.findingId ?? item?.findingText ?? '').toLowerCase() === key) === index;
      })
      .slice(0, 6);
  }

  buildUnansweredQuestion({ centralQuestion, contradictionsAndCompetingViewpoints, causeAndEffectRelationships, strongEndingInsights }) {
    const contradiction = Array.isArray(contradictionsAndCompetingViewpoints)
      ? contradictionsAndCompetingViewpoints[0]
      : null;
    const causeEffect = Array.isArray(causeAndEffectRelationships)
      ? causeAndEffectRelationships[0]
      : null;
    const endingInsight = Array.isArray(strongEndingInsights)
      ? strongEndingInsights[0]
      : null;

    const parts = [];
    if (String(centralQuestion ?? '').trim().length > 0) {
      parts.push(`If ${String(centralQuestion).trim()}, what evidence still challenges the dominant explanation?`);
    }
    if (contradiction?.viewpointSummary) {
      parts.push(`How do we reconcile this contradiction: ${String(contradiction.viewpointSummary).slice(0, 120)}...?`);
    }
    if (causeEffect?.effect) {
      parts.push(`What happens next if ${String(causeEffect.effect).slice(0, 120)} continues?`);
    }
    if (endingInsight?.insight) {
      parts.push(`Which institution answers for ${String(endingInsight.insight).slice(0, 120)}?`);
    }

    return parts[0] ?? 'What critical evidence remains unresolved, and who benefits if it stays unresolved?';
  }

  buildVerifiedDocumentaryFacts({ findingJudgments, findings }) {
    const fromJudgments = findingJudgments
      .filter(judgment => Number(judgment?.storyWorthinessScore ?? 0) >= 5 && judgment?.decision !== 'EXCLUDE')
      .map(judgment => ({
        findingId: judgment?.findingId ?? null,
        fact: String(judgment?.findingText ?? '').trim(),
        verificationStatus: this.inferVerificationStatus(judgment?.findingText),
        confidenceScore: this.normalizeConfidenceToScore(judgment?.confidence),
        confidenceLabel: this.scoreToConfidenceLabel(this.normalizeConfidenceToScore(judgment?.confidence)),
        sourceAnchors: []
      }))
      .filter(entry => entry.fact.length > 0);

    if (fromJudgments.length >= 25) {
      return fromJudgments.slice(0, 50);
    }

    const normalizedFallback = findings
      .map((finding, index) => {
        const text = String(finding?.claim ?? finding?.summary ?? '').trim();
        return {
          findingId: finding?.id ?? `FACT-${String(index + 1).padStart(3, '0')}`,
          fact: text,
          verificationStatus: this.inferVerificationStatus(text),
          confidenceScore: this.normalizeConfidenceToScore(finding?.confidence),
          confidenceLabel: this.scoreToConfidenceLabel(this.normalizeConfidenceToScore(finding?.confidence)),
          sourceAnchors: []
        };
      })
      .filter(entry => entry.fact.length > 0);

    return [...fromJudgments, ...normalizedFallback]
      .filter((entry, index, arr) => {
        const key = String(entry?.findingId ?? entry?.fact ?? '').toLowerCase();
        return key.length > 0 && arr.findIndex(item => String(item?.findingId ?? item?.fact ?? '').toLowerCase() === key) === index;
      })
      .slice(0, 50);
  }

  buildResolvedHighestStoryValueFacts({ highestStoryValueFacts, verifiedDocumentaryFacts }) {
    if (highestStoryValueFacts.length >= 10) {
      return highestStoryValueFacts;
    }

    const fallback = verifiedDocumentaryFacts.map((fact, index) => ({
      findingId: fact?.findingId ?? `HSF-${String(index + 1).padStart(3, '0')}`,
      findingText: String(fact?.fact ?? ''),
      storyWorthinessScore: Math.max(7, Number(fact?.confidenceScore ?? 7)),
      decision: 'SUPPORTING',
      reason: 'Fallback high story-value candidate derived from verified documentary facts.'
    }));

    return [...highestStoryValueFacts, ...fallback]
      .filter((entry, index, arr) => {
        const key = String(entry?.findingId ?? entry?.findingText ?? '').toLowerCase();
        return key.length > 0 && arr.findIndex(item => String(item?.findingId ?? item?.findingText ?? '').toLowerCase() === key) === index;
      })
      .slice(0, 50);
  }

  buildFallbackOpeningCandidates({ findings, verifiedDocumentaryFacts }) {
    const sourceTexts = [
      ...verifiedDocumentaryFacts.map(item => item?.fact),
      ...findings.map(item => item?.claim ?? item?.summary ?? '')
    ];
    const openingTokens = /(unexpected|mystery|collapse|crisis|shock|contradict|unresolved|turning point|reveal|exposed|urgent|competing viewpoint|accountability|systemic risk)/i;

    return sourceTexts
      .map((text, index) => {
        const normalized = String(text ?? '').trim();
        if (normalized.length === 0 || !openingTokens.test(normalized)) return null;
        return {
          findingId: `OPEN-${String(index + 1).padStart(3, '0')}`,
          findingText: normalized,
          storyWorthinessScore: 8,
          decision: 'OPENING_CANDIDATE',
          reason: 'Fallback opening candidate derived from high-curiosity research signal.'
        };
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  buildMajorEventTimeline({ findings, verifiedDocumentaryFacts, centralQuestion }) {
    const sourceTexts = [
      ...verifiedDocumentaryFacts.map(item => item?.fact),
      ...findings.map(item => item?.claim ?? item?.summary ?? '')
    ];

    const timeline = sourceTexts
      .map((text, index) => {
        const normalized = String(text ?? '').trim();
        if (normalized.length === 0) return null;

        const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
        const ordinalMatch = normalized.match(/\b(first|second|third|final|initial|later|afterward|subsequent)\b/i);
        const eventLabel = normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;

        return {
          eventId: `EVENT-${String(index + 1).padStart(3, '0')}`,
          timeMarker: yearMatch?.[1] ?? ordinalMatch?.[1] ?? `sequence-${index + 1}`,
          event: eventLabel,
          relevanceToCentralQuestion: String(centralQuestion ?? '').trim().length > 0
            ? `Connects to ${String(centralQuestion).trim()}.`
            : 'Relevant to documentary central question.'
        };
      })
      .filter(Boolean);

    return timeline.slice(0, 60);
  }

  buildMajorPeopleAndOrganizations({ findings, verifiedDocumentaryFacts, providers }) {
    const sourceTexts = [
      ...verifiedDocumentaryFacts.map(item => item?.fact),
      ...findings.map(item => item?.claim ?? item?.summary ?? ''),
      ...providers.map(item => item?.provider ?? '')
    ];

    const organizations = new Set();
    const people = new Set();

    sourceTexts.forEach(text => {
      const normalized = String(text ?? '');
      const orgMatches = normalized.match(/\b([A-Z][A-Za-z&.\-]+(?:\s+[A-Z][A-Za-z&.\-]+){0,5}\s+(?:Bank|Corp|Corporation|Committee|Commission|Agency|Authority|Department|Group|Fund|Exchange|Council|Reserve|Treasury|Ministry|Board|Court|Office))\b/g) ?? [];
      orgMatches.forEach(match => organizations.add(match.trim()));

      const peopleMatches = normalized.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g) ?? [];
      peopleMatches.forEach(match => {
        if (!/(The|This|That|Executive|General|Public)/.test(match)) {
          people.add(match.trim());
        }
      });
    });

    return [
      ...[...people].map(name => ({ type: 'PERSON', name })),
      ...[...organizations].map(name => ({ type: 'ORGANIZATION', name }))
    ].slice(0, 80);
  }

  buildCauseAndEffectRelationships({ findings, verifiedDocumentaryFacts }) {
    const sourceTexts = [
      ...verifiedDocumentaryFacts.map(item => item?.fact),
      ...findings.map(item => item?.claim ?? item?.summary ?? '')
    ];

    const patterns = [
      /(.+?)\s+(?:led to|resulted in|caused|triggered|drove|forced|produced)\s+(.+)/i,
      /because\s+(.+?),\s+(.+)/i,
      /due to\s+(.+?),\s+(.+)/i
    ];

    const relationships = [];

    sourceTexts.forEach((text, index) => {
      const normalized = String(text ?? '').trim();
      if (normalized.length === 0) return;

      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match) continue;

        const cause = String(match[1] ?? '').trim();
        const effect = String(match[2] ?? '').trim();

        if (cause.length > 0 && effect.length > 0) {
          relationships.push({
            relationshipId: `CAUSE-EFFECT-${String(index + 1).padStart(3, '0')}`,
            cause,
            effect,
            evidenceSnippet: normalized
          });
          break;
        }
      }
    });

    return relationships.slice(0, 50);
  }

  buildMajorTurningPoints({ findings, verifiedDocumentaryFacts, majorEventTimeline }) {
    const sourceTexts = [
      ...verifiedDocumentaryFacts.map(item => item?.fact),
      ...findings.map(item => item?.claim ?? item?.summary ?? ''),
      ...majorEventTimeline.map(item => item?.event)
    ];
    const turningPointTokens = /(turning point|collapse|crisis|bankruptcy|bailout|intervention|default|shock|pivot|inflection|reversal|reform)/i;

    return sourceTexts
      .map((text, index) => {
        const normalized = String(text ?? '').trim();
        if (normalized.length === 0 || !turningPointTokens.test(normalized)) return null;
        return {
          turningPointId: `TURN-${String(index + 1).padStart(3, '0')}`,
          description: normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized
        };
      })
      .filter(Boolean)
      .slice(0, 30);
  }

  buildContradictionsAndCompetingViewpoints({ findings, sourceQualityAssessment, storyWorthinessAssessment }) {
    const fromJudgments = Array.isArray(storyWorthinessAssessment?.reasoning?.findingJudgments)
      ? storyWorthinessAssessment.reasoning.findingJudgments
      : [];
    const contradictorySignals = Array.isArray(sourceQualityAssessment?.reasoning?.contradictoryEvidence?.signals)
      ? sourceQualityAssessment.reasoning.contradictoryEvidence.signals
      : [];
    const sourceTexts = [
      ...findings.map(item => item?.claim ?? item?.summary ?? ''),
      ...fromJudgments.map(item => item?.findingText ?? ''),
      ...contradictorySignals.map(item => item?.description ?? item?.signal ?? '')
    ];

    const contradictionTokens = /(contradict|dispute|contested|competing|however|on the other hand|counter|challenge)/i;
    const rows = sourceTexts
      .map((text, index) => {
        const normalized = String(text ?? '').trim();
        if (normalized.length === 0 || !contradictionTokens.test(normalized)) return null;
        return {
          contradictionId: `CONTR-${String(index + 1).padStart(3, '0')}`,
          viewpointSummary: normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized
        };
      })
      .filter(Boolean);

    return rows.slice(0, 40);
  }

  buildStrongEndingInsights({ findings, verifiedDocumentaryFacts, centralQuestion }) {
    const sourceTexts = [
      ...verifiedDocumentaryFacts.map(item => item?.fact),
      ...findings.map(item => item?.claim ?? item?.summary ?? '')
    ];
    const endingTokens = /(implication|legacy|lesson|reform|what this means|future|next|unresolved|warning|accountability|insight)/i;

    const insights = sourceTexts
      .map((text, index) => {
        const normalized = String(text ?? '').trim();
        if (normalized.length === 0 || !endingTokens.test(normalized)) return null;

        return {
          insightId: `ENDING-${String(index + 1).padStart(3, '0')}`,
          insight: normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized,
          whyItMatters: String(centralQuestion ?? '').trim().length > 0
            ? `Provides forward-looking significance for ${String(centralQuestion).trim()}.`
            : 'Provides forward-looking significance for documentary conclusion.'
        };
      })
      .filter(Boolean);

    return insights.slice(0, 25);
  }

  buildMajorClaimConfidenceScores({ verifiedDocumentaryFacts, sourceQualityAssessment, findingJudgments }) {
    const judgmentsById = new Map(
      (Array.isArray(findingJudgments) ? findingJudgments : [])
        .map(judgment => [String(judgment?.findingId ?? ''), judgment])
    );

    return verifiedDocumentaryFacts
      .filter(fact => Number(fact?.confidenceScore ?? 0) >= 0)
      .map((fact, index) => {
        const judgment = judgmentsById.get(String(fact?.findingId ?? ''));
        const confidenceScore = this.normalizeConfidenceToScore(judgment?.confidence ?? fact?.confidenceScore);
        return {
          claimId: fact?.findingId ?? `CLAIM-${String(index + 1).padStart(3, '0')}`,
          claim: String(fact?.fact ?? ''),
          confidenceScore,
          confidenceLabel: this.scoreToConfidenceLabel(confidenceScore),
          confidenceRationale: String(sourceQualityAssessment?.confidence?.conclusion ?? 'Confidence assessed from source-quality and corroboration signals.')
        };
      })
      .slice(0, 60);
  }

  buildDocumentaryDossierReadiness({
    verifiedDocumentaryFacts,
    topOpeningCandidates,
    highestStoryValueFacts,
    majorEventTimeline,
    majorPeopleAndOrganizations,
    causeAndEffectRelationships,
    majorTurningPoints,
    contradictionsAndCompetingViewpoints,
    strongEndingInsights,
    majorClaimConfidenceScores,
    sourceClassifications,
    outstandingResearchGaps
  }) {
    const requirements = [
      {
        id: 'VERIFIED_FACTS',
        description: '25-50 verified documentary facts',
        met: verifiedDocumentaryFacts.length >= 25 && verifiedDocumentaryFacts.length <= 50,
        observed: verifiedDocumentaryFacts.length
      },
      {
        id: 'OPENING_HOOK_CANDIDATES',
        description: 'At least 3 outstanding opening hook candidates',
        met: topOpeningCandidates.length >= 3,
        observed: topOpeningCandidates.length
      },
      {
        id: 'HIGH_STORY_VALUE_FACTS',
        description: 'At least 10 high story-value facts',
        met: highestStoryValueFacts.length >= 10,
        observed: highestStoryValueFacts.length
      },
      {
        id: 'TIMELINE_OF_MAJOR_EVENTS',
        description: 'Complete timeline of major events',
        met: majorEventTimeline.length >= 8,
        observed: majorEventTimeline.length
      },
      {
        id: 'MAJOR_PEOPLE_ORGANIZATIONS',
        description: 'Major people and organizations involved',
        met: majorPeopleAndOrganizations.length >= 5,
        observed: majorPeopleAndOrganizations.length
      },
      {
        id: 'CAUSE_EFFECT_RELATIONSHIPS',
        description: 'Cause-and-effect relationships',
        met: causeAndEffectRelationships.length >= 6,
        observed: causeAndEffectRelationships.length
      },
      {
        id: 'MAJOR_TURNING_POINTS',
        description: 'Major turning points',
        met: majorTurningPoints.length >= 5,
        observed: majorTurningPoints.length
      },
      {
        id: 'CONTRADICTIONS_COMPETING_VIEWPOINTS',
        description: 'Contradictions and competing viewpoints',
        met: contradictionsAndCompetingViewpoints.length >= 3,
        observed: contradictionsAndCompetingViewpoints.length
      },
      {
        id: 'ENDING_INSIGHTS',
        description: 'Strong ending insights',
        met: strongEndingInsights.length >= 3,
        observed: strongEndingInsights.length
      },
      {
        id: 'CONFIDENCE_PER_MAJOR_CLAIM',
        description: 'Confidence scores for every major claim',
        met: majorClaimConfidenceScores.length >= 10,
        observed: majorClaimConfidenceScores.length
      },
      {
        id: 'SOURCE_CLASSIFICATIONS',
        description: 'Source classifications',
        met: sourceClassifications.length > 0,
        observed: sourceClassifications.length
      },
      {
        id: 'RESEARCH_GAPS_IDENTIFIED',
        description: 'Research gaps clearly identified',
        met: Array.isArray(outstandingResearchGaps),
        observed: Array.isArray(outstandingResearchGaps) ? outstandingResearchGaps.length : 0
      }
    ];

    const unmetRequirements = requirements
      .filter(requirement => !requirement.met)
      .map(requirement => `${requirement.id}: ${requirement.description} (observed=${requirement.observed})`);

    return {
      isReady: unmetRequirements.length === 0,
      requirements,
      unmetRequirements
    };
  }

  buildCorroborationSummary({ findingJudgments, sourceQualityAssessment }) {
    const corroborationSignals = findingJudgments
      .filter(judgment => this.textHasAny(judgment?.findingText, ['corroborat', 'verified', 'confirmed by', 'independent']))
      .length;

    return {
      score: Number(sourceQualityAssessment?.reasoning?.independentCorroboration?.score ?? 0),
      conclusion: String(sourceQualityAssessment?.reasoning?.independentCorroboration?.conclusion ?? 'Corroboration analysis unavailable.'),
      corroboratedImportantClaimCount: corroborationSignals
    };
  }

  buildOutstandingResearchGaps({
    normalizedResearch,
    sourceQualityAssessment,
    storyWorthinessAssessment,
    highestStoryValueFacts,
    topOpeningCandidates,
    corroborationSummary
  }) {
    const gaps = [];
    const missingEvidence = Array.isArray(sourceQualityAssessment?.reasoning?.missingEvidence?.missingItems)
      ? sourceQualityAssessment.reasoning.missingEvidence.missingItems
      : [];

    missingEvidence.forEach(item => {
      gaps.push(item);
    });

    if (corroborationSummary.score < 7) {
      gaps.push('Important claims require stronger independent corroboration before scripting.');
    }

    if (topOpeningCandidates.length === 0) {
      gaps.push('No strong opening candidate identified; collect a high-curiosity, high-conflict fact.');
    }

    if (highestStoryValueFacts.length < 3) {
      gaps.push('Insufficient high story-value facts for a robust narrative arc.');
    }

    const centralRelevance = Number(storyWorthinessAssessment?.reasoning?.centralQuestionRelevance?.score ?? 0);
    if (centralRelevance < 7) {
      gaps.push('Gather facts with stronger relevance to the documentary central question.');
    }

    const findings = Array.isArray(normalizedResearch?.findings) ? normalizedResearch.findings : [];
    if (findings.length < 4) {
      gaps.push('Increase total finding coverage to reduce narrative fragility.');
    }

    return [...new Set(gaps)];
  }

  toFindingRecord(judgment) {
    return {
      findingId: judgment?.findingId ?? null,
      findingText: judgment?.findingText ?? '',
      storyWorthinessScore: Number(judgment?.storyWorthinessScore ?? 0),
      decision: String(judgment?.decision ?? 'SUPPORTING'),
      reason: String(judgment?.reasoning ?? 'Included for narrative support.')
    };
  }

  inferVerificationStatus(text) {
    const normalized = String(text ?? '').toLowerCase();
    if (/(verified|confirmed|corroborated|documented|official record)/.test(normalized)) {
      return 'VERIFIED';
    }
    if (/(likely|suggests|reported|claimed|alleged)/.test(normalized)) {
      return 'PARTIALLY_VERIFIED';
    }
    return 'UNVERIFIED';
  }

  normalizeConfidenceToScore(confidence) {
    if (Number.isFinite(Number(confidence))) {
      const numeric = Number(confidence);
      return Math.max(0, Math.min(10, numeric > 10 ? Math.round(numeric / 10) : Math.round(numeric)));
    }

    const normalized = String(confidence ?? '').trim().toUpperCase();
    if (normalized === 'HIGH') return 8;
    if (normalized === 'MEDIUM') return 6;
    if (normalized === 'LOW') return 4;
    return 5;
  }

  scoreToConfidenceLabel(score) {
    if (score >= 8) return 'HIGH';
    if (score >= 6) return 'MEDIUM';
    return 'LOW';
  }

  textHasAny(text, needles) {
    const normalized = String(text ?? '').toLowerCase();
    return needles.some(needle => normalized.includes(needle));
  }
}