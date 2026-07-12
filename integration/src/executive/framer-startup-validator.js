import { createFramerAdapterConfigFromEnv, redactFramerConfig, validateFramerAdapterConfig } from './framer-adapter-config.js';

function hasWhitespace(value) {
  return /\s/.test(String(value ?? ''));
}

export function validateFramerProjectUrlFormat(projectUrl) {
  const issues = [];

  if (!projectUrl || String(projectUrl).trim().length === 0) {
    issues.push('FRAMER_PROJECT_URL is required.');
    return {
      isValid: false,
      issues
    };
  }

  let parsed;
  try {
    parsed = new URL(String(projectUrl));
  } catch {
    issues.push('FRAMER_PROJECT_URL must be a valid absolute URL.');
    return {
      isValid: false,
      issues
    };
  }

  if (parsed.protocol !== 'https:') {
    issues.push('FRAMER_PROJECT_URL must use https protocol.');
  }

  const host = String(parsed.hostname).toLowerCase();
  if (!(host === 'framer.com' || host.endsWith('.framer.com'))) {
    issues.push('FRAMER_PROJECT_URL host must be framer.com.');
  }

  if (!String(parsed.pathname).includes('/projects/')) {
    issues.push('FRAMER_PROJECT_URL should target a /projects/ path.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function validateFramerApiKeyFormat(apiKey) {
  const issues = [];
  const key = String(apiKey ?? '').trim();

  if (key.length === 0) {
    issues.push('FRAMER_API_KEY is required.');
    return {
      isValid: false,
      issues
    };
  }

  if (hasWhitespace(key)) {
    issues.push('FRAMER_API_KEY must not contain whitespace.');
  }

  if (key.length < 16) {
    issues.push('FRAMER_API_KEY appears too short to be valid (minimum 16 characters).');
  }

  if (/[^\x21-\x7E]/.test(key)) {
    issues.push('FRAMER_API_KEY must contain printable ASCII characters only.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function validateFramerRequiredEnvironment(env = process.env) {
  const required = [
    'FRAMER_PROJECT_URL',
    'FRAMER_API_KEY',
    'FRAMER_READ_ONLY',
    'FRAMER_LIVE_MODE',
    'FRAMER_DRY_RUN',
    'FRAMER_ALLOW_PREVIEW_PUBLISH',
    'FRAMER_ALLOW_PRODUCTION_DEPLOY',
    'FRAMER_ALLOW_PROJECT_DUPLICATION'
  ];

  const missing = required.filter((name) => {
    const value = env[name];
    return value === undefined || value === null || String(value).trim().length === 0;
  });

  return {
    required,
    missing,
    isComplete: missing.length === 0
  };
}

export function runFramerStartupValidation(env = process.env) {
  const config = createFramerAdapterConfigFromEnv(env);
  const configValidation = validateFramerAdapterConfig(config);
  const requiredValidation = validateFramerRequiredEnvironment(env);
  const projectUrlValidation = validateFramerProjectUrlFormat(config.projectUrl);
  const apiKeyValidation = validateFramerApiKeyFormat(config.apiKey);

  const issues = [
    ...configValidation.issues,
    ...requiredValidation.missing.map((name) => `${name} is missing.`),
    ...projectUrlValidation.issues,
    ...apiKeyValidation.issues
  ];

  return {
    ok: issues.length === 0,
    issues,
    checks: {
      environmentComplete: requiredValidation.isComplete,
      apiKeyFormatValid: apiKeyValidation.isValid,
      projectUrlFormatValid: projectUrlValidation.isValid,
      configValid: configValidation.isValid
    },
    redactedConfig: redactFramerConfig(config),
    requiredVariables: requiredValidation.required,
    missingVariables: requiredValidation.missing
  };
}
