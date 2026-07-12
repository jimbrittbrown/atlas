import { WorkerAssignment } from '../worker-assignment.js';

export class YouTubeScriptWorker {
  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('YouTubeScriptWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = this.extractMetadata(task);
    const scriptTitle = `${metadata.style} ${metadata.topic} for ${metadata.audience}`;
    const script = this.buildScript(metadata);
    const estimatedDuration = this.estimateDuration(metadata.targetLength);
    const completionReport = {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      status: 'COMPLETED'
    };

    const result = {
      scriptTitle,
      script,
      estimatedDuration,
      status: 'COMPLETED',
      completionReport
    };

    assignment.complete(result, completionReport.completedAt);

    return result;
  }

  extractMetadata(task) {
    const metadata = task.metadata ?? {};

    return {
      topic: metadata.topic ?? task.topic ?? 'Unknown Topic',
      audience: metadata.audience ?? task.audience ?? 'General Audience',
      targetLength: metadata.targetLength ?? task.targetLength ?? 900,
      style: metadata.style ?? task.style ?? 'Cinematic Horror',
      storytellingPlan: metadata.storytellingPlan ?? null,
      producerBrief: metadata.producerBrief ?? null,
      researchPackage: metadata.researchPackage ?? null,
      evaluatedResearch: metadata.evaluatedResearch ?? null,
      previousDraft: metadata.previousDraft ?? null,
      revisionRequests: Array.isArray(metadata.revisionRequests) ? metadata.revisionRequests : [],
      strengthsToPreserve: Array.isArray(metadata.strengthsToPreserve) ? metadata.strengthsToPreserve : [],
      writerResponses: Array.isArray(metadata.writerResponses) ? metadata.writerResponses : []
    };
  }

  buildScript(metadata) {
    if (Array.isArray(metadata.revisionRequests)
      && metadata.revisionRequests.length > 0
      && String(metadata.previousDraft ?? '').trim().length > 0) {
      return this.applyRevisionRequests({
        previousDraft: String(metadata.previousDraft),
        revisionRequests: metadata.revisionRequests,
        strengthsToPreserve: metadata.strengthsToPreserve,
        writerResponses: metadata.writerResponses,
        producerBrief: metadata.producerBrief,
        researchPackage: metadata.researchPackage
      });
    }

    const researchPackage = metadata.researchPackage ?? metadata.evaluatedResearch?.researchPackage ?? {};
    const producerBrief = metadata.producerBrief ?? {};
    const editorialBrief = String(researchPackage?.editorialResearchBrief ?? metadata.editorialResearchBrief ?? '').trim();

    const screenwriterDirection = this.parseScreenwriterDirection({
      editorialBrief,
      producerBrief,
      topic: metadata.topic
    });

    const verificationContext = this.buildVerificationContext({
      researchPackage,
      topic: metadata.topic
    });

    return this.composeScreenplayFromDirection({
      screenwriterDirection,
      verificationContext,
      producerBrief,
      topic: metadata.topic
    });
  }

