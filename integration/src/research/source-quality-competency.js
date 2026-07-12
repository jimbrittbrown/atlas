export class SourceQualityCompetency {
  assess(input = {}) {
    const providers = Array.isArray(input.providers) ? input.providers : [];
    const findings = Array.isArray(input.findings) ? input.findings : [];
    const executiveSummary = String(input.executiveSummary ?? '');

    const sourceProfiles = providers.map(provider => this.profileSource(provider));

    const sourceTypeBreakdown = this.buildSourceTypeBreakdown(sourceProfiles);
    const sourceHierarchy = this.evaluateSourceHierarchy(sourceTypeBreakdown, sourceProfiles.length);
    const corroboration = this.evaluateIndependentCorroboration(sourceProfiles, findings);
    const authority = this.evaluateAuthorityAndExpertise(sourceProfiles, executiveSummary);
    const bias = this.evaluateBiasDetection(sourceProfiles, executiveSummary, findings);
    const conflicts = this.evaluateConflictsOfInterest(sourceProfiles, executiveSummary, findings);
    const currency = this.evaluateCurrency(sourceProfiles, executiveSummary, findings);
    const missingEvidence = this.evaluateMissingEvidence(sourceProfiles, findings, executiveSummary);
    const contradictoryEvidence = this.evaluateContradictoryEvidence(findings, executiveSummary);
    const rejectionAnalysis = this.evaluateRejectionCriteria(sourceProfiles, corroboration, authority, bias, conflicts);
    const professionalMasterClassLessons = this.buildProfessionalMasterClassLessons();
    const professionalSourceVerificationWorkflow = this.buildProfessionalSourceVerificationWorkflow();

    const confidenceAssignment = this.assignEvidenceConfidence({
      sourceHierarchy,
      corroboration,
      authority,
      bias,
      conflicts,
      currency,
      missingEvidence,
      contradictoryEvidence,
      rejectionAnalysis
    });

    const appliedProfessionalReasoning = this.buildAppliedProfessionalReasoning({
      sourceProfiles,
      findings,
      sourceHierarchy,
      corroboration,
      missingEvidence,
      contradictoryEvidence,
      confidenceAssignment,
      professionalSourceVerificationWorkflow
    });

    const sourceQualityScore = this.boundScore(confidenceAssignment.score);

    return {
      sourceQualityScore,
      confidence: confidenceAssignment,
      reasoning: {
        sourceClassification: {
          primary: sourceTypeBreakdown.primary,
          secondary: sourceTypeBreakdown.secondary,
          tertiary: sourceTypeBreakdown.tertiary,
          unknown: sourceTypeBreakdown.unknown,
          classifications: sourceProfiles.map(profile => ({
            source: profile.source,
            type: profile.type,
            rationale: profile.typeRationale
          }))
        },
        sourceHierarchy,
        independentCorroboration: corroboration,
        authorityAndExpertise: authority,
        biasDetection: bias,
        conflictsOfInterest: conflicts,
        currency,
        evidenceConfidence: confidenceAssignment,
        missingEvidence,
        contradictoryEvidence,
        rejectionCriteria: rejectionAnalysis,
        confidenceAssignmentMethod: 'Weighted confidence model combining hierarchy, corroboration, authority, bias, conflict risk, currency, and contradiction handling.',
        professionalMasterClassLessons,
        professionalSourceVerificationWorkflow,
        appliedProfessionalReasoning
      },
      rationale: this.buildRationale({
        sourceHierarchy,
        corroboration,
        authority,
        bias,
        conflicts,
        currency,
        missingEvidence,
        contradictoryEvidence,
        rejectionAnalysis,
        confidenceAssignment,
        appliedProfessionalReasoning
      })
    };
  }

  profileSource(provider = {}) {
    const source = String(provider.provider ?? provider.source ?? provider.name ?? 'UNKNOWN_SOURCE').trim();
    const providerText = `${source} ${JSON.stringify(provider ?? {})}`.toLowerCase();
    const type = this.classifySourceType(providerText);

    const status = String(provider.status ?? '').toLowerCase();
    const hasError = Boolean(provider.error);
    const failed = status === 'failed' || status === 'error' || hasError;

    return {
      source,
      type,
      typeRationale: this.describeTypeRationale(type),
      authoritySignal: this.scoreAuthoritySignal(providerText),
      biasSignal: this.scoreBiasSignal(providerText),
      conflictSignal: this.scoreConflictSignal(providerText),
      recencySignal: this.extractRecencySignal(providerText),
      failed
    };
  }

  classifySourceType(providerText) {
    const primaryTokens = [
      'archive', 'court', 'filing', 'transcript', 'interview', 'dataset', 'public record', 'official record',
      'government', 'primary', 'first-hand', 'deposition', 'evidence log'
    ];
    const secondaryTokens = [
      'analysis', 'report', 'paper', 'journal', 'news', 'documentary', 'review', 'investigation', 'meta-analysis'
    ];
    const tertiaryTokens = [
      'encyclopedia', 'wikipedia', 'blog', 'summary', 'aggregator', 'digest', 'commentary'
    ];

    if (this.containsAny(providerText, tertiaryTokens)) return 'TERTIARY';
    if (this.containsAny(providerText, primaryTokens)) return 'PRIMARY';
    if (this.containsAny(providerText, secondaryTokens)) return 'SECONDARY';
    return 'UNKNOWN';
  }

  describeTypeRationale(type) {
    if (type === 'PRIMARY') return 'Direct evidence or first-hand records anchor the claim path.';
    if (type === 'SECONDARY') return 'Interpretive analysis adds context but depends on underlying evidence quality.';
    if (type === 'TERTIARY') return 'Aggregated or summarized material is useful for orientation, not core proof.';
    return 'Source type is unclear and should not carry major evidentiary weight until classified.';
  }

  buildSourceTypeBreakdown(sourceProfiles) {
    const breakdown = {
      primary: 0,
      secondary: 0,
      tertiary: 0,
      unknown: 0
    };

    sourceProfiles.forEach(profile => {
      if (profile.type === 'PRIMARY') breakdown.primary += 1;
      else if (profile.type === 'SECONDARY') breakdown.secondary += 1;
      else if (profile.type === 'TERTIARY') breakdown.tertiary += 1;
      else breakdown.unknown += 1;
    });

    return breakdown;
  }

  evaluateSourceHierarchy(breakdown, totalSources) {
    if (totalSources === 0) {
      return {
        score: 0,
        conclusion: 'No source hierarchy can be established without sources.',
        hierarchyStatus: 'INSUFFICIENT'
      };
    }

    const weighted = (
      breakdown.primary * 1.0
      + breakdown.secondary * 0.75
      + breakdown.tertiary * 0.35
      + breakdown.unknown * 0.5
    ) / totalSources;

    const score = this.clamp(Math.round(weighted * 10));
    const hierarchyStatus = score >= 7 ? 'STRONG' : score >= 5 ? 'MODERATE' : 'WEAK';

    return {
      score,
      hierarchyStatus,
      conclusion: `Hierarchy quality is ${hierarchyStatus.toLowerCase()} with ${breakdown.primary} primary, ${breakdown.secondary} secondary, and ${breakdown.tertiary} tertiary sources.`
    };
  }

  evaluateIndependentCorroboration(sourceProfiles, findings) {
    const uniqueSources = new Set(sourceProfiles.map(profile => profile.source.toLowerCase())).size;
    const corroborationSignals = findings.filter(finding => {
      const text = JSON.stringify(finding ?? {}).toLowerCase();
      return this.containsAny(text, ['corroborat', 'confirmed by', 'verified by', 'independent']);
    }).length;

    let score = 2;
    if (uniqueSources >= 2) score += 2;
    if (uniqueSources >= 3) score += 2;
    if (corroborationSignals >= 1) score += 2;
    if (corroborationSignals >= 2) score += 1;

    return {
      score: this.clamp(score),
      uniqueSourceCount: uniqueSources,
      corroborationSignals,
      conclusion: uniqueSources >= 3
        ? 'Independent corroboration is present across multiple distinct sources.'
        : 'Corroboration depth is limited and should be expanded before high-confidence use.'
    };
  }

  evaluateAuthorityAndExpertise(sourceProfiles, executiveSummary) {
    const authoritySignals = sourceProfiles.reduce((sum, profile) => sum + profile.authoritySignal, 0);
    const avgAuthority = sourceProfiles.length > 0 ? authoritySignals / sourceProfiles.length : 0;
    const summaryBoost = this.containsAny(executiveSummary.toLowerCase(), ['expert', 'peer-reviewed', 'official', 'archival']) ? 1 : 0;
    const score = this.clamp(Math.round(avgAuthority + summaryBoost));

    return {
      score,
      conclusion: score >= 7
        ? 'Source authority and domain expertise are strong enough for documentary use.'
        : 'Authority signal is mixed and requires higher-credibility domain sourcing.'
    };
  }

  evaluateBiasDetection(sourceProfiles, executiveSummary, findings) {
    const sourceBiasLoad = sourceProfiles.reduce((sum, profile) => sum + profile.biasSignal, 0);
    const text = `${executiveSummary} ${JSON.stringify(findings ?? [])}`.toLowerCase();
    const narrativeBiasSignals = this.containsAny(text, ['opinion', 'partisan', 'activist', 'advocacy', 'propaganda']) ? 2 : 0;

    const totalBiasSignals = sourceBiasLoad + narrativeBiasSignals;
    const score = this.clamp(10 - Math.min(8, totalBiasSignals));

    return {
      score,
      detectedBiasSignals: totalBiasSignals,
      conclusion: totalBiasSignals === 0
        ? 'No material bias indicators detected in current evidence set.'
        : 'Bias indicators detected and should be controlled with stronger counter-sourcing.'
    };
  }

  evaluateConflictsOfInterest(sourceProfiles, executiveSummary, findings) {
    const sourceConflicts = sourceProfiles.reduce((sum, profile) => sum + profile.conflictSignal, 0);
    const text = `${executiveSummary} ${JSON.stringify(findings ?? [])}`.toLowerCase();
    const textualConflicts = this.containsAny(text, ['sponsor', 'funded by', 'paid', 'affiliate', 'financial interest']) ? 2 : 0;
    const total = sourceConflicts + textualConflicts;
    const score = this.clamp(10 - Math.min(8, total));

    return {
      score,
      detectedConflictSignals: total,
      conclusion: total === 0
        ? 'No significant conflict-of-interest flags detected.'
        : 'Conflict-of-interest risk is present and should reduce evidentiary confidence.'
    };
  }

  evaluateCurrency(sourceProfiles, executiveSummary, findings) {
    const recencySignals = sourceProfiles
      .map(profile => profile.recencySignal)
      .filter(value => Number.isFinite(value));

    const text = `${executiveSummary} ${JSON.stringify(findings ?? [])}`;
    const years = this.extractYears(text);
    const combinedYears = [...recencySignals, ...years];

    if (combinedYears.length === 0) {
      return {
        score: 4,
        newestYear: null,
        conclusion: 'Information currency cannot be verified from available source metadata.'
      };
    }

    const newestYear = Math.max(...combinedYears);
    const currentYear = new Date().getUTCFullYear();
    const age = Math.max(0, currentYear - newestYear);
    let score = 9;
    if (age > 2) score = 7;
    if (age > 5) score = 5;
    if (age > 10) score = 3;

    return {
      score,
      newestYear,
      conclusion: age <= 2
        ? 'Evidence is current enough for contemporary documentary framing.'
        : 'Evidence may be stale and should be refreshed with newer documentation.'
    };
  }

  evaluateMissingEvidence(sourceProfiles, findings, executiveSummary) {
    const issues = [];

    if (sourceProfiles.length === 0) issues.push('No attributable sources supplied.');
    if (findings.length < 3) issues.push('Finding coverage is thin for high-confidence narrative claims.');
    if (!this.containsAny(executiveSummary.toLowerCase(), ['evidence', 'record', 'documented', 'verified'])) {
      issues.push('Executive summary does not clearly reference documentary-grade evidence anchors.');
    }

    const primaryCount = sourceProfiles.filter(profile => profile.type === 'PRIMARY').length;
    if (primaryCount === 0) issues.push('No primary-source anchor detected for critical claims.');

    return {
      score: this.clamp(10 - issues.length * 2),
      missingItems: issues,
      conclusion: issues.length === 0
        ? 'No major evidence gaps detected.'
        : 'Material evidence gaps remain and should be closed before escalation.'
    };
  }

  evaluateContradictoryEvidence(findings, executiveSummary) {
    const text = `${executiveSummary} ${JSON.stringify(findings ?? [])}`.toLowerCase();
    const contradictionSignals = this.countMatches(text, ['contradict', 'inconsistent', 'dispute', 'contested', 'conflict']);

    return {
      score: this.clamp(10 - Math.min(6, contradictionSignals * 2)),
      contradictionSignals,
      conclusion: contradictionSignals === 0
        ? 'No contradictory evidence flags detected in current package.'
        : 'Contradictory evidence is present and should be explicitly reconciled in narrative framing.'
    };
  }

  evaluateRejectionCriteria(sourceProfiles, corroboration, authority, bias, conflicts) {
    const rejectedSources = sourceProfiles
      .filter(profile => {
        const highRiskTertiary = profile.type === 'TERTIARY' && (profile.biasSignal >= 2 || profile.conflictSignal >= 2);
        const failedSource = profile.failed;
        const lowTrust = profile.authoritySignal <= 2 && (profile.biasSignal >= 2 || profile.conflictSignal >= 2);
        const weakCorroboration = corroboration.score < 5;

        return failedSource || highRiskTertiary || (lowTrust && weakCorroboration);
      })
      .map(profile => ({
        source: profile.source,
        reason: profile.failed
          ? 'Rejected: source execution failed or returned unusable evidence.'
          : 'Rejected: low authority with elevated bias/conflict risk and insufficient corroboration.'
      }));

    return {
      score: this.clamp(10 - rejectedSources.length * 2),
      rejectedSources,
      conclusion: rejectedSources.length === 0
        ? 'No sources meet full-rejection criteria.'
        : `${rejectedSources.length} source(s) should be rejected from documentary evidence chain.`
    };
  }

  assignEvidenceConfidence({
    sourceHierarchy,
    corroboration,
    authority,
    bias,
    conflicts,
    currency,
    missingEvidence,
    contradictoryEvidence,
    rejectionAnalysis
  }) {
    const weighted = (
      sourceHierarchy.score * 0.2
      + corroboration.score * 0.2
      + authority.score * 0.15
      + bias.score * 0.1
      + conflicts.score * 0.1
      + currency.score * 0.1
      + missingEvidence.score * 0.075
      + contradictoryEvidence.score * 0.075
      + rejectionAnalysis.score * 0.1
    );

    const earnedConfidenceAdjustments = [];
    let adjustedScore = weighted;

    if (sourceHierarchy.score < 5) {
      adjustedScore -= 0.8;
      earnedConfidenceAdjustments.push('Reduced confidence: evidence hierarchy is too weak for elite documentary standards.');
    }

    if (corroboration.score < 5) {
      adjustedScore -= 0.8;
      earnedConfidenceAdjustments.push('Reduced confidence: corroboration is insufficient across independent sources.');
    }

    if (missingEvidence.missingItems.length > 0) {
      adjustedScore -= 0.5;
      earnedConfidenceAdjustments.push('Reduced confidence: unresolved missing evidence remains in the package.');
    }

    if (contradictoryEvidence.contradictionSignals > 0) {
      adjustedScore -= 0.5;
      earnedConfidenceAdjustments.push('Reduced confidence: contradictory evidence has not been fully reconciled.');
    }

    const score = this.boundScore(adjustedScore);

    let level = 'LOW';
    if (score >= 7.5) level = 'HIGH';
    else if (score >= 6) level = 'MEDIUM';

    return {
      score,
      level,
      conclusion: level === 'HIGH'
        ? 'Evidence confidence is high enough for core documentary claims.'
        : level === 'MEDIUM'
          ? 'Evidence confidence is moderate; use with explicit caveats and further verification.'
          : 'Evidence confidence is low; do not rely on this package for central claims.',
      earnedConfidenceAdjustments
    };
  }

  buildRationale({
    sourceHierarchy,
    corroboration,
    authority,
    bias,
    conflicts,
    currency,
    missingEvidence,
    contradictoryEvidence,
    rejectionAnalysis,
    confidenceAssignment,
    appliedProfessionalReasoning
  }) {
    return [
      `Source hierarchy: ${sourceHierarchy.conclusion}`,
      `Independent corroboration: ${corroboration.conclusion}`,
      `Authority and expertise: ${authority.conclusion}`,
      `Bias detection: ${bias.conclusion}`,
      `Conflicts of interest: ${conflicts.conclusion}`,
      `Currency: ${currency.conclusion}`,
      `Missing evidence: ${missingEvidence.conclusion}`,
      `Contradictory evidence: ${contradictoryEvidence.conclusion}`,
      `Rejection threshold: ${rejectionAnalysis.conclusion}`,
      `Assigned evidence confidence: ${confidenceAssignment.level} (${confidenceAssignment.score}/10).`,
      `Professional reasoning shifts: ${(appliedProfessionalReasoning.decisionAdjustments ?? []).join(' ')}`
    ].join(' ');
  }

  buildProfessionalMasterClassLessons() {
    return [
      {
        lessonId: 'SQ-MASTER-001',
        lessonTitle: 'Every Source Has an Agenda',
        professionalPrinciple: 'Treat every source as motivated, not neutral, until proven otherwise.',
        whyProfessionalsThinkThisWay: 'Investigative researchers know that incentives shape framing. Agenda-awareness prevents narrative capture by a single actor.',
        commonBeginnerMistakes: [
          'Assuming formal tone equals objectivity.',
          'Confusing confidence in writing with reliability of evidence.',
          'Using one persuasive source as proof.'
        ],
        professionalExamples: [
          'A corporate-funded report is retained for context but validated against independent filings and court records.',
          'A partisan interview is used only for claims that can be externally corroborated.'
        ],
        questionsSpecialistShouldAskItself: [
          'Who benefits if this claim is accepted?',
          'What incentives may have shaped what this source included or omitted?',
          'Which independent source could falsify this claim?'
        ],
        howThisLessonChangesFutureDecisions: 'Increase scrutiny for agenda-heavy sources and lower their standalone evidentiary weight.'
      },
      {
        lessonId: 'SQ-MASTER-002',
        lessonTitle: 'Primary Evidence Is Preferred',
        professionalPrinciple: 'Prioritize first-hand records before interpretation layers.',
        whyProfessionalsThinkThisWay: 'Primary evidence reduces distortion introduced by retelling, summarization, and editorial framing.',
        commonBeginnerMistakes: [
          'Building core claims from summaries without tracing source origin.',
          'Treating commentary as equal to records.',
          'Skipping original context around quoted material.'
        ],
        professionalExamples: [
          'Use court transcripts and filings for factual chronology before citing pundit analysis.',
          'Verify a quoted statistic in the original dataset release.'
        ],
        questionsSpecialistShouldAskItself: [
          'Where is the first-hand record?',
          'Am I citing interpretation when original evidence is available?',
          'Would this claim survive if I remove all secondary commentary?'
        ],
        howThisLessonChangesFutureDecisions: 'Promote primary-source anchors into central claims and demote unsupported secondary summaries.'
      },
      {
        lessonId: 'SQ-MASTER-003',
        lessonTitle: 'Corroboration Increases Confidence',
        professionalPrinciple: 'Confidence rises only when independent sources converge.',
        whyProfessionalsThinkThisWay: 'Independent corroboration limits single-source error and intentional manipulation.',
        commonBeginnerMistakes: [
          'Using repeated citations from one origin as false corroboration.',
          'Confusing source quantity with source independence.',
          'Ignoring corroboration gaps for attractive claims.'
        ],
        professionalExamples: [
          'A claim appears in a news report, then is verified against public records and direct testimony.',
          'Two outlets repeating one press release are treated as one source lineage, not two independent confirmations.'
        ],
        questionsSpecialistShouldAskItself: [
          'How many independent evidence lineages support this claim?',
          'Which corroboration source is least likely to share the same bias?',
          'What evidence would meaningfully strengthen confidence?'
        ],
        howThisLessonChangesFutureDecisions: 'Require multi-lineage corroboration before elevating claims to high-confidence narrative beats.'
      },
      {
        lessonId: 'SQ-MASTER-004',
        lessonTitle: 'Missing Evidence Matters',
        professionalPrinciple: 'Absence of expected evidence is itself an investigative signal.',
        whyProfessionalsThinkThisWay: 'Elite researchers infer risk from what should exist but does not, preventing premature certainty.',
        commonBeginnerMistakes: [
          'Assuming no contradiction means claim is complete.',
          'Ignoring missing documents because current sources are persuasive.',
          'Escalating stories without checking expected records.'
        ],
        professionalExamples: [
          'A major allegation without transactional records is flagged as unresolved, not proven.',
          'Timeline claims are downgraded when no dated documentary anchor can be found.'
        ],
        questionsSpecialistShouldAskItself: [
          'What document or record should exist if this claim is true?',
          'Which missing element most weakens confidence?',
          'Should this be marked as unresolved instead of confirmed?'
        ],
        howThisLessonChangesFutureDecisions: 'Convert missing anchors into explicit research gaps and confidence penalties.'
      },
      {
        lessonId: 'SQ-MASTER-005',
        lessonTitle: 'Contradictory Evidence Must Be Investigated',
        professionalPrinciple: 'Contradictions are investigation prompts, not narrative inconveniences.',
        whyProfessionalsThinkThisWay: 'Unresolved contradictions often expose chronology errors, witness reliability issues, or manipulation.',
        commonBeginnerMistakes: [
          'Discarding contradictory facts to preserve narrative flow.',
          'Treating contradiction as noise rather than a lead.',
          'Failing to explain unresolved conflicts to downstream teams.'
        ],
        professionalExamples: [
          'Competing witness statements are retained and reconciled against time-stamped records.',
          'A disputed claim is moved out of the opening and labeled contested until verified.'
        ],
        questionsSpecialistShouldAskItself: [
          'What exactly conflicts, and which source is stronger by hierarchy?',
          'Can timeline, method, or context explain the contradiction?',
          'What additional evidence would resolve this dispute?'
        ],
        howThisLessonChangesFutureDecisions: 'Force reconciliation steps before high-impact narrative placement of contested facts.'
      },
      {
        lessonId: 'SQ-MASTER-006',
        lessonTitle: 'Confidence Should Be Earned, Not Assumed',
        professionalPrinciple: 'Confidence is a result of verification work, not storytelling appeal.',
        whyProfessionalsThinkThisWay: 'Investigative credibility depends on traceable proof of confidence calibration.',
        commonBeginnerMistakes: [
          'Marking confidence high before corroboration and contradiction checks complete.',
          'Using vague confidence labels without criteria.',
          'Failing to lower confidence when gaps appear.'
        ],
        professionalExamples: [
          'A claim starts low confidence, rises only after primary records and independent confirmation arrive.',
          'Confidence is reduced when conflict-of-interest risk emerges.'
        ],
        questionsSpecialistShouldAskItself: [
          'Which verification steps justify this confidence level?',
          'What would make this confidence drop?',
          'Can I show explicit evidence for my confidence assignment?'
        ],
        howThisLessonChangesFutureDecisions: 'Apply confidence gates and explicit penalties when verification criteria are unmet.'
      },
      {
        lessonId: 'SQ-MASTER-007',
        lessonTitle: 'Interesting Does Not Equal Important',
        professionalPrinciple: 'Select evidence for consequence and explanatory value, not novelty alone.',
        whyProfessionalsThinkThisWay: 'Compelling but low-impact facts can distract from core investigative truth.',
        commonBeginnerMistakes: [
          'Overweighting sensational claims without evidentiary depth.',
          'Prioritizing unusual anecdotes over structurally important facts.',
          'Conflating audience excitement with investigative relevance.'
        ],
        professionalExamples: [
          'A viral anecdote is deprioritized while records-backed systemic evidence is promoted.',
          'A dramatic quote is treated as color unless it changes causal understanding.'
        ],
        questionsSpecialistShouldAskItself: [
          'Does this evidence change the core understanding of what happened?',
          'Is this claim important to the mission objective or just surprising?',
          'Would this still matter if removed from the script?'
        ],
        howThisLessonChangesFutureDecisions: 'Elevate consequential evidence and demote low-impact but sensational facts.'
      },
      {
        lessonId: 'SQ-MASTER-008',
        lessonTitle: 'Evidence Hierarchy Governs Weight',
        professionalPrinciple: 'Evidence weight follows hierarchy: primary > secondary > tertiary.',
        whyProfessionalsThinkThisWay: 'Hierarchy prevents weak-source claims from overpowering stronger contradictory records.',
        commonBeginnerMistakes: [
          'Giving equal weight to all citations.',
          'Allowing tertiary summaries to define final conclusions.',
          'Ignoring source lineage when weighing disagreements.'
        ],
        professionalExamples: [
          'A tertiary digest is used to orient scope, while final claims rely on filings and direct records.',
          'Conflicts are resolved by escalating to the strongest available source class.'
        ],
        questionsSpecialistShouldAskItself: [
          'Which source class supports each key claim?',
          'Am I over-weighting lower-tier material?',
          'If sources conflict, which one wins by evidentiary hierarchy?'
        ],
        howThisLessonChangesFutureDecisions: 'Assign explicit weight by source tier and cap confidence when hierarchy is weak.'
      },
      {
        lessonId: 'SQ-MASTER-009',
        lessonTitle: 'Professional Source Verification Workflow',
        professionalPrinciple: 'Follow a repeatable verification workflow before evidence enters core narrative.',
        whyProfessionalsThinkThisWay: 'Workflow discipline creates consistency, auditability, and better downstream handoff quality.',
        commonBeginnerMistakes: [
          'Skipping verification steps under time pressure.',
          'Failing to document rejection rationale.',
          'Passing unresolved contradictions downstream without flags.'
        ],
        professionalExamples: [
          'Researchers classify source type, map agenda risk, corroborate claims, resolve conflicts, then assign confidence.',
          'Rejected sources are logged with evidence-based reasons for auditability.'
        ],
        questionsSpecialistShouldAskItself: [
          'Have I executed each verification step in order?',
          'What decision logs will help Storytelling trust this package?',
          'What unresolved risk must be explicitly disclosed?'
        ],
        howThisLessonChangesFutureDecisions: 'Enforce a documented verification sequence and prevent unverified claims from entering core narrative.'
      }
    ];
  }

  buildProfessionalSourceVerificationWorkflow() {
    return {
      workflowName: 'Professional Documentary Source Verification Workflow',
      steps: [
        {
          stepId: 'VERIFY-001',
          action: 'Classify source type and evidence hierarchy position.',
          expectedDecisionImpact: 'Determines initial evidentiary weight and reliability ceiling.'
        },
        {
          stepId: 'VERIFY-002',
          action: 'Assess agenda, bias, and conflict-of-interest risk.',
          expectedDecisionImpact: 'Adjusts trust calibration and guards against narrative capture.'
        },
        {
          stepId: 'VERIFY-003',
          action: 'Corroborate claims across independent source lineages.',
          expectedDecisionImpact: 'Raises confidence only when independent convergence exists.'
        },
        {
          stepId: 'VERIFY-004',
          action: 'Identify missing expected evidence and contradictory evidence.',
          expectedDecisionImpact: 'Prevents premature certainty and drives unresolved-risk tracking.'
        },
        {
          stepId: 'VERIFY-005',
          action: 'Apply rejection criteria and confidence assignment gates.',
          expectedDecisionImpact: 'Ensures confidence is earned through verifiable standards.'
        },
        {
          stepId: 'VERIFY-006',
          action: 'Document rationale for accepted, rejected, and contested evidence.',
          expectedDecisionImpact: 'Improves downstream trust, explainability, and revision efficiency.'
        }
      ]
    };
  }

  buildAppliedProfessionalReasoning({
    sourceProfiles,
    findings,
    sourceHierarchy,
    corroboration,
    missingEvidence,
    contradictoryEvidence,
    confidenceAssignment,
    professionalSourceVerificationWorkflow
  }) {
    const primaryCount = sourceProfiles.filter(profile => profile.type === 'PRIMARY').length;
    const tertiaryCount = sourceProfiles.filter(profile => profile.type === 'TERTIARY').length;

    const activatedLessons = [];
    const decisionAdjustments = [];

    activatedLessons.push({
      lessonId: 'SQ-MASTER-001',
      activationReason: 'All sources were screened for agenda, bias, and conflict signals before weighting.'
    });

    if (primaryCount === 0) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-002',
        activationReason: 'No primary evidence anchor detected for core claims.'
      });
      decisionAdjustments.push('Downgrade confidence until primary evidence is collected for high-impact claims.');
    }

    if (corroboration.score < 7) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-003',
        activationReason: 'Independent corroboration depth is below professional threshold.'
      });
      decisionAdjustments.push('Require additional independent corroboration before elevating central narrative claims.');
    }

    if (missingEvidence.missingItems.length > 0) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-004',
        activationReason: `${missingEvidence.missingItems.length} missing evidence gap(s) detected.`
      });
      decisionAdjustments.push('Track missing evidence explicitly and avoid promoting unresolved claims to headline status.');
    }

    if (contradictoryEvidence.contradictionSignals > 0) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-005',
        activationReason: `${contradictoryEvidence.contradictionSignals} contradiction signal(s) require reconciliation.`
      });
      decisionAdjustments.push('Retain contradictory evidence in the package and assign follow-up verification tasks.');
    }

    if (confidenceAssignment.score < 7.5) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-006',
        activationReason: 'Confidence remained below elite standard after quality gates.'
      });
      decisionAdjustments.push('Use explicit caveats and hold high-confidence labels until confidence gates are satisfied.');
    }

    if (tertiaryCount > primaryCount) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-007',
        activationReason: 'Source mix risks overweighting interesting but lower-importance tertiary material.'
      });
      decisionAdjustments.push('Prioritize consequential evidence over sensational but weakly anchored claims.');
    }

    if (sourceHierarchy.score < 7) {
      activatedLessons.push({
        lessonId: 'SQ-MASTER-008',
        activationReason: 'Evidence hierarchy is not strong enough for elite documentary confidence.'
      });
      decisionAdjustments.push('Re-weight claims based on hierarchy and cap narrative certainty where tier quality is weak.');
    }

    activatedLessons.push({
      lessonId: 'SQ-MASTER-009',
      activationReason: `Verification workflow executed in ${professionalSourceVerificationWorkflow.steps.length} documented step(s).`
    });

    if (decisionAdjustments.length === 0) {
      decisionAdjustments.push('Maintain current professional verification discipline and continue monitoring for new contradictions.');
    }

    return {
      activatedLessons,
      decisionAdjustments,
      findingCount: findings.length,
      providerCount: sourceProfiles.length
    };
  }

  scoreAuthoritySignal(text) {
    let score = 3;
    if (this.containsAny(text, ['government', 'court', 'archive', 'official', 'peer-reviewed', 'journal'])) score += 3;
    if (this.containsAny(text, ['expert', 'investigation', 'research institute', 'university'])) score += 2;
    if (this.containsAny(text, ['blog', 'anonymous', 'opinion only'])) score -= 2;
    return this.clamp(score);
  }

  scoreBiasSignal(text) {
    return this.countMatches(text, ['partisan', 'advocacy', 'propaganda', 'opinion', 'sponsored', 'sensational']);
  }

  scoreConflictSignal(text) {
    return this.countMatches(text, ['funded by', 'affiliate', 'paid', 'financial interest', 'stakeholder']);
  }

  extractRecencySignal(text) {
    const years = this.extractYears(text);
    return years.length > 0 ? Math.max(...years) : null;
  }

  extractYears(text) {
    return (String(text ?? '').match(/\b(19\d{2}|20\d{2})\b/g) ?? [])
      .map(value => Number.parseInt(value, 10))
      .filter(value => Number.isFinite(value));
  }

  containsAny(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.some(token => normalized.includes(token));
  }

  countMatches(text, tokens) {
    const normalized = String(text ?? '').toLowerCase();
    return tokens.reduce((count, token) => count + (normalized.includes(token) ? 1 : 0), 0);
  }

  clamp(value) {
    return Math.max(0, Math.min(10, Math.round(value)));
  }

  boundScore(value) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(10, Math.round(numeric * 10) / 10));
  }
}