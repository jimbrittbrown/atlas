export const DemonstrationProjectTypes = Object.freeze([
  'PORTFOLIO_DEMONSTRATION',
  'PROSPECT_DEMONSTRATION'
]);

export const DemonstrationFactoryWorkflowStages = Object.freeze([
  'MISSION_INTAKE',
  'PROJECT_SCOPING',
  'RESEARCH_AND_ANALYSIS',
  'CONVERSION_STRATEGY_BLUEPRINT',
  'DEMONSTRATION_BUILD',
  'EXECUTIVE_AUDIT_AND_IMPACT_MODELING',
  'CEO_REVIEW_PACKAGE_ASSEMBLY',
  'READY_FOR_SALES_HANDOFF'
]);

export function createDemonstrationFactoryInput(payload = {}) {
  return {
    factoryName: String(payload.factoryName ?? 'Atlas Web Demonstration Factory v1').trim(),
    operatingCompany: String(payload.operatingCompany ?? 'Atlas Web').trim(),
    ceoObjective: String(
      payload.ceoObjective
        ?? 'Produce executive-quality demonstration websites that increase qualified leads and booked jobs.'
    ).trim()
  };
}

export function validateDemonstrationFactoryInput(input = {}) {
  const issues = [];

  if (!input.factoryName) issues.push('factoryName is required');
  if (!input.operatingCompany) issues.push('operatingCompany is required');
  if (!input.ceoObjective) issues.push('ceoObjective is required');

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function createDemonstrationFactoryResult(payload = {}) {
  return {
    architecture: payload.architecture ?? null,
    workflow: Array.isArray(payload.workflow) ? payload.workflow : [],
    requiredSpecialists: Array.isArray(payload.requiredSpecialists) ? payload.requiredSpecialists : [],
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
    executiveReviewProcess: Array.isArray(payload.executiveReviewProcess) ? payload.executiveReviewProcess : [],
    futureIntegrationWithSalesEngine: payload.futureIntegrationWithSalesEngine ?? null,
    controls: payload.controls ?? null
  };
}

export function validateDemonstrationFactoryPackage(result = {}) {
  const missingFields = [];

  if (!result.architecture) missingFields.push('architecture');
  if (!Array.isArray(result.workflow) || result.workflow.length === 0) missingFields.push('workflow');
  if (!Array.isArray(result.requiredSpecialists) || result.requiredSpecialists.length === 0) {
    missingFields.push('requiredSpecialists');
  }
  if (!Array.isArray(result.artifacts) || result.artifacts.length === 0) missingFields.push('artifacts');
  if (!Array.isArray(result.executiveReviewProcess) || result.executiveReviewProcess.length === 0) {
    missingFields.push('executiveReviewProcess');
  }
  if (!result.futureIntegrationWithSalesEngine) missingFields.push('futureIntegrationWithSalesEngine');

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}
