export class CuriosityEngineeringCompetency {
  assess(script = '') {
    const normalizedScript = String(script ?? '').trim();
    const sections = this.segmentScript(normalizedScript);

    if (sections.length === 0) {
      return {
        curiosityScore: 0,
        reasoning: this.emptyReasoning(),
        rationale: 'Curiosity engineering cannot be assessed because script content is empty.'
      };
    }

    const sectionDiagnostics = sections.map((section, index) => this.evaluateSection({ section, index, total: sections.length }));

    const curiosityGapCreation = this.aggregate(sectionDiagnostics, 'curiosityGapCreation');
    const informationWithholding = this.aggregate(sectionDiagnostics, 'informationWithholding');
    const informationReleaseTiming = this.aggregate(sectionDiagnostics, 'informationReleaseTiming');
    const narrativeTension = this.aggregate(sectionDiagnostics, 'narrativeTension');
    const openLoops = this.aggregate(sectionDiagnostics, 'openLoops');
    const questionGeneration = this.aggregate(sectionDiagnostics, 'questionGeneration');
    const delayedGratification = this.aggregate(sectionDiagnostics, 'delayedGratification');
    const audienceExpectationManagement = this.aggregate(sectionDiagnostics, 'audienceExpectationManagement');
    const satisfyingReveals = this.aggregate(sectionDiagnostics, 'satisfyingReveals');

    const collapseDetection = this.detectCuriosityCollapse(sectionDiagnostics);
    const earlyReveals = this.detectEarlyReveals(sectionDiagnostics);
    const rewriteSections = this.selectRewriteSections(sectionDiagnostics, collapseDetection, earlyReveals);
    const questionInsertionPoints = this.selectQuestionInsertionPoints(sectionDiagnostics);
    const lowestRetentionRiskScene = this.identifyRetentionRiskScene(sectionDiagnostics);

    const curiosityTrend = this.evaluateCuriosityTrend(sectionDiagnostics, collapseDetection);

    const curiosityScore = this.computeCuriosityScore({
      curiosityGapCreation,
      informationWithholding,
      informationReleaseTiming,
      narrativeTension,
      openLoops,
      questionGeneration,
      delayedGratification,
      audienceExpectationManagement,
      satisfyingReveals,
      curiosityCollapseDetection: collapseDetection
    });

    const reasoning = {
      curiosityGapCreation,
      informationWithholding,
      informationReleaseTiming,
      narrativeTension,
      openLoops,
      questionGeneration,
      delayedGratification,
      audienceExpectationManagement,
      satisfyingReveals,
      curiosityCollapseDetection: collapseDetection,
      whyCuriosityIncreasing: curiosityTrend.increasingReasons,
      whyCuriosityDecreasing: curiosityTrend.decreasingReasons,
      sectionsShouldBeRewritten: rewriteSections,
      revealsTooEarly: earlyReveals,
      questionsShouldBeIntroduced: questionInsertionPoints,
      sceneMostLikelyToLoseAudience: lowestRetentionRiskScene,
      sectionDiagnostics
    };

    return {
      curiosityScore,
      reasoning,
      rationale: this.buildRationale({ curiosityScore, curiosityTrend, collapseDetection, lowestRetentionRiskScene })
    };
  }

  emptyReasoning() {
    return {
      curiosityGapCreation: { score: 0, conclusion: 'No script provided.' },
      informationWithholding: { score: 0, conclusion: 'No script provided.' },
      informationReleaseTiming: { score: 0, conclusion: 'No script provided.' },
      narrativeTension: { score: 0, conclusion: 'No script provided.' },
      openLoops: { score: 0, conclusion: 'No script provided.' },
      questionGeneration: { score: 0, conclusion: 'No script provided.' },
      delayedGratification: { score: 0, conclusion: 'No script provided.' },
      audienceExpectationManagement: { score: 0, conclusion: 'No script provided.' },
      satisfyingReveals: { score: 0, conclusion: 'No script provided.' },
      curiosityCollapseDetection: { score: 0, collapseSections: [], conclusion: 'No script provided.' },
      whyCuriosityIncreasing: [],
      whyCuriosityDecreasing: [],
      sectionsShouldBeRewritten: [],
      revealsTooEarly: [],
      questionsShouldBeIntroduced: [],
      sceneMostLikelyToLoseAudience: null,
      sectionDiagnostics: []
    };
  }

  segmentScript(script) {
    const parts = script
      .split(/\n+/)
      .map(part => part.trim())
      .filter(Boolean);

    if (parts.length >= 3) return parts;

    return script
      .split(/(?<=[.!?])\s+/)
      .map(part => part.trim())
      .filter(Boolean);
  }

