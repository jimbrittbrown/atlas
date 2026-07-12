import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebsiteBuilderMissionManager } from '../src/executive/website-builder-mission-manager.js';

const OUTPUT_JSON = '/root/atlas/review/website-builder-mission-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/website-builder-mission-v1-report.md';

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

  const warningLines = result.mission.warnings.length > 0
    ? result.mission.warnings.map((item) => `- ${item}`).join('\n')
    : '- None';

  const blockingLines = result.mission.blockingIssues.length > 0
    ? result.mission.blockingIssues.map((item) => `- ${item}`).join('\n')
    : '- None';

  const failureLines = result.mission.failureLog.length > 0
    ? result.mission.failureLog.map((item) => `- ${item.stageId}: ${item.errorMessage ?? item.reason}`).join('\n')
    : '- None';

  return `# Website Builder Mission v1 Report

## Result
- Mission ID: ${result.mission.missionId}
- State: ${result.mission.state}
- Completion: ${result.progress.completionPercentage}%
- Current Stage: ${result.progress.currentStage}

## Governance
- Publish attempted: ${result.governance.publishAttempted ? 'YES' : 'NO'}
- Deploy attempted: ${result.governance.deployAttempted ? 'YES' : 'NO'}
- Destructive operation attempted: ${result.governance.destructiveOperationAttempted ? 'YES' : 'NO'}
- Stop before publish: ${result.governance.stopBeforePublish ? 'YES' : 'NO'}

## Stage History
| Stage | Status | Started | Completed |
|---|---|---|---|
${stageLines}

## Warnings
${warningLines}

## Blocking Issues
${blockingLines}

## Failures
${failureLines}

## Sandbox Build Result
\`\`\`json
${JSON.stringify(result.mission.artifacts.sandboxBuildResult, null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();

  const manager = new WebsiteBuilderMissionManager();
  const missionRequest = {
    missionId: `website-builder-mission-v1-${Date.now()}`,
    prospectUrl: 'https://www.ridgeline-roofing.example',
    prospect: {
      approved: true,
      approvedBy: 'ATLAS_EXECUTIVE_AUTONOMOUS_WEBSITE_BUILDER',
      companyName: 'RidgeLine Roofing (Sandbox Build)'
    },
    existingBranding: {
      palette: 'amber-black',
      tone: 'authoritative'
    },
    adapterType: 'FRAMER',
    websiteRequirements: {
      pages: ['home', 'services', 'about', 'contact'],
      sections: ['hero', 'services-grid', 'testimonials', 'contact-cta']
    },
    stopAfterSandboxUpdate: true
  };

  const result = await manager.runMission(missionRequest);

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(result));

  console.log('Website Builder Mission v1 completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`State: ${result.mission.state}`);

  if (result.mission.state !== 'COMPLETED') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Website Builder Mission v1 failed.');
  console.error(error);
  process.exitCode = 1;
});
