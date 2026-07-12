function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createFramerAdapterConfigFromEnv(env = process.env) {
  return {
    projectUrl: env.FRAMER_PROJECT_URL ?? '',
    apiKey: env.FRAMER_API_KEY ?? '',
    apiKeyEnvVarName: 'FRAMER_API_KEY',
    readOnly: parseBoolean(env.FRAMER_READ_ONLY, true),
    liveMode: parseBoolean(env.FRAMER_LIVE_MODE, false),
    dryRun: parseBoolean(env.FRAMER_DRY_RUN, true),
    allowPreviewPublish: parseBoolean(env.FRAMER_ALLOW_PREVIEW_PUBLISH, false),
    allowProductionDeploy: parseBoolean(env.FRAMER_ALLOW_PRODUCTION_DEPLOY, false),
    allowProjectDuplication: parseBoolean(env.FRAMER_ALLOW_PROJECT_DUPLICATION, false),
    maxRetries: parseInteger(env.FRAMER_MAX_RETRIES, 2),
    retryDelayMs: parseInteger(env.FRAMER_RETRY_DELAY_MS, 250),
    requestTimeoutMs: parseInteger(env.FRAMER_REQUEST_TIMEOUT_MS, 30000),
    externalAgentEnabled: parseBoolean(env.FRAMER_EXTERNAL_AGENT_ENABLED, true),
    pluginFallbackEnabled: parseBoolean(env.FRAMER_PLUGIN_FALLBACK_ENABLED, true)
  };
}

export function validateFramerAdapterConfig(config = {}) {
  const issues = [];

  if (!config.projectUrl || String(config.projectUrl).trim().length === 0) {
    issues.push('FRAMER_PROJECT_URL is required.');
  }

  if (!config.apiKey || String(config.apiKey).trim().length === 0) {
    issues.push('FRAMER_API_KEY is required.');
  }

  if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) {
    issues.push('FRAMER_MAX_RETRIES must be an integer >= 0.');
  }

  if (!Number.isInteger(config.retryDelayMs) || config.retryDelayMs < 0) {
    issues.push('FRAMER_RETRY_DELAY_MS must be an integer >= 0.');
  }

  if (config.readOnly === true && config.allowProductionDeploy === true) {
    issues.push('FRAMER_ALLOW_PRODUCTION_DEPLOY cannot be true when FRAMER_READ_ONLY is true.');
  }

  if (config.readOnly === true && config.allowPreviewPublish === true) {
    issues.push('FRAMER_ALLOW_PREVIEW_PUBLISH cannot be true when FRAMER_READ_ONLY is true.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function redactFramerConfig(config = {}) {
  return {
    ...config,
    apiKey: config.apiKey ? '***REDACTED***' : ''
  };
}
