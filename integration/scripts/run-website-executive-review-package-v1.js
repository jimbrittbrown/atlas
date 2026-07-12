import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebsiteExecutiveReviewMissionManager } from '../src/executive/website-executive-review-mission-manager.js';

const OUTPUT_JSON = '/root/atlas/review/website-executive-review-package-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/website-executive-review-package-v1-report.md';

function loadIntegrationEnvFile() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const integrationRoot = resolve(scriptDir, '..');
  const envPath = resolve(integrationRoot, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  const lines = String(content).split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (key.length === 0 || typeof process.env[key] === 'string') {
      continue;
    }

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"'))
      || (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      process.env[key] = rawValue.slice(1, -1);
      continue;
    }

    process.env[key] = rawValue;
  }
}

function toMarkdown(result) {
  const stageLines = result.mission.stageHistory.map((entry) => (
    `| ${entry.stageId} | ${entry.status} | ${entry.startedAt} | ${entry.completedAt ?? '-'} |`
  )).join('\n');

  const review = result.executiveReviewPackage ?? {};
  const missingAssets = Array.isArray(review.missingAssets) && review.missingAssets.length > 0
    ? review.missingAssets.map((item) => `- ${item}`).join('\n')
    : '- None';

  const risks = Array.isArray(review.risks) && review.risks.length > 0
    ? review.risks.map((item) => `- ${item}`).join('\n')
    : '- None';

  return `# Website Executive Review Package v1 Report

## Result
- Mission ID: ${result.mission.missionId}
- Mission State: ${result.mission.state}
- Completion: ${result.progress.completionPercentage}%
- Current Stage: ${result.progress.currentStage}

## Governance
- Publish attempted: ${result.governance.publishAttempted ? 'YES' : 'NO'}
- Deploy attempted: ${result.governance.deployAttempted ? 'YES' : 'NO'}
- Destructive operation attempted: ${result.governance.destructiveOperationAttempted ? 'YES' : 'NO'}

## Stage History
| Stage | Status | Started | Completed |
|---|---|---|---|
${stageLines}

## Executive Review Decision
- Executive Recommendation: ${review.executiveRecommendation ?? 'N/A'}
- Confidence Score: ${review.confidenceScore ?? 'N/A'}

## Missing Assets
${missingAssets}

## Risks
${risks}

## Executive Review Package
\`\`\`json
${JSON.stringify(review, null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();

  const manager = new WebsiteExecutiveReviewMissionManager();
  const prospectUrl = String(process.env.ATLAS_EXECUTIVE_REVIEW_WEBSITE_URL ?? 'https://www.apple.com').trim();

  const result = await manager.runMission({
    missionId: `website-executive-review-v1-${Date.now()}`,
    prospectUrl,
    prospect: {
      approved: true,
      approvedBy: 'ATLAS_EXECUTIVE_REVIEW_AUTOMATION',
      segment: 'Public Company Website Review'
    },
    adapterType: 'FRAMER'
  });

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(result));

  console.log('Website Executive Review Package v1 mission completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Mission State: ${result.mission.state}`);

  if (result.mission.state !== 'AWAITING_CEO_APPROVAL') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Website Executive Review Package v1 mission failed.');
  console.error(error);
  process.exitCode = 1;
});
