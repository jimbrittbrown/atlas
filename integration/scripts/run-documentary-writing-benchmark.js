import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SpecialistBenchmarkFramework } from '../src/benchmarking/specialist-benchmark-framework.js';
import { SpecialistRegistryStore } from '../src/benchmarking/specialist-registry-store.js';
import { createExternalWriterInput } from '../src/external-writer/external-documentary-writer-contract.js';
import { OpenAIDocumentaryWriterAdapter } from '../src/benchmarking/providers/openai-documentary-writer-adapter.js';
import { AnthropicDocumentaryWriterAdapter } from '../src/benchmarking/providers/anthropic-documentary-writer-adapter.js';
import { GeminiDocumentaryWriterAdapter } from '../src/benchmarking/providers/gemini-documentary-writer-adapter.js';
import { PerplexityBenchmarkWriterAdapter } from '../src/benchmarking/providers/perplexity-benchmark-writer-adapter.js';

function readText(path) {
  return readFileSync(path, 'utf8');
}

function extractJsonBlock(markdown) {
  const match = String(markdown).match(/```json\n([\s\S]*?)\n```/);
  return match ? JSON.parse(match[1]) : null;
}

function safeString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function getArtifacts() {
  const producerBrief = extractJsonBlock(readText('/root/atlas/review/producer-brief.md')) ?? {};
  const researchPackage = extractJsonBlock(readText('/root/atlas/review/research-package.md')) ?? {};
  const storytellingPlan = extractJsonBlock(readText('/root/atlas/review/storytelling-plan.md')) ?? {};
  const narrativeBeats = extractJsonBlock(readText('/root/atlas/review/narrative-beats.md')) ?? [];
  const editorialResearchBrief = readText('/root/atlas/review/editorial-research-brief.md')
    .replace(/^#\s*Editorial Research Brief\s*/i, '')
    .trim();
  const goldStandard = readText('/root/atlas/docs/executive/atlas-documentary-storytelling-gold-standard.md');

  return {
    producerBrief,
    researchPackage,
    storytellingPlan,
    narrativeBeats,
    editorialResearchBrief,
    goldStandard
  };
}

function buildExternalInput(artifacts) {
  const producerBrief = artifacts.producerBrief ?? {};

  return createExternalWriterInput({
    producerBrief,
    verifiedResearchPackage: artifacts.researchPackage,
    editorialResearchBrief: artifacts.editorialResearchBrief,
    storytellingPlan: artifacts.storytellingPlan,
    narrativeBeats: artifacts.narrativeBeats,
    goldStandard: artifacts.goldStandard,
    targetAudience: safeString(
      producerBrief?.targetAudience,
      'General documentary audience and executive review council'
    ),
    targetRuntime: Number(producerBrief?.runtimeTargetSeconds ?? 420),
    documentaryVoice: safeString(
      producerBrief?.tone,
      'Serious, precise, and human-centered'
    ),
    factualRestrictions: [
      'Do not fabricate facts or chronology.',
      'Anchor claims in verified research package evidence.',
      'Preserve attribution and uncertainty where evidence is disputed.'
    ],
    titlePromise: safeString(
      producerBrief?.documentaryObjective,
      'Investigate a high-stakes institutional failure with evidence-grounded accountability.'
    ),
    endingObjective: 'Close with unresolved accountability pressure that motivates reflection and continuation.'
  });
}

function summarizeResult(result) {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    status: result.status,
    runtimeMs: result.runtimeMs,
    cost: result.cost,
    scores: result.scores,
    weaknesses: result.weaknesses,
    missingEnvironmentVariables: result.missingEnvironmentVariables ?? [],
    error: result.error ?? null
  };
}

