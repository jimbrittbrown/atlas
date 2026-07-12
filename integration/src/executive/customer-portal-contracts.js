import { randomUUID } from 'node:crypto';

export const CustomerPortalMissionType = 'WEBSITE_BUILD';

export function createCustomerPortalSession({
  customerId,
  accountId,
  sessionId,
  stripeCustomerId = null,
  createdAt = new Date().toISOString()
} = {}) {
  return {
    sessionId: sessionId ?? `cps_${randomUUID()}`,
    customerId,
    accountId,
    stripeCustomerId,
    createdAt,
    lastSeenAt: createdAt
  };
}

export function createCustomerPortalWebsiteRequest({
  requestId,
  customerId = null,
  businessName,
  businessType,
  websiteUrl = null,
  contactName,
  email,
  phone,
  targetAudience,
  businessDescription,
  goals = [],
  budget = null,
  timeline = null,
  preferredStyle = null,
  preferredColors = [],
  desiredPages = [],
  specialFeatures = [],
  competitors = [],
  notes = null,
  logoUpload = null,
  imageUploads = [],
  brandAssetsUpload = [],
  timestamp = new Date().toISOString(),
  requestedBy = 'CUSTOMER_PORTAL',
  accountId = null,
  sessionId = null
} = {}) {
  return {
    requestId: requestId ?? `cpr_${randomUUID()}`,
    customerId,
    businessName,
    businessType,
    websiteUrl,
    contactName,
    email,
    phone,
    targetAudience,
    businessDescription,
    goals,
    budget,
    timeline,
    preferredStyle,
    preferredColors,
    desiredPages,
    specialFeatures,
    competitors,
    notes,
    logoUpload,
    imageUploads,
    brandAssetsUpload,
    timestamp,
    requestedBy,
    accountId,
    sessionId
  };
}

export function validateCustomerPortalWebsiteRequest(input = {}) {
  const issues = [];

  if (!input.businessName || String(input.businessName).trim().length === 0) {
    issues.push('businessName is required.');
  }

  if (!input.businessType || String(input.businessType).trim().length === 0) {
    issues.push('businessType is required.');
  }

  if (!input.contactName || String(input.contactName).trim().length === 0) {
    issues.push('contactName is required.');
  }

  if (!input.email || String(input.email).trim().length === 0) {
    issues.push('email is required.');
  }

  if (!input.phone || String(input.phone).trim().length === 0) {
    issues.push('phone is required.');
  }

  if (!input.targetAudience || String(input.targetAudience).trim().length === 0) {
    issues.push('targetAudience is required.');
  }

  if (!input.businessDescription || String(input.businessDescription).trim().length === 0) {
    issues.push('businessDescription is required.');
  }

  if (!Array.isArray(input.goals) || input.goals.length === 0) {
    issues.push('goals must contain at least one entry.');
  }

  if (!input.budget || String(input.budget).trim().length === 0) {
    issues.push('budget is required.');
  }

  if (!input.timeline || String(input.timeline).trim().length === 0) {
    issues.push('timeline is required.');
  }

  if (!Array.isArray(input.desiredPages) || input.desiredPages.length === 0) {
    issues.push('desiredPages must contain at least one page.');
  }

  if (input.websiteUrl) {
    try {
      const parsed = new URL(String(input.websiteUrl));
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push('websiteUrl must use http or https protocol.');
      }
    } catch {
      issues.push('websiteUrl must be a valid absolute URL when provided.');
    }
  }

  if (!input.timestamp || Number.isNaN(Date.parse(String(input.timestamp)))) {
    issues.push('timestamp must be a valid ISO timestamp.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function createCustomerPortalLoginRequest({
  email,
  customerId = null,
  accountId = null,
  sessionId = null,
  timestamp = new Date().toISOString()
} = {}) {
  return {
    email,
    customerId,
    accountId,
    sessionId,
    timestamp
  };
}

export function validateCustomerPortalLoginRequest(input = {}) {
  const issues = [];

  if (!input.email || String(input.email).trim().length === 0) {
    issues.push('email is required.');
  }

  if (!input.timestamp || Number.isNaN(Date.parse(String(input.timestamp)))) {
    issues.push('timestamp must be a valid ISO timestamp.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function createCustomerPortalRevisionRequest({
  missionId,
  reason,
  requestedBy,
  notes = null,
  timestamp = new Date().toISOString()
} = {}) {
  return {
    missionId,
    reason,
    requestedBy,
    notes,
    timestamp
  };
}

export function validateCustomerPortalRevisionRequest(input = {}) {
  const issues = [];

  if (!input.missionId || String(input.missionId).trim().length === 0) {
    issues.push('missionId is required.');
  }

  if (!input.reason || String(input.reason).trim().length === 0) {
    issues.push('reason is required.');
  }

  if (!input.requestedBy || String(input.requestedBy).trim().length === 0) {
    issues.push('requestedBy is required.');
  }

  if (!input.timestamp || Number.isNaN(Date.parse(String(input.timestamp)))) {
    issues.push('timestamp must be a valid ISO timestamp.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