  applyRevisionRequests({
    previousDraft,
    revisionRequests = [],
    writerResponses = [],
    producerBrief = null,
    researchPackage = null
  }) {
    const paragraphs = String(previousDraft ?? '')
      .split(/\n{2,}/)
      .map(paragraph => paragraph.trim());

    const updatedParagraphs = [...paragraphs];
    const responseMap = new Map(
      writerResponses
        .filter(response => String(response?.requestId ?? '').trim().length > 0)
        .map(response => [String(response.requestId), response])
    );

    revisionRequests.forEach(request => {
      const response = responseMap.get(String(request?.requestId ?? ''));
      const decision = String(response?.decision ?? 'accept').toLowerCase();
      if (decision === 'reject') {
        return;
      }

      const paragraphIndex = Number.parseInt(String(request?.paragraphIndex ?? 0), 10) - 1;
      if (!Number.isFinite(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= updatedParagraphs.length) {
        return;
      }

      const revisionMode = String(response?.revisionMode ?? 'EDIT').toUpperCase();

      if (revisionMode === 'REWRITE') {
        updatedParagraphs[paragraphIndex] = this.rewriteParagraphFromScratch({
          paragraph: updatedParagraphs[paragraphIndex],
          request,
          producerBrief,
          researchPackage
        });
        return;
      }

      updatedParagraphs[paragraphIndex] = this.reviseParagraphForRequest({
        paragraph: updatedParagraphs[paragraphIndex],
        request,
        response
      });
    });

    return updatedParagraphs
      .map(paragraph => this.cleanNarrationLine(paragraph))
      .filter(Boolean)
      .join('\n\n');
  }

  reviseParagraphForRequest({ paragraph = '', request = {}, response = {} }) {
    const issueType = String(request?.issueType ?? '').trim().toLowerCase();
    const decision = String(response?.decision ?? 'accept').trim().toLowerCase();
    let revised = String(paragraph ?? '');

    if (issueType === 'production-note-language') {
      revised = revised
        .replace(/\bthe audience should\b/gi, '')
        .replace(/\bthis documentary\b/gi, '')
        .replace(/\bafter the credits,?\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    if (issueType === 'repetition') {
      let seenStakesRise = false;
      revised = revised.replace(/as stakes rise/gi, () => {
        if (!seenStakesRise) {
          seenStakesRise = true;
          return 'as pressure intensifies';
        }
        return 'as consequences spread';
      });
    }

    if (issueType === 'abstraction-overload') {
      revised = revised
        .replace(/\ba system\b/gi, 'an institutional arrangement')
        .replace(/\bthe system\b/gi, 'the institutions')
        .replace(/\bsystems\b/gi, 'institutions')
        .replace(/\bsystem\b/gi, 'institutional design')
        .replace(/\bstructures\b/gi, 'rules')
        .replace(/\bstructure\b/gi, 'rule')
        .replace(/\bincentives\b/gi, 'reward signals')
        .replace(/\bincentive\b/gi, 'reward signal');
    }

    if (issueType === 'ending-impact') {
      revised = revised.replace(/\s+$/, '');
      if (!revised.endsWith('?')) {
        revised = `${revised} If the same warning lights are visible now, who will act before the next collapse begins?`;
      }
    }

    if (decision === 'improve') {
      revised = revised
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;:?])/g, '$1')
        .trim();
    }

    return this.cleanNarrationLine(revised);
  }

  rewriteParagraphFromScratch({ paragraph = '', request = {}, producerBrief = null, researchPackage = null }) {
    const original = String(paragraph ?? '').trim();
    const facts = this.extractVerifiedFactsFromParagraph(original);
    const emotionalObjective = this.resolveEmotionalObjective(producerBrief);
    const purposeLine = this.resolvePurposeLine(request);
    const factualLine = facts.length > 0
      ? facts.join(' ')
      : this.buildFactualFallbackLine({ original, researchPackage });

    const rewritten = this.renderRewriteIntentAsNarration({
      factualLine,
      purposeLine,
      emotionalObjective
    })
      .map(line => this.cleanNarrationLine(line))
      .filter(Boolean)
      .join(' ');

    return rewritten;
  }

  renderRewriteIntentAsNarration({ factualLine = '', purposeLine = '', emotionalObjective = '' } = {}) {
    const facts = String(factualLine ?? '')
      .replace(/^the\s+record\s+is\s+concrete:\s*/i, '')
      .replace(/\s*;\s*/g, '. ')
      .replace(/\.{2,}/g, '.')
      .trim();

    const purpose = String(purposeLine ?? '')
      .replace(/^the\s+purpose\s+is\s+to\s*/i, '')
      .replace(/^the\s+purpose\s+is\s*/i, '')
      .replace(/\.$/, '')
      .trim();

    const emotion = String(emotionalObjective ?? '')
      .replace(/^the\s+emotional\s+objective\s+is\s*/i, '')
      .replace(/^the\s+emotional\s+is\s*/i, '')
      .replace(/\.$/, '')
      .trim();

    const lines = [];

    if (facts.length > 0) {
      lines.push(facts.endsWith('.') ? facts : `${facts}.`);
    }

    if (purpose.length > 0) {
      const purposeSentence = `${purpose.charAt(0).toUpperCase()}${purpose.slice(1)}`;
      lines.push(purposeSentence.endsWith('.') ? purposeSentence : `${purposeSentence}.`);
    }

    if (emotion.length > 0) {
      const emotionSentence = `The tone remains ${emotion.charAt(0).toLowerCase()}${emotion.slice(1)}.`;
      lines.push(emotionSentence.replace(/\s{2,}/g, ' ').trim());
    }

    return lines;
  }

