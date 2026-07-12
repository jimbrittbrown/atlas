export class ExecutiveScriptEditor {
  reviewScreenplay({ script = '' } = {}) {
    const paragraphs = this.splitParagraphs(script);

    if (paragraphs.length === 0) {
      return {
        approvalStatus: 'REVISION_REQUIRED',
        summary: 'No screenplay paragraphs were provided for editorial review.',
        strengths: [],
        revisionRequests: [
          {
            requestId: 'REV-001',
            issueType: 'missing-content',
            paragraphIndex: 1,
            priority: 'HIGH',
            reason: 'Screenplay is empty.',
            request: 'Provide a complete first draft before editorial approval can be considered.'
          }
        ],
        reviewChecklist: this.buildEmptyReview(),
        weakestParagraphIndex: 1,
        weakestParagraphWhy: 'No screenplay paragraph available for analysis.'
      };
    }

    const productionNotePatterns = [
      /\bthe audience should\b/i,
      /\bwe are telling a story about\b/i,
      /\bemotional journey\b/i,
      /\bthe stakes rise\b/i,
      /\bafter the credits\b/i,
      /\bthis documentary\b/i,
      /\bwhat are we still missing\b/i
    ];

    const productionNoteLines = paragraphs
      .flatMap((paragraph, idx) => this.splitSentences(paragraph).map(sentence => ({ sentence, idx: idx + 1 })))
      .filter(item => productionNotePatterns.some(pattern => pattern.test(item.sentence)));

    const repeatedIdeas = this.detectRepeatedIdeas(paragraphs);
    const weakestParagraphIndex = this.findWeakestParagraphIndex(paragraphs);
    const unnecessaryAbstractions = this.collectAbstractPhrases(paragraphs);

    const reviewChecklist = {
      openingHooksImmediately: this.evaluateOpeningHook(paragraphs[0]),
      productionNoteLines: productionNoteLines.map(item => ({
        paragraph: item.idx,
        line: item.sentence
      })),
      repeatedIdeas,
      paragraphMomentum: this.evaluateParagraphMomentum(paragraphs),
      explainsInsteadOfDramatizes: this.countAbstractSentences(paragraphs.join(' ')) > 2,
      narratorVoiceAuthentic: productionNoteLines.length === 0,
      unnecessaryAbstractions,
      endingFeelsEarned: this.endingFeelsEarned(paragraphs[paragraphs.length - 1] ?? ''),
      unforgettableIdea: this.extractUnforgettableIdea(paragraphs),
      weakestParagraphIndex,
      weakestParagraphWhy: this.describeWeakestParagraph(paragraphs[weakestParagraphIndex - 1] ?? '')
    };

    const strengths = this.collectStrengths(reviewChecklist, paragraphs);
    const revisionRequests = this.buildRevisionRequests({
      paragraphs,
      reviewChecklist,
      productionNoteLines,
      repeatedIdeas,
      weakestParagraphIndex,
      unnecessaryAbstractions
    });

    return {
      approvalStatus: revisionRequests.length === 0 ? 'APPROVED_FOR_PRODUCTION' : 'REVISION_REQUIRED',
      summary: this.buildEditorialSummary({ reviewChecklist, revisionRequests }),
      strengths,
      revisionRequests,
      reviewChecklist,
      weakestParagraphIndex,
      weakestParagraphWhy: reviewChecklist.weakestParagraphWhy
    };
  }

  reviewAndRevise({ script = '' } = {}) {
    const screenplayReview = this.reviewScreenplay({ script });
    const revisedScript = this.applyRequestedRevisions({
      script,
      revisionRequests: screenplayReview.revisionRequests
    });

    return {
      review: screenplayReview.reviewChecklist,
      revisedScript
    };
  }

  applyRequestedRevisions({ script = '', revisionRequests = [] } = {}) {
    const paragraphs = this.splitParagraphs(script);
    const updated = [...paragraphs];

    revisionRequests.forEach(request => {
      const paragraphIndex = Number.parseInt(String(request?.paragraphIndex ?? 0), 10) - 1;
      if (!Number.isFinite(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= updated.length) {
        return;
      }

      let paragraph = updated[paragraphIndex];
      paragraph = this.rewriteParagraph(paragraph);
      paragraph = this.removeRepeatedSentences(paragraph);
      paragraph = this.tightenNarration(paragraph);
      updated[paragraphIndex] = paragraph;
    });

    const transitioned = this.ensureParagraphTransitions(updated.filter(Boolean));
    return this.strengthenEnding(transitioned).join('\n\n');
  }

  buildRevisionRequests({
    paragraphs,
    reviewChecklist,
    productionNoteLines,
    repeatedIdeas,
    weakestParagraphIndex,
    unnecessaryAbstractions
  }) {
    const requests = [];
    let counter = 1;

    productionNoteLines.slice(0, 4).forEach(item => {
      requests.push({
        requestId: `REV-${String(counter).padStart(3, '0')}`,
        issueType: 'production-note-language',
        paragraphIndex: item.idx,
        priority: 'HIGH',
        diagnosis: 'Narration briefly shifts into meta direction instead of story voice.',
        reason: 'Directive wording interrupts audience immersion and weakens authority of the narrator.',
        exampleImprovement: 'Replace "the audience should" with a concrete observation tied to consequence.',
        request: 'A mentorship note: keep this beat, but express it as observed consequence rather than instruction.'
      });
      counter += 1;
    });

    repeatedIdeas.slice(0, 2).forEach(() => {
      requests.push({
        requestId: `REV-${String(counter).padStart(3, '0')}`,
        issueType: 'repetition',
        paragraphIndex: weakestParagraphIndex,
        priority: 'MEDIUM',
        diagnosis: 'A rhetorical phrase repeats often enough to flatten momentum.',
        reason: 'Repetition lowers contrast between beats and makes later escalations feel less earned.',
        exampleImprovement: 'Keep the strongest instance, then vary later lines with fresh concrete language.',
        request: 'Mentorship suggestion: preserve the strongest phrasing once and vary subsequent escalation lines.'
      });
      counter += 1;
    });

    if (unnecessaryAbstractions.length > 0) {
      requests.push({
        requestId: `REV-${String(counter).padStart(3, '0')}`,
        issueType: 'abstraction-overload',
        paragraphIndex: weakestParagraphIndex,
        priority: 'MEDIUM',
        diagnosis: 'Conceptual vocabulary is overtaking concrete action in this paragraph.',
        reason: 'The audience follows events faster when verbs and actors are explicit.',
        exampleImprovement: 'Name who acted, what they chose, and who paid the price.',
        request: 'Mentorship suggestion: keep the idea, but anchor it in specific actors and consequences.'
      });
      counter += 1;
    }

    if (!reviewChecklist.endingFeelsEarned) {
      requests.push({
        requestId: `REV-${String(counter).padStart(3, '0')}`,
        issueType: 'ending-impact',
        paragraphIndex: paragraphs.length,
        priority: 'HIGH',
        diagnosis: 'Closing beat resolves language before emotional tension fully peaks.',
        reason: 'A stronger unresolved question increases retention after the final line.',
        exampleImprovement: 'End with one specific unanswered accountability question.',
        request: 'Mentorship suggestion: close on one unresolved question that feels unavoidable, not generic.'
      });
    }

    return requests;
  }

  collectStrengths(reviewChecklist, paragraphs) {
    const strengths = [];

    if (reviewChecklist.openingHooksImmediately) {
      strengths.push('Opening establishes stakes quickly and creates immediate narrative pull.');
    }

    if (paragraphs.length >= 4) {
      strengths.push('Structure sustains a clear progression from event to consequence to reflection.');
    }

    if (reviewChecklist.unforgettableIdea && reviewChecklist.unforgettableIdea !== 'Unforgettable idea unavailable.') {
      strengths.push('Contains at least one high-retention line worth preserving verbatim.');
    }

    return strengths;
  }

  buildEditorialSummary({ reviewChecklist, revisionRequests }) {
    if (revisionRequests.length === 0) {
      return 'Screenplay is approved for production; preserve current strengths and proceed.';
    }

    if (!reviewChecklist.narratorVoiceAuthentic) {
      return 'Revision required: remove production-note phrasing and preserve documentary narration voice.';
    }

    return 'Revision required: targeted paragraph-level fixes are needed before production approval.';
  }

  buildEmptyReview() {
    return {
      openingHooksImmediately: false,
      productionNoteLines: [],
      repeatedIdeas: [],
      paragraphMomentum: 'No screenplay paragraphs available to evaluate.',
      explainsInsteadOfDramatizes: true,
      narratorVoiceAuthentic: false,
      unnecessaryAbstractions: [],
      endingFeelsEarned: false,
      unforgettableIdea: 'No screenplay submitted.',
      weakestParagraphIndex: 1,
      weakestParagraphWhy: 'No screenplay paragraph available for analysis.'
    };
  }

  splitParagraphs(script) {
    return String(script ?? '')
      .split(/\n{2,}/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean);
  }

  splitSentences(paragraph) {
    return String(paragraph ?? '')
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);
  }

  evaluateOpeningHook(firstParagraph) {
    const text = String(firstParagraph ?? '').trim();
    if (text.length === 0) return false;
    return /\b(when|suddenly|overnight|collapsed|without warning|first)\b/i.test(text) && text.length >= 80;
  }

  detectRepeatedIdeas(paragraphs) {
    const phraseCounts = new Map();
    const stop = new Set(['the', 'and', 'that', 'with', 'from', 'this', 'they', 'were', 'have', 'has']);

    paragraphs.forEach(paragraph => {
      const words = String(paragraph).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length - 2; i += 1) {
        const tri = words.slice(i, i + 3);
        if (tri.some(word => stop.has(word))) continue;
        const key = tri.join(' ');
        phraseCounts.set(key, (phraseCounts.get(key) ?? 0) + 1);
      }
    });

    return [...phraseCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([phrase, count]) => ({ phrase, count }));
  }

  findWeakestParagraphIndex(paragraphs) {
    let weakest = { idx: 1, score: Number.NEGATIVE_INFINITY };

    paragraphs.forEach((paragraph, index) => {
      const sentenceCount = this.splitSentences(paragraph).length;
      const abstractCount = this.countAbstractSentences(paragraph);
      const productionNotePenalty = /\b(the audience should|this documentary|we are telling)\b/i.test(paragraph) ? 3 : 0;
      const score = abstractCount + productionNotePenalty + (sentenceCount > 4 ? 1 : 0);
      if (score <= weakest.score) return;
      weakest = { idx: index + 1, score };
    });

    return weakest.idx;
  }

  rewriteParagraph(paragraph) {
    let rewritten = String(paragraph ?? '').trim();

    rewritten = rewritten
      .replace(/\bthe audience should\b/gi, '')
      .replace(/\bwe are telling a story about\b/gi, '')
      .replace(/\bthis documentary\b/gi, '')
      .replace(/\bemotional journey\b/gi, '')
      .replace(/\bthe stakes rise as new evidence challenges the obvious conclusion\.?/gi, '')
      .replace(/\bbut what are we still missing\??/gi, '')
      .replace(/\bafter the credits,?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return rewritten;
  }

  removeRepeatedSentences(paragraph) {
    const sentences = this.splitSentences(paragraph);
    const seen = new Set();

    const deduped = sentences.filter(sentence => {
      const key = sentence.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.join(' ');
  }

  tightenNarration(paragraph) {
    return String(paragraph ?? '')
      .replace(/\bvery\b/gi, '')
      .replace(/\bin order to\b/gi, 'to')
      .replace(/\bthe fact that\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:?])/g, '$1')
      .trim();
  }

  ensureParagraphTransitions(paragraphs) {
    if (paragraphs.length <= 1) return paragraphs;

    return paragraphs.map((paragraph, index) => {
      if (index === 0) return paragraph;
      if (/^(Then|Years later|From|By|Inside|Outside|Still)/i.test(paragraph)) return paragraph;
      const bridge = ['Then', 'By then', 'Still', 'Years later', 'From there'][Math.min(index, 4)] ?? 'Then';
      return `${bridge}, ${paragraph.charAt(0).toLowerCase()}${paragraph.slice(1)}`;
    });
  }

  strengthenEnding(paragraphs) {
    if (paragraphs.length === 0) return paragraphs;

    const revised = [...paragraphs];
    const ending = revised[revised.length - 1];

    if (!/\?$/.test(ending.trim())) {
      revised[revised.length - 1] = `${ending} If those same pressures are building again today, would we recognize them before it is too late?`;
    }

    return revised;
  }

  evaluateParagraphMomentum(paragraphs) {
    if (paragraphs.length < 2) return 'Single-paragraph script; momentum cannot be fully evaluated.';

    const smooth = paragraphs.slice(1).every(paragraph => /^(Then|By|Years later|From|Still|Inside|Outside)/i.test(paragraph));
    return smooth
      ? 'Paragraph flow is strong; each section advances consequence and escalates stakes.'
      : 'Momentum is moderate; transitions were tightened to improve progression.';
  }

  countAbstractSentences(text) {
    const abstractTokens = /(system|structure|framework|dynamic|incentive|architecture|model|paradigm)/i;
    return this.splitSentences(text).filter(sentence => abstractTokens.test(sentence)).length;
  }

  collectAbstractPhrases(paragraphs) {
    const abstractTokens = /(system|structure|framework|dynamic|incentive|architecture|model|paradigm)/i;
    return paragraphs
      .flatMap(paragraph => this.splitSentences(paragraph))
      .filter(sentence => abstractTokens.test(sentence))
      .slice(0, 5);
  }

  endingFeelsEarned(lastParagraph) {
    const text = String(lastParagraph ?? '').trim().toLowerCase();
    return text.includes('if') && text.includes('?');
  }

  extractUnforgettableIdea(paragraphs) {
    const candidates = paragraphs
      .flatMap(paragraph => this.splitSentences(paragraph))
      .filter(sentence => sentence.length >= 60)
      .sort((a, b) => b.length - a.length);

    return candidates[0] ?? 'Unforgettable idea unavailable.';
  }

  describeWeakestParagraph(paragraph) {
    const text = String(paragraph ?? '');
    if (/\b(the audience should|this documentary|we are telling)\b/i.test(text)) {
      return 'Contains production-note phrasing that breaks narration voice.';
    }

    if (this.countAbstractSentences(text) >= 2) {
      return 'Leans too abstract and explains more than it dramatizes.';
    }

    return 'Most likely to lose momentum relative to surrounding sections.';
  }
}