  evaluateSection({ section, index, total }) {
    const text = String(section ?? '').toLowerCase();
    const sentenceId = `SCENE-${String(index + 1).padStart(3, '0')}`;

    const curiosityGapCreation = this.scoreCuriosityGap(text);
    const informationWithholding = this.scoreInformationWithholding(text);
    const informationReleaseTiming = this.scoreInformationReleaseTiming(text, index, total);
    const narrativeTension = this.scoreNarrativeTension(text);
    const openLoops = this.scoreOpenLoops(text);
    const questionGeneration = this.scoreQuestionGeneration(text);
    const delayedGratification = this.scoreDelayedGratification(text);
    const audienceExpectationManagement = this.scoreExpectationManagement(text);
    const satisfyingReveals = this.scoreSatisfyingReveals(text, index, total);

    const retentionRisk = this.clamp(10 - Math.round((
      curiosityGapCreation
      + narrativeTension
      + questionGeneration
      + delayedGratification
    ) / 4));

    const revealTooEarly = index < Math.max(1, Math.floor(total * 0.35))
      && this.containsAny(text, ['the truth is', 'it was', 'the answer is', 'we now know', 'revealed that'])
      && curiosityGapCreation < 6;

    return {
      sceneId: sentenceId,
      section,
      curiosityGapCreation,
      informationWithholding,
      informationReleaseTiming,
      narrativeTension,
      openLoops,
      questionGeneration,
      delayedGratification,
      audienceExpectationManagement,
      satisfyingReveals,
      retentionRisk,
      revealTooEarly
    };
  }

  scoreCuriosityGap(text) {
    let score = 3;
    if (this.containsAny(text, ['why', 'how', 'what happened', 'unknown', 'mystery', 'unresolved'])) score += 3;
    if (this.containsAny(text, ['clue', 'question', 'missing'])) score += 2;
    if (this.containsAny(text, ['the answer is', 'case closed'])) score -= 2;
    return this.clamp(score);
  }

  scoreInformationWithholding(text) {
    let score = 3;
    if (this.containsAny(text, ['not yet', 'before we reveal', 'later', 'first'])) score += 3;
    if (this.containsAny(text, ['we will return', 'hold that thought'])) score += 2;
    if (this.containsAny(text, ['everything is clear', 'here is the full answer'])) score -= 2;
    return this.clamp(score);
  }

  scoreInformationReleaseTiming(text, index, total) {
    let score = 5;
    const early = index < Math.max(1, Math.floor(total * 0.35));
    const hasDirectReveal = this.containsAny(text, ['the answer is', 'the truth is', 'it was']);
    if (early && hasDirectReveal) score -= 3;
    if (!early && hasDirectReveal) score += 2;
    if (this.containsAny(text, ['step by step', 'first', 'next', 'finally'])) score += 1;
    return this.clamp(score);
  }

  scoreNarrativeTension(text) {
    let score = 3;
    if (this.containsAny(text, ['risk', 'stakes', 'threat', 'pressure', 'consequence'])) score += 4;
    if (this.containsAny(text, ['if', 'unless', 'before it was too late'])) score += 2;
    return this.clamp(score);
  }

  scoreOpenLoops(text) {
    let score = 3;
    if (text.includes('?')) score += 3;
    if (this.containsAny(text, ['but', 'however', 'yet', 'still unresolved'])) score += 2;
    return this.clamp(score);
  }

  scoreQuestionGeneration(text) {
    let score = 2;
    const qCount = (text.match(/\?/g) ?? []).length;
    if (qCount >= 1) score += 3;
    if (qCount >= 2) score += 2;
    if (this.containsAny(text, ['the question is', 'we need to know'])) score += 2;
    return this.clamp(score);
  }

  scoreDelayedGratification(text) {
    let score = 3;
    if (this.containsAny(text, ['we are not there yet', 'before we get to that', 'later we discover'])) score += 3;
    if (this.containsAny(text, ['first we must understand', 'one more clue'])) score += 2;
    return this.clamp(score);
  }

  scoreExpectationManagement(text) {
    let score = 3;
    if (this.containsAny(text, ['you might think', 'you expect', 'seems obvious'])) score += 3;
    if (this.containsAny(text, ['but the evidence shows', 'instead'])) score += 2;
    return this.clamp(score);
  }

  scoreSatisfyingReveals(text, index, total) {
    let score = 4;
    const lateSection = index >= Math.floor(total * 0.6);
    const revealLanguage = this.containsAny(text, ['revealed', 'discovered', 'the answer', 'finally']);
    if (lateSection && revealLanguage) score += 4;
    if (!lateSection && revealLanguage) score -= 2;
    return this.clamp(score);
  }

  aggregate(sectionDiagnostics, key) {
    if (sectionDiagnostics.length === 0) {
      return { score: 0, conclusion: 'No sections were evaluated.' };
    }

    const score = this.clamp(Math.round(
      sectionDiagnostics.reduce((sum, section) => sum + Number(section[key] ?? 0), 0) / sectionDiagnostics.length
    ));

    const quality = score >= 7 ? 'strong' : score >= 5 ? 'moderate' : 'weak';
    return {
      score,
      conclusion: `${key} is ${quality} across the evaluated script.`
    };
  }

