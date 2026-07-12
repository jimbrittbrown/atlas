import {
  createExternalWriterResult,
  validateExternalWriterResult
} from '../../external-writer/external-documentary-writer-contract.js';
import {
  buildDocumentaryWriterPrompt,
  estimateNarrationRuntime,
  extractFactualClaims
} from './documentary-writer-prompt.js';

export class OpenAIDocumentaryWriterAdapter {
  constructor({
    apiKey = process.env.OPENAI_API_KEY ?? null,
    model = process.env.OPENAI_WRITER_MODEL ?? 'gpt-5.1',
    baseUrl = 'https://api.openai.com/v1',
    timeoutMs = 90000,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : null;
    this.model = String(model ?? 'gpt-5.1').trim();
    this.baseUrl = String(baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.timeoutMs = Number(timeoutMs ?? 90000);
    this.fetchImpl = fetchImpl;
  }

  identity() {
    return 'openai';
  }

  modelIdentity() {
    return this.model;
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  requiredEnvironmentVariables() {
    return ['OPENAI_API_KEY'];
  }

  async execute({ input }) {
    if (!this.isConfigured()) {
      throw new Error('OpenAI adapter is not configured. Missing OPENAI_API_KEY.');
    }

    const payload = {
      model: this.model,
      temperature: 0.3,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You are an elite documentary screenwriter.',
                'Return one complete, coherent, audience-facing documentary screenplay.',
                'Do not return bullet templates, planning notes, or JSON wrappers.',
                'Preserve factual integrity and do not invent unsupported claims.'
              ].join(' ')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildDocumentaryWriterPrompt(input)
            }
          ]
        }
      ]
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = String(body?.error?.message ?? `OpenAI request failed: HTTP ${response.status}`);
      throw new Error(message);
    }

    const screenplay = String(body?.output_text ?? '').trim();

    const normalizedResult = createExternalWriterResult({
      providerIdentity: this.identity(),
      modelIdentity: this.model,
      screenplay,
      estimatedNarrationRuntime: estimateNarrationRuntime(screenplay),
      factualClaims: extractFactualClaims(screenplay),
      providerWarnings: screenplay.length < 300 ? ['Screenplay appears shorter than expected.'] : [],
      generationMetadata: {
        endpoint: '/responses',
        id: body?.id ?? null,
        created: body?.created_at ?? null,
        status: body?.status ?? null
      },
      usage: body?.usage ?? null
    });

    const validation = validateExternalWriterResult(normalizedResult);
    if (!validation.isValid) {
      throw new Error(`External writer result invalid: ${validation.issues.join(' | ')}`);
    }

    return {
      rawProviderResponse: body,
      normalizedResult
    };
  }
}
