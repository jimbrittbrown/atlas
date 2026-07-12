import { createCompositionPolicy, validateCompositionPolicy } from './composition-policy-contracts.js';

export function createProductionProfile({
  profileId,
  name,
  description = '',
  compositionPolicy = {}
} = {}) {
  return {
    profileId,
    name,
    description,
    compositionPolicy: createCompositionPolicy(compositionPolicy)
  };
}

export function validateProductionProfile(profile = {}) {
  const issues = [];

  if (typeof profile.profileId !== 'string' || profile.profileId.trim().length === 0) {
    issues.push({ field: 'profileId', issue: 'MISSING_PROFILE_ID' });
  }

  if (typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    issues.push({ field: 'name', issue: 'MISSING_PROFILE_NAME' });
  }

  const policyValidation = validateCompositionPolicy(profile.compositionPolicy ?? {});
  if (!policyValidation.isValid) {
    issues.push(...policyValidation.issues.map(issue => ({
      field: `compositionPolicy.${issue.field}`,
      issue: issue.issue
    })));
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
