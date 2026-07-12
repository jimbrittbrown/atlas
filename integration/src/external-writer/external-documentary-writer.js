import {
  createExternalWriterInput,
  validateExternalWriterInput
} from './external-documentary-writer-contract.js';
import { ExternalDocumentaryWriterProviderRegistry } from './external-documentary-writer-provider-registry.js';

export class ExternalDocumentaryWriter {
  constructor({ providerRegistry = null } = {}) {
    this.providerRegistry = providerRegistry ?? new ExternalDocumentaryWriterProviderRegistry();
  }

  registerProvider(provider) {
    return this.providerRegistry.register(provider);
  }

  listProviders() {
    return this.providerRegistry.list();
  }

  resolveProvider({ preferredProvider = null } = {}) {
    const providerId = String(preferredProvider ?? '').trim();
    if (providerId.length === 0) {
      throw new Error('External documentary writer requires explicit preferredProvider.');
    }

    const provider = this.providerRegistry.get(providerId);
    if (!provider.isConfigured()) {
      const missing = Array.isArray(provider?.requiredEnvironmentVariables?.())
        ? provider.requiredEnvironmentVariables()
        : [];
      throw new Error(`Provider ${providerId} is not configured. Missing: ${missing.join(', ')}`);
    }

    return provider;
  }

  async generateScreenplay({
    preferredProvider = null,
    input = {}
  } = {}) {
    const normalizedInput = createExternalWriterInput(input);
    const validation = validateExternalWriterInput(normalizedInput);

    if (!validation.isValid) {
      throw new Error(`External writer input invalid. Missing: ${validation.missing.join(', ')}`);
    }

    const provider = this.resolveProvider({ preferredProvider });
    const execution = await provider.execute({ input: normalizedInput });

    return {
      selectedProvider: provider.identity(),
      selectedModel: execution?.normalizedResult?.modelIdentity ?? null,
      input: normalizedInput,
      rawProviderResponse: execution?.rawProviderResponse ?? null,
      result: execution?.normalizedResult ?? null
    };
  }
}
