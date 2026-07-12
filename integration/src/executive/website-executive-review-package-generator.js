function defaultScore(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(100, Math.round(parsed * 100)));
  }

  return fallback;
}

function collectMissingAssets({ existingBranding = {} }) {
  const missing = [];

  if (!existingBranding.logo) {
    missing.push('Company logo');
  }

  if (!existingBranding.colors) {
    missing.push('Brand color palette');
  }

  if (!Array.isArray(existingBranding.photography) || existingBranding.photography.length === 0) {
    missing.push('Photography references');
  }

  if (!Array.isArray(existingBranding.reviews) || existingBranding.reviews.length === 0) {
    missing.push('Customer testimonials');
  }

  return missing;
}

function summarizeRisks({ missingAssets = [], intelligenceReport }) {
  const risks = [];

  if (missingAssets.length > 0) {
    risks.push(`Missing assets: ${missingAssets.join(', ')}`);
  }

  const limitations = intelligenceReport?.projectDetails?.limitations ?? [];
  if (Array.isArray(limitations) && limitations.length > 0) {
    risks.push('Framer API capability limitations detected for some read surfaces.');
  }

  if (!intelligenceReport?.summary) {
    risks.push('Intelligence summary is incomplete.');
  }

  return risks;
}

function deriveExecutiveRecommendation({ confidenceScore, risks = [] }) {
  if (confidenceScore >= 0.8 && risks.length <= 1) {
    return 'APPROVE';
  }

  if (confidenceScore >= 0.6) {
    return 'REVISION_REQUIRED';
  }

  return 'REJECT';
}

export class WebsiteExecutiveReviewPackageGenerator {
  generate({
    mission,
    intelligenceReport,
    brandPackage,
    templateSelection,
    customizationPlan,
    websiteHealthScores,
    customerAnalysis,
    competitorSummary
  } = {}) {
    const missingAssets = collectMissingAssets({ existingBranding: mission?.existingBranding ?? {} });
    const risks = summarizeRisks({ missingAssets, intelligenceReport });

    const confidenceParts = [
      Number(intelligenceReport?.confidence ?? 0),
      Number(brandPackage?.confidence ?? 0),
      Number(templateSelection?.confidence ?? 0),
      risks.length === 0 ? 0.9 : 0.7
    ].filter((value) => Number.isFinite(value));

    const confidenceScore = confidenceParts.length > 0
      ? Number((confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length).toFixed(2))
      : 0;

    const executiveRecommendation = deriveExecutiveRecommendation({ confidenceScore, risks });

    return {
      missionId: mission?.missionId ?? null,
      executiveSummary: intelligenceReport?.summary ?? 'No executive summary available.',
      businessOverview: {
        companyName: mission?.artifacts?.prospectProfile?.companyName ?? null,
        prospectUrl: mission?.prospectUrl ?? null,
        segment: mission?.prospect?.segment ?? 'Unknown'
      },
      websiteHealthScores: websiteHealthScores ?? {
        contentClarity: defaultScore(intelligenceReport?.confidence, 70),
        conversionReadiness: defaultScore(templateSelection?.confidence, 72),
        brandConsistency: defaultScore(brandPackage?.confidence, 75),
        trustSignals: 68,
        technicalReadiness: 74
      },
      brandPackage,
      messagingStrategy: {
        narrative: brandPackage?.brandNarrative ?? null,
        primaryAudience: mission?.prospect?.segment ?? 'General audience',
        conversionGoal: customizationPlan?.primaryCallToAction ?? 'Capture qualified leads'
      },
      customerAnalysis: customerAnalysis ?? {
        audienceSegments: [
          'Prospects seeking service quality and trust',
          'Price-sensitive comparison shoppers',
          'Repeat/referral customers'
        ],
        needs: [
          'Fast clarity on services',
          'Proof of reliability',
          'Simple conversion path'
        ]
      },
      competitorSummary: competitorSummary ?? {
        directCompetitors: [],
        observations: [
          'Competitor-specific intelligence not yet enriched in this mission run.'
        ]
      },
      recommendedTemplate: templateSelection,
      customizationPlan,
      missingAssets,
      risks,
      confidenceScore,
      executiveRecommendation
    };
  }
}
