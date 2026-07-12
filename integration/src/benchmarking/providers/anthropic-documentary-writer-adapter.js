import {
  createExternalWriterResult,
  validateExternalWriterResult
} from '../../external-writer/external-documentary-writer-contract.js';
import {
  buildDocumentaryWriterPrompt,
  estimateNarrationRuntime,
  extractFactualClaims
} from './documentary-writer-prompt.js';

export class AnthropicDocumentaryWriterAdapter {
  constructor({
    apiKey = process.env.ANTHROPIC_API_KEY ?? null,
    model = process.env.ANTHROPIC_WRITER_MODEL ?? 'claude-sonnet-4-20250514',
    baseUrl = 'https://api.anthropic.com/v1',
    timeoutMs = 90000,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : null;
    this.model = String(model ?? 'claude-sonnet-4-20250514').trim();
    this.baseUrl = String(baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    this.timeoutMs = Number(timeoutMs ?? 90000);
    this.fetchImpl = fetchImpl;
  }

  identity() {
    return 'anthropic';
  }

  modelIdentity() {
    return this.model;
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  requiredEnvironmentVariables() {
    return ['ANTHROPIC_API_KEY'];
  }

  async execute({ input }) {
    if (!this.isConfigured()) {
      throw new Error('Anthropic adapter is not configured. Missing ANTHROPIC_API_KEY.');
    }

    const payload = {
      model: this.model,
      max_tokens: 8000,
      temperature: 0.3,
      system: [
        'You are an elite documentary screenwriter.',
        'Return one complete, coherent, audience-facing documentary screenplay.',
        'Do not return JSON wrappers, planning notes, or bullet templates.',
        'Preserve factual integrity and avoid unsupported claims.'
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: buildDocumentaryWriterPrompt(input)
        }
      ]
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
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
      const message = String(body?.error?.message ?? `Anthropic request failed: HTTP ${response.status}`);
      throw new Error(message);
    }

    const screenplay = Array.isArray(body?.content)
      ? body.content
        .filter(item => item?.type === 'text')
        .map(item => String(item?.text ?? ''))
        .join('\n')
        .trim()
      : '';

    const normalizedResult = createExternalWriterResult({
      providerIdentity: this.identity(),
      modelIdentity: this.model,
      screenplay,
      estimatedNarrationRuntime: estimateNarrationRuntime(screenplay),
      factualClaims: extractFactualClaims(screenplay),
      providerWarnings: screenplay.length < 300 ? ['Screenplay appears shorter than expected.'] : [],
      generationMetadata: {
        endpoint: '/messages',
        id: body?.id ?? null,
        stopReason: body?.stop_reason ?? null,
        type: body?.type ?? null
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
