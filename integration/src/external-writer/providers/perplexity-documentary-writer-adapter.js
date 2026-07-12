import {
  createExternalWriterResult,
  validateExternalWriterResult
} from '../external-documentary-writer-contract.js';

export class PerplexityDocumentaryWriterAdapter {
  constructor({
    apiKey = process.env.PERPLEXITY_API_KEY ?? null,
    model = process.env.PERPLEXITY_WRITER_MODEL ?? 'sonar-pro',
    baseUrl = 'https://api.perplexity.ai',
    timeoutMs = 90000,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : null;
    this.model = String(model ?? 'sonar-pro').trim();
    this.baseUrl = String(baseUrl ?? 'https://api.perplexity.ai').replace(/\/+$/, '');
    this.timeoutMs = Number(timeoutMs ?? 90000);
    this.fetchImpl = fetchImpl;
  }

  identity() {
    return 'perplexity';
  }

  priority() {
    return 10;
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  requiredEnvironmentVariables() {
    return ['PERPLEXITY_API_KEY'];
  }

  async execute({ input }) {
    if (!this.isConfigured()) {
      throw new Error('Perplexity adapter is not configured. Missing PERPLEXITY_API_KEY.');
    }

    const payload = {
      model: this.model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: [
            'You are an elite documentary screenwriter.',
            'Return one complete, coherent, audience-facing documentary screenplay.',
            'Do not return planning notes, JSON fragments, bullet templates, or role labels.',
            'Preserve factual integrity and avoid inventing unsupported claims.',
            'Use an investigative documentary voice with narrative flow and unresolved curiosity pressure.'
          ].join(' ')
        },
        {
          role: 'user',
          content: this.buildPrompt(input)
        }
      ]
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
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

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = String(responseBody?.error?.message ?? `Perplexity request failed: HTTP ${response.status}`);
      const error = new Error(message);
      error.status = response.status;
      error.responseBody = responseBody;
      throw error;
    }

    const screenplay = String(responseBody?.choices?.[0]?.message?.content ?? '').trim();

    const result = createExternalWriterResult({
      providerIdentity: this.identity(),
      modelIdentity: this.model,
      screenplay,
      estimatedNarrationRuntime: this.estimateNarrationRuntime(screenplay),
      factualClaims: this.extractFactualClaims(screenplay),
      providerWarnings: screenplay.length < 300 ? ['Screenplay appears shorter than expected.'] : [],
      generationMetadata: {
        endpoint: '/chat/completions',
        finishReason: responseBody?.choices?.[0]?.finish_reason ?? null,
        created: responseBody?.created ?? null,
        id: responseBody?.id ?? null
      },
      usage: responseBody?.usage ?? null
    });

    const validation = validateExternalWriterResult(result);
    if (!validation.isValid) {
      const error = new Error(`External writer result invalid: ${validation.issues.join(' | ')}`);
      error.validationIssues = validation.issues;
      throw error;
    }

    return {
      rawProviderResponse: responseBody,
      normalizedResult: result
    };
  }

  buildPrompt(input = {}) {
    const verifiedFacts = Array.isArray(input?.verifiedResearchPackage?.verifiedDocumentaryFacts)
      ? input.verifiedResearchPackage.verifiedDocumentaryFacts
      : [];

    const factLines = verifiedFacts
      .slice(0, 40)
      .map((item, index) => `${index + 1}. ${String(item?.fact ?? '').trim()}`)
      .filter(line => line.length > 3)
      .join('\n');

    const narrativeBeats = Array.isArray(input?.narrativeBeats)
      ? input.narrativeBeats
      : [];

    const beatLines = narrativeBeats
      .slice(0, 20)
      .map((beat, index) => `${index + 1}. ${String(beat?.beatObjective ?? beat?.objective ?? '').trim()}`)
      .filter(line => line.length > 3)
      .join('\n');

    const factualRestrictions = Array.isArray(input?.factualRestrictions)
      ? input.factualRestrictions
      : [];

    return [
      'Write one complete documentary screenplay using the approved Atlas package below.',
      '',
      `Target audience: ${input.targetAudience}`,
      `Target runtime (seconds): ${input.targetRuntime}`,
      `Documentary voice: ${input.documentaryVoice}`,
      `Title promise: ${input.titlePromise}`,
      `Ending objective: ${input.endingObjective}`,
      '',
      'Producer brief:',
      JSON.stringify(input.producerBrief ?? {}, null, 2),
      '',
      'Editorial research brief:',
      String(input.editorialResearchBrief ?? ''),
      '',
      'Storytelling plan summary:',
      JSON.stringify(input.storytellingPlan ?? {}, null, 2),
      '',
      'Narrative beats:',
      beatLines,
      '',
      'Verified factual anchors (use these and do not fabricate contradictory claims):',
      factLines,
      '',
      'Gold Standard:',
      String(input.goldStandard ?? ''),
      '',
      `Factual restrictions: ${factualRestrictions.length > 0 ? factualRestrictions.join('; ') : 'Use only evidence-grounded claims and avoid unsupported specifics.'}`,
      '',
      'Return only the screenplay text.'
    ].join('\n');
  }

  extractFactualClaims(screenplay = '') {
    const sentences = String(screenplay ?? '')
      .split(/(?<=[.!?])\s+/)
      .map(item => item.trim())
      .filter(Boolean);

    return sentences
      .filter(line => /\b(19\d{2}|20\d{2}|according|record|documented|confirmed|verified|evidence|report|hearing)\b/i.test(line))
      .slice(0, 80);
  }

  estimateNarrationRuntime(screenplay = '') {
    const words = String(screenplay ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (words === 0) {
      return null;
    }

    const seconds = Math.round(words / 2.5);
    return {
      words,
      seconds
    };
  }
}
