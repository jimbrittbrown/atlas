function toString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate);
}

async function callPerplexity({ baseUrl, apiKey, model, system, user }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = String(body?.error?.message ?? `Perplexity request failed: HTTP ${response.status}`);
    throw new Error(message);
  }

  return {
    text: String(body?.choices?.[0]?.message?.content ?? '').trim(),
    citations: Array.isArray(body?.citations) ? body.citations : [],
    usage: body?.usage ?? null
  };
}

function normalizeProvider(item = {}, index = 0) {
  return {
    provider: toString(item.provider, `Provider ${index + 1}`),
    company: toString(item.company, toString(item.provider, `Company ${index + 1}`)),
    capability: toString(item.capability, 'Specialist capability under review'),
    strengths: toArray(item.strengths).map(value => toString(value)).filter(Boolean),
    weaknesses: toArray(item.weaknesses).map(value => toString(value)).filter(Boolean),
    typicalUseCases: toArray(item.typicalUseCases).map(value => toString(value)).filter(Boolean),
    pricing: toString(item.pricing, 'Pricing not published'),
    apiAvailability: toString(item.apiAvailability, 'UNKNOWN'),
    enterpriseReadiness: toString(item.enterpriseReadiness, 'UNKNOWN'),
    evidenceSources: toArray(item.evidenceSources).map(value => toString(value)).filter(Boolean),
    overallRecommendation: toString(item.overallRecommendation, 'Candidate recommended for benchmark evaluation.'),
    recommendationScore: Number(toNumber(item.recommendationScore, 0).toFixed(2))
  };
}

export function createPerplexityWorkforceMarketDiscovery({
  apiKey = '',
  model = 'sonar-pro',
  baseUrl = 'https://api.perplexity.ai'
} = {}) {
  const normalizedApiKey = String(apiKey).trim();
  const normalizedModel = String(model).trim() || 'sonar-pro';
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');

  return {
    async discoverCategory({ category, options = {} }) {
      const candidateProviders = toArray(options.candidateProviders).map(value => toString(value)).filter(Boolean);

      if (!normalizedApiKey) {
        const fallbackProviders = candidateProviders.map((provider, index) => normalizeProvider({
          provider,
          company: provider,
          capability: category,
          strengths: ['Candidate queued for benchmark.'],
          weaknesses: ['External evidence not collected yet.'],
          typicalUseCases: ['Pending formal market validation'],
          pricing: 'UNKNOWN',
          apiAvailability: 'UNKNOWN',
          enterpriseReadiness: 'UNKNOWN',
          evidenceSources: [],
          overallRecommendation: 'Use as provisional benchmark candidate until external research is configured.',
          recommendationScore: Math.max(1, 10 - index)
        }, index));

        return {
          category,
          generatedAt: new Date().toISOString(),
          overallRecommendation: 'External market discovery not configured. Provide PERPLEXITY_API_KEY to discover candidates.',
          providers: fallbackProviders,
          evidenceSources: [],
          usage: null
        };
      }

      const optionalProviderHint = candidateProviders.length > 0
        ? `Candidate providers to evaluate first: ${candidateProviders.join(', ')}.`
        : 'Include current leaders in this category and do not limit to currently known Atlas providers.';

      const prompt = [
        `Atlas requires specialist market discovery for category: ${category}.`,
        optionalProviderHint,
        'Return strict JSON with this shape:',
        '{',
        '  "providers": [',
        '    {',
        '      "provider": "",',
        '      "company": "",',
        '      "capability": "",',
        '      "strengths": [""],',
        '      "weaknesses": [""],',
        '      "typicalUseCases": [""],',
        '      "pricing": "",',
        '      "apiAvailability": "AVAILABLE|LIMITED|UNAVAILABLE|UNKNOWN",',
        '      "enterpriseReadiness": "HIGH|MEDIUM|LOW|UNKNOWN",',
        '      "evidenceSources": [""],',
        '      "overallRecommendation": "",',
        '      "recommendationScore": 0',
        '    }',
        '  ],',
        '  "overallRecommendation": ""',
        '}',
        'Requirements:',
        '- Return at least 5 providers.',
        '- Prioritize current market leaders relevant to this category in 2026.',
        '- Ensure evidenceSources are concrete URLs where possible.'
      ].join('\n');

      const response = await callPerplexity({
        baseUrl: normalizedBaseUrl,
        apiKey: normalizedApiKey,
        model: normalizedModel,
        system: 'You are Atlas Workforce Market Discovery Analyst. Return strict JSON only.',
        user: prompt
      });

      const payload = extractJson(response.text);
      const providers = toArray(payload?.providers)
        .map((item, index) => normalizeProvider(item, index))
        .sort((a, b) => b.recommendationScore - a.recommendationScore);

      return {
        category,
        generatedAt: new Date().toISOString(),
        overallRecommendation: toString(
          payload?.overallRecommendation,
          providers[0]?.overallRecommendation ?? 'Benchmark top three providers before final hiring decision.'
        ),
        providers,
        evidenceSources: Array.from(new Set(providers.flatMap(item => item.evidenceSources))),
        usage: response.usage ?? null,
        citations: response.citations ?? []
      };
    }
  };
}
