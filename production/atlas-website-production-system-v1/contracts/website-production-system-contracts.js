const TemplateApprovalStates = Object.freeze({
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  DEPRECATED: 'DEPRECATED'
});

const AssetTypes = Object.freeze({
  LOGO: 'LOGO',
  PHOTO: 'PHOTO',
  ICON: 'ICON',
  DOCUMENT: 'DOCUMENT'
});

const CustomizationStatuses = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED'
});

const QaCheckNames = Object.freeze([
  'NO_PLACEHOLDERS',
  'BRANDING_CONSISTENCY',
  'CONTACT_CONSISTENCY',
  'CTA_CONSISTENCY',
  'RESPONSIVE_READINESS',
  'MISSING_ASSETS',
  'BROKEN_LINKS',
  'REQUIRED_PAGES_PRESENT'
]);

const QaStatuses = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL'
});

const DeliveryStatuses = Object.freeze({
  READY: 'READY',
  BLOCKED: 'BLOCKED',
  DELIVERED: 'DELIVERED'
});

function normalizeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => normalizeString(item))
    .filter(Boolean);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function createTemplateVersion(input = {}) {
  return {
    version: normalizeString(input.version),
    approvedAt: normalizeString(input.approvedAt),
    approvedBy: normalizeString(input.approvedBy),
    releaseNotes: normalizeString(input.releaseNotes),
    templatePath: normalizeString(input.templatePath),
    requiredPages: normalizeStringArray(input.requiredPages),
    status: normalizeString(input.status, TemplateApprovalStates.DRAFT).toUpperCase(),
    layoutLockHash: normalizeString(input.layoutLockHash),
    metadata: cloneValue(input.metadata ?? {})
  };
}

function createWebsiteTemplateRegistryEntry(input = {}) {
  const versions = Array.isArray(input.versions)
    ? input.versions.map(createTemplateVersion)
    : [];

  return {
    templateId: normalizeString(input.templateId).toUpperCase(),
    templateFamily: normalizeString(input.templateFamily),
    displayName: normalizeString(input.displayName),
    industry: normalizeString(input.industry),
    status: normalizeString(input.status, TemplateApprovalStates.DRAFT).toUpperCase(),
    activeVersion: normalizeString(input.activeVersion),
    versionHistory: versions,
    tags: normalizeStringArray(input.tags),
    createdAt: normalizeString(input.createdAt),
    updatedAt: normalizeString(input.updatedAt)
  };
}

function createClientBrandingPackage(input = {}) {
  const logoAsset = input.logoAsset ?? {};

  return {
    clientId: normalizeString(input.clientId).toUpperCase(),
    companyName: normalizeString(input.companyName),
    existingLogo: {
      assetId: normalizeString(logoAsset.assetId),
      assetPath: normalizeString(logoAsset.assetPath),
      assetType: normalizeString(logoAsset.assetType, AssetTypes.LOGO).toUpperCase(),
      overwriteApproved: normalizeBoolean(logoAsset.overwriteApproved, false)
    },
    brandColors: normalizeStringArray(input.brandColors),
    contactInformation: {
      phone: normalizeString(input.contactInformation?.phone),
      email: normalizeString(input.contactInformation?.email),
      website: normalizeString(input.contactInformation?.website),
      address: normalizeString(input.contactInformation?.address)
    },
    serviceAreas: normalizeStringArray(input.serviceAreas),
    services: normalizeStringArray(input.services),
    existingReviews: Array.isArray(input.existingReviews)
      ? input.existingReviews.map(review => ({
        source: normalizeString(review.source),
        reviewer: normalizeString(review.reviewer),
        rating: Number.isFinite(review.rating) ? review.rating : null,
        quote: normalizeString(review.quote)
      }))
      : [],
    certificationsLicenses: normalizeStringArray(input.certificationsLicenses),
    financingOptions: normalizeStringArray(input.financingOptions),
    existingPhotography: Array.isArray(input.existingPhotography)
      ? input.existingPhotography.map(photo => ({
        assetId: normalizeString(photo.assetId),
        assetPath: normalizeString(photo.assetPath),
        caption: normalizeString(photo.caption),
        approved: normalizeBoolean(photo.approved, false)
      }))
      : [],
    notes: normalizeString(input.notes)
  };
}

