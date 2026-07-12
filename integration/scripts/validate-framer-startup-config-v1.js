import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFramerStartupValidation } from '../src/executive/framer-startup-validator.js';

const OUTPUT_JSON = '/root/atlas/review/framer-startup-validation-v1.json';
const OUTPUT_MD = '/root/atlas/review/framer-startup-validation-v1.md';

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
  const issueLines = result.issues.length > 0
    ? result.issues.map((issue) => `- ${issue}`).join('\n')
    : '- None';

  const missingLines = result.missingVariables.length > 0
    ? result.missingVariables.map((name) => `- ${name}`).join('\n')
    : '- None';

  const requiredLines = result.requiredVariables.map((name) => `- ${name}`).join('\n');

  return `# Framer Startup Validation v1 (Offline)

## Result
- Status: ${result.ok ? 'PASS' : 'FAIL'}
- Network Requests: NONE

## Checks
- Environment variables exist: ${result.checks.environmentComplete ? 'PASS' : 'FAIL'}
- API key format valid: ${result.checks.apiKeyFormatValid ? 'PASS' : 'FAIL'}
- Project URL format valid: ${result.checks.projectUrlFormatValid ? 'PASS' : 'FAIL'}
- Configuration complete and policy-valid: ${result.checks.configValid ? 'PASS' : 'FAIL'}

## Required Variables
${requiredLines}

## Missing Variables
${missingLines}

## Issues
${issueLines}

## Redacted Configuration
\`\`\`json
${JSON.stringify(result.redactedConfig, null, 2)}
\`\`\`
`;
}

function main() {
  loadIntegrationEnvFile();
  const result = runFramerStartupValidation(process.env);

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(result));

  console.log('Framer startup validation completed (offline, no network).');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Status: ${result.ok ? 'PASS' : 'FAIL'}`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main();
