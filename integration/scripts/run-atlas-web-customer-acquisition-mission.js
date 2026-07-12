import { mkdirSync, writeFileSync } from 'node:fs';

const PERPLEXITY_API_KEY = String(process.env.PERPLEXITY_API_KEY ?? '').trim();
const PERPLEXITY_MODEL = String(process.env.PERPLEXITY_RESEARCH_MODEL ?? 'sonar-pro').trim();
const PERPLEXITY_BASE_URL = String(process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai').replace(/\/+$/, '');

const MISSION_NAME = 'ATLAS_WEB_CUSTOMER_ACQUISITION_STRATEGY_001';
const CEO_OBJECTIVE = 'Determine the single highest-probability niche and offer for Atlas Web to acquire Customer #1 quickly.';

const REQUIRED_NICHES = [
  'Roofing',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Landscaping',
  'Dentists',
  'Chiropractors',
  'Attorneys',
  'Real Estate',
  'Insurance',
  'Home Services'
];

function assertConfigured() {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('Missing PERPLEXITY_API_KEY for external specialist research.');
  }
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate);
}

function toNumber(value, { min = null, max = null, fallback = 0 } = {}) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;

  let normalized = n;
  if (typeof min === 'number') normalized = Math.max(min, normalized);
  if (typeof max === 'number') normalized = Math.min(max, normalized);

  return Number(normalized.toFixed(2));
}

function toString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNiche(item = {}, index = 0) {
  return {
    rank: index + 1,
    niche: toString(item.niche, `Niche ${index + 1}`),
    demand: toNumber(item.demand, { min: 0, max: 10, fallback: 0 }),
    competition: toNumber(item.competition, { min: 0, max: 10, fallback: 0 }),
    averageCustomerValue: toString(item.averageCustomerValue, 'Unknown'),
    easeOfReachingDecisionMakers: toNumber(item.easeOfReachingDecisionMakers, { min: 0, max: 10, fallback: 0 }),
    websiteQualityInMarket: toNumber(item.websiteQualityInMarket, { min: 0, max: 10, fallback: 0 }),
    landingPageImprovementLikelihood: toNumber(item.landingPageImprovementLikelihood, { min: 0, max: 10, fallback: 0 }),
    repeatBusinessPotential: toNumber(item.repeatBusinessPotential, { min: 0, max: 10, fallback: 0 }),
    upsellOpportunities: toString(item.upsellOpportunities, 'No upsell analysis provided.'),
    timeToFirstSale: toString(item.timeToFirstSale, 'Unknown'),
    overallExecutiveScore: toNumber(item.overallExecutiveScore, { min: 0, max: 10, fallback: 0 }),
    rationale: toString(item.rationale, 'Rationale pending.')
  };
}

function checkRequiredNiches(niches = []) {
  const normalizedNames = niches.map(item => String(item.niche ?? '').toLowerCase());

  const missing = REQUIRED_NICHES.filter(name => {
    const needle = name.toLowerCase();
    return !normalizedNames.some(candidate => candidate.includes(needle) || needle.includes(candidate));
  });

  return missing;
}

async function callPerplexity({ system, user }) {
  const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      temperature: 0.2,
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

function toMarkdown(result) {
  const rows = result.nicheEvaluations
    .map(item => `| ${item.rank} | ${item.niche} | ${item.demand} | ${item.competition} | ${item.easeOfReachingDecisionMakers} | ${item.websiteQualityInMarket} | ${item.landingPageImprovementLikelihood} | ${item.repeatBusinessPotential} | ${item.timeToFirstSale} | ${item.overallExecutiveScore} |`)
    .join('\n');

  const topNiche = result.selectedNiche;
  const offer = result.flagshipOffer;

  const risks = result.risks.map(item => `- ${item}`).join('\n');
  const pain = result.customerPainPoints.map(item => `- ${item}`).join('\n');
  const wins = result.whyAtlasWins.map(item => `- ${item}`).join('\n');

  return [
    '# Atlas Web Customer Acquisition Strategy Mission',
    '',
    `Mission: ${result.mission.name}`,
    `Objective: ${result.mission.objective}`,
    `Evaluated At: ${result.mission.evaluatedAt}`,
    `Status: ${result.mission.status}`,
    '',
    '## Niche Scorecard',
    '',
    '| Rank | Niche | Demand | Competition | Reach Decision Makers | Website Quality | Landing Page Improvement | Repeat Business | Time to First Sale | Executive Score |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---|---:|',
    rows,
    '',
    '## Selected Niche',
    '',
    `- Niche: ${topNiche.niche}`,
    `- Why selected: ${topNiche.rationale}`,
    '',
    '## Single Flagship Offer',
    '',
    `- Offer name: ${offer.offerName}`,
    `- Deliverables: ${offer.deliverables.join('; ')}`,
    `- Target turnaround time: ${offer.targetTurnaroundTime}`,
    `- Suggested price: ${offer.suggestedPrice}`,
    `- Why customers buy immediately: ${offer.whyCustomersBuyImmediately}`,
    `- Expected gross margin: ${offer.expectedGrossMargin}`,
    `- Future upsell opportunities: ${offer.futureUpsellOpportunities.join('; ')}`,
    '',
    '## Ideal Customer Profile',
    '',
    `- ${result.idealCustomerProfile}`,
    '',
    '## Customer Pain Points',
    '',
    pain,
    '',
    '## Why Atlas Wins',
    '',
    wins,
    '',
    '## Sales Positioning',
    '',
    `- ${result.salesPositioning}`,
    '',
    '## Outreach Strategy',
    '',
    `- ${result.outreachStrategy}`,
    '',
    '## First 100 Prospect Acquisition Plan',
    '',
    result.first100ProspectAcquisitionPlan.map(item => `- ${item}`).join('\n'),
    '',
    '## Customer #1 Acquisition Plan',
    '',
    result.customer1AcquisitionPlan.map(item => `- ${item}`).join('\n'),
    '',
    '## Risks',
    '',
    risks,
    '',
    '## Executive Recommendation',
    '',
    `- ${result.executiveRecommendation}`,
    '',
    '## Research Citations',
    '',
    result.researchCitations.map(url => `- ${url}`).join('\n'),
    ''
  ].join('\n');
}

async function main() {
  assertConfigured();

  const researchPrompt = [
    'Mission context:',
    '- Approved business: Atlas Web (AI Website & Landing Page Agency)',
    '- Mission objective: maximize probability of acquiring Customer #1 quickly',
    '- Do NOT build websites, branding, or assets; strategy only.',
    '',
    'Evaluate at least 12 niches and MUST include these niches:',
    REQUIRED_NICHES.map(item => `- ${item}`).join('\n'),
    '',
    'For each niche, provide the following fields:',
    '- niche',
    '- demand (0-10)',
    '- competition (0-10 where 10 means most crowded)',
    '- averageCustomerValue (text)',
    '- easeOfReachingDecisionMakers (0-10)',
    '- websiteQualityInMarket (0-10 where lower quality means bigger opportunity)',
    '- landingPageImprovementLikelihood (0-10)',
    '- repeatBusinessPotential (0-10)',
    '- upsellOpportunities (text)',
    '- timeToFirstSale (text)',
    '- overallExecutiveScore (0-10)',
    '- rationale (1-3 sentences)',
    '',
    'Sort by overallExecutiveScore descending.',
    'Return JSON only with shape: { "nicheEvaluations": [ ... ] }'
  ].join('\n');

  const nicheResearch = await callPerplexity({
    system: 'You are Atlas External Market Research Specialist. Return evidence-grounded niche scoring for first-customer acquisition. Return strict JSON only.',
    user: researchPrompt
  });

  const nichePayload = extractJson(nicheResearch.text);
  const nicheEvaluationsRaw = toArray(nichePayload?.nicheEvaluations);

  if (nicheEvaluationsRaw.length < 10) {
    throw new Error(`Expected at least 10 niche evaluations, received ${nicheEvaluationsRaw.length}.`);
  }

  const normalizedNiches = nicheEvaluationsRaw
    .map((item, index) => normalizeNiche(item, index))
    .sort((a, b) => b.overallExecutiveScore - a.overallExecutiveScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const missingRequiredNiches = checkRequiredNiches(normalizedNiches);
  if (missingRequiredNiches.length > 0) {
    throw new Error(`Research output missing required niches: ${missingRequiredNiches.join(', ')}`);
  }

  const selectedNiche = normalizedNiches[0];

  const offerPrompt = [
    'Selected niche for Atlas Web:',
    JSON.stringify(selectedNiche, null, 2),
    '',
    'Define ONE single flagship launch offer (not multiple packages) with easiest near-term sale probability.',
    'Also provide:',
    '1. Ideal Customer Profile',
    '2. Customer Pain Points',
    '3. Why Atlas wins',
    '4. Sales positioning',
    '5. Outreach strategy',
    '6. First 100 prospect acquisition plan',
    '7. Customer #1 acquisition plan',
    '8. Risks',
    '9. Executive recommendation',
    '',
    'Return JSON only with this shape:',
    '{',
    '  "flagshipOffer": {',
    '    "offerName": "",',
    '    "deliverables": [""],',
    '    "targetTurnaroundTime": "",',
    '    "suggestedPrice": "",',
    '    "whyCustomersBuyImmediately": "",',
    '    "expectedGrossMargin": "",',
    '    "futureUpsellOpportunities": [""]',
    '  },',
    '  "idealCustomerProfile": "",',
    '  "customerPainPoints": [""],',
    '  "whyAtlasWins": [""],',
    '  "salesPositioning": "",',
    '  "outreachStrategy": "",',
    '  "first100ProspectAcquisitionPlan": [""],',
    '  "customer1AcquisitionPlan": [""],',
    '  "risks": [""],',
    '  "executiveRecommendation": ""',
    '}'
  ].join('\n');

  const offerResearch = await callPerplexity({
    system: 'You are Atlas External Go-To-Market Specialist. Maximize first-customer acquisition probability with one flagship offer. Return strict JSON only.',
    user: offerPrompt
  });

  const offerPayload = extractJson(offerResearch.text);

  const flagshipOffer = {
    offerName: toString(offerPayload?.flagshipOffer?.offerName, 'Atlas Web Conversion Sprint'),
    deliverables: toArray(offerPayload?.flagshipOffer?.deliverables).map(item => toString(item)).filter(Boolean),
    targetTurnaroundTime: toString(offerPayload?.flagshipOffer?.targetTurnaroundTime, '5 business days'),
    suggestedPrice: toString(offerPayload?.flagshipOffer?.suggestedPrice, '$2,500'),
    whyCustomersBuyImmediately: toString(offerPayload?.flagshipOffer?.whyCustomersBuyImmediately, 'Immediate conversion uplift opportunity with low implementation risk.'),
    expectedGrossMargin: toString(offerPayload?.flagshipOffer?.expectedGrossMargin, '65-80%'),
    futureUpsellOpportunities: toArray(offerPayload?.flagshipOffer?.futureUpsellOpportunities).map(item => toString(item)).filter(Boolean)
  };

  const result = {
    mission: {
      name: MISSION_NAME,
      approvedBusiness: 'Atlas Web',
      objective: CEO_OBJECTIVE,
      evaluatedAt: new Date().toISOString(),
      status: 'COMPLETED_PRE_WEBSITE_CREATION'
    },
    nicheEvaluations: normalizedNiches,
    selectedNiche,
    flagshipOffer,
    idealCustomerProfile: toString(offerPayload?.idealCustomerProfile, 'Owner-led SMB with weak conversion-focused web presence and immediate lead generation need.'),
    customerPainPoints: toArray(offerPayload?.customerPainPoints).map(item => toString(item)).filter(Boolean),
    whyAtlasWins: toArray(offerPayload?.whyAtlasWins).map(item => toString(item)).filter(Boolean),
    salesPositioning: toString(offerPayload?.salesPositioning, 'Fast conversion-focused outcomes with executive-governed execution quality.'),
    outreachStrategy: toString(offerPayload?.outreachStrategy, 'Direct outbound to high-intent local businesses with evidence-led conversion promise.'),
    first100ProspectAcquisitionPlan: toArray(offerPayload?.first100ProspectAcquisitionPlan).map(item => toString(item)).filter(Boolean),
    customer1AcquisitionPlan: toArray(offerPayload?.customer1AcquisitionPlan).map(item => toString(item)).filter(Boolean),
    risks: toArray(offerPayload?.risks).map(item => toString(item)).filter(Boolean),
    executiveRecommendation: toString(offerPayload?.executiveRecommendation, 'Proceed with selected niche and single flagship offer to maximize first-customer probability.'),
    researchCitations: Array.from(new Set([...(nicheResearch.citations ?? []), ...(offerResearch.citations ?? [])])),
    externalSpecialists: {
      provider: 'perplexity',
      model: PERPLEXITY_MODEL,
      stages: {
        nicheResearch: {
          usage: nicheResearch.usage,
          citationCount: (nicheResearch.citations ?? []).length
        },
        offerDesign: {
          usage: offerResearch.usage,
          citationCount: (offerResearch.citations ?? []).length
        }
      }
    }
  };

  mkdirSync('/root/atlas/review', { recursive: true });

  writeFileSync('/root/atlas/review/atlas-web-customer-acquisition-package.json', `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync('/root/atlas/review/atlas-web-customer-acquisition-package.md', `${toMarkdown(result)}\n`);

  console.log('WROTE=/root/atlas/review/atlas-web-customer-acquisition-package.json');
  console.log('WROTE=/root/atlas/review/atlas-web-customer-acquisition-package.md');
  console.log(`SELECTED_NICHE=${selectedNiche.niche}`);
  console.log(`SELECTED_SCORE=${selectedNiche.overallExecutiveScore}`);
}

main().catch(error => {
  console.error(`MISSION_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
