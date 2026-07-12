import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebsiteDemonstrationMissionManager } from '../src/executive/website-demonstration-mission-manager.js';

const OUTPUT_JSON = '/root/atlas/review/website-demonstration-mission-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/website-demonstration-mission-v1-report.md';

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

  const failureLines = result.mission.failureLog.length > 0
    ? result.mission.failureLog.map((entry) => `- ${entry.stageId}: ${entry.errorMessage ?? entry.reason}`).join('\n')
    : '- None';

  const reviewPackage = result.executiveReviewPackage ?? {};
  const screenshotLines = Array.isArray(reviewPackage.screenshotReferences) && reviewPackage.screenshotReferences.length > 0
    ? reviewPackage.screenshotReferences.map((entry) => `- ${entry.type}: ${entry.reference ?? 'N/A'}`).join('\n')
    : '- None';

  return `# Website Demonstration Mission v1 Report

## Result
- Mission ID: ${result.mission.missionId}
- State: ${result.mission.state}
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

## Executive Review Highlights
- Business summary company: ${reviewPackage.businessSummary?.companyName ?? 'N/A'}
- Selected template: ${reviewPackage.selectedTemplate?.templateId ?? 'N/A'}
- Confidence score: ${reviewPackage.confidenceScore ?? 'N/A'}
- CEO recommendation: ${reviewPackage.ceoApprovalRecommendation ?? 'N/A'}

## Screenshot References
${screenshotLines}

## Failures
${failureLines}

## Executive Review Package
\`\`\`json
${JSON.stringify(reviewPackage, null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();

  const manager = new WebsiteDemonstrationMissionManager();
  const websiteUrl = String(process.env.ATLAS_DEMO_WEBSITE_URL ?? 'https://www.apple.com').trim();

  const result = await manager.runMission({
    missionId: `website-demonstration-mission-v1-${Date.now()}`,
    websiteUrl,
    prospect: {
      approved: true,
      approvedBy: 'ATLAS_EXECUTIVE_DEMONSTRATION_MISSION',
      companyName: null,
      segment: 'Public Company Website Demonstration'
    },
    adapterType: 'FRAMER'
  });

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(result));

  console.log('Website Demonstration Mission v1 completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`State: ${result.mission.state}`);

  if (result.mission.state !== 'COMPLETED') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Website Demonstration Mission v1 failed.');
  console.error(error);
  process.exitCode = 1;
});
