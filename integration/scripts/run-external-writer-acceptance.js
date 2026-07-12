import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ExternalDocumentaryWriter } from '../src/external-writer/external-documentary-writer.js';
import { PerplexityDocumentaryWriterAdapter } from '../src/external-writer/providers/perplexity-documentary-writer-adapter.js';
import { ExternalScreenplayGovernanceEvaluator } from '../src/external-writer/governance/external-screenplay-governance-evaluator.js';
import { createExternalWriterInput } from '../src/external-writer/external-documentary-writer-contract.js';

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

async function main() {
  mkdirSync('/root/atlas/review', { recursive: true });

  const providerAudit = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    googleVertexProject: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
    googleVertexLocation: Boolean(process.env.GOOGLE_CLOUD_LOCATION),
    googleVertexCredentialsJson: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
  };

  const writer = new ExternalDocumentaryWriter();
  writer.registerProvider(new PerplexityDocumentaryWriterAdapter());

  const artifacts = getArtifacts();
  const input = buildExternalInput(artifacts);

  const selectedProvider = writer.resolveProvider({ preferredProvider: 'perplexity' });
  if (!selectedProvider) {
    const noCallResult = {
      providerAudit,
      realExternalCallOccurred: false,
      reason: 'No configured external documentary writer provider available.',
      missingEnvironmentVariables: ['PERPLEXITY_API_KEY']
    };

    writeFileSync('/root/atlas/review/external-writer-result.json', `${JSON.stringify(noCallResult, null, 2)}\n`);
    console.log('REAL_EXTERNAL_CALL=FALSE');
    console.log('WROTE=/root/atlas/review/external-writer-result.json');
    return;
  }

  const execution = await writer.generateScreenplay({
    preferredProvider: 'perplexity',
    input
  });

  const screenplay = String(execution?.result?.screenplay ?? '').trim();
  writeFileSync('/root/atlas/review/external-writer-first-pass.md', screenplay.length > 0 ? `${screenplay}\n` : '');

  const governanceEvaluator = new ExternalScreenplayGovernanceEvaluator();
  const governance = governanceEvaluator.evaluate({
    screenplay,
    researchPackage: artifacts.researchPackage,
    topic: safeString(artifacts.researchPackage?.centralQuestion, 'Documentary topic')
  });

  const normalized = {
    providerAudit,
    selectedProvider: execution.selectedProvider,
    selectedModel: execution.selectedModel,
    realExternalCallOccurred: true,
    result: execution.result,
    governance
  };

  writeFileSync('/root/atlas/review/external-writer-result.json', `${JSON.stringify(normalized, null, 2)}\n`);

  console.log('REAL_EXTERNAL_CALL=TRUE');
  console.log(`PROVIDER=${execution.selectedProvider}`);
  console.log(`MODEL=${execution.selectedModel}`);
  console.log(`SCREENPLAY_LENGTH=${screenplay.length}`);
  console.log(`STORYTELLING_SCORE=${Number(governance?.storytellingEvaluation?.overallScore ?? 0)}`);
  console.log(`FACT_MAPPING_RATE=${Number(governance?.factualReview?.mappingRate ?? 0)}`);
  console.log(`CEO_DECISION=${governance?.ceoApprovalRecommendation?.decision ?? 'UNKNOWN'}`);
  console.log('WROTE=/root/atlas/review/external-writer-first-pass.md');
  console.log('WROTE=/root/atlas/review/external-writer-result.json');
}

main().catch(error => {
  const failurePayload = {
    realExternalCallOccurred: false,
    error: {
      message: String(error?.message ?? error),
      status: error?.status ?? null,
      validationIssues: error?.validationIssues ?? null
    }
  };

  writeFileSync('/root/atlas/review/external-writer-result.json', `${JSON.stringify(failurePayload, null, 2)}\n`);
  console.error('REAL_EXTERNAL_CALL=FALSE');
  console.error(`ERROR=${String(error?.message ?? error)}`);
  console.error('WROTE=/root/atlas/review/external-writer-result.json');
  process.exitCode = 1;
});
