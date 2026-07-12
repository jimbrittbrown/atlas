function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class WebsiteProductionDeliveryPackageGenerator {
  constructor({ reviewPackageGenerator, now } = {}) {
    this.reviewPackageGenerator = reviewPackageGenerator;
    this.now = now;
  }

  generate({
    session,
    pipelineMission,
    sandboxProject,
    qaResult,
    revisionHistory,
    workforceDirector
  } = {}) {
    const confidencePenalty = Math.min(30, Number(qaResult.issuesRemaining ?? 0) * 5);
    const confidenceScore = Math.max(0, Math.min(100, Number(qaResult.qualityScore ?? 0) - confidencePenalty));

    const executiveReviewPackage = this.reviewPackageGenerator.generate({
      mission: pipelineMission,
      intelligenceReport: pipelineMission?.artifacts?.companyResearch,
      brandPackage: pipelineMission?.artifacts?.brandPackage,
      templateSelection: pipelineMission?.artifacts?.templateSelection,
      customizationPlan: pipelineMission?.artifacts?.customizationPackage,
      websiteHealthScores: {
        contentClarity: Number(qaResult.qualityScore ?? 0),
        conversionReadiness: Number(qaResult.qualityScore ?? 0),
        brandConsistency: Number(qaResult.qualityScore ?? 0),
        trustSignals: Number(qaResult.qualityScore ?? 0),
        technicalReadiness: Number(qaResult.qualityScore ?? 0)
      }
    });

    return {
      websitePackage: {
        packageId: `${session.reviewId}_website_package`,
        sandboxProjectId: sandboxProject?.id ?? null,
        sandboxProjectName: sandboxProject?.name ?? null,
        projectUrl: sandboxProject?.projectUrl ?? null,
        missionId: session.missionId
      },
      assets: {
        screenshots: qaResult.screenshotTasks.map((task) => ({
          taskId: task.taskId,
          page: task.page,
          reference: `capture://${task.taskId}`
        })),
        brandingAssets: pipelineMission?.artifacts?.brandPackage ?? {},
        projectAssets: pipelineMission?.artifacts?.companyResearch?.projectDetails?.details?.assets ?? {}
      },
      qaReport: {
        qualityScore: qaResult.qualityScore,
        qaStatus: qaResult.qaStatus,
        issuesRemaining: qaResult.issuesRemaining,
        checks: qaResult.checks
      },
      revisionHistory,
      deploymentInstructions: {
        policy: 'CEO_APPROVAL_REQUIRED_BEFORE_ANY_DEPLOYMENT',
        steps: [
          'Review QA report and revision history.',
          'Review executive review package recommendation.',
          'Obtain explicit CEO approval ticket before publish/deploy.',
          'Execute publish/deploy only via separately authorized workflows.'
        ],
        publishAllowed: false,
        deployAllowed: false,
        destructiveOperationsAllowed: false
      },
      customerDeliverySummary: {
        generatedAt: nowIso(this.now),
        missionId: session.missionId,
        qualityScore: qaResult.qualityScore,
        confidenceScore,
        workforceStatus: workforceDirector?.buildDashboard?.() ?? null,
        readiness: qaResult.qaStatus === 'PASS' ? 'READY_FOR_CEO_REVIEW' : 'REVISION_PENDING_EXECUTIVE_DECISION'
      },
      executiveReviewPackage,
      confidenceScore
    };
  }
}
