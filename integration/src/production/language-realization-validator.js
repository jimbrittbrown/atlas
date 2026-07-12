export class LanguageRealizationValidator {
  validate({ script = '', researchPackage = null } = {}) {
    const text = String(script ?? '').trim();
    const issues = [];
    const warnings = [];

    if (text.length === 0) {
      issues.push('Composed screenplay is empty.');
    }

    const prohibitedPatterns = [
      { pattern: /\b(the purpose is|the emotional objective is|the emotional is|the tone remains)\b/i, label: 'planning language' },
      { pattern: /\b(show who acted|keep narration|rewrite this|mentorship suggestion)\b/i, label: 'internal instruction language' },
      { pattern: /\b(editorial note|issueType|revision request|approval status)\b/i, label: 'editorial terminology' },
      { pattern: /\bworkflow|process|handoff|pipeline|implementation\b/i, label: 'process description' },
      { pattern: /\bplaceholder|todo|tbd|n\/a\b/i, label: 'placeholder scaffolding' },
      { pattern: /\b(screenwriter|executive script editor|executive producer|writer'?s room)\b/i, label: 'role reference leakage' }
    ];

    prohibitedPatterns.forEach(({ pattern, label }) => {
      if (pattern.test(text)) {
        issues.push(`Detected prohibited ${label} in composed narration.`);
      }
    });

    const naturalLanguageCheck = /[.?!]/.test(text) && !/\b(=>|::|\{\{|\}\}|\[\[|\]\])\b/.test(text);
    if (!naturalLanguageCheck) {
      issues.push('Narration does not meet natural publication language heuristics.');
    }

    const verifiedFacts = this.collectFactAnchors(researchPackage);
    let factualPreservation = true;
    if (verifiedFacts.length > 0) {
      const preserved = verifiedFacts.some(anchor => text.toLowerCase().includes(anchor.toLowerCase()));
      if (!preserved) {
        factualPreservation = false;
        warnings.push('No verified fact anchors were detected in composed narration.');
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      warnings,
      checks: {
        noProhibitedLanguage: !issues.some(issue => issue.includes('Detected prohibited')),
        naturalPublicationLanguage: !issues.includes('Narration does not meet natural publication language heuristics.'),
        factualPreservation
      }
    };
  }

  collectFactAnchors(researchPackage = null) {
    const packageData = researchPackage ?? {};
    const facts = Array.isArray(packageData?.highestStoryValueFacts)
      ? packageData.highestStoryValueFacts
      : [];

    const fromFacts = facts
      .map(item => String(item?.findingText ?? item?.fact ?? '').trim())
      .filter(Boolean)
      .map(text => text.split(/\s+/).slice(0, 5).join(' '));

    if (fromFacts.length > 0) {
      return fromFacts;
    }

    const fromVerified = Array.isArray(packageData?.verifiedDocumentaryFacts)
      ? packageData.verifiedDocumentaryFacts
          .map(item => String(item?.fact ?? '').trim())
          .filter(Boolean)
          .map(text => text.split(/\s+/).slice(0, 5).join(' '))
      : [];

    return fromVerified;
  }
}
