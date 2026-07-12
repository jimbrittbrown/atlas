import { StorytellingEvaluator } from '../../production/storytelling-evaluator.js';
import { ExecutiveScriptEditor } from '../../production/executive-script-editor.js';

export class ExternalScreenplayGovernanceEvaluator {
  constructor({
    storytellingEvaluator = null,
    executiveScriptEditor = null
  } = {}) {
    this.storytellingEvaluator = storytellingEvaluator ?? new StorytellingEvaluator();
    this.executiveScriptEditor = executiveScriptEditor ?? new ExecutiveScriptEditor();
  }

  evaluate({ screenplay = '', researchPackage = null, topic = '' } = {}) {
    const script = String(screenplay ?? '').trim();
    const factualReview = this.evaluateFactualGrounding({ script, researchPackage });
    const storytelling = this.storytellingEvaluator.evaluate(script);
    const editorial = this.executiveScriptEditor.reviewScreenplay({
      script,
      topic,
      researchPackage
    });

    const ceoReadiness = this.resolveCEOReadiness({
      storytelling,
      factualReview,
      editorial
    });

    return {
      screenplayLength: script.length,
      factualReview,
      storytellingEvaluation: storytelling,
      editorialReview: editorial,
      ceoApprovalRecommendation: ceoReadiness
    };
  }

  evaluateFactualGrounding({ script = '', researchPackage = null } = {}) {
    const verifiedFacts = Array.isArray(researchPackage?.verifiedDocumentaryFacts)
      ? researchPackage.verifiedDocumentaryFacts
      : [];

    const scriptSentences = String(script)
      .split(/(?<=[.!?])\s+/)
      .map(item => item.trim())
      .filter(Boolean);

    const claims = scriptSentences
      .filter(line => /\b(19\d{2}|20\d{2}|according|report|record|documented|confirmed|evidence|hearing|review)\b/i.test(line));

    const factPool = verifiedFacts
      .map(item => String(item?.fact ?? '').toLowerCase())
      .filter(Boolean);

    const mappedClaims = claims.map(claim => {
      const normalized = claim.toLowerCase();
      const mapped = factPool.some(fact => this.hasTokenOverlap(normalized, fact));

      return {
        claim,
        mapped
      };
    });

    const mappedCount = mappedClaims.filter(item => item.mapped).length;
    const unmapped = mappedClaims.filter(item => !item.mapped).map(item => item.claim);

    return {
      totalClaims: mappedClaims.length,
      mappedClaims: mappedCount,
      unmappedClaims: unmapped,
      mappingRate: mappedClaims.length === 0
        ? 0
        : Number((mappedCount / mappedClaims.length).toFixed(3)),
      status: unmapped.length === 0 ? 'PASS' : 'REVIEW_REQUIRED'
    };
  }

  hasTokenOverlap(a = '', b = '') {
    const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'were', 'was', 'are', 'has', 'had']);
    const tokensA = String(a).split(/[^a-z0-9]+/).filter(token => token.length > 3 && !stop.has(token));
    const tokensB = new Set(String(b).split(/[^a-z0-9]+/).filter(token => token.length > 3 && !stop.has(token)));

    let overlap = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) overlap += 1;
      if (overlap >= 5) return true;
    }

    return false;
  }

  resolveCEOReadiness({ storytelling, factualReview, editorial }) {
    const storytellingScore = Number(storytelling?.overallScore ?? 0);
    const factualPass = factualReview?.status === 'PASS';
    const editorialApproved = String(editorial?.approvalStatus ?? '').toUpperCase() === 'APPROVED_FOR_PRODUCTION';

    if (storytellingScore >= 7 && factualPass && editorialApproved) {
      return {
        decision: 'APPROVE',
        rationale: 'External screenplay meets storytelling, factual, and editorial governance checks.'
      };
    }

    return {
      decision: 'RETURN_FOR_REVISION',
      rationale: 'External screenplay requires revision through Atlas governance before CEO approval.',
      blockers: {
        storytellingScore,
        factualStatus: factualReview?.status ?? 'UNKNOWN',
        editorialApproval: editorial?.approvalStatus ?? 'UNKNOWN'
      }
    };
  }
}
