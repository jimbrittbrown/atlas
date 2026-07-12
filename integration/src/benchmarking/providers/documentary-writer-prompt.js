export function buildDocumentaryWriterPrompt(input = {}) {
  const verifiedFacts = Array.isArray(input?.verifiedResearchPackage?.verifiedDocumentaryFacts)
    ? input.verifiedResearchPackage.verifiedDocumentaryFacts
    : [];

  const factLines = verifiedFacts
    .slice(0, 50)
    .map((item, index) => `${index + 1}. ${String(item?.fact ?? '').trim()}`)
    .filter(line => line.length > 3)
    .join('\n');

  const narrativeBeats = Array.isArray(input?.narrativeBeats)
    ? input.narrativeBeats
    : [];

  const beatLines = narrativeBeats
    .slice(0, 30)
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

export function extractFactualClaims(screenplay = '') {
  return String(screenplay ?? '')
    .split(/(?<=[.!?])\s+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(line => /\b(19\d{2}|20\d{2}|according|record|documented|confirmed|verified|evidence|report|hearing)\b/i.test(line))
    .slice(0, 120);
}

export function estimateNarrationRuntime(screenplay = '') {
  const words = String(screenplay ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return null;
  }

  return {
    words,
    seconds: Math.round(words / 2.5)
  };
}
