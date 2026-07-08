import test from 'node:test';
import assert from 'node:assert/strict';
import { SecretManager } from '../src/infrastructure/secret-manager.js';
import { ConfigurationService } from '../src/infrastructure/configuration-service.js';
import { ProductionAdapter } from '../src/infrastructure/production-adapter.js';

class TestProviderAdapter extends ProductionAdapter {
  constructor({ responses = [], ...options } = {}) {
    super({ providerId: 'test-provider', ...options });
    this.responses = responses;
    this.authenticateCalls = [];
    this.executeCalls = [];
  }

  async authenticate(context) {
    this.authenticateCalls.push(context);
    return { authorized: true };
  }

  async execute(context) {
    this.executeCalls.push(context);
    const next = this.responses.shift();

    if (typeof next === 'function') {
      return next(context);
    }

    if (next instanceof Error) {
      throw next;
    }

    return next ?? { output: 'default-output' };
  }

  normalizeResponse(rawResponse) {
    return {
      output: rawResponse.output ?? 'normalized-output'
    };
  }
}

function createConfigurationService({ env = {}, providerConfiguration = {} } = {}) {
  const secretManager = new SecretManager({
    environment: 'testing',
    env
  });

  secretManager.registerProviderSchema('test-provider', {
    required: ['apiKey'],
    envMap: {
      apiKey: 'TEST_PROVIDER_API_KEY'
    }
  });

  const configurationService = new ConfigurationService({
    environment: 'testing',
    secretManager
  });

  configurationService.registerProviderConfiguration('test-provider', {
    endpoint: providerConfiguration.endpoint ?? 'https://provider.testing/api',
    retryPolicy: providerConfiguration.retryPolicy ?? { maxRetries: 0, baseDelayMs: 1 },
    timeoutMs: providerConfiguration.timeoutMs ?? 20,
    rateLimit: providerConfiguration.rateLimit ?? { requestsPerMinute: 100 },
    requiredSecrets: ['apiKey']
  });

  return {
    configurationService,
    secretManager
  };
}

test('production adapter retries retriable failures and succeeds', async () => {
  const { configurationService } = createConfigurationService({
    env: {
      TEST_PROVIDER_API_KEY: 'secret-key'
    },
    providerConfiguration: {
      retryPolicy: { maxRetries: 1, baseDelayMs: 1 }
    }
  });
  const adapter = new TestProviderAdapter({
    configurationService,
    sleep: async () => {},
    responses: [
      () => {
        const error = new Error('Transient provider outage');
        error.status = 503;
        throw error;
      },
      { output: 'recovered-output' }
    ]
  });

  const response = await adapter.run({ operation: 'generate' });

  assert.equal(response.output, 'recovered-output');
  assert.equal(adapter.executeCalls.length, 2);
  assert.equal(adapter.getHealthReport().status, 'HEALTHY');
});

test('production adapter fails with normalized timeout error', async () => {
  const { configurationService } = createConfigurationService({
    env: {
      TEST_PROVIDER_API_KEY: 'secret-key'
    },
    providerConfiguration: {
      timeoutMs: 5,
      retryPolicy: { maxRetries: 0, baseDelayMs: 1 }
    }
  });
  const adapter = new TestProviderAdapter({
    configurationService,
    responses: [() => new Promise(() => {})]
  });

  await assert.rejects(
    adapter.run({ operation: 'generate' }),
    error => {
      assert.equal(error.name, 'ProductionAdapterError');
      assert.equal(error.details.code, 'TIMEOUT');
      assert.equal(error.details.timeout, true);
      return true;
    }
  );
});

test('production adapter injects provider configuration into execute context', async () => {
  const { configurationService } = createConfigurationService({
    env: {
      TEST_PROVIDER_API_KEY: 'secret-key'
    },
    providerConfiguration: {
      endpoint: 'https://custom.provider/api/v2',
      timeoutMs: 25,
      retryPolicy: { maxRetries: 0, baseDelayMs: 1 },
      rateLimit: { requestsPerMinute: 88 }
    }
  });
  const adapter = new TestProviderAdapter({
    configurationService,
    responses: [context => ({
      output: `${context.configuration.endpoint}|${context.configuration.timeoutMs}|${context.configuration.rateLimit.requestsPerMinute}`
    })]
  });

  const response = await adapter.run({ operation: 'generate' });

  assert.equal(response.output, 'https://custom.provider/api/v2|25|88');
});

test('production adapter resolves required secrets for provider execution', async () => {
  const { configurationService } = createConfigurationService({
    env: {
      TEST_PROVIDER_API_KEY: 'very-secret-key'
    }
  });
  const adapter = new TestProviderAdapter({
    configurationService,
    responses: [context => ({
      output: context.secrets.configuredSecrets.apiKey.value
    })]
  });

  const response = await adapter.run({ operation: 'generate' });

  assert.equal(response.output, 'very-secret-key');
  assert.equal(adapter.authenticateCalls.length, 1);
  assert.equal(adapter.authenticateCalls[0].secrets.configuredSecrets.apiKey.configured, true);
});

test('production adapter normalizes non-retriable errors', async () => {
  const { configurationService } = createConfigurationService({
    env: {
      TEST_PROVIDER_API_KEY: 'secret-key'
    }
  });
  const adapter = new TestProviderAdapter({
    configurationService,
    responses: [() => {
      throw new Error('Unexpected response format');
    }]
  });

  await assert.rejects(
    adapter.run({ operation: 'generate' }),
    error => {
      assert.equal(error.name, 'ProductionAdapterError');
      assert.equal(error.details.code, 'PROVIDER_EXECUTION_FAILED');
      assert.equal(error.details.retriable, false);
      assert.equal(error.details.providerId, 'test-provider');
      return true;
    }
  );
});
