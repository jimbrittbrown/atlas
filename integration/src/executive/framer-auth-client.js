import { FramerAdapterError } from './framer-error-normalizer.js';

export class FramerAuthClient {
  constructor({ config } = {}) {
    this.config = config ?? {};
  }

  getApiKey() {
    const apiKey = String(this.config.apiKey ?? '').trim();

    if (!apiKey) {
      throw new FramerAdapterError({
        message: `Missing API key. Set ${this.config.apiKeyEnvVarName ?? 'FRAMER_API_KEY'}.`,
        code: 'FRAMER_AUTH_ERROR',
        retryable: false,
        stage: 'AUTH',
        operation: 'resolve-api-key'
      });
    }

    return apiKey;
  }

  getProjectUrl() {
    const projectUrl = String(this.config.projectUrl ?? '').trim();

    if (!projectUrl) {
      throw new FramerAdapterError({
        message: 'Missing Framer project URL. Set FRAMER_PROJECT_URL.',
        code: 'FRAMER_VALIDATION_ERROR',
        retryable: false,
        stage: 'AUTH',
        operation: 'resolve-project-url'
      });
    }

    return projectUrl;
  }

  authenticate() {
    return {
      projectUrl: this.getProjectUrl(),
      apiKey: this.getApiKey()
    };
  }
}
