const ValidationSeverities = Object.freeze({
  BLOCKED: 'BLOCKED',
  WARNING: 'WARNING'
});

const ConfidenceBands = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

const RequiredAssetFields = Object.freeze([
  'logo',
  'images',
  'contactInformation',
  'reviews',
  'colors'
]);

function normalizeString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(item => normalizeString(item)).filter(Boolean);
}

function normalizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function normalizeReview(review = {}) {
  return {
    source: normalizeString(review.source),
    reviewer: normalizeString(review.reviewer),
    rating: Number.isFinite(review.rating) ? review.rating : null,
    quote: normalizeString(review.quote),
    reviewUrl: normalizeString(review.reviewUrl)
  };
}

function normalizeSocialLinks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const links = {};
  Object.keys(value).forEach(key => {
    const normalized = normalizeString(value[key]);
    if (normalized) {
      links[key] = normalized;
    }
  });
  return links;
}

function deriveConfidence(score) {
  if (score >= 0.8) {
    return ConfidenceBands.HIGH;
  }

  if (score >= 0.55) {
    return ConfidenceBands.MEDIUM;
  }

  return ConfidenceBands.LOW;
}

function scoreTextField(value, options = {}) {
  const minimumLength = options.minimumLength ?? 3;
  const fieldValue = normalizeString(value);

  if (!fieldValue) {
    return 0;
  }

  if (fieldValue.length >= minimumLength * 2) {
    return 0.95;
  }

  if (fieldValue.length >= minimumLength) {
    return 0.72;
  }

  return 0.4;
}

function scoreArrayField(values, options = {}) {
  const minItems = options.minItems ?? 1;
  const list = normalizeStringArray(values);

  if (list.length === 0) {
    return 0;
  }

  if (list.length >= minItems * 2) {
    return 0.9;
  }

  if (list.length >= minItems) {
    return 0.7;
  }

  return 0.45;
}

function scoreObjectField(value, requiredKeys = []) {
  const objectValue = normalizeObject(value);

  if (requiredKeys.length === 0) {
    return Object.keys(objectValue).length > 0 ? 0.8 : 0;
  }

  const populated = requiredKeys.filter(key => normalizeString(objectValue[key])).length;

  if (populated === 0) {
    return 0;
  }

  if (populated === requiredKeys.length) {
    return 0.95;
  }

  return 0.6;
}

function buildConfidenceEntry(field, score) {
  const rounded = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  return {
    field,
    score: rounded,
    band: deriveConfidence(rounded),
    uncertain: rounded < 0.55
  };
}

function createCompanyResearchModule(input = {}) {
  return {
    websiteUrl: normalizeString(input.websiteUrl),
    companyName: normalizeString(input.companyName),
    logo: {
      assetId: normalizeString(input.logo?.assetId),
      assetPath: normalizeString(input.logo?.assetPath),
      sourceUrl: normalizeString(input.logo?.sourceUrl)
    },
    primaryColors: normalizeStringArray(input.primaryColors),
    contactInformation: {
      phone: normalizeString(input.contactInformation?.phone),
      email: normalizeString(input.contactInformation?.email),
      website: normalizeString(input.contactInformation?.website),
      address: normalizeString(input.contactInformation?.address)
    },
    serviceList: normalizeStringArray(input.serviceList),
    serviceAreas: normalizeStringArray(input.serviceAreas),
    existingMessaging: normalizeString(input.existingMessaging),
    certifications: normalizeStringArray(input.certifications),
    financingOptions: normalizeStringArray(input.financingOptions),
    existingReviews: Array.isArray(input.existingReviews)
      ? input.existingReviews.map(normalizeReview)
      : [],
    socialLinks: normalizeSocialLinks(input.socialLinks),
    images: Array.isArray(input.images)
      ? input.images.map(image => ({
        assetId: normalizeString(image.assetId),
        assetPath: normalizeString(image.assetPath),
        sourceUrl: normalizeString(image.sourceUrl),
        caption: normalizeString(image.caption)
      }))
      : []
  };
}

function scoreCompanyResearchModule(module = {}) {
  const scores = [
    buildConfidenceEntry('websiteUrl', scoreTextField(module.websiteUrl, { minimumLength: 10 })),
    buildConfidenceEntry('companyName', scoreTextField(module.companyName, { minimumLength: 3 })),
    buildConfidenceEntry('logo', scoreTextField(module.logo?.assetPath, { minimumLength: 5 })),
    buildConfidenceEntry('primaryColors', scoreArrayField(module.primaryColors, { minItems: 2 })),
    buildConfidenceEntry('contactInformation', scoreObjectField(module.contactInformation, ['phone', 'email', 'address'])),
    buildConfidenceEntry('serviceList', scoreArrayField(module.serviceList, { minItems: 3 })),
    buildConfidenceEntry('serviceAreas', scoreArrayField(module.serviceAreas, { minItems: 2 })),
    buildConfidenceEntry('existingMessaging', scoreTextField(module.existingMessaging, { minimumLength: 20 })),
    buildConfidenceEntry('certifications', scoreArrayField(module.certifications, { minItems: 1 })),
    buildConfidenceEntry('financingOptions', scoreArrayField(module.financingOptions, { minItems: 1 })),
    buildConfidenceEntry('existingReviews', scoreArrayField(module.existingReviews.map(review => review.quote), { minItems: 2 })),
    buildConfidenceEntry('socialLinks', scoreObjectField(module.socialLinks, [])),
    buildConfidenceEntry('images', scoreArrayField(module.images.map(image => image.assetPath), { minItems: 3 }))
  ];

  const uncertainFields = scores.filter(entry => entry.uncertain).map(entry => entry.field);
  const aggregateScore = Number((scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length).toFixed(2));

  return {
    aggregateScore,
    aggregateBand: deriveConfidence(aggregateScore),
    scores,
    uncertainFields
  };
}

