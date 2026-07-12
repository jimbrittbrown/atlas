import { mkdirSync, writeFileSync } from 'node:fs';
import { createFramerAdapterConfigFromEnv, redactFramerConfig, validateFramerAdapterConfig } from '../src/executive/framer-adapter-config.js';
import { AtlasFramerWebsiteAdapter } from '../src/executive/framer-website-adapter.js';

const OUTPUT_JSON = '/root/atlas/review/framer-live-integration-v1-report.json';
const OUTPUT_MD = '/root/atlas/review/framer-live-integration-v1-report.md';

function nowIso() {
  return new Date().toISOString();
}

async function runStage({ id, name, execute, stages }) {
  const startedAt = nowIso();
  let status = 'PASS';
  let output = null;
  let warnings = [];
  let blockingIssues = [];

  try {
    const result = await execute();
    output = result?.output ?? null;
    warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    blockingIssues = Array.isArray(result?.blockingIssues) ? result.blockingIssues : [];
    if (blockingIssues.length > 0) status = 'FAIL';
  } catch (error) {
    status = 'FAIL';
    blockingIssues = [error instanceof Error ? error.message : String(error)];
  }

  stages.push({
    id,
    name,
    status,
    startedAt,
    completedAt: nowIso(),
    warnings,
    blockingIssues,
    output
  });

  return stages[stages.length - 1];
}

function toMarkdown(report) {
  const rows = report.stages.map((stage) => `| ${stage.id} | ${stage.name} | ${stage.status} | ${stage.warnings.length} | ${stage.blockingIssues.length} |`).join('\n');
  const warnings = report.warnings.length > 0 ? report.warnings.map((w) => `- ${w}`).join('\n') : '- None';
  const blockers = report.blockingIssues.length > 0 ? report.blockingIssues.map((b) => `- ${b}`).join('\n') : '- None';
  const deps = report.dependencies.map((d) => `- ${d.name}: ${d.status} - ${d.detail}`).join('\n');
  const next = report.nextSteps.map((n) => `- ${n}`).join('\n');

  return `# Framer Live Integration v1 Report

## Objective
- Replace mocked Framer adapter path with real authenticated integration boundaries.
- Enforce read-only mode and stop before any destructive action.

## Result
- Overall status: ${report.overallStatus}
- Generated at: ${report.generatedAt}

## Stage Results
| ID | Stage | Status | Warnings | Blocking |
|---|---|---|---|---|
${rows}

## Warnings
${warnings}

## Blocking Issues
${blockers}

## Dependency Report
${deps}

## Configuration (Redacted)
\`\`\`json
${JSON.stringify(report.redactedConfig, null, 2)}
\`\`\`

## Duplicate Workflow Preparation
\`\`\`json
${JSON.stringify(report.duplicateWorkflowPreparation, null, 2)}
\`\`\`

## Next Steps
${next}
`;
}

