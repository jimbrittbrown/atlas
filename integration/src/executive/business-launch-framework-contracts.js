const REQUIRED_LAUNCH_PACKAGE_SECTIONS = Object.freeze([
  'executiveSummary',
  'businessMission',
  'targetCustomer',
  'valueProposition',
  'revenueModel',
  'pricingStrategy',
  'requiredAISpecialists',
  'requiredHumanDecisions',
  'brandRequirements',
  'websiteRequirements',
  'marketingRequirements',
  'salesRequirements',
  'contentRequirements',
  'operationsRequirements',
  'customerSupportRequirements',
  'analyticsRequirements',
  'kpiDashboard',
  'first30DayExecutionPlan',
  'first90DayGrowthPlan',
  'executiveRiskAssessment'
]);

export const BusinessLaunchPipelineStages = Object.freeze([
  'APPROVED_BUSINESS',
  'LAUNCH_PLANNING',
  'WORKFORCE_ASSIGNMENT',
  'ASSET_CREATION',
  'QUALITY_REVIEW',
  'CEO_APPROVAL',
  'LAUNCH',
  'PERFORMANCE_MONITORING',
  'IMPROVEMENT_RECOMMENDATIONS'
]);

export function createBusinessLaunchFrameworkInput({
  approvedBusinessRecommendation = {},
  ceoObjectives = [],
  availableWorkforce = [],
  availableBudget = {},
  currentAtlasAssets = []
} = {}) {
  return {
    approvedBusinessRecommendation,
    ceoObjectives: Array.isArray(ceoObjectives) ? ceoObjectives : [],
    availableWorkforce: Array.isArray(availableWorkforce) ? availableWorkforce : [],
    availableBudget: availableBudget ?? {},
    currentAtlasAssets: Array.isArray(currentAtlasAssets) ? currentAtlasAssets : []
  };
}

export function validateBusinessLaunchFrameworkInput(input = {}) {
  const issues = [];

  if (!input?.approvedBusinessRecommendation || typeof input.approvedBusinessRecommendation !== 'object') {
    issues.push('approvedBusinessRecommendation is required.');
  }

  if (!Array.isArray(input?.ceoObjectives) || input.ceoObjectives.length === 0) {
    issues.push('ceoObjectives must include at least one objective.');
  }

  if (!Array.isArray(input?.availableWorkforce)) {
    issues.push('availableWorkforce must be an array.');
  }

  if (!input?.availableBudget || typeof input.availableBudget !== 'object') {
    issues.push('availableBudget is required.');
  }

  if (!Array.isArray(input?.currentAtlasAssets)) {
    issues.push('currentAtlasAssets must be an array.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function validateBusinessLaunchPackage(launchPackage = {}) {
  const missingSections = REQUIRED_LAUNCH_PACKAGE_SECTIONS.filter(
    section => launchPackage?.[section] === undefined
  );

  return {
    isValid: missingSections.length === 0,
    missingSections,
    requiredSections: REQUIRED_LAUNCH_PACKAGE_SECTIONS
  };
}

export function createBusinessLaunchFrameworkResult({
  frameworkArchitecture = {},
  launchPackageSchema = {},
  pipeline = [],
  requiredArtifacts = [],
  executiveWorkflow = [],
  dashboardProjection = {},
  launchPackage = {}
} = {}) {
  return {
    generatedAt: new Date().toISOString(),
    frameworkArchitecture,
    launchPackageSchema,
    pipeline,
    requiredArtifacts,
    executiveWorkflow,
    dashboardProjection,
    launchPackage
  };
}

export function requiredLaunchPackageSections() {
  return [...REQUIRED_LAUNCH_PACKAGE_SECTIONS];
}