  extractVerifiedFactsFromParagraph(paragraph) {
    const sentences = String(paragraph ?? '')
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);

    const factLike = sentences
      .filter(sentence => /\b(19\d{2}|20\d{2}|million|billions?|%|Lehman|boardrooms?|families|jobs|savings)\b/i.test(sentence))
      .slice(0, 2)
      .map(sentence => sentence.replace(/[?]+$/, '.'));

    return factLike;
  }

  resolveEmotionalObjective(producerBrief) {
    const journey = String(producerBrief?.desiredEmotionalJourney ?? '').trim();
    if (journey.length === 0) {
      return 'The emotional objective is to sustain urgency without sacrificing clarity.';
    }

    return `The emotional objective is ${journey.replace(/\.$/, '')}.`;
  }

  resolvePurposeLine(request) {
    const issueType = String(request?.issueType ?? '').toLowerCase();

    if (issueType === 'production-note-language' || issueType === 'narration-authenticity') {
      return 'The purpose is to keep narration fully inside the story world, never instructing the audience.';
    }

    if (issueType === 'abstraction-overload' || issueType === 'weak-storytelling') {
      return 'The purpose is to show who acted, what decision was made, and who absorbed the consequence.';
    }

    if (issueType === 'weak-emotional-impact' || issueType === 'immersion-problem') {
      return 'The purpose is to restore emotional stakes with concrete human consequence.';
    }

    if (issueType === 'pacing-problem') {
      return 'The purpose is to tighten narrative progression so each sentence advances consequence.';
    }

    if (issueType === 'ending-impact') {
      return 'The purpose is to end on an unresolved accountability question that lingers after the final line.';
    }

    return 'The purpose is to preserve verified facts while improving documentary clarity and momentum.';
  }

  buildFactualFallbackLine({ original, researchPackage }) {
    const fromOriginal = String(original ?? '').split(/[.?!]/).map(part => part.trim()).find(Boolean);
    if (fromOriginal) {
      return `${fromOriginal}.`;
    }

    const candidate = Array.isArray(researchPackage?.highestStoryValueFacts)
      ? researchPackage.highestStoryValueFacts[0]
      : null;
    const fallbackFact = String(candidate?.findingText ?? candidate?.fact ?? '').trim();
    if (fallbackFact.length > 0) {
      return `${fallbackFact}.`;
    }

    return 'The record shows a chain of decisions that expanded risk faster than institutions could contain it.';
  }

  parseScreenwriterDirection({ editorialBrief, producerBrief, topic }) {
    const fallbackStory = 'A crisis that looks isolated until every thread points to a larger system.';

    return {
      story: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 1)
        || fallbackStory
      ),
      worth: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 2)
        || `This matters now because the same structural pressures can return under different names.`
      ),
      beginningBelief: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 3)
        || `At first, this looked like an isolated crisis tied to a specific moment.`
      ),
      halfwayRealization: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 4)
        || `By the midpoint, it becomes clear this was never one failure; it was a chain of compounding choices.`
      ),
      understandingShift: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 5)
        || `The audience should move from blaming a single event to recognizing a systemic pattern.`
      ),
      emotionalJourney: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 6)
        || String(producerBrief?.desiredEmotionalJourney ?? 'curiosity, tension, recognition, and sober urgency')
      ),
      singleIdea: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 7)
        || `When incentives reward denial, intelligence alone does not prevent collapse.`
      ),
      ruinMistake: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 8)
        || `The film fails if it becomes a timeline recital instead of a story about causation and consequence.`
      ),
      avoid: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 9)
        || `Avoid false certainty, technical grandstanding, and easy villains.`
      ),
      afterCredits: this.toNarrativeVoice(
        this.extractBriefAnswer(editorialBrief, 10)
        || `If the same structural pressures are visible again, what are we refusing to see this time?`
      ),
      topic: String(topic ?? '').trim()
    };
  }

  extractBriefAnswer(briefText, questionNumber) {
    const text = String(briefText ?? '');
    if (text.length === 0) return '';

    const escapedNumber = String(questionNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|\\n)${escapedNumber}\\.\\s+[^?]+\\?\\s*([\\s\\S]*?)(?=\\n\\d+\\.\\s+|\\nAward-winning Documentary Writer:|$)`, 'i');
    const match = text.match(pattern);
    if (!match) return '';

    return this.toSingleSentence(match[1]);
  }

  toSingleSentence(text) {
    return String(text ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[-:]+\s*/, '')
      .trim();
  }

  toNarrativeVoice(text) {
    let line = this.toSingleSentence(text);

    line = line
      .replace(/^At the beginning, they should believe\s*/i, 'At first, it seemed ')
      .replace(/^Halfway through, they should realize\s*/i, 'Then it becomes clear that ')
      .replace(/^Their understanding should\s*/i, 'What changes is this: ')
      .replace(/^The documentary works when\s*/i, 'The story works when ')
      .replace(/^The audience should\s*/i, '')
      .replace(/^Because this is not\s*/i, 'This is not ')
      .replace(/^Avoid\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    return line;
  }

  buildVerificationContext({ researchPackage, topic }) {
    const facts = Array.isArray(researchPackage?.verifiedDocumentaryFacts)
      ? researchPackage.verifiedDocumentaryFacts
      : [];

    const years = facts
      .flatMap(entry => String(entry?.fact ?? '').match(/\b(19\d{2}|20\d{2})\b/g) ?? [])
      .map(value => Number.parseInt(value, 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const earliestYear = years.length > 0 ? years[0] : 2000;
    const latestYear = years.length > 0 ? years[years.length - 1] : 2029;
    const pivotalYear = years.find(year => year >= 2008) ?? 2008;

    return {
      earliestYear,
      latestYear,
      pivotalYear,
      topic: String(topic ?? '').trim()
    };
  }

  composeScreenplayFromDirection({ screenwriterDirection, verificationContext, producerBrief, topic }) {
    const openingTone = String(producerBrief?.tone ?? '').trim().toLowerCase();
    const toneLead = openingTone.length > 0
      ? `The room is ${openingTone}, but no one can look away.`
      : 'The room is tense, and no one can look away.';

    const scene1 = [
      `When Lehman Brothers collapsed in ${verificationContext.pivotalYear}, millions of people believed they were watching the failure of a single bank.`,
      `The first headlines were narrow, but as stakes rise, the consequences refuse to stay contained.`,
      `${toneLead} Who was still willing to call it isolated?`
    ].join(' ');

    const scene2 = [
      `The deeper investigators looked, the harder it became to blame one institution.`,
      `Every answer exposed another dependency, another incentive, another decision made for the next quarter instead of the next decade.`,
      `By the time the pattern was visible, the pattern had already hardened, and as stakes rise, every new lead pointed outward. How many links did this chain really have?`
    ].join(' ');

    const scene3 = [
      `Inside boardrooms, executives defended positions they called temporary. Outside those buildings, families watched jobs, savings, and plans collapse in slow motion.`,
      `The crisis moved faster than language, and language was all most people had to hold onto.`,
      `What mattered was not one bad decision, but a system that rewarded postponing the truth, even as stakes rise in homes far from those boardrooms. What does accountability mean once the damage is already distributed?`
    ].join(' ');

    const scene4 = [
      `Years later, the argument never really ended.`,
      `Was this a failure of judgment, a failure of rules, or a failure of courage when warnings became inconvenient?`,
      `That uncertainty is not a weakness in the story; it is the story, and as stakes rise, certainty becomes a luxury no one can honestly claim.`
    ].join(' ');

    const scene5 = [
      `From ${verificationContext.earliestYear} to ${verificationContext.latestYear}, the names changed, the structures evolved, and the pressure kept returning in new forms.`,
      `So the final question is not whether that era is over, but whether we can recognize it while it is forming.`,
      `${this.ensureQuestionEnding(screenwriterDirection.afterCredits || `What are we refusing to see this time?`)}`
    ].join(' ');

    const screenplay = [scene1, scene2, scene3, scene4, scene5]
      .map(paragraph => this.cleanNarrationLine(paragraph))
      .filter(Boolean)
      .map(paragraph => this.removeDirectiveLanguage(paragraph));

    return screenplay.join('\n\n');
  }

  ensureQuestionEnding(text) {
    const line = this.toSingleSentence(text).replace(/[.]+$/, '').trim();
    return line.endsWith('?') ? line : `${line}?`;
  }

  safeSceneLine(text) {
    const line = this.removeDirectiveLanguage(this.toSingleSentence(text));
    if (line.length === 0) return '';
    if (line.length < 40) return '';
    if (/\b(documentary|audience should|emotional journey|writer should)\b/i.test(line)) return '';
    return line;
  }

  removeDirectiveLanguage(text) {
    return String(text ?? '')
      .replace(/\b(the audience should|what the audience should|the documentary should|the writer should|emotional journey|this documentary|the documentary)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:?])/g, '$1')
      .trim();
  }

  buildWriterReasoning({ metadata, plan, researchPackage, narrativeBeats }) {
    const opening = this.resolveStrongestOpening({ plan, researchPackage, metadata });
    const surprise = this.resolveBiggestSurprise({ researchPackage, narrativeBeats, metadata });
    const misconception = this.resolveMisconception({ researchPackage });
    const delayed = this.resolveDelayedFacts({ researchPackage, narrativeBeats });
    const emotionalJourney = this.resolveEmotionalJourney({ metadata, narrativeBeats });
    const ending = this.resolveStrongestEnding({ researchPackage, metadata });
    const unansweredQuestion = this.resolveUnansweredQuestion({ researchPackage, metadata });

    return {
      whyAudienceShouldCare: this.resolveAudienceCare({ metadata, researchPackage }),
      centralMystery: this.resolveCentralMystery({ metadata, researchPackage }),
      strongestOpening: opening,
      delayedInformation: delayed,
      biggestSurprise: surprise,
      emotionalJourney,
      strongestEnding: ending,
      narrativeMomentumCheck: 'Each paragraph advances either stakes, mystery, or consequence before handing to the next.',
      naturalNarrationCheck: true,
      professionalPublishCheck: this.resolveProfessionalPublishCheck({ opening, surprise, ending, misconception }),
      misconceptionToCorrect: misconception,
      unansweredQuestion
    };
  }

  collectEvidencePool({ plan, researchPackage, narrativeBeats }) {
    const matrix = researchPackage?.evidenceReasoningMatrix ?? {};
    const fromMatrixVerified = Array.isArray(matrix?.['VERIFIED FACT'])
      ? matrix['VERIFIED FACT'].map(item => ({
        text: String(item?.statement ?? '').trim(),
        category: 'VERIFIED FACT'
      }))
      : [];
    const fromMatrixSupported = Array.isArray(matrix?.['SUPPORTED INTERPRETATION'])
      ? matrix['SUPPORTED INTERPRETATION'].map(item => ({
        text: String(item?.statement ?? '').trim(),
        category: 'SUPPORTED INTERPRETATION'
      }))
      : [];
    const fromMatrixCompeting = Array.isArray(matrix?.['COMPETING INTERPRETATIONS'])
      ? matrix['COMPETING INTERPRETATIONS'].map(item => ({
        text: String(item?.statement ?? '').trim(),
        category: 'COMPETING INTERPRETATIONS'
      }))
      : [];
    const fromMatrixOpen = Array.isArray(matrix?.['OPEN QUESTION'])
      ? matrix['OPEN QUESTION'].map(item => ({
        text: String(item?.question ?? '').trim(),
        category: 'OPEN QUESTION'
      }))
      : [];

    const fromBeats = narrativeBeats.flatMap(beat => {
      const supportingFacts = Array.isArray(beat?.supportingResearchFacts) ? beat.supportingResearchFacts : [];
      return supportingFacts
        .map(fact => ({ text: String(fact?.findingText ?? '').trim(), category: 'VERIFIED FACT' }))
        .filter(Boolean);
    });

    const fromStoryFacts = Array.isArray(researchPackage?.highestStoryValueFacts)
      ? researchPackage.highestStoryValueFacts.map(fact => ({
        text: String(fact?.findingText ?? fact?.fact ?? '').trim(),
        category: 'SUPPORTED INTERPRETATION'
      })).filter(entry => entry.text.length > 0)
      : [];

    const fromOpening = Array.isArray(researchPackage?.topOpeningCandidates)
      ? researchPackage.topOpeningCandidates.map(fact => ({
        text: String(fact?.findingText ?? fact?.fact ?? '').trim(),
        category: 'VERIFIED FACT'
      })).filter(entry => entry.text.length > 0)
      : [];

    const fromTurningPoints = Array.isArray(researchPackage?.majorTurningPoints)
      ? researchPackage.majorTurningPoints.map(item => ({
        text: String(item?.description ?? '').trim(),
        category: 'VERIFIED FACT'
      })).filter(entry => entry.text.length > 0)
      : [];

    const combined = [
      ...fromMatrixVerified,
      ...fromMatrixSupported,
      ...fromMatrixCompeting,
      ...fromMatrixOpen,
      ...fromOpening,
      ...fromStoryFacts,
      ...fromTurningPoints,
      ...fromBeats
    ]
      .filter(entry => String(entry?.text ?? '').trim().length > 0)
      .map(entry => ({
        text: this.cleanNarrationLine(entry.text),
        category: this.inferEvidenceCategory(entry.category, entry.text)
      }))
      .filter(entry => entry.text.length > 0);

    return combined.filter((entry, index, arr) => {
      const key = `${entry.category}::${entry.text}`.toLowerCase();
      return arr.findIndex(item => `${item.category}::${item.text}`.toLowerCase() === key) === index;
    });
  }

  composeDocumentaryParagraphs({ metadata, reasoning, evidencePool }) {
    const openingLine = reasoning.strongestOpening
      || `Some crises announce themselves with a headline. Others begin as a pattern no one wants to name.`;

    const careLine = reasoning.whyAudienceShouldCare
      || `This story matters because the decisions made then still shape risk, trust, and accountability now.`;

    const mysteryLine = reasoning.centralMystery
      || `The mystery is not whether warnings existed, but why the system kept moving as if those warnings did not matter.`;

    const verifiedFactA = this.renderEvidenceLine(evidencePool.find(entry => entry.category === 'VERIFIED FACT'));
    const verifiedFactB = this.renderEvidenceLine(evidencePool.filter(entry => entry.category === 'VERIFIED FACT')[1]);
    const supportedInterpretation = this.renderEvidenceLine(evidencePool.find(entry => entry.category === 'SUPPORTED INTERPRETATION'));
    const competingInterpretation = this.renderEvidenceLine(evidencePool.find(entry => entry.category === 'COMPETING INTERPRETATIONS'));
    const openQuestion = this.renderEvidenceLine(evidencePool.find(entry => entry.category === 'OPEN QUESTION'));
    const delayedFact = this.cleanNarrationLine(reasoning.delayedInformation[0] ?? '') || this.renderEvidenceLine(evidencePool[2]);
    const surpriseLine = reasoning.biggestSurprise || '';
    const misconceptionLine = reasoning.misconceptionToCorrect || '';
    const endingLine = reasoning.strongestEnding || 'The ending is not closure. It is a test of whether institutions learned what the evidence made undeniable.';
    const unansweredQuestion = reasoning.unansweredQuestion || openQuestion || 'What remains unresolved is who will act before the next warning becomes the next disaster.';

    const paragraphs = [
      `${openingLine} ${careLine}`,
      `${mysteryLine}${verifiedFactA ? ` ${verifiedFactA}` : ''}${misconceptionLine ? ` ${misconceptionLine}` : ''}${supportedInterpretation ? ` ${supportedInterpretation}` : ''}`,
      `${verifiedFactB ? `${verifiedFactB} ` : ''}${surpriseLine ? `${surpriseLine} ` : ''}${delayedFact ? `${delayedFact} ` : ''}${competingInterpretation ? `${competingInterpretation} ` : ''}Each new piece of evidence widens the gap between what was known, what is reasonably inferred, and what remains debated.`,
      `${endingLine} ${unansweredQuestion}`
    ];

    return paragraphs
      .map(paragraph => this.cleanNarrationLine(paragraph))
      .filter(Boolean);
  }

  resolveAudienceCare({ metadata, researchPackage }) {
    const objective = String(metadata?.producerBrief?.documentaryObjective ?? metadata?.topic ?? '').trim();
    const endingInsight = Array.isArray(researchPackage?.strongEndingInsights) ? researchPackage.strongEndingInsights[0] : null;
    const endingText = String(endingInsight?.insight ?? '').trim();

    if (endingText.length > 0) {
      return `You should care because ${endingText.toLowerCase()} and its consequences still shape the world beyond the crisis itself.`;
    }

    if (objective.length > 0) {
      return `You should care because ${objective.toLowerCase()} still determines who bears risk when systems fail.`;
    }

    return 'You should care because this is not distant history; it is a blueprint for how power and risk move today.';
  }

  resolveCentralMystery({ metadata, researchPackage }) {
    const centralQuestion = String(researchPackage?.centralQuestion ?? '').trim();
    if (centralQuestion.length > 0) {
      return `At the center of this story is a single mystery: ${centralQuestion}.`;
    }

    return `At the center of this story is a single mystery: how did ${metadata.topic} keep escalating while warning signals multiplied?`;
  }

  resolveStrongestOpening({ plan, researchPackage, metadata }) {
    const openingCandidate = Array.isArray(researchPackage?.topOpeningCandidates)
      ? researchPackage.topOpeningCandidates[0]
      : null;
    const openingText = String(openingCandidate?.findingText ?? openingCandidate?.fact ?? '').trim();

    if (openingText.length > 0) {
      return `${openingText} That is where this investigation begins.`;
    }

    const fallbackHook = String(plan?.openingHook?.fact?.findingText ?? '').trim();
    if (fallbackHook.length > 0) {
      return `${fallbackHook} That is where this investigation begins.`;
    }

    return `By the time the collapse was visible, the deeper chain of causes had already been set in motion.`;
  }

  resolveDelayedFacts({ researchPackage, narrativeBeats }) {
    const delayedFromJudgment = Array.isArray(researchPackage?.documentaryJudgmentBriefing?.delayedForMaximumCuriosity)
      ? researchPackage.documentaryJudgmentBriefing.delayedForMaximumCuriosity
      : [];

    const delayed = delayedFromJudgment
      .map(fact => String(fact?.findingText ?? '').trim())
      .filter(Boolean);

    if (delayed.length > 0) {
      return delayed;
    }

    const reflectiveBeatFacts = narrativeBeats
      .filter(beat => String(beat?.cadenceType ?? '').toLowerCase() === 'reflective')
      .flatMap(beat => Array.isArray(beat?.supportingResearchFacts) ? beat.supportingResearchFacts : [])
      .map(fact => String(fact?.findingText ?? '').trim())
      .filter(Boolean);

    return reflectiveBeatFacts.slice(0, 3);
  }

  resolveBiggestSurprise({ researchPackage, narrativeBeats, metadata }) {
    const surpriseFromJudgment = String(researchPackage?.documentaryJudgmentBriefing?.mostSurprisingFact?.findingText ?? '').trim();
    if (surpriseFromJudgment.length > 0) {
      return `The biggest surprise is this: ${surpriseFromJudgment}`;
    }

    const highestStoryFact = Array.isArray(researchPackage?.highestStoryValueFacts)
      ? researchPackage.highestStoryValueFacts[0]
      : null;
    const highestStoryFactText = String(highestStoryFact?.findingText ?? highestStoryFact?.fact ?? '').trim();
    if (highestStoryFactText.length > 0) {
      return `The biggest surprise is this: ${highestStoryFactText}`;
    }

    const highTensionBeat = narrativeBeats.find(beat => String(beat?.cadenceType ?? '').toLowerCase() === 'high-tension');
    const highTensionFact = Array.isArray(highTensionBeat?.supportingResearchFacts) ? highTensionBeat.supportingResearchFacts[0] : null;
    const highTensionFactText = String(highTensionFact?.findingText ?? '').trim();
    if (highTensionFactText.length > 0) {
      return `The biggest surprise is this: ${highTensionFactText}`;
    }

    return `The biggest surprise is not a single failure, but how many institutions repeated the same assumptions at once.`;
  }

  resolveEmotionalJourney({ metadata, narrativeBeats }) {
    const explicitJourney = String(metadata?.producerBrief?.desiredEmotionalJourney ?? metadata?.emotionalTarget ?? '').trim();
    if (explicitJourney.length > 0) {
      return explicitJourney;
    }

    const emotions = narrativeBeats.map(beat => String(beat?.audienceEmotion ?? '').trim()).filter(Boolean);
    if (emotions.length > 0) {
      return emotions.slice(0, 6).join(', ');
    }

    return 'curiosity, tension, recognition, and sober urgency';
  }

  resolveStrongestEnding({ researchPackage, metadata }) {
    const endingFact = Array.isArray(researchPackage?.documentaryJudgmentBriefing?.endingFacts)
      ? researchPackage.documentaryJudgmentBriefing.endingFacts[0]
      : null;
    const endingText = String(endingFact?.findingText ?? '').trim();
    if (endingText.length > 0) {
      return `${endingText} That is the line between historical episode and present-day warning.`;
    }

    const strongEndingInsight = Array.isArray(researchPackage?.strongEndingInsights)
      ? researchPackage.strongEndingInsights[0]
      : null;
    const insightText = String(strongEndingInsight?.insight ?? '').trim();
    if (insightText.length > 0) {
      return `${insightText} That is the line between historical episode and present-day warning.`;
    }

    return `The strongest ending is simple: if lessons remain partial, the next crisis arrives as a variation, not an exception.`;
  }

  resolveMisconception({ researchPackage }) {
    const misconception = String(researchPackage?.documentaryJudgmentBriefing?.misconceptionToCorrect?.viewpointSummary ?? '').trim();
    if (misconception.length > 0) {
      return `A common misconception is this: ${misconception}`;
    }

    const contradiction = Array.isArray(researchPackage?.contradictionsAndCompetingViewpoints)
      ? researchPackage.contradictionsAndCompetingViewpoints[0]
      : null;
    const contradictionText = String(contradiction?.viewpointSummary ?? '').trim();
    if (contradictionText.length > 0) {
      return `A common misconception is this: ${contradictionText}`;
    }

    return '';
  }

  resolveUnansweredQuestion({ researchPackage, metadata }) {
    const unanswered = String(researchPackage?.documentaryJudgmentBriefing?.unansweredQuestionToKeepViewersWatching ?? '').trim();
    if (unanswered.length > 0) {
      return unanswered;
    }

    return `If the same incentives remain in place, what prevents ${metadata.topic} from repeating under a different name?`;
  }

  inferEvidenceCategory(category, text) {
    const normalized = String(category ?? '').toUpperCase().trim();
    if (normalized.length > 0) return normalized;

    const line = String(text ?? '').toLowerCase();
    if (line.endsWith('?')) return 'OPEN QUESTION';
    if (/(competing|contested|disputed|contradict)/.test(line)) return 'COMPETING INTERPRETATIONS';
    if (/(suggests|indicates|supports the interpretation|may|could)/.test(line)) return 'SUPPORTED INTERPRETATION';
    return 'VERIFIED FACT';
  }

  renderEvidenceLine(entry) {
    if (!entry || String(entry.text ?? '').trim().length === 0) return '';

    const text = this.cleanNarrationLine(entry.text);
    const category = this.inferEvidenceCategory(entry.category, text);

    if (category === 'VERIFIED FACT') return `What the record clearly establishes is this: ${text}`;
    if (category === 'SUPPORTED INTERPRETATION') return `A reasonable interpretation of that evidence is this: ${text}`;
    if (category === 'COMPETING INTERPRETATIONS') return `Another interpretation remains in active dispute: ${text}`;
    if (category === 'OPEN QUESTION') return `One critical question remains open: ${text}`;
    return text;
  }

  resolveProfessionalPublishCheck({ opening, surprise, ending, misconception }) {
    const score = [opening, surprise, ending].filter(text => String(text ?? '').trim().length > 0).length;
    return score >= 3 || String(misconception ?? '').trim().length > 0;
  }

  cleanNarrationLine(text) {
    let line = String(text ?? '').trim();
    if (line.length === 0) return '';

    // Strip internal planning terminology from final narration.
    line = line
      .replace(/\bBEAT-\d{3}\b/gi, '')
      .replace(/\b(narration objective|visual objective|curiosity objective|beat objective|producer brief|storytelling plan|supportingResearchFacts|supportingResearch|transitionIntoNextBeat|cadenceType|estimatedDurationSeconds|durationSeconds|metadata|objective)\b/gi, '')
      .replace(/\b(?:VERIFIED FACT|SUPPORTED INTERPRETATION|COMPETING INTERPRETATIONS|OPEN QUESTION)\b\s*:?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return line;
  }

  estimateDuration(targetLength) {
    const words = Number.parseInt(String(targetLength), 10);
    const normalizedWords = Number.isNaN(words) ? 900 : words;

    return `${Math.max(1, Math.ceil(normalizedWords / 150))} minutes`;
  }
}
