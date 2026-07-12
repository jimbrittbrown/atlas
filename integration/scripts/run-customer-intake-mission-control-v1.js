import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';

const OUTPUT_JSON = '/root/atlas/review/customer-intake-mission-control-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/customer-intake-mission-control-v1-report.md';

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
  const activityLines = result.dashboard.recentActivityFeed.length > 0
    ? result.dashboard.recentActivityFeed.map((entry) => `- ${entry.timestamp} | ${entry.type}`).join('\n')
    : '- None';

  return `# Customer Intake & Mission Control v1 Validation Report

## Result
- Intake accepted: ${result.accepted ? 'YES' : 'NO'}
- Customer ID: ${result.customer?.customerId ?? 'N/A'}
- Mission ID: ${result.mission?.missionId ?? 'N/A'}
- Executive status: ${result.mission?.executiveStatus ?? 'N/A'}

## Governance
- Publish attempted: NO
- Deploy attempted: NO
- Destructive operations: NO

## Dashboard Snapshot
- Total customers: ${result.dashboard.totalCustomers}
- Active missions: ${result.dashboard.activeMissions}
- Awaiting executive review: ${result.dashboard.awaitingExecutiveReview}
- Completed missions: ${result.dashboard.completedMissions}
- Blocked missions: ${result.dashboard.blockedMissions}

## Recent Activity
${activityLines}

## Mission Downstream Summary
\`\`\`json
${JSON.stringify({
  missionState: result.downstreamResult?.mission?.state ?? null,
  currentStage: result.downstreamResult?.mission?.currentStageId ?? null,
  completionPercentage: result.downstreamResult?.progress?.completionPercentage ?? null
}, null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();

  const control = new CustomerIntakeMissionControl();

  const result = await control.intake({
    companyName: 'North Ridge HVAC',
    contactName: 'Morgan Lee',
    email: 'morgan@northridge.example',
    phone: '+1-303-555-0199',
    website: 'https://northridge.example',
    industry: 'Home Services',
    missionType: 'WEBSITE_BUILD',
    adapterType: 'FRAMER',
    providerHint: 'FRAMER_SANDBOX',
    existingBranding: {
      colors: {
        primary: '#0F172A',
        secondary: '#F59E0B'
      }
    }
  });

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(result));

  console.log('Customer Intake & Mission Control v1 validation completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Accepted: ${result.accepted ? 'YES' : 'NO'}`);

  if (!result.accepted) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Customer Intake & Mission Control v1 validation failed.');
  console.error(error);
  process.exitCode = 1;
});
