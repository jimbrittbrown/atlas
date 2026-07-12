import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebsiteBuilderMissionManager } from '../src/executive/website-builder-mission-manager.js';

const OUTPUT_JSON = '/root/atlas/review/workforce-director-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/workforce-director-v1-report.md';

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
  const workforce = result.workforce ?? {};
  const dashboard = workforce.dashboard ?? {};
  const assignments = workforce.assignments?.assignmentPlan?.stageAssignments ?? [];

  const assignmentTable = assignments.map((stage) => {
    const assigned = stage.workers.map((worker) => `${worker.workerName} (${worker.specialty})`).join(', ') || 'None';
    return `| ${stage.stageId} | ${stage.ready ? 'YES' : 'NO'} | ${assigned} |`;
  }).join('\n');

  return `# Atlas Workforce Director v1 Report

## Mission Execution
- Mission ID: ${result.mission.missionId}
- State: ${result.mission.state}
- Completion: ${result.progress.completionPercentage}%
- Current Stage: ${result.progress.currentStage}

## Governance
- Publish attempted: ${result.governance.publishAttempted ? 'YES' : 'NO'}
- Deploy attempted: ${result.governance.deployAttempted ? 'YES' : 'NO'}
- Destructive operation attempted: ${result.governance.destructiveOperationAttempted ? 'YES' : 'NO'}

## Workforce Dashboard
- Active workers: ${dashboard.activeWorkers ?? 0}
- Idle workers: ${dashboard.idleWorkers ?? 0}
- Worker utilization: ${dashboard.workerUtilization ?? 0}%
- Blocked workers: ${dashboard.blockedWorkers ?? 0}

## Stage Assignments
| Stage | Ready | Assigned Workers |
|---|---|---|
${assignmentTable}

## Workload Snapshot
\`\`\`json
${JSON.stringify(dashboard.currentWorkload ?? [], null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();

  const manager = new WebsiteBuilderMissionManager();
  const result = await manager.runMission({
    missionId: `workforce-director-v1-${Date.now()}`,
    prospectUrl: 'https://www.ridgeline-roofing.example',
    prospect: {
      approved: true,
      approvedBy: 'ATLAS_WORKFORCE_DIRECTOR_V1',
      companyName: 'RidgeLine Roofing'
    },
    existingBranding: {
      palette: 'amber-black',
      tone: 'authoritative'
    },
    adapterType: 'FRAMER',
    websiteRequirements: {
      pages: ['home', 'services', 'about', 'contact']
    },
    stopAfterSandboxUpdate: true
  });

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(result));

  console.log('Atlas Workforce Director v1 validation completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`State: ${result.mission.state}`);

  if (result.mission.state !== 'COMPLETED') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Atlas Workforce Director v1 validation failed.');
  console.error(error);
  process.exitCode = 1;
});
