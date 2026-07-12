import { WorkerAssignment } from '../worker-assignment.js';

export class ScreenplayComposerWorker {
  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('ScreenplayComposerWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const task = assignment.result?.task ?? {};
    const metadata = task.metadata ?? {};
    const revisionRequests = Array.isArray(metadata.revisionRequests) ? metadata.revisionRequests : [];
    const writerResponses = Array.isArray(metadata.writerResponses) ? metadata.writerResponses : [];

    const composedScript = revisionRequests.length > 0
      ? this.applyRevisionPass({
        previousScript: String(metadata.previousComposedScript ?? metadata.script ?? ''),
        revisionRequests,
        writerResponses,
        verifiedFacts: this.collectVerifiedFacts(metadata)
      })
      : this.composeInitialDraft({
        planningScript: String(metadata.planningScript ?? metadata.script ?? ''),
        verifiedFacts: this.collectVerifiedFacts(metadata)
      });

    const completionReport = {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      status: 'COMPLETED'
    };

    const result = {
      scriptTitle: metadata.scriptTitle ?? 'Documentary Screenplay',
      script: composedScript,
      status: 'COMPLETED',
      completionReport
    };

    assignment.complete(result, completionReport.completedAt);

    return result;
  }

  composeInitialDraft({ planningScript = '', verifiedFacts = [] }) {
    const paragraphs = this.splitParagraphs(planningScript)
      .map(paragraph => this.realizeParagraph(paragraph))
      .filter(Boolean);

    if (paragraphs.length === 0 && verifiedFacts.length > 0) {
      return `${verifiedFacts[0]}`;
    }

    return paragraphs.join('\n\n');
  }

  applyRevisionPass({ previousScript = '', revisionRequests = [], writerResponses = [], verifiedFacts = [] }) {
    const paragraphs = this.splitParagraphs(previousScript);
    const responseMap = new Map(
      writerResponses
        .filter(item => String(item?.requestId ?? '').trim().length > 0)
        .map(item => [String(item.requestId), item])
    );

    revisionRequests.forEach(request => {
      const response = responseMap.get(String(request?.requestId ?? '')) ?? {};
      const decision = String(response?.decision ?? 'accept').toLowerCase();
      if (decision === 'reject') return;

      const index = Number.parseInt(String(request?.paragraphIndex ?? 0), 10) - 1;
      if (!Number.isFinite(index) || index < 0 || index >= paragraphs.length) return;

      const mode = String(response?.revisionMode ?? 'EDIT').toUpperCase();
      if (mode === 'REWRITE') {
        paragraphs[index] = this.rewriteParagraph({
          originalParagraph: paragraphs[index],
          request,
          verifiedFacts
        });
        return;
      }

      paragraphs[index] = this.editParagraph({
        paragraph: paragraphs[index],
        request
      });
    });

    return paragraphs
      .map(paragraph => this.realizeParagraph(paragraph))
      .filter(Boolean)
      .join('\n\n');
  }

  rewriteParagraph({ originalParagraph = '', request = {}, verifiedFacts = [] }) {
    const original = String(originalParagraph ?? '').trim();
    const factLine = this.extractFactSentence(original) || verifiedFacts[0] || original;
    const issueType = String(request?.issueType ?? '').toLowerCase();

    if (issueType === 'production-note-language' || issueType === 'narration-authenticity') {
      return `${factLine} The consequence was visible long before institutions admitted it.`;
    }

    if (issueType === 'abstraction-overload' || issueType === 'weak-storytelling') {
      return `${factLine} Decision-makers delayed action, and ordinary households absorbed the cost.`;
    }

    if (issueType === 'weak-emotional-impact' || issueType === 'immersion-problem') {
      return `${factLine} Behind every market signal was a family recalculating what survival would require.`;
    }

    if (issueType === 'pacing-problem') {
      return `${factLine} Each delay narrowed the options and accelerated the damage.`;
    }

    if (issueType === 'ending-impact') {
      return `${factLine} If the same pressures are building again, who acts before the next collapse becomes undeniable?`;
    }

    return `${factLine} The consequences spread faster than public language could explain.`;
  }

  editParagraph({ paragraph = '', request = {} }) {
    let text = String(paragraph ?? '').trim();
    const issueType = String(request?.issueType ?? '').toLowerCase();

    if (issueType === 'repetition') {
      let seen = false;
      text = text.replace(/as stakes rise/gi, () => {
        if (!seen) {
          seen = true;
          return 'as pressure intensifies';
        }
        return 'as consequences spread';
      });
    }

    return this.realizeParagraph(text);
  }

  realizeParagraph(text) {
    return String(text ?? '')
      .replace(/\b(the purpose is(?: to)?|the emotional objective is|the emotional is|the tone remains|show who acted|keep narration)\b/gi, '')
      .replace(/\b(editorial note|implementation|workflow|process|placeholder|role:|screenwriter|executive producer|executive script editor)\b/gi, '')
      .replace(/\s*;\s*/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:?])/g, '$1')
      .replace(/\.{2,}/g, '.')
      .trim();
  }

  splitParagraphs(script) {
    return String(script ?? '')
      .split(/\n{2,}/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean);
  }

  collectVerifiedFacts(metadata = {}) {
    const researchPackage = metadata.researchPackage ?? {};
    const fromHighestValue = Array.isArray(researchPackage?.highestStoryValueFacts)
      ? researchPackage.highestStoryValueFacts.map(item => String(item?.findingText ?? item?.fact ?? '').trim())
      : [];

    const fromVerifiedFacts = Array.isArray(researchPackage?.verifiedDocumentaryFacts)
      ? researchPackage.verifiedDocumentaryFacts.map(item => String(item?.fact ?? '').trim())
      : [];

    return [...fromHighestValue, ...fromVerifiedFacts].filter(Boolean);
  }

  extractFactSentence(paragraph = '') {
    const sentence = String(paragraph ?? '')
      .split(/(?<=[.!?])\s+/)
      .map(item => item.trim())
      .find(item => /\b(19\d{2}|20\d{2}|Lehman|boardrooms?|families|jobs|savings|markets?)\b/i.test(item));

    return sentence ? sentence.replace(/[?]+$/, '.').trim() : '';
  }
}