function createWebsiteCustomizationJob(input = {}) {
  return {
    jobId: normalizeString(input.jobId).toUpperCase(),
    clientId: normalizeString(input.clientId).toUpperCase(),
    templateId: normalizeString(input.templateId).toUpperCase(),
    templateVersion: normalizeString(input.templateVersion),
    brandingPackageId: normalizeString(input.brandingPackageId),
    preserveLayout: normalizeBoolean(input.preserveLayout, true),
    requestedLogoOverwrite: normalizeBoolean(input.requestedLogoOverwrite, false),
    replacementMap: cloneValue(input.replacementMap ?? {}),
    status: normalizeString(input.status, CustomizationStatuses.PENDING).toUpperCase(),
    generatedArtifactPath: normalizeString(input.generatedArtifactPath),
    createdAt: normalizeString(input.createdAt),
    completedAt: normalizeString(input.completedAt)
  };
}

function createQaCheckResult(input = {}) {
  return {
    name: normalizeString(input.name).toUpperCase(),
    status: normalizeString(input.status, QaStatuses.FAIL).toUpperCase(),
    findings: normalizeStringArray(input.findings),
    evidence: cloneValue(input.evidence ?? {})
  };
}

function createWebsiteQaReport(input = {}) {
  const checks = Array.isArray(input.checks) ? input.checks.map(createQaCheckResult) : [];
  const failingChecks = checks.filter(check => check.status === QaStatuses.FAIL).length;

  return {
    qaReportId: normalizeString(input.qaReportId).toUpperCase(),
    jobId: normalizeString(input.jobId).toUpperCase(),
    clientId: normalizeString(input.clientId).toUpperCase(),
    templateId: normalizeString(input.templateId).toUpperCase(),
    status: failingChecks > 0 ? QaStatuses.FAIL : QaStatuses.PASS,
    checks,
    generatedAt: normalizeString(input.generatedAt)
  };
}

function createDeliveryPackage(input = {}) {
  return {
    deliveryId: normalizeString(input.deliveryId).toUpperCase(),
    clientId: normalizeString(input.clientId).toUpperCase(),
    jobId: normalizeString(input.jobId).toUpperCase(),
    websitePackagePath: normalizeString(input.websitePackagePath),
    qaReportPath: normalizeString(input.qaReportPath),
    launchChecklistPath: normalizeString(input.launchChecklistPath),
    clientHandoffSummaryPath: normalizeString(input.clientHandoffSummaryPath),
    status: normalizeString(input.status, DeliveryStatuses.BLOCKED).toUpperCase(),
    deliveredAt: normalizeString(input.deliveredAt)
  };
}

function validateTemplateRegistryEntry(entry = {}) {
  const issues = [];

  if (!entry.templateId) {
    issues.push({ field: 'templateId', issue: 'MISSING_TEMPLATE_ID', severity: 'BLOCKED' });
  }

  if (!entry.displayName) {
    issues.push({ field: 'displayName', issue: 'MISSING_DISPLAY_NAME', severity: 'BLOCKED' });
  }

  if (!entry.activeVersion) {
    issues.push({ field: 'activeVersion', issue: 'MISSING_ACTIVE_VERSION', severity: 'BLOCKED' });
  }

  if (!Array.isArray(entry.versionHistory) || entry.versionHistory.length === 0) {
    issues.push({ field: 'versionHistory', issue: 'MISSING_VERSION_HISTORY', severity: 'BLOCKED' });
  }

  return { isValid: issues.length === 0, issues };
}