function toMarkdown(benchmark) {
  const rows = benchmark.providerResults.map(result => {
    const s = result.scores ?? {};
    return `| ${result.providerId} | ${result.modelId ?? 'N/A'} | ${result.status} | ${s.hook ?? 'N/A'} | ${s.curiosity ?? 'N/A'} | ${s.narrativeFlow ?? 'N/A'} | ${s.documentaryVoice ?? 'N/A'} | ${s.informationDensity ?? 'N/A'} | ${s.audienceCommitment ?? 'N/A'} | ${s.factualPreservation ?? 'N/A'} | ${s.goldStandardCompliance ?? 'N/A'} | ${s.estimatedNarrationQuality ?? 'N/A'} | ${s.overallExecutiveProducerScore ?? 'N/A'} | ${result.cost ?? 'N/A'} | ${result.runtimeMs ?? 'N/A'} |`;
  }).join('\n');

  const weaknesses = benchmark.providerResults.map(result => {
    const weak = result?.weaknesses?.weakCategories ?? [];
    const weakList = weak.length > 0
      ? weak.map(item => `${item.category}:${item.score}`).join(', ')
      : 'none';

    return `- ${result.providerId}: ${weakList}${result.error ? ` | error=${result.error}` : ''}${Array.isArray(result.missingEnvironmentVariables) && result.missingEnvironmentVariables.length > 0 ? ` | missing=${result.missingEnvironmentVariables.join(', ')}` : ''}`;
  }).join('\n');

  const recommendation = benchmark.executiveProducerRecommendation ?? {};

  return [
    '# Specialist Benchmark: Documentary Writing',
    '',
    `Benchmark ID: ${benchmark.benchmarkId}`,
    `Run At: ${benchmark.runAt}`,
    `Completed In (ms): ${benchmark.completedInMs}`,
    '',
    '## Side-by-Side Score Comparison',
    '',
    '| Provider | Model | Status | Hook | Curiosity | Narrative Flow | Documentary Voice | Information Density | Audience Commitment | Factual Preservation | Gold Standard Compliance | Estimated Narration Quality | Overall Executive Producer Score | Cost | Runtime (ms) |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    rows,
    '',
    '## Executive Producer Recommendation',
    '',
    `- Recommendation: ${recommendation.recommendation ?? 'NO_HIRE_RECOMMENDATION'}`,
    `- Rationale: ${recommendation.rationale ?? 'No rationale available.'}`,
    `- Current Champion: ${recommendation?.champion?.providerId ?? 'NONE'}`,
    `- Runner-up: ${recommendation?.runnerUp?.providerId ?? 'NONE'}`,
    '',
    '## Weaknesses of Each Provider',
    '',
    weaknesses,
    ''
  ].join('\n');
}

async function main() {
  mkdirSync('/root/atlas/review', { recursive: true });

  const artifacts = getArtifacts();
  const input = buildExternalInput(artifacts);

  const benchmark = new SpecialistBenchmarkFramework({ category: 'documentary-writing' });
  benchmark.registerProvider(new OpenAIDocumentaryWriterAdapter());
  benchmark.registerProvider(new AnthropicDocumentaryWriterAdapter());
  benchmark.registerProvider(new GeminiDocumentaryWriterAdapter());
  benchmark.registerProvider(new PerplexityBenchmarkWriterAdapter());

  const benchmarkResult = await benchmark.run({
    benchmarkId: `DOC-WRITER-BENCH-${Date.now()}`,
    input,
    evaluationContext: {
      topic: safeString(artifacts?.researchPackage?.centralQuestion, 'Documentary topic')
    }
  });

  const registryStore = new SpecialistRegistryStore();
  const specialistRegistry = registryStore.recordBenchmark({
    benchmarkResult,
    benchmarkType: 'documentary-writing'
  });

  const summary = {
    benchmark: {
      benchmarkId: benchmarkResult.benchmarkId,
      category: benchmarkResult.category,
      runAt: benchmarkResult.runAt,
      completedInMs: benchmarkResult.completedInMs,
      providerResults: benchmarkResult.providerResults.map(summarizeResult),
      rankings: benchmarkResult.rankings,
      executiveProducerRecommendation: benchmarkResult.executiveProducerRecommendation
    },
    specialistRegistry
  };

  writeFileSync('/root/atlas/review/documentary-writing-benchmark-result.json', `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync('/root/atlas/review/documentary-writing-benchmark-report.md', `${toMarkdown(benchmarkResult)}\n`);

  const rec = benchmarkResult.executiveProducerRecommendation ?? {};

  console.log(`BENCHMARK_ID=${benchmarkResult.benchmarkId}`);
  console.log(`CURRENT_CHAMPION=${rec?.champion?.providerId ?? 'NONE'}`);
  console.log(`RUNNER_UP=${rec?.runnerUp?.providerId ?? 'NONE'}`);
  console.log(`RECOMMENDATION=${rec?.recommendation ?? 'NO_HIRE_RECOMMENDATION'}`);
  console.log('WROTE=/root/atlas/review/documentary-writing-benchmark-result.json');
  console.log('WROTE=/root/atlas/review/documentary-writing-benchmark-report.md');
  console.log('WROTE=/root/atlas/registry/specialist-registry.json');
}

main().catch(error => {
  console.error(`BENCHMARK_FAILED=${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
