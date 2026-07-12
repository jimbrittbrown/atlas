export const AtlasSalesEngineCapabilities = Object.freeze([
  'PROSPECT_DISCOVERY',
  'PROSPECT_SCORING',
  'WEBSITE_AUDIT_GENERATION',
  'OUTREACH_GENERATION',
  'CRM',
  'MEETING_TRACKING',
  'PROPOSAL_GENERATION',
  'CONTRACT_GENERATION',
  'INVOICE_GENERATION',
  'FOLLOW_UP_SCHEDULING',
  'WIN_LOSS_ANALYSIS',
  'CUSTOMER_SATISFACTION_TRACKING',
  'REFERRAL_TRACKING',
  'REVENUE_DASHBOARD',
  'SALES_ANALYTICS'
]);

export const AtlasSalesEnginePipelineStages = Object.freeze([
  'PROSPECT',
  'QUALIFIED_PROSPECT',
  'AUDIT',
  'OUTREACH',
  'MEETING',
  'PROPOSAL',
  'CLOSED_WON_OR_CLOSED_LOST',
  'PROJECT_DELIVERY',
  'CUSTOMER_SUCCESS',
  'REFERRAL',
  'REPEAT_BUSINESS'
]);

const REQUIRED_PACKAGE_FIELDS = Object.freeze([
  'salesEngineArchitecture',
  'departmentResponsibilities',
  'pipeline',
  'requiredArtifacts',
  'dashboardModel',
  'executiveWorkflow'
]);

export function createSalesEngineInput({
  departmentName = 'Atlas Sales Engine',
  operatingCompany = null,
  ceoObjective = 'Acquire customers, convert prospects, track revenue, and improve sales performance.',
  availableWorkforce = [],
  benchmarkSignals = {},
  opportunityContext = {}
} = {}) {
  return {
    departmentName,
    operatingCompany,
    ceoObjective,
    availableWorkforce: Array.isArray(availableWorkforce) ? availableWorkforce : [],
    benchmarkSignals: benchmarkSignals ?? {},
    opportunityContext: opportunityContext ?? {}
  };
}

export function validateSalesEngineInput(input = {}) {
  const issues = [];

  if (typeof input?.departmentName !== 'string' || input.departmentName.trim().length === 0) {
    issues.push('departmentName is required.');
  }

  if (typeof input?.ceoObjective !== 'string' || input.ceoObjective.trim().length === 0) {
    issues.push('ceoObjective is required.');
  }

  if (!Array.isArray(input?.availableWorkforce)) {
    issues.push('availableWorkforce must be an array.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function validateSalesEnginePackage(enginePackage = {}) {
  const missingFields = REQUIRED_PACKAGE_FIELDS.filter(field => enginePackage?.[field] === undefined);

  return {
    isValid: missingFields.length === 0,
    missingFields,
    requiredFields: [...REQUIRED_PACKAGE_FIELDS]
  };
}

export function createSalesEngineResult({
  salesEngineArchitecture = {},
  departmentResponsibilities = [],
  pipeline = [],
  requiredArtifacts = [],
  dashboardModel = {},
  executiveWorkflow = []
} = {}) {
  return {
    generatedAt: new Date().toISOString(),
    salesEngineArchitecture,
    departmentResponsibilities,
    pipeline,
    requiredArtifacts,
    dashboardModel,
    executiveWorkflow
  };
}
