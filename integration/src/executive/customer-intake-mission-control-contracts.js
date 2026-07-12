export const MissionTypes = Object.freeze({
  WEBSITE_BUILD: 'WEBSITE_BUILD'
});

export const MissionExecutiveStatuses = Object.freeze({
  ACTIVE: 'ACTIVE',
  AWAITING_EXECUTIVE_REVIEW: 'AWAITING_EXECUTIVE_REVIEW',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED'
});

export const CustomerStatuses = Object.freeze({
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
  INTAKE_REVIEW: 'INTAKE_REVIEW',
  BLOCKED: 'BLOCKED'
});

export function createCustomerIntakeRequest({
  companyName,
  contactName,
  email,
  phone,
  website,
  industry,
  missionType = MissionTypes.WEBSITE_BUILD,
  adapterType = 'FRAMER',
  providerHint = 'FRAMER_SANDBOX',
  existingBranding = {}
} = {}) {
  return {
    companyName,
    contactName,
    email,
    phone,
    website,
    industry,
    missionType,
    adapterType,
    providerHint,
    existingBranding
  };
}

export function validateCustomerIntakeRequest(request = {}) {
  const issues = [];

  if (!request.companyName || String(request.companyName).trim().length === 0) {
    issues.push('companyName is required.');
  }

  if (!request.contactName || String(request.contactName).trim().length === 0) {
    issues.push('contactName is required.');
  }

  if (!request.email || String(request.email).trim().length === 0) {
    issues.push('email is required.');
  }

  if (!request.phone || String(request.phone).trim().length === 0) {
    issues.push('phone is required.');
  }

  const website = String(request.website ?? '').trim();
  if (website.length === 0) {
    issues.push('website is required.');
  } else {
    try {
      const parsed = new URL(website);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push('website must use http or https protocol.');
      }
    } catch {
      issues.push('website must be a valid absolute URL.');
    }
  }

  if (!request.industry || String(request.industry).trim().length === 0) {
    issues.push('industry is required.');
  }

  const missionType = String(request.missionType ?? '').toUpperCase().trim();
  if (!Object.values(MissionTypes).includes(missionType)) {
    issues.push(`missionType must be one of: ${Object.values(MissionTypes).join(', ')}.`);
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