function validateClientBrandingPackage(brandingPackage = {}) {
  const issues = [];

  const requiredStringFields = ['clientId', 'companyName'];

  requiredStringFields.forEach(field => {
    if (!normalizeString(brandingPackage[field])) {
      issues.push({ field, issue: `MISSING_${field.toUpperCase()}`, severity: 'BLOCKED' });
    }
  });

  if (!normalizeString(brandingPackage.existingLogo?.assetPath)) {
    issues.push({ field: 'existingLogo.assetPath', issue: 'MISSING_EXISTING_LOGO', severity: 'BLOCKED' });
  }

  if (!Array.isArray(brandingPackage.brandColors) || brandingPackage.brandColors.length === 0) {
    issues.push({ field: 'brandColors', issue: 'MISSING_BRAND_COLORS', severity: 'BLOCKED' });
  }

  if (!Array.isArray(brandingPackage.serviceAreas) || brandingPackage.serviceAreas.length === 0) {
    issues.push({ field: 'serviceAreas', issue: 'MISSING_SERVICE_AREAS', severity: 'BLOCKED' });
  }

  if (!Array.isArray(brandingPackage.services) || brandingPackage.services.length === 0) {
    issues.push({ field: 'services', issue: 'MISSING_SERVICES', severity: 'BLOCKED' });
  }

  return { isValid: issues.length === 0, issues };
}

function validateCustomizationJob(job = {}, brandingPackage = {}) {
  const issues = [];

  if (!job.preserveLayout) {
    issues.push({ field: 'preserveLayout', issue: 'LAYOUT_PRESERVATION_DISABLED', severity: 'BLOCKED' });
  }

  if (job.requestedLogoOverwrite && !brandingPackage.existingLogo?.overwriteApproved) {
    issues.push({
      field: 'requestedLogoOverwrite',
      issue: 'LOGO_OVERWRITE_NOT_APPROVED',
      severity: 'BLOCKED'
    });
  }

  if (!job.templateId || !job.templateVersion) {
    issues.push({ field: 'templateVersion', issue: 'MISSING_TEMPLATE_SELECTION', severity: 'BLOCKED' });
  }

  return { isValid: issues.length === 0, issues };
}

function validateQaReport(qaReport = {}) {
  const issues = [];
  const checkMap = new Map((qaReport.checks ?? []).map(check => [check.name, check]));

  QaCheckNames.forEach(name => {
    if (!checkMap.has(name)) {
      issues.push({ field: 'checks', issue: `MISSING_${name}`, severity: 'BLOCKED' });
    }
  });

  const failedChecks = (qaReport.checks ?? []).filter(check => check.status === QaStatuses.FAIL);
  if (failedChecks.length > 0) {
    issues.push({ field: 'status', issue: 'QA_FAILED', severity: 'BLOCKED' });
  }

  return { isValid: issues.length === 0, issues };
}

function validateDeliveryPackage(deliveryPackage = {}) {
  const issues = [];

  const requiredArtifacts = [
    'websitePackagePath',
    'qaReportPath',
    'launchChecklistPath',
    'clientHandoffSummaryPath'
  ];

  requiredArtifacts.forEach(field => {
    if (!normalizeString(deliveryPackage[field])) {
      issues.push({ field, issue: `MISSING_${field.toUpperCase()}`, severity: 'BLOCKED' });
    }
  });

  return { isValid: issues.length === 0, issues };
}

module.exports = {
  TemplateApprovalStates,
  AssetTypes,
  CustomizationStatuses,
  QaCheckNames,
  QaStatuses,
  DeliveryStatuses,
  createTemplateVersion,
  createWebsiteTemplateRegistryEntry,
  createClientBrandingPackage,
  createWebsiteCustomizationJob,
  createQaCheckResult,
  createWebsiteQaReport,
  createDeliveryPackage,
  validateTemplateRegistryEntry,
  validateClientBrandingPackage,
  validateCustomizationJob,
  validateQaReport,
  validateDeliveryPackage
};