  detectCuriosityCollapse(sectionDiagnostics) {
    const collapseSections = sectionDiagnostics
      .filter(section => section.retentionRisk >= 7)
      .map(section => ({
        sceneId: section.sceneId,
        section: section.section,
        reason: 'Curiosity collapse risk due to low tension and weak open-loop maintenance.'
      }));

    const score = this.clamp(10 - collapseSections.length * 2);

    return {
      score,
      collapseSections,
      conclusion: collapseSections.length === 0
        ? 'No major curiosity collapse points detected.'
        : `${collapseSections.length} scene(s) risk curiosity collapse and should be rewritten.`
    };
  }

  detectEarlyReveals(sectionDiagnostics) {
    return sectionDiagnostics
      .filter(section => section.revealTooEarly)
      .map(section => ({
        sceneId: section.sceneId,
        section: section.section,
        reason: 'Reveal occurs too early and collapses curiosity before tension peaks.'
      }));
  }

  selectRewriteSections(sectionDiagnostics, collapseDetection, earlyReveals) {
    const earlyRevealIds = new Set(earlyReveals.map(item => item.sceneId));

    return sectionDiagnostics
      .filter(section => section.retentionRisk >= 7 || earlyRevealIds.has(section.sceneId))
      .map(section => ({
        sceneId: section.sceneId,
        section: section.section,
        rewriteReason: section.retentionRisk >= 7
          ? 'Low curiosity retention risk; add stronger open loops and tension.'
          : 'Move reveal later and introduce exploratory question first.'
      }));
  }

  selectQuestionInsertionPoints(sectionDiagnostics) {
    return sectionDiagnostics
      .filter(section => section.questionGeneration <= 4 && section.curiosityGapCreation <= 5)
      .slice(0, 3)
      .map(section => ({
        sceneId: section.sceneId,
        section: section.section,
        reason: 'Introduce a guiding question to open a curiosity loop.'
      }));
  }

  identifyRetentionRiskScene(sectionDiagnostics) {
    if (sectionDiagnostics.length === 0) return null;

    const scene = [...sectionDiagnostics].sort((a, b) => b.retentionRisk - a.retentionRisk)[0];
    return {
      sceneId: scene.sceneId,
      section: scene.section,
      retentionRisk: scene.retentionRisk,
      reason: 'Highest probability audience drop due to curiosity collapse indicators.'
    };
  }

  evaluateCuriosityTrend(sectionDiagnostics, collapseDetection) {
    const increasingReasons = [];
    const decreasingReasons = [];

    const avgGap = this.average(sectionDiagnostics.map(section => section.curiosityGapCreation));
    const avgQuestions = this.average(sectionDiagnostics.map(section => section.questionGeneration));
    const avgTension = this.average(sectionDiagnostics.map(section => section.narrativeTension));

    if (avgGap >= 6) increasingReasons.push('Curiosity gaps are sustained through unresolved narrative prompts.');
    if (avgQuestions >= 6) increasingReasons.push('Question density supports active audience prediction loops.');
    if (avgTension >= 6) increasingReasons.push('Narrative tension maintains forward pressure between reveals.');

    if (collapseDetection.collapseSections.length > 0) decreasingReasons.push('Curiosity collapses in specific sections due to weak loop maintenance.');
    if (sectionDiagnostics.some(section => section.revealTooEarly)) decreasingReasons.push('Early reveal timing reduces delayed gratification.');
    if (avgQuestions < 5) decreasingReasons.push('Insufficient question generation causes flat audience engagement.');

    return {
      increasingReasons,
      decreasingReasons
    };
  }

  computeCuriosityScore(metrics) {
    const weighted = (
      metrics.curiosityGapCreation.score * 0.16
      + metrics.informationWithholding.score * 0.1
      + metrics.informationReleaseTiming.score * 0.12
      + metrics.narrativeTension.score * 0.14
      + metrics.openLoops.score * 0.1
      + metrics.questionGeneration.score * 0.1
      + metrics.delayedGratification.score * 0.08
      + metrics.audienceExpectationManagement.score * 0.08
      + metrics.satisfyingReveals.score * 0.08
      + metrics.curiosityCollapseDetection.score * 0.04
    );

    return this.clamp(Math.round(weighted));
  }

  buildRationale({ curiosityScore, curiosityTrend, collapseDetection, lowestRetentionRiskScene }) {
    const inc = curiosityTrend.increasingReasons.length > 0
      ? curiosityTrend.increasingReasons.join(' ')
      : 'Curiosity growth signals are limited.';
    const dec = curiosityTrend.decreasingReasons.length > 0
      ? curiosityTrend.decreasingReasons.join(' ')
      : 'No major curiosity decline factors detected.';

    const collapse = collapseDetection.collapseSections.length > 0
      ? `${collapseDetection.collapseSections.length} collapse-risk section(s) identified.`
      : 'No collapse-risk sections identified.';

    const dropRisk = lowestRetentionRiskScene
      ? `Highest audience-loss risk is ${lowestRetentionRiskScene.sceneId}.`
      : 'No single drop-risk scene identified.';

    return `Curiosity engineering score is ${curiosityScore}/10. Increasing factors: ${inc} Decreasing factors: ${dec} ${collapse} ${dropRisk}`;
  }

  average(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return values.reduce((sum, value) => sum + Number(value ?? 0), 0) / values.length;
  }

  containsAny(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  clamp(value) {
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}