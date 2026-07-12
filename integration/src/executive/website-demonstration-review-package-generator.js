function toHost(websiteUrl) {
  try {
    return new URL(String(websiteUrl)).hostname;
  } catch {
    return null;
  }
}

function deriveMessagingStrategy({ businessSummary = {}, brandPackage = {}, customizationSummary = {} }) {
  return {
    primaryAudience: businessSummary.segment ?? 'Local service customers',
    narrative: brandPackage.brandNarrative ?? 'Professional credibility and clear service trust signals.',
    conversionFocus: customizationSummary.callToAction ?? 'Lead form and call-now actions',
    trustSignals: [
      'Customer reviews',
      'Service coverage clarity',
      'Certifications and warranties'
    ]
  };
}

export class WebsiteDemonstrationReviewPackageGenerator {
  generate({
    mission,
    intelligenceReport,
    brandPackage,
    templateSelection,
    customizationSummary,
    builderMissionResult,
    framerBuildInstructions,
    qaReport,
    confidenceScore,
    ceoApprovalRecommendation
  } = {}) {
    const websiteUrl = mission?.websiteUrl ?? null;
    const websiteHost = toHost(websiteUrl);

    const sandboxExecutionSummary = {
      status: builderMissionResult?.mission?.state ?? 'UNKNOWN',
      sandboxBuildStatus: builderMissionResult?.mission?.artifacts?.sandboxBuildResult?.status ?? 'UNKNOWN',
      sandboxProject: builderMissionResult?.mission?.artifacts?.sandboxBuildResult?.sandboxProject ?? null,
      governance: builderMissionResult?.governance ?? null
    };

    const screenshotReferences = [
      {
        id: 'source-homepage',
        type: 'SOURCE_WEBSITE',
        reference: websiteUrl,
        note: 'Primary homepage reference for comparative analysis.'
      },
      {
        id: 'source-services',
        type: 'SOURCE_WEBSITE',
        reference: websiteUrl,
        note: 'Services and content structure reference.'
      },
      {
        id: 'sandbox-project',
        type: 'SANDBOX_PROJECT',
        reference: sandboxExecutionSummary?.sandboxProject?.projectUrl ?? null,
        note: 'Target Framer Sandbox project reference.'
      }
    ];

    return {
      missionId: mission?.missionId ?? null,
      websiteUrl,
      businessSummary: {
        companyName: mission?.artifacts?.prospectProfile?.companyName ?? null,
        websiteHost,
        segment: mission?.prospect?.segment ?? 'Unknown',
        researchSummary: intelligenceReport?.summary ?? null
      },
      existingWebsiteAnalysis: {
        sourceUrl: websiteUrl,
        sourceHost: websiteHost,
        findings: intelligenceReport?.findings ?? [],
        projectInfoContext: intelligenceReport?.projectInfo ?? null,
        capabilityLimitations: intelligenceReport?.projectDetails?.limitations ?? []
      },
      brandPackage,
      messagingStrategy: deriveMessagingStrategy({
        businessSummary: mission?.prospect ?? {},
        brandPackage,
        customizationSummary
      }),
      selectedTemplate: templateSelection,
      screenshotReferences,
      customizationSummary,
      sandboxExecutionSummary,
      qaReport,
      confidenceScore,
      ceoApprovalRecommendation,
      framerBuildInstructions
    };
  }
}
