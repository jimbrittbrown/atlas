import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFramerAdapterConfigFromEnv, redactFramerConfig } from '../src/executive/framer-adapter-config.js';
import { AtlasFramerWebsiteAdapter } from '../src/executive/framer-website-adapter.js';
import { runFramerStartupValidation } from '../src/executive/framer-startup-validator.js';

const OUTPUT_JSON = '/root/atlas/review/framer-readonly-connection-test-v1.json';
const OUTPUT_MD = '/root/atlas/review/framer-readonly-connection-test-v1.md';

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

function toMarkdown(report) {
  const warningLines = report.warnings.length > 0 ? report.warnings.map((w) => `- ${w}`).join('\n') : '- None';
  const blockerLines = report.blockingIssues.length > 0 ? report.blockingIssues.map((b) => `- ${b}`).join('\n') : '- None';

  return `# Framer Read-Only Connection Test v1

## Result
- Status: ${report.status}
- Authenticated: ${report.authenticated ? 'YES' : 'NO'}
- Read-Only Enforcement: ${report.readOnlyEnforced ? 'YES' : 'NO'}
- Network Writes Executed: NO
- Publish Executed: NO

## Read Operations
- Workspace read attempted: ${report.reads.workspaceAttempted ? 'YES' : 'NO'}
- Project read attempted: ${report.reads.projectAttempted ? 'YES' : 'NO'}
- Site read attempted: ${report.reads.siteAttempted ? 'YES' : 'NO'}

## Warnings
${warningLines}

## Blocking Issues
${blockerLines}

## Redacted Configuration
\`\`\`json
${JSON.stringify(report.redactedConfig, null, 2)}
\`\`\`

## Connection Report
\`\`\`json
${JSON.stringify(report.connectionReport, null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();
  const preflight = runFramerStartupValidation(process.env);
  const config = createFramerAdapterConfigFromEnv(process.env);

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    authenticated: false,
    readOnlyEnforced: false,
    reads: {
      workspaceAttempted: false,
      projectAttempted: false,
      siteAttempted: false
    },
    warnings: [],
    blockingIssues: [],
    redactedConfig: redactFramerConfig(config),
    connectionReport: null
  };

  if (!preflight.ok) {
    report.blockingIssues.push('Startup validation failed. Run validate-framer-startup-config-v1 first.');
    report.blockingIssues.push(...preflight.issues);
  }

  if (config.readOnly !== true) {
    report.blockingIssues.push('FRAMER_READ_ONLY must be true.');
  }

  if (config.liveMode !== true) {
    report.blockingIssues.push('FRAMER_LIVE_MODE must be true for live connection test.');
  }

  if (config.dryRun !== false) {
    report.blockingIssues.push('FRAMER_DRY_RUN must be false for live connection test.');
  }

  if (config.allowPreviewPublish !== false) {
    report.blockingIssues.push('FRAMER_ALLOW_PREVIEW_PUBLISH must be false.');
  }

  if (config.allowProductionDeploy !== false) {
    report.blockingIssues.push('FRAMER_ALLOW_PRODUCTION_DEPLOY must be false.');
  }

  if (config.allowProjectDuplication !== false) {
    report.blockingIssues.push('FRAMER_ALLOW_PROJECT_DUPLICATION must be false.');
  }

  if (report.blockingIssues.length === 0) {
    const adapter = new AtlasFramerWebsiteAdapter({ config });

    try {
      const connectionReport = await adapter.verifyConnection();
      report.connectionReport = connectionReport;
      report.authenticated = true;
      report.readOnlyEnforced = true;
      report.reads.workspaceAttempted = true;
      report.reads.projectAttempted = true;
      report.reads.siteAttempted = true;

      if (Array.isArray(connectionReport.limitations) && connectionReport.limitations.length > 0) {
        report.warnings.push(...connectionReport.limitations);
      }

      report.status = 'PASS';
    } catch (error) {
      report.blockingIssues.push(error instanceof Error ? error.message : String(error));
    }
  }

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(report));

  console.log('Framer read-only connection test completed.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Status: ${report.status}`);

  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Framer read-only connection test failed.');
  console.error(error);
  process.exitCode = 1;
});
