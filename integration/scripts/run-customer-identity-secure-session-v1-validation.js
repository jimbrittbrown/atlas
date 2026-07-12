import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function nowIso() {
  return new Date().toISOString();
}

function runStep({ name, cwd, command, env = {} }) {
  const startedAt = Date.now();
  const result = spawnSync('bash', ['-lc', command], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const output = `${stdout}${stderr}`;

  return {
    name,
    cwd,
    command,
    exitCode: Number(result.status ?? 1),
    durationMs: Date.now() - startedAt,
    output,
    summary: parseSummary(output)
  };
}

function parseSummary(output) {
  const nodeSummary = /(?:\u2139\s*)?tests\s+(\d+)[\s\S]*?(?:\u2139\s*)?pass\s+(\d+)[\s\S]*?(?:\u2139\s*)?fail\s+(\d+)/im.exec(output);
  if (nodeSummary) {
    return {
      framework: 'node-test',
      tests: Number(nodeSummary[1]),
      pass: Number(nodeSummary[2]),
      fail: Number(nodeSummary[3])
    };
  }

  const vitestPass = /Tests\s+(\d+)\s+passed\s+\((\d+)\)/m.exec(output);
  const vitestFail = /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed\s+\((\d+)\)/m.exec(output);
  if (vitestFail) {
    return {
      framework: 'vitest',
      tests: Number(vitestFail[3]),
      pass: Number(vitestFail[2]),
      fail: Number(vitestFail[1])
    };
  }
  if (vitestPass) {
    return {
      framework: 'vitest',
      tests: Number(vitestPass[2]),
      pass: Number(vitestPass[1]),
      fail: 0
    };
  }

  return {
    framework: 'unknown',
    tests: null,
    pass: null,
    fail: null
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Customer Identity & Secure Sessions v1 Validation Report');
  lines.push('');
  lines.push(`- Generated At: ${report.generatedAt}`);
  lines.push(`- Overall Status: ${report.overallStatus}`);
  lines.push('');
  lines.push('## Executed Steps');
  lines.push('');

  report.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.name}`);
    lines.push(`   - Command: ${step.command}`);
    lines.push(`   - Cwd: ${step.cwd}`);
    lines.push(`   - Exit Code: ${step.exitCode}`);
    lines.push(`   - Duration Ms: ${step.durationMs}`);
    lines.push(`   - Summary: framework=${step.summary.framework}, tests=${step.summary.tests}, pass=${step.summary.pass}, fail=${step.summary.fail}`);
  });

  lines.push('');
  lines.push('## Aggregated Totals');
  lines.push('');
  lines.push(`- Tests: ${report.totals.tests}`);
  lines.push(`- Passed: ${report.totals.pass}`);
  lines.push(`- Failed: ${report.totals.fail}`);
  lines.push('');
  lines.push('## Governance');
  lines.push('');
  lines.push('- No deploy, publish, or production infrastructure modifications were performed by this validation runner.');
  lines.push('- No production secrets were emitted in report outputs.');

  return `${lines.join('\n')}\n`;
}

const steps = [
  {
    name: 'Focused Auth Security Tests',
    cwd: '/root/atlas/integration',
    command: 'node --test test/customer-auth-security.test.js test/customer-intake-api.test.js'
  },
  {
    name: 'Customer Portal + Mission Control Regressions',
    cwd: '/root/atlas/integration',
    command: 'node --test test/customer-portal.test.js test/customer-dashboard.test.js test/customer-intake-mission-control.test.js'
  },
  {
    name: 'Executive Dashboard Frontend Regressions',
    cwd: '/root/atlas/apps/executive-dashboard',
    command: 'npm test -- --run'
  },
  {
    name: 'Broad Integration Regression',
    cwd: '/root/atlas/integration',
    command: "printf 'ELEVENLABS_API_KEY=test-local-key\\n' > .env && node --test test/*.test.js; status=$?; rm -f .env; exit $status"
  }
];

const results = steps.map((step) => runStep(step));
const totals = results.reduce((acc, step) => {
  acc.tests += Number(step.summary.tests ?? 0);
  acc.pass += Number(step.summary.pass ?? 0);
  acc.fail += Number(step.summary.fail ?? 0);
  return acc;
}, { tests: 0, pass: 0, fail: 0 });

const overallStatus = results.every((step) => step.exitCode === 0) ? 'PASS' : 'FAIL';
const report = {
  mission: 'Customer Identity & Secure Sessions v1',
  generatedAt: nowIso(),
  overallStatus,
  totals,
  steps: results.map((step) => ({
    name: step.name,
    cwd: step.cwd,
    command: step.command,
    exitCode: step.exitCode,
    durationMs: step.durationMs,
    summary: step.summary
  }))
};

const reviewDir = '/root/atlas/review';
const jsonPath = join(reviewDir, 'customer-identity-secure-session-v1-report.json');
const mdPath = join(reviewDir, 'customer-identity-secure-session-v1-report.md');

writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(mdPath, buildMarkdownReport(report));

if (overallStatus !== 'PASS') {
  process.exitCode = 1;
}