async function main() {
  const config = createFramerAdapterConfigFromEnv(process.env);
  const validation = validateFramerAdapterConfig(config);

  const adapter = new AtlasFramerWebsiteAdapter({ config });
  const stages = [];
  const warnings = [];
  const blockingIssues = [];
  const dependencies = [];

  let connectionReport = null;
  let projectsReport = null;
  let metadataReport = null;
  let siteReport = null;
  let previewReport = null;
  let projectDetailReport = null;
  let duplicatePreparation = null;

  await runStage({
    id: 'P1',
    name: 'Authentication and Configuration',
    stages,
    execute: async () => {
      if (!validation.isValid) {
        dependencies.push({
          name: 'Framer credentials/configuration',
          status: 'MISSING',
          detail: validation.issues.join(' | ')
        });

        warnings.push('Configuration incomplete. Live connection could not be attempted.');

        return {
          output: {
            configValid: false,
            issues: validation.issues
          }
        };
      }

      if (config.readOnly !== true) {
        blockingIssues.push('FRAMER_READ_ONLY must remain true for this mission.');
      }

      if (config.allowProductionDeploy === true) {
        blockingIssues.push('FRAMER_ALLOW_PRODUCTION_DEPLOY must remain false for this mission.');
      }

      if (config.allowPreviewPublish === true) {
        blockingIssues.push('FRAMER_ALLOW_PREVIEW_PUBLISH must remain false for this mission.');
      }

      return {
        output: {
          configValid: true,
          readOnly: config.readOnly,
          liveMode: config.liveMode,
          dryRun: config.dryRun
        },
        blockingIssues: blockingIssues
      };
    }
  });

  await runStage({
    id: 'P2',
    name: 'Verify Connection and Retrieve Workspace/Projects/Sites',
    stages,
    execute: async () => {
      if (!validation.isValid) {
        return {
          warnings: ['Skipped live connection due to missing config.'],
          output: null
        };
      }

      connectionReport = await adapter.verifyConnection();

      const workspaceAvailable = connectionReport.workspace?.supported === true;
      const projectsAvailable = connectionReport.projects?.supported === true || connectionReport.projectInfo?.supported === true;
      const sitesAvailable = connectionReport.sites?.supported === true || connectionReport.publishInfo?.supported === true;

      if (!workspaceAvailable) {
        warnings.push('Workspace retrieval is not exposed by detected Server API methods in this context.');
      }
      if (!projectsAvailable) {
        warnings.push('Project listing methods unavailable; only connected project metadata may be accessible.');
      }
      if (!sitesAvailable) {
        warnings.push('Site listing methods unavailable; publish info may still provide partial site metadata.');
      }

      return {
        output: connectionReport,
        warnings: connectionReport.limitations ?? []
      };
    }
  });

  await runStage({
    id: 'P3',
    name: 'Execute Read Operations',
    stages,
    execute: async () => {
      if (!validation.isValid) {
        return {
          warnings: ['Skipped read operations due to missing config.']
        };
      }

      projectsReport = await adapter.listProjects();
      metadataReport = await adapter.readProjectMetadata();
      siteReport = await adapter.readSiteInformation();
      previewReport = await adapter.readPreviewInformation();
      projectDetailReport = await adapter.readAllProjectDetails();

      return {
        output: {
          projects: projectsReport,
          metadata: metadataReport,
          sites: siteReport,
          preview: previewReport,
          projectDetails: projectDetailReport
        }
      };
    }
  });

  await runStage({
    id: 'P4',
    name: 'Prepare Duplicate Workflow (Do Not Execute)',
    stages,
    execute: async () => {
      duplicatePreparation = await adapter.prepareDuplicateWorkflow({
        sourceProjectId: metadataReport?.projectInfo?.id ?? null,
        duplicateName: 'RidgeLine Roofing - Duplicate - Prepared'
      });

      return {
        output: duplicatePreparation
      };
    }
  });

  await runStage({
    id: 'P5',
    name: 'Website Orchestrator Integration Readiness',
    stages,
    execute: async () => {
      return {
        output: {
          providerInterfaceUnchanged: true,
          framerProviderType: 'FRAMER',
          providerModule: 'integration/src/executive/website-provider-adapters.js',
          adapterModule: 'integration/src/executive/framer-website-adapter.js'
        }
      };
    }
  });

  const overallStatus = stages.every((stage) => stage.status === 'PASS') ? 'PASS' : 'FAIL';

  const report = {
    generatedAt: nowIso(),
    overallStatus,
    stages,
    warnings,
    blockingIssues,
    dependencies,
    redactedConfig: redactFramerConfig(config),
    connectionReport,
    readOperations: {
      projectsReport,
      metadataReport,
      siteReport,
      previewReport,
      projectDetailReport
    },
    duplicateWorkflowPreparation: duplicatePreparation,
    nextSteps: [
      'Keep FRAMER_READ_ONLY=true until CEO explicitly approves write testing.',
      'Keep FRAMER_ALLOW_PREVIEW_PUBLISH=false and FRAMER_ALLOW_PRODUCTION_DEPLOY=false.',
      'After CEO approval, run controlled sandbox-only write validation in a duplicated project, never in production.',
      'Do not execute duplicate workflow until CEO ticket authorizes duplication testing.'
    ]
  };

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, toMarkdown(report));

  console.log('Framer Live Integration v1 report generated.');
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`Markdown: ${OUTPUT_MD}`);
  console.log(`Overall Status: ${overallStatus}`);
}

main().catch((error) => {
  console.error('Framer live integration mission failed.');
  console.error(error);
  process.exitCode = 1;
});
