import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFramerAdapterConfigFromEnv,
  redactFramerConfig,
  validateFramerAdapterConfig
} from '../src/executive/framer-adapter-config.js';
import { AtlasFramerWebsiteAdapter } from '../src/executive/framer-website-adapter.js';

const OUTPUT_JSON = '/root/atlas/review/framer-read-engine-v2-capability-report.json';
const OUTPUT_MD = '/root/atlas/review/framer-read-engine-v2-capability-report.md';

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
  const supported = report.supportedEndpoints.length > 0
    ? report.supportedEndpoints.map((entry) => `- ${entry.category}.${entry.operationId} via ${entry.methodName}`).join('\n')
    : '- None';
  const unsupported = report.unsupportedEndpoints.length > 0
    ? report.unsupportedEndpoints.map((entry) => `- ${entry.category}.${entry.operationId}: ${entry.reason ?? 'Not exposed'}`).join('\n')
    : '- None';
  const limitations = report.limitations.length > 0
    ? report.limitations.map((entry) => `- ${entry}`).join('\n')
    : '- None';
  const recommendations = report.recommendedFutureWriteOperations.length > 0
    ? report.recommendedFutureWriteOperations.map((entry) => `- ${entry}`).join('\n')
    : '- None';

  return `# Framer Read Engine v2 Capability Report

## Result
- Status: ${report.status}
- Connected: ${report.connected ? 'YES' : 'NO'}
- Mode: ${report.mode}
- Available Methods Detected: ${report.availableMethodCount}

## Supported Endpoints
${supported}

## Unsupported Endpoints
${unsupported}

## Limitations
${limitations}

## Recommended Future Write Operations
${recommendations}

## Categories
\`\`\`json
${JSON.stringify(report.categories, null, 2)}
\`\`\`

## Redacted Configuration
\`\`\`json
${JSON.stringify(report.redactedConfig, null, 2)}
\`\`\`
`;
}

async function main() {
  loadIntegrationEnvFile();

  const config = createFramerAdapterConfigFromEnv(process.env);
  const validation = validateFramerAdapterConfig(config);

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    connected: false,
    mode: config.dryRun ? 'DRY_RUN' : 'LIVE',
    availableMethodCount: 0,
    supportedEndpoints: [],
    unsupportedEndpoints: [],
    categories: {},
    limitations: [],
    recommendedFutureWriteOperations: [],
    blockingIssues: [],
    redactedConfig: redactFramerConfig(config)
  };

  if (!validation.isValid) {
    report.blockingIssues.push(...validation.issues);
  }

  if (config.readOnly !== true) {
    report.blockingIssues.push('FRAMER_READ_ONLY must be true for Read Engine v2 capability discovery.');
  }

  if (report.blockingIssues.length === 0) {
    try {
      const adapter = new AtlasFramerWebsiteAdapter({ config });
      const details = await adapter.readAllProjectDetails();

      report.connected = Boolean(details.connected);
      report.mode = details.mode ?? report.mode;
      report.availableMethodCount = Number(details.availableMethodCount ?? 0);
      report.supportedEndpoints = Array.isArray(details.supportedEndpoints) ? details.supportedEndpoints : [];
      report.unsupportedEndpoints = Array.isArray(details.unsupportedEndpoints) ? details.unsupportedEndpoints : [];
      report.categories = details.categories ?? {};
      report.limitations = Array.isArray(details.limitations) ? details.limitations : [];
      report.recommendedFutureWriteOperations = Array.isArray(details.recommendedFutureWriteOperations)
        ? details.recommendedFutureWriteOperations
        : [];

      report.status = details.connected ? 'PASS' : 'FAIL';
    } catch (error) {
      report.blockingIssues.push(error instanceof Error ? error.message : String(error));
    }
  }

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(report));

  console.log('Framer Read Engine v2 capability report generated.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Status: ${report.status}`);

  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Framer Read Engine v2 capability report failed.');
  console.error(error);
  process.exitCode = 1;
});
