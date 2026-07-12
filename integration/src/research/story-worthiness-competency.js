export class StoryWorthinessCompetency {
  assess(input = {}) {
    const findings = Array.isArray(input.findings) ? input.findings : [];
    const centralQuestion = this.resolveCentralQuestion(input);

    const findingJudgments = findings.map(finding => this.evaluateFinding({ finding, centralQuestion }));

    const aggregateScore = findingJudgments.length === 0
      ? 0
      : this.clamp(Math.round(
        findingJudgments.reduce((sum, judgment) => sum + judgment.storyWorthinessScore, 0) / findingJudgments.length
      ));

    const includeCount = findingJudgments.filter(judgment => judgment.decision === 'INCLUDE').length;
    const openingCount = findingJudgments.filter(judgment => judgment.decision === 'OPENING_CANDIDATE').length;
    const excludeCount = findingJudgments.filter(judgment => judgment.decision === 'EXCLUDE').length;

    const rationale = this.buildRationale({
      aggregateScore,
      includeCount,
      openingCount,
      excludeCount,
      total: findingJudgments.length,
      centralQuestion
    });

    return {
      storyPotentialScore: aggregateScore,
      reasoning: {
        centralQuestion,
        audienceCuriosityValue: this.aggregateDimension(findingJudgments, 'audienceCuriosityValue'),
        surprise: this.aggregateDimension(findingJudgments, 'surprise'),
        emotionalSignificance: this.aggregateDimension(findingJudgments, 'emotionalSignificance'),
        narrativeImportance: this.aggregateDimension(findingJudgments, 'narrativeImportance'),
        conflictCreation: this.aggregateDimension(findingJudgments, 'conflictCreation'),
        characterSignificance: this.aggregateDimension(findingJudgments, 'characterSignificance'),
        visualPotential: this.aggregateDimension(findingJudgments, 'visualPotential'),
        memorability: this.aggregateDimension(findingJudgments, 'memorability'),
        educationalValue: this.aggregateDimension(findingJudgments, 'educationalValue'),
        centralQuestionRelevance: this.aggregateDimension(findingJudgments, 'centralQuestionRelevance'),
        findingJudgments,
        inclusionSummary: {
          openingCandidates: openingCount,
          include: includeCount,
          exclude: excludeCount,
          totalFindings: findingJudgments.length
        }
      },
      rationale
    };
  }

  evaluateFinding({ finding, centralQuestion }) {
    const text = this.extractFindingText(finding);
    const normalized = text.toLowerCase();

    const dimensions = {
      audienceCuriosityValue: this.scoreAudienceCuriosity(normalized),
      surprise: this.scoreSurprise(normalized),
      emotionalSignificance: this.scoreEmotionalSignificance(normalized),
      narrativeImportance: this.scoreNarrativeImportance(normalized),
      conflictCreation: this.scoreConflictCreation(normalized),
      characterSignificance: this.scoreCharacterSignificance(normalized),
      visualPotential: this.scoreVisualPotential(normalized),
      memorability: this.scoreMemorability(normalized),
      educationalValue: this.scoreEducationalValue(normalized),
      centralQuestionRelevance: this.scoreCentralQuestionRelevance(normalized, centralQuestion)
    };

    const evidenceStrength = this.scoreEvidenceStrength(normalized);
    const storyWorthinessScore = this.scoreStoryWorthiness(dimensions);
    const decision = this.decideInclusion({ dimensions, evidenceStrength, storyWorthinessScore });

    return {
      findingId: String(finding?.id ?? ''),
      findingText: text,
      dimensions,
      evidenceStrength,
      storyWorthinessScore,
      decision,
      reasoning: this.buildFindingReasoning({ dimensions, evidenceStrength, storyWorthinessScore, decision })
    };
  }

  scoreAudienceCuriosity(text) {
    let score = 3;
    if (this.containsAny(text, ['mystery', 'question', 'unknown', 'what happened', 'why'])) score += 3;
    if (this.containsAny(text, ['reveal', 'clue', 'hidden', 'unresolved'])) score += 2;
    if (this.containsAny(text, ['unexpected', 'turning point'])) score += 1;
    return this.clamp(score);
  }

  scoreSurprise(text) {
    let score = 3;
    if (this.containsAny(text, ['unexpected', 'shocking', 'surprising', 'rare', 'unusual'])) score += 4;
    if (this.containsAny(text, ['contradict', 'counterintuitive', 'reversal'])) score += 2;
    return this.clamp(score);
  }

  scoreEmotionalSignificance(text) {
    let score = 3;
    if (this.containsAny(text, ['loss', 'fear', 'hope', 'grief', 'pressure', 'risk', 'harm'])) score += 4;
    if (this.containsAny(text, ['family', 'victim', 'survivor', 'community'])) score += 2;
    return this.clamp(score);
  }

  scoreNarrativeImportance(text) {
    let score = 3;
    if (this.containsAny(text, ['stake', 'consequence', 'turning point', 'decision', 'impact'])) score += 4;
    if (this.containsAny(text, ['because', 'therefore', 'led to'])) score += 2;
    return this.clamp(score);
  }

  scoreConflictCreation(text) {
    let score = 3;
    if (this.containsAny(text, ['conflict', 'dispute', 'battle', 'contested', 'versus', 'opposed'])) score += 4;
    if (this.containsAny(text, ['contradict', 'inconsistent', 'rival'])) score += 2;
    return this.clamp(score);
  }

  scoreCharacterSignificance(text) {
    let score = 3;
    if (this.containsAny(text, ['character', 'witness', 'leader', 'investigator', 'family', 'subject'])) score += 3;
    if (this.containsAny(text, ['name', 'person', 'individual'])) score += 2;
    return this.clamp(score);
  }

  scoreVisualPotential(text) {
    let score = 3;
    if (this.containsAny(text, ['image', 'video', 'footage', 'archive', 'scene', 'location'])) score += 4;
    if (this.containsAny(text, ['photo', 'document', 'map', 'timeline'])) score += 2;
    return this.clamp(score);
  }

  scoreMemorability(text) {
    let score = 3;
    if (this.containsAny(text, ['never', 'first', 'only', 'record-breaking', 'historic'])) score += 3;
    if (this.hasNumbers(text)) score += 2;
    if (this.containsAny(text, ['dramatic', 'iconic', 'signature'])) score += 2;
    return this.clamp(score);
  }

  scoreEducationalValue(text) {
    let score = 3;
    if (this.containsAny(text, ['explains', 'context', 'history', 'background', 'evidence', 'data'])) score += 4;
    if (this.containsAny(text, ['policy', 'system', 'pattern', 'mechanism'])) score += 2;
    return this.clamp(score);
  }

  scoreCentralQuestionRelevance(text, centralQuestion) {
    if (!centralQuestion) return 5;

    const questionTokens = centralQuestion
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter(token => token.length > 2);

    if (questionTokens.length === 0) return 5;

    const overlap = questionTokens.filter(token => text.includes(token)).length;
    const ratio = overlap / questionTokens.length;

    if (ratio >= 0.6) return 9;
    if (ratio >= 0.4) return 7;
    if (ratio >= 0.2) return 5;
    return 3;
  }

  scoreEvidenceStrength(text) {
    let score = 3;
    if (this.containsAny(text, ['evidence', 'documented', 'record', 'verified', 'corroborated', 'court', 'filing'])) score += 4;
    if (this.containsAny(text, ['according to', 'source', 'archive'])) score += 2;
    return this.clamp(score);
  }

  scoreStoryWorthiness(dimensions) {
    const weighted = (
      dimensions.audienceCuriosityValue * 0.12
      + dimensions.surprise * 0.08
      + dimensions.emotionalSignificance * 0.12
      + dimensions.narrativeImportance * 0.16
      + dimensions.conflictCreation * 0.12
      + dimensions.characterSignificance * 0.08
      + dimensions.visualPotential * 0.08
      + dimensions.memorability * 0.08
      + dimensions.educationalValue * 0.08
      + dimensions.centralQuestionRelevance * 0.08
    );

    return this.clamp(Math.round(weighted));
  }

  decideInclusion({ dimensions, evidenceStrength, storyWorthinessScore }) {
    const openingCandidate = dimensions.audienceCuriosityValue >= 8
      && (dimensions.surprise >= 7 || dimensions.conflictCreation >= 7)
      && dimensions.centralQuestionRelevance >= 6;

    if (openingCandidate) return 'OPENING_CANDIDATE';
    if (storyWorthinessScore >= 7 && dimensions.centralQuestionRelevance >= 6 && evidenceStrength >= 5) return 'INCLUDE';
    if (storyWorthinessScore >= 6 && dimensions.centralQuestionRelevance < 5) return 'SUPPORTING_NOT_CENTRAL';
    if (storyWorthinessScore < 6) return 'EXCLUDE';
    return 'SUPPORTING';
  }

  buildFindingReasoning({ dimensions, evidenceStrength, storyWorthinessScore, decision }) {
    if (
      dimensions.educationalValue >= 7
      && dimensions.audienceCuriosityValue < 5
      && dimensions.emotionalSignificance < 5
      && dimensions.conflictCreation < 5
    ) {
      return 'Technically correct but low story value.';
    }

    if (dimensions.emotionalSignificance >= 8 && evidenceStrength <= 4) {
      return 'High emotional value but weak evidence.';
    }

    if ((decision === 'SUPPORTING_NOT_CENTRAL' || decision === 'SUPPORTING') && dimensions.centralQuestionRelevance < 5) {
      return 'Excellent supporting fact but not central to the narrative.';
    }

    if (decision === 'OPENING_CANDIDATE') {
      return 'Strong opening candidate because it immediately creates curiosity.';
    }

    if (decision === 'EXCLUDE') {
      return 'Exclude from core narrative because story worthiness is below threshold.';
    }

    return `Include in narrative due to strong story-worthiness profile (${storyWorthinessScore}/10).`;
  }

  buildRationale({ aggregateScore, includeCount, openingCount, excludeCount, total, centralQuestion }) {
    if (total === 0) {
      return 'No findings available for story-worthiness judgment.';
    }

    return `Story worthiness evaluated against central question "${centralQuestion || 'UNSPECIFIED'}" with aggregate score ${aggregateScore}/10; ${openingCount} opening candidate(s), ${includeCount} include decision(s), and ${excludeCount} exclusion(s).`;
  }

  aggregateDimension(findingJudgments, key) {
    if (findingJudgments.length === 0) {
      return {
        score: 0,
        conclusion: 'No findings available.'
      };
    }

    const score = this.clamp(Math.round(
      findingJudgments.reduce((sum, judgment) => sum + Number(judgment.dimensions[key] ?? 0), 0) / findingJudgments.length
    ));

    const label = score >= 7 ? 'strong' : score >= 5 ? 'moderate' : 'weak';

    return {
      score,
      conclusion: `${key} is ${label} across evaluated findings.`
    };
  }

  resolveCentralQuestion(input) {
    const explicit = String(input.centralQuestion ?? '').trim();
    if (explicit.length > 0) return explicit;

    const summary = String(input.executiveSummary ?? '').trim();
    if (summary.length === 0) return 'What is the most evidence-backed explanation of the central documentary issue?';

    const questionMatch = summary.match(/[^.?!]*\?/);
    if (questionMatch && String(questionMatch[0]).trim().length > 0) {
      return String(questionMatch[0]).trim();
    }

    return summary.slice(0, 140);
  }

  extractFindingText(finding) {
    return String(
      finding?.claim
      ?? finding?.summary
      ?? finding?.text
      ?? finding?.statement
      ?? ''
    ).trim();
  }

  containsAny(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  hasNumbers(text) {
    return /\d/.test(String(text ?? ''));
  }

  clamp(value) {
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}