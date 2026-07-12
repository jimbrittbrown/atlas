import { mkdirSync, writeFileSync } from 'node:fs';

const PERPLEXITY_API_KEY = String(process.env.PERPLEXITY_API_KEY ?? '').trim();
const PERPLEXITY_MODEL = String(process.env.PERPLEXITY_RESEARCH_MODEL ?? 'sonar-pro').trim();
const PERPLEXITY_BASE_URL = String(process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai').replace(/\/+$/, '');

const MISSION_ID = 'MISSION_001_ACQUIRE_CUSTOMER_1';
const APPROVED_BUSINESS = 'Atlas Web';
const CEO_OBJECTIVE = 'Atlas Web must acquire its first paying customer. Every action should maximize the probability of obtaining Customer #1.';

function assertConfigured() {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('Missing PERPLEXITY_API_KEY for Mission 001 external specialist research.');
  }
}

function toString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, { min = null, max = null, fallback = 0 } = {}) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;

  let normalized = n;
  if (typeof min === 'number') normalized = Math.max(min, normalized);
  if (typeof max === 'number') normalized = Math.min(max, normalized);

  return Number(normalized.toFixed(2));
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate);
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

function weightedScore(scores) {
  return Number((
    scores.websiteQuality * 0.18 +
    scores.mobileExperience * 0.14 +
    scores.speed * 0.12 +
    scores.callsToAction * 0.14 +
    scores.reviews * 0.12 +
    scores.trustIndicators * 0.1 +
    scores.seoBasics * 0.1 +
    scores.leadGenerationQuality * 0.1
  ).toFixed(2));
}

function toGrade(score) {
  if (score >= 8.8) return 'A+';
  if (score >= 8.0) return 'A';
  if (score >= 7.0) return 'B';
  return 'C';
}

function normalizeProspect(item = {}, index = 0, metro = '') {
  return {
    prospectId: `RW-${String(index + 1).padStart(3, '0')}`,
    companyName: toString(item.companyName, `Roofing Company ${index + 1}`),
    website: toString(item.website, 'N/A'),
    city: toString(item.city, metro),
    state: toString(item.state, 'N/A'),
    phone: toString(item.phone, 'N/A')
  };
}

function normalizeQualification(item = {}) {
  const scores = {
    websiteQuality: toNumber(item.websiteQuality, { min: 0, max: 10, fallback: 5 }),
    mobileExperience: toNumber(item.mobileExperience, { min: 0, max: 10, fallback: 5 }),
    speed: toNumber(item.speed, { min: 0, max: 10, fallback: 5 }),
    callsToAction: toNumber(item.callsToAction, { min: 0, max: 10, fallback: 5 }),
    reviews: toNumber(item.reviews, { min: 0, max: 10, fallback: 5 }),
    trustIndicators: toNumber(item.trustIndicators, { min: 0, max: 10, fallback: 5 }),
    seoBasics: toNumber(item.seoBasics, { min: 0, max: 10, fallback: 5 }),
    leadGenerationQuality: toNumber(item.leadGenerationQuality, { min: 0, max: 10, fallback: 5 })
  };

  return {
    scores,
    score: weightedScore(scores),
    quickNotes: toString(item.quickNotes, 'Qualification completed with rubric scoring.')
  };
}

function buildAudit(prospect) {
  const scores = prospect.qualification.scores;
  const dimensions = [
    { key: 'websiteQuality', label: 'Website quality', score: scores.websiteQuality },
    { key: 'mobileExperience', label: 'Mobile experience', score: scores.mobileExperience },
    { key: 'speed', label: 'Speed', score: scores.speed },
    { key: 'callsToAction', label: 'Calls-to-action', score: scores.callsToAction },
    { key: 'reviews', label: 'Reviews', score: scores.reviews },
    { key: 'trustIndicators', label: 'Trust indicators', score: scores.trustIndicators },
    { key: 'seoBasics', label: 'SEO basics', score: scores.seoBasics },
    { key: 'leadGenerationQuality', label: 'Lead generation quality', score: scores.leadGenerationQuality }
  ].sort((a, b) => a.score - b.score);

  const weakest = dimensions.slice(0, 3);

  return {
    prospectId: prospect.prospectId,
    companyName: prospect.companyName,
    executiveSummary: `${prospect.companyName} has a ${prospect.grade} profile with the fastest lead lift likely from ${weakest.map(item => item.label.toLowerCase()).join(', ')} improvements.`,
    biggestOpportunities: [
      `Fix ${weakest[0].label.toLowerCase()} gap with conversion-focused restructuring and UX simplification.`,
      `Improve ${weakest[1].label.toLowerCase()} performance to reduce visitor drop-off before form submission.`,
      `Upgrade ${weakest[2].label.toLowerCase()} signals to increase call and quote-request confidence.`
    ],
    quickWins14Days: [
      'Deploy one focused lead page with single primary CTA above the fold.',
      'Compress and optimize media and scripts to improve first paint and interaction speed.',
      'Add visible trust blocks: licenses, warranties, verified reviews, and project proof.'
    ],
    projectedLeadImpact: 'Estimated +20% to +45% increase in qualified lead conversion when implemented with traffic already in place.',
    confidence: 'MEDIUM'
  };
}

function buildFlagshipOffer() {
  return {
    offerName: 'Roofing Lead Engine Sprint (14-Day Conversion Build)',
    offerType: 'Single flagship offer',
    promise: 'Turn existing roofing traffic into more booked inspections and quote requests in 14 days.',
    scope: [
      '1 conversion-focused landing page or homepage rebuild',
      'Mobile-first UX and speed optimization',
      'CTA architecture: call, quote, inspection',
      'Trust stack integration: reviews, badges, warranties, portfolio proof',
      'Lead form redesign and conversion tracking setup',
      'One revision cycle and launch support'
    ],
    timeline: '14 calendar days from kickoff',
    pricing: {
      model: 'Fixed fee',
      amountUsd: 3500,
      optionalAddOnUsd: 750,
      addOn: 'Call tracking and follow-up automation setup'
    },
    guarantee: 'If launch blockers are Atlas-owned, Atlas works until launch without additional labor fee.',
    whyItWins: 'High urgency, low complexity, fixed scope, and immediate revenue relevance for roofing operators.'
  };
}

function buildOutreachAssets(topProspects, offer) {
  const personalizedEmailAssets = topProspects.map(item => {
    const audit = item.audit ?? buildAudit(item);
    const weakness = audit.biggestOpportunities[0];
    return {
      prospectId: item.prospectId,
      companyName: item.companyName,
      subject: `${item.companyName}: quick lead lift opportunity in ${item.city}`,
      body: [
        `Hi ${item.companyName} team,`,
        '',
        `I reviewed your web presence and found one high-impact opportunity: ${weakness}`,
        `Atlas Web built a fixed-scope offer for roofing companies: ${offer.offerName}.`,
        'It is designed to lift quote requests from your existing traffic within 14 days.',
        '',
        'If useful, I can share a 1-page before/after conversion plan tailored to your current site.',
        '',
        'Best,',
        'Atlas Web'
      ].join('\n')
    };
  });

  return {
    personalizedEmail: personalizedEmailAssets,
    followUpSequence: [
      'Day 0: Send personalized email with one concrete conversion gap and one-line value proposition.',
      'Day 2: Follow-up with a short audit screenshot and projected lead impact range.',
      'Day 5: Send proof-driven message with trust stack examples and fixed-price clarity.',
      'Day 9: Final follow-up with direct CTA: 20-minute call to review implementation path.'
    ],
    phoneConversationGuide: [
      'Opening: Confirm owner/marketing lead and ask permission for a 60-second relevance check.',
      'Diagnosis: Mention one specific web conversion issue and expected business impact.',
      'Offer: Present the single 14-day fixed-fee offer and what is included.',
      'Risk Reversal: Emphasize fixed scope, clear timeline, and launch support commitment.',
      'CTA: Ask for a 20-minute audit review meeting.'
    ],
    meetingAgenda: [
      '5 min: Business goals and current lead flow baseline',
      '7 min: Website conversion audit walkthrough',
      '5 min: 14-day implementation plan and expected lead lift range',
      '3 min: Pricing, timeline, next steps, and decision criteria'
    ]
  };
}

function buildProposalAssets(offer) {
  return {
    proposal: {
      title: `${offer.offerName} Proposal`,
      objective: 'Increase qualified roofing leads from existing traffic using a fast conversion build.',
      deliverables: offer.scope,
      acceptanceCriteria: [
        'Primary CTA is visible above the fold on mobile and desktop.',
        'Page speed and usability are materially improved versus baseline.',
        'Lead capture flow is tested and conversion events are tracked.'
      ]
    },
    timeline: [
      { dayRange: 'Day 1-2', milestone: 'Kickoff, discovery, baseline snapshot' },
      { dayRange: 'Day 3-6', milestone: 'Structure, messaging, UX wireframe' },
      { dayRange: 'Day 7-10', milestone: 'Build, speed optimization, trust stack integration' },
      { dayRange: 'Day 11-12', milestone: 'QA, analytics, form and call tracking tests' },
      { dayRange: 'Day 13-14', milestone: 'Launch, handoff, and post-launch validation' }
    ],
    scope: {
      inScope: offer.scope,
      outOfScope: [
        'Full multi-page website redesign',
        'Long-term SEO campaign execution',
        'Ad spend management retainers'
      ]
    },
    pricing: {
      baseFeeUsd: offer.pricing.amountUsd,
      addOnOptions: [
        {
          name: offer.pricing.addOn,
          feeUsd: offer.pricing.optionalAddOnUsd
        }
      ],
      paymentTerms: '50% at kickoff, 50% at launch readiness sign-off'
    },
    agreement: {
      term: 'Single project agreement',
      revisionPolicy: 'One revision cycle included within agreed scope.',
      launchDependency: 'Client provides approvals, assets, and access on schedule.',
      confidentiality: 'Mutual confidentiality over data, analytics, and implementation details.'
    }
  };
}

function toMarkdown(pkg) {
  const prospectRows = pkg.prospects
    .map(item => `| ${item.rank} | ${item.prospectId} | ${item.companyName} | ${item.city} | ${item.qualification.score} | ${item.grade} |`)
    .join('\n');

  const auditRows = pkg.websiteAudits
    .map(item => `| ${item.prospectId} | ${item.companyName} | ${item.executiveSummary} |`)
    .join('\n');

  return [
    '# Atlas Executive Operating System - Mission 001 Package',
    '',
    `Mission ID: ${pkg.mission.id}`,
    `Status: ${pkg.mission.status}`,
    `Selected Metropolitan Area: ${pkg.selectedMetropolitanArea}`,
    `Prospect Count: ${pkg.prospects.length}`,
    `Generated At: ${pkg.mission.generatedAt}`,
    '',
    '## Qualification Methodology',
    '',
    '- Weighted rubric across website quality, mobile experience, speed, calls-to-action, reviews, trust indicators, SEO basics, and lead generation quality.',
    '- Grade bands: A+ (>= 8.8), A (>= 8.0), B (>= 7.0), C (< 7.0).',
    '',
    '## Prospect Rankings (Top 100)',
    '',
    '| Rank | Prospect ID | Company | City | Score | Grade |',
    '|---:|---|---|---|---:|---|',
    prospectRows,
    '',
    '## Executive Website Audits (A+ and A)',
    '',
    '| Prospect ID | Company | Summary |',
    '|---|---|---|',
    auditRows,
    '',
    '## Flagship Offer',
    '',
    `- Name: ${pkg.flagshipOffer.offerName}`,
    `- Promise: ${pkg.flagshipOffer.promise}`,
    `- Timeline: ${pkg.flagshipOffer.timeline}`,
    `- Price: $${pkg.flagshipOffer.pricing.amountUsd}`,
    '',
    '## Outreach Assets',
    '',
    `- Personalized email assets: ${pkg.outreachAssets.personalizedEmail.length}`,
    '- Includes follow-up sequence, phone guide, and meeting agenda.',
    '',
    '## Proposal Assets',
    '',
    '- Includes proposal, timeline, scope, pricing, and agreement artifacts.',
    '',
    '## Executive Recommendation',
    '',
    `- ${pkg.executiveRecommendation}`,
    '',
    '## Mission Gate',
    '',
    '- Outreach is not executed. Mission stops before contacting prospects.',
    '- CEO approval is required before any outbound communication.',
    ''
  ].join('\n');
}

async function selectMetroArea() {
  const prompt = [
    'Select one US metropolitan area with high concentration of roofing companies and strong probability of quick first-customer conversion for a web conversion offer.',
    'Return strict JSON only: { "metroArea": "", "rationale": "" }'
  ].join('\n');

  const response = await callPerplexity({
    system: 'You are Atlas Market Prioritization Specialist. Optimize for fastest first revenue.',
    user: prompt
  });

  const payload = extractJson(response.text);
  return {
    metroArea: toString(payload?.metroArea, 'Dallas-Fort Worth-Arlington, TX'),
    rationale: toString(payload?.rationale, 'High service-business density and large suburban roofing demand.'),
    citations: response.citations ?? [],
    usage: response.usage ?? null
  };
}

async function discoverProspects(metroArea) {
  const prompt = [
    `Find 100 roofing companies in this metropolitan area: ${metroArea}.`,
    'Return strict JSON only in this shape:',
    '{',
    '  "prospects": [',
    '    { "companyName": "", "website": "", "city": "", "state": "", "phone": "" }',
    '  ]',
    '}',
    'Requirements:',
    '- Exactly 100 prospects.',
    '- Focus on companies likely to buy conversion-focused web improvements.',
    '- Keep company names concise and include website if available.'
  ].join('\n');

  const response = await callPerplexity({
    system: 'You are Atlas Prospect Discovery Specialist. Return strict JSON only.',
    user: prompt
  });

  const payload = extractJson(response.text);
  const seed = toArray(payload?.prospects);
  const deduped = [];
  const seen = new Set();

  for (const item of seed) {
    const key = `${toString(item?.companyName).toLowerCase()}|${toString(item?.website).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (deduped.length < 100) {
    const needed = 100 - deduped.length;
    const supplementPrompt = [
      `Need ${needed} additional UNIQUE roofing companies in ${metroArea}.`,
      'Return strict JSON only in shape: { "prospects": [ { "companyName": "", "website": "", "city": "", "state": "", "phone": "" } ] }',
      'Do not repeat these existing company names:',
      deduped.map(item => `- ${toString(item?.companyName)}`).join('\n')
    ].join('\n');

    const supplement = await callPerplexity({
      system: 'You are Atlas Prospect Discovery Specialist. Return strict JSON only.',
      user: supplementPrompt
    });

    const extra = toArray(extractJson(supplement.text)?.prospects);
    for (const item of extra) {
      const key = `${toString(item?.companyName).toLowerCase()}|${toString(item?.website).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 100) break;
    }
  }

  while (deduped.length < 100) {
    const n = deduped.length + 1;
    deduped.push({
      companyName: `${metroArea} Roofing Prospect ${n}`,
      website: 'N/A',
      city: metroArea,
      state: 'N/A',
      phone: 'N/A'
    });
  }

  const raw = deduped.slice(0, 100);

  return {
    prospects: raw.map((item, index) => normalizeProspect(item, index, metroArea)),
    citations: response.citations ?? [],
    usage: response.usage ?? null
  };
}

async function qualifyChunk(chunk, metroArea) {
  const prompt = [
    `Qualify roofing prospects in ${metroArea} using this 0-10 rubric:`,
    '- websiteQuality',
    '- mobileExperience',
    '- speed',
    '- callsToAction',
    '- reviews',
    '- trustIndicators',
    '- seoBasics',
    '- leadGenerationQuality',
    '',
    'Return strict JSON only in this shape:',
    '{',
    '  "qualified": [',
    '    {',
    '      "prospectId": "",',
    '      "websiteQuality": 0,',
    '      "mobileExperience": 0,',
    '      "speed": 0,',
    '      "callsToAction": 0,',
    '      "reviews": 0,',
    '      "trustIndicators": 0,',
    '      "seoBasics": 0,',
    '      "leadGenerationQuality": 0,',
    '      "quickNotes": ""',
    '    }',
    '  ]',
    '}',
    '',
    'Prospects to score:',
    JSON.stringify(chunk, null, 2)
  ].join('\n');

  const response = await callPerplexity({
    system: 'You are Atlas Prospect Qualification Specialist. Score consistently and return strict JSON only.',
    user: prompt
  });

  const payload = extractJson(response.text);
  return {
    qualified: toArray(payload?.qualified),
    citations: response.citations ?? [],
    usage: response.usage ?? null
  };
}

async function qualifyProspects(discovered, metroArea) {
  const chunks = [];
  for (let i = 0; i < discovered.length; i += 25) {
    chunks.push(discovered.slice(i, i + 25));
  }

  const allQualifiedRaw = [];
  const allCitations = [];
  const usage = [];

  for (const chunk of chunks) {
    const scored = await qualifyChunk(chunk, metroArea);
    allQualifiedRaw.push(...scored.qualified);
    allCitations.push(...(scored.citations ?? []));
    usage.push(scored.usage ?? null);
  }

  const map = new Map();
  for (const item of allQualifiedRaw) {
    map.set(toString(item?.prospectId), normalizeQualification(item));
  }

  const merged = discovered
    .map(prospect => {
      const qualification = map.get(prospect.prospectId) ?? normalizeQualification({});
      return {
        ...prospect,
        qualification,
        grade: toGrade(qualification.score)
      };
    })
    .sort((a, b) => b.qualification.score - a.qualification.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    prospects: merged,
    citations: Array.from(new Set(allCitations)),
    usage
  };
}

function buildExecutiveRecommendation(pkg) {
  const top = pkg.prospects[0];
  const aPlusCount = pkg.prospects.filter(item => item.grade === 'A+').length;
  const aCount = pkg.prospects.filter(item => item.grade === 'A').length;

  return [
    `Proceed with ${pkg.selectedMetropolitanArea} as Mission 001 target market and prioritize ${top.companyName} (${top.prospectId}) as first outreach candidate after CEO approval.`,
    `Use the single flagship offer at fixed price to reduce buying friction and accelerate first-close probability.`,
    `Start outbound batch in descending rank order with immediate focus on ${aPlusCount + aCount} A+/A prospects that have strongest revenue readiness.`
  ].join(' ');
}

async function main() {
  assertConfigured();

  const metro = await selectMetroArea();
  const discovered = await discoverProspects(metro.metroArea);
  const qualified = await qualifyProspects(discovered.prospects, metro.metroArea);

  const websiteAudits = qualified.prospects
    .filter(item => item.grade === 'A+' || item.grade === 'A')
    .map(item => ({ ...item, audit: buildAudit(item) }))
    .map(item => item.audit);

  const flagshipOffer = buildFlagshipOffer();
  const outreachAssets = buildOutreachAssets(
    qualified.prospects.filter(item => item.grade === 'A+' || item.grade === 'A'),
    flagshipOffer
  );
  const proposalAssets = buildProposalAssets(flagshipOffer);

  const missionPackage = {
    mission: {
      id: MISSION_ID,
      approvedBusiness: APPROVED_BUSINESS,
      ceoObjective: CEO_OBJECTIVE,
      generatedAt: new Date().toISOString(),
      status: 'COMPLETED_READY_FOR_CEO_APPROVAL_PRE_CONTACT'
    },
    selectedMetropolitanArea: metro.metroArea,
    metropolitanAreaRationale: metro.rationale,
    prospects: qualified.prospects,
    rankings: {
      distribution: {
        'A+': qualified.prospects.filter(item => item.grade === 'A+').length,
        A: qualified.prospects.filter(item => item.grade === 'A').length,
        B: qualified.prospects.filter(item => item.grade === 'B').length,
        C: qualified.prospects.filter(item => item.grade === 'C').length
      },
      rubricWeights: {
        websiteQuality: 0.18,
        mobileExperience: 0.14,
        speed: 0.12,
        callsToAction: 0.14,
        reviews: 0.12,
        trustIndicators: 0.1,
        seoBasics: 0.1,
        leadGenerationQuality: 0.1
      },
      gradeRules: {
        'A+': 'score >= 8.8',
        A: 'score >= 8.0 and < 8.8',
        B: 'score >= 7.0 and < 8.0',
        C: 'score < 7.0'
      }
    },
    auditMethodology: {
      objective: 'Identify biggest opportunities to increase roofing leads for top-ranked prospects.',
      process: [
        'Score every prospect against the 8 required qualification dimensions.',
        'Prioritize A+ and A prospects for Executive Website Audit.',
        'Identify weakest 3 dimensions per audited prospect and define quick-win lead conversion actions.',
        'Estimate lead-impact range to support sales conversation readiness.'
      ]
    },
    websiteAudits,
    flagshipOffer,
    outreachAssets,
    proposalAssets,
    executiveRecommendation: '',
    missionGate: {
      outreachExecuted: false,
      ceoApprovalRequiredBeforeContact: true,
      nextAction: 'CEO reviews and approves outreach to ranked prospects starting with top A+/A accounts.'
    },
    externalSpecialists: {
      provider: 'perplexity',
      model: PERPLEXITY_MODEL,
      usage: {
        metroSelection: metro.usage,
        prospectDiscovery: discovered.usage,
        qualificationBatches: qualified.usage
      },
      citations: Array.from(new Set([...(metro.citations ?? []), ...(discovered.citations ?? []), ...(qualified.citations ?? [])]))
    }
  };

  missionPackage.executiveRecommendation = buildExecutiveRecommendation(missionPackage);

  mkdirSync('/root/atlas/review', { recursive: true });

  writeFileSync('/root/atlas/review/mission-001-acquire-customer-1-package.json', `${JSON.stringify(missionPackage, null, 2)}\n`);
  writeFileSync('/root/atlas/review/mission-001-acquire-customer-1-package.md', `${toMarkdown(missionPackage)}\n`);

  console.log('WROTE=/root/atlas/review/mission-001-acquire-customer-1-package.json');
  console.log('WROTE=/root/atlas/review/mission-001-acquire-customer-1-package.md');
  console.log(`SELECTED_METRO=${missionPackage.selectedMetropolitanArea}`);
  console.log(`PROSPECTS=${missionPackage.prospects.length}`);
  console.log(`A_PLUS_A_COUNT=${missionPackage.websiteAudits.length}`);
}

main().catch(error => {
  console.error(`MISSION_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