function createBrandAssetPackage({ researchModule = {}, clientId = '' } = {}) {
  return {
    clientId: normalizeString(clientId).toUpperCase(),
    companyName: researchModule.companyName,
    logoAsset: {
      assetId: researchModule.logo?.assetId ?? '',
      assetPath: researchModule.logo?.assetPath ?? '',
      assetType: 'LOGO',
      overwriteApproved: false
    },
    brandColors: normalizeStringArray(researchModule.primaryColors),
    contactInformation: {
      phone: normalizeString(researchModule.contactInformation?.phone),
      email: normalizeString(researchModule.contactInformation?.email),
      website: normalizeString(researchModule.contactInformation?.website || researchModule.websiteUrl),
      address: normalizeString(researchModule.contactInformation?.address)
    },
    serviceAreas: normalizeStringArray(researchModule.serviceAreas),
    services: normalizeStringArray(researchModule.serviceList),
    existingReviews: Array.isArray(researchModule.existingReviews) ? researchModule.existingReviews : [],
    certificationsLicenses: normalizeStringArray(researchModule.certifications),
    financingOptions: normalizeStringArray(researchModule.financingOptions),
    existingPhotography: Array.isArray(researchModule.images)
      ? researchModule.images.map(photo => ({
        assetId: normalizeString(photo.assetId),
        assetPath: normalizeString(photo.assetPath),
        caption: normalizeString(photo.caption),
        approved: false
      }))
      : [],
    socialLinks: normalizeSocialLinks(researchModule.socialLinks),
    notes: normalizeString(researchModule.existingMessaging)
  };
}

function createAssetValidationReport({ researchModule = {}, confidence = null } = {}) {
  const missingAssets = [];

  if (!normalizeString(researchModule.logo?.assetPath)) {
    missingAssets.push('logo');
  }

  if (!Array.isArray(researchModule.images) || researchModule.images.length === 0) {
    missingAssets.push('images');
  }

  const contact = researchModule.contactInformation ?? {};
  const hasContact = normalizeString(contact.phone) || normalizeString(contact.email) || normalizeString(contact.address);
  if (!hasContact) {
    missingAssets.push('contactInformation');
  }

  if (!Array.isArray(researchModule.existingReviews) || researchModule.existingReviews.length === 0) {
    missingAssets.push('reviews');
  }

  if (!Array.isArray(researchModule.primaryColors) || researchModule.primaryColors.length === 0) {
    missingAssets.push('colors');
  }

  const findings = missingAssets.map(field => ({
    field,
    severity: field === 'logo' || field === 'contactInformation' ? ValidationSeverities.BLOCKED : ValidationSeverities.WARNING,
    message: `Missing required asset: ${field}.`
  }));

  const uncertainFindings = (confidence?.uncertainFields ?? []).map(field => ({
    field,
    severity: ValidationSeverities.WARNING,
    message: `Low-confidence extraction for ${field}.`
  }));

  return {
    requiredAssetFields: [...RequiredAssetFields],
    missingAssets,
    findings: [...findings, ...uncertainFindings],
    isComplete: missingAssets.length === 0,
    blocked: findings.some(item => item.severity === ValidationSeverities.BLOCKED)
  };
}

function createExecutiveSummary({ researchModule = {}, confidence = null, validation = null } = {}) {
  const strengths = [];

  if ((confidence?.aggregateScore ?? 0) >= 0.8) {
    strengths.push('High-confidence business profile extracted.');
  }

  if ((researchModule.existingReviews ?? []).length >= 3) {
    strengths.push('Existing social proof is strong and reusable.');
  }

  if ((researchModule.serviceList ?? []).length >= 4) {
    strengths.push('Service taxonomy is detailed enough for conversion-focused page sections.');
  }

  if ((researchModule.primaryColors ?? []).length >= 2) {
    strengths.push('Brand color system detected for immediate theme alignment.');
  }

  const readinessScoreRaw = Math.max(0, Math.min(100,
    Math.round(((confidence?.aggregateScore ?? 0) * 70) + ((validation?.isComplete ? 1 : 0) * 20) - ((validation?.blocked ? 1 : 0) * 20) + 10)
  ));

  const overview = normalizeString(researchModule.existingMessaging)
    || `${normalizeString(researchModule.companyName)} serves ${normalizeStringArray(researchModule.serviceAreas).join(', ')}.`;

  return {
    businessOverview: overview,
    brandStrengths: strengths,
    missingAssets: validation?.missingAssets ?? [],
    customizationReadinessScore: readinessScoreRaw,
    readinessClassification: readinessScoreRaw >= 80 ? 'READY' : readinessScoreRaw >= 60 ? 'CONDITIONAL' : 'NOT_READY'
  };
}

module.exports = {
  ValidationSeverities,
  ConfidenceBands,
  RequiredAssetFields,
  createCompanyResearchModule,
  scoreCompanyResearchModule,
  createBrandAssetPackage,
  createAssetValidationReport,
  createExecutiveSummary
};
