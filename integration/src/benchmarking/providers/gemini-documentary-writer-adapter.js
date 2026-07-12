import {
  createExternalWriterResult,
  validateExternalWriterResult
} from '../../external-writer/external-documentary-writer-contract.js';
import {
  buildDocumentaryWriterPrompt,
  estimateNarrationRuntime,
  extractFactualClaims
} from './documentary-writer-prompt.js';

export class GeminiDocumentaryWriterAdapter {
  constructor({
    apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_VERTEX_API_KEY ?? null,
    model = process.env.GEMINI_WRITER_MODEL ?? 'gemini-2.5-pro',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models',
    timeoutMs = 90000,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : null;
    this.model = String(model ?? 'gemini-2.5-pro').trim();
    this.baseUrl = String(baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/+$/, '');
    this.timeoutMs = Number(timeoutMs ?? 90000);
    this.fetchImpl = fetchImpl;
  }

  identity() {
    return 'gemini';
  }

  modelIdentity() {
    return this.model;
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  requiredEnvironmentVariables() {
    return ['GEMINI_API_KEY or GOOGLE_VERTEX_API_KEY'];
  }

  async execute({ input }) {
    if (!this.isConfigured()) {
      throw new Error('Gemini adapter is not configured. Missing GEMINI_API_KEY or GOOGLE_VERTEX_API_KEY.');
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'You are an elite documentary screenwriter.',
                'Return one complete, coherent, audience-facing documentary screenplay.',
                'Do not return JSON wrappers, planning notes, or bullet templates.',
                'Preserve factual integrity and avoid unsupported claims.',
                '',
                buildDocumentaryWriterPrompt(input)
              ].join('\n')
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: {
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
      const message = String(body?.error?.message ?? `Gemini request failed: HTTP ${response.status}`);
      throw new Error(message);
    }

    const screenplay = String(body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

    const normalizedResult = createExternalWriterResult({
      providerIdentity: this.identity(),
      modelIdentity: this.model,
      screenplay,
      estimatedNarrationRuntime: estimateNarrationRuntime(screenplay),
      factualClaims: extractFactualClaims(screenplay),
      providerWarnings: screenplay.length < 300 ? ['Screenplay appears shorter than expected.'] : [],
      generationMetadata: {
        endpoint: ':generateContent',
        finishReason: body?.candidates?.[0]?.finishReason ?? null,
        modelVersion: body?.modelVersion ?? null
      },
      usage: body?.usageMetadata ?? null
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
