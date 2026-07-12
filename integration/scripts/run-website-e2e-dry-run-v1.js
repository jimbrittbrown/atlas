import { mkdirSync, writeFileSync } from 'node:fs';
import { AtlasWebsiteOrchestrator } from '../src/executive/website-orchestrator.js';
import { AtlasFramerWebsiteAdapter } from '../src/executive/framer-website-adapter.js';
import { FramerWebsiteAdapter, WebsiteProviderAdapterRegistry } from '../src/executive/website-provider-adapters.js';

const REPORT_JSON_PATH = '/root/atlas/review/atlas-website-e2e-dry-run-v1-report.json';
const REPORT_MD_PATH = '/root/atlas/review/atlas-website-e2e-dry-run-v1-report.md';

function nowIso() {
  return new Date().toISOString();
}

function toConfidence(values = []) {
  const valid = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (valid.length === 0) return 0;
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Number(average.toFixed(2));
}

function createStageTracker() {
  const timeline = [];
  const stageResults = [];

  async function runStage({ id, name, execute }) {
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
      if (blockingIssues.length > 0) {
        status = 'FAIL';
      }
    } catch (error) {
      status = 'FAIL';
      blockingIssues = [error instanceof Error ? error.message : String(error)];
    }

    const completedAt = nowIso();

    timeline.push({
      stageId: id,
      stageName: name,
      startedAt,
      completedAt,
      status
    });

    stageResults.push({
      stageId: id,
      stageName: name,
      status,
      warnings,
      blockingIssues,
      output
    });

    return {
      status,
      output,
      warnings,
      blockingIssues
    };
  }

  return {
    timeline,
    stageResults,
    runStage
  };
}

function createDryRunFramerConfig() {
  return {
    projectUrl: 'https://framer.com/projects/ridgeline-roofing-demo-sandbox',
    apiKey: 'dry-run-placeholder-key',
    apiKeyEnvVarName: 'FRAMER_API_KEY',
    dryRun: true,
    allowPreviewPublish: true,
    allowProductionDeploy: false,
    maxRetries: 2,
    retryDelayMs: 100,
    requestTimeoutMs: 30000,
    externalAgentEnabled: true,
    pluginFallbackEnabled: true
  };
}

function createMissionInput() {
  return {
    missionId: `atlas-web-e2e-dry-run-${Date.now()}`,
    prospect: {
      approved: true,
      approvedBy: 'ATLAS_EXECUTIVE_DEMO_SYSTEM',
      approvedAt: nowIso(),
      companyName: 'RidgeLine Roofing (Fictional Demonstration)',
      segment: 'Local Service Business',
      serviceArea: 'Denver Metro (Demo)',
      notes: 'Demonstration customer only; no real customer data.'
    },
    existingBranding: {
      companyName: 'RidgeLine Roofing',
      logo: 'ridgeline-roofing-logo-demo.svg',
      colors: {
        primary: '#1E3A5F',
        secondary: '#D97706',
        neutral: '#F3F4F6'
      },
      services: ['Roof Repair', 'Roof Replacement', 'Storm Damage Inspection'],
      contact: {
        phone: '(303) 555-0119',
        email: 'hello@ridgeline-roofing.demo'
      },
      serviceAreas: ['Denver', 'Aurora', 'Lakewood'],
      reviews: [
        {
          source: 'Demo Review',
          quote: 'Fast response, clear estimate, and excellent cleanup.'
        }
      ],
      photography: ['roof-inspection-demo-01.jpg', 'crew-install-demo-02.jpg']
    },
    adapterType: 'FRAMER',
    ceoDecision: 'PENDING',
    estimatedStageMinutes: 5
  };
}

function buildExecutiveReport({
  missionInput,
  timeline,
  stageResults,
  handoffs,
  orchestratorResult,
  framerPreviewResult,
  qaReport,
  dependencies,
  warnings,
  blockingIssues,
  missingIntegrations
}) {
  const stagePassCount = stageResults.filter((stage) => stage.status === 'PASS').length;
  const overallStatus = stageResults.every((stage) => stage.status === 'PASS') ? 'PASS' : 'FAIL';

  const confidenceSignals = [
    orchestratorResult?.dashboard?.confidence,
    qaReport?.confidence,
    handoffs?.intelligenceToProductionAccepted ? 0.9 : 0.2,
    handoffs?.productionToOrchestratorAccepted ? 0.9 : 0.2,
    handoffs?.orchestratorInvokedFramerAdapter ? 0.9 : 0.2,
    handoffs?.framerPreviewReturned ? 0.9 : 0.2,
    handoffs?.qaExecuted ? 0.9 : 0.2,
    handoffs?.executiveReportGenerated ? 0.9 : 0.2
  ];

  const confidence = toConfidence(confidenceSignals);

  return {
    mission: {
      id: missionInput.missionId,
      objective: 'Atlas Website End-to-End Dry Run v1',
      customer: missionInput.prospect.companyName,
      mode: 'DRY_RUN',
      publishPolicy: 'NO_PUBLISH',
      stopCondition: 'CEO_APPROVAL_GATE'
    },
    overallStatus,
    summary: {
      stagePassCount,
      totalStages: stageResults.length,
      confidence
    },
    stageResults,
    timeline,
    handoffValidation: {
      intelligenceOutputAcceptedByProductionSystem: handoffs.intelligenceToProductionAccepted,
      productionOutputAcceptedByWebsiteOrchestrator: handoffs.productionToOrchestratorAccepted,
      orchestratorInvokedFramerAdapter: handoffs.orchestratorInvokedFramerAdapter,
      framerAdapterReturnedPreviewResponse: handoffs.framerPreviewReturned,
      qaExecuted: handoffs.qaExecuted,
      executiveReportGenerated: handoffs.executiveReportGenerated
    },
    orchestrator: {
      missionState: orchestratorResult?.mission?.state ?? 'UNKNOWN',
      currentStage: orchestratorResult?.dashboard?.currentStage ?? 'UNKNOWN',
      completionPercentage: orchestratorResult?.dashboard?.completionPercentage ?? 0,
      blockingIssues: orchestratorResult?.dashboard?.blockingIssues ?? []
    },
    framerPreview: framerPreviewResult,
    qaReport,
    warnings,
    blockingIssues,
    missingIntegrations,
    dependencyReport: dependencies,
    recommendedNextEngineeringTasks: [
      'Add live Framer sandbox credentials in secret manager after CEO approval ticket.',
      'Implement capability probes for method-level Server API availability and route unsupported edits to Plugin/External Agent boundaries.',
      'Add persistent checkpoint storage for resume across process restarts (current idempotency cache is in-memory).',
      'Add executive dashboard mission panel for dry-run dependency status and approval readiness.',
      'Add a controlled live sandbox integration test command guarded by FRAMER_ALLOW_PRODUCTION_DEPLOY=false.'
    ]
  };
}

function toMarkdown(report) {
  const stageLines = report.stageResults.map((stage) => (
    `| ${stage.stageId} | ${stage.stageName} | ${stage.status} | ${stage.warnings.length} | ${stage.blockingIssues.length} |`
  )).join('\n');

  const timelineLines = report.timeline.map((item) => (
    `| ${item.stageId} | ${item.startedAt} | ${item.completedAt} | ${item.status} |`
  )).join('\n');

  const dependencyLines = report.dependencyReport.map((dep) => (
    `- ${dep.name}: ${dep.status} - ${dep.detail}`
  )).join('\n');

  const warningLines = report.warnings.length > 0
    ? report.warnings.map((warning) => `- ${warning}`).join('\n')
    : '- None';

  const blockingLines = report.blockingIssues.length > 0
    ? report.blockingIssues.map((issue) => `- ${issue}`).join('\n')
    : '- None';

  const integrationLines = report.missingIntegrations.length > 0
    ? report.missingIntegrations.map((item) => `- ${item}`).join('\n')
    : '- None';

  const taskLines = report.recommendedNextEngineeringTasks.map((task) => `- ${task}`).join('\n');

  return `# Executive Mission Report: Atlas Website End-to-End Dry Run v1

## Mission
- Mission ID: ${report.mission.id}
- Objective: ${report.mission.objective}
- Customer: ${report.mission.customer}
- Mode: ${report.mission.mode}
- Publish policy: ${report.mission.publishPolicy}
- Stop condition: ${report.mission.stopCondition}

## Overall Result
- Overall status: ${report.overallStatus}
- Stages passed: ${report.summary.stagePassCount}/${report.summary.totalStages}
- Confidence: ${report.summary.confidence}

## Stage PASS/FAIL
| Stage ID | Stage Name | Status | Warning Count | Blocking Count |
|---|---|---|---|---|
${stageLines}

## Execution Timeline
| Stage ID | Started At | Completed At | Status |
|---|---|---|---|
${timelineLines}

## Handoff Validation
- Intelligence output accepted by Production System: ${report.handoffValidation.intelligenceOutputAcceptedByProductionSystem ? 'PASS' : 'FAIL'}
- Production output accepted by Website Orchestrator: ${report.handoffValidation.productionOutputAcceptedByWebsiteOrchestrator ? 'PASS' : 'FAIL'}
- Orchestrator correctly invokes Framer Adapter: ${report.handoffValidation.orchestratorInvokedFramerAdapter ? 'PASS' : 'FAIL'}
- Framer Adapter returns preview response: ${report.handoffValidation.framerAdapterReturnedPreviewResponse ? 'PASS' : 'FAIL'}
- QA executes: ${report.handoffValidation.qaExecuted ? 'PASS' : 'FAIL'}
- Executive report generates: ${report.handoffValidation.executiveReportGenerated ? 'PASS' : 'FAIL'}

## Orchestrator State at Stop
- Mission state: ${report.orchestrator.missionState}
- Current stage: ${report.orchestrator.currentStage}
- Completion: ${report.orchestrator.completionPercentage}%

## Warnings
${warningLines}

## Blocking Issues
${blockingLines}

## Missing Integrations
${integrationLines}

## Dependency Report
${dependencyLines}

## Recommended Next Engineering Tasks
${taskLines}
`;
}

async function runMission() {
  const tracker = createStageTracker();
  const missionInput = createMissionInput();

  const dependencies = [];
  const warnings = [];
  const blockingIssues = [];
  const missingIntegrations = [];

  const handoffs = {
    intelligenceToProductionAccepted: false,
    productionToOrchestratorAccepted: false,
    orchestratorInvokedFramerAdapter: false,
    framerPreviewReturned: false,
    qaExecuted: false,
    executiveReportGenerated: false
  };

  const framerAdapterCore = new AtlasFramerWebsiteAdapter({
    config: createDryRunFramerConfig()
  });

  const framerAdapter = new FramerWebsiteAdapter({ framerAdapter: framerAdapterCore });

  let intelligenceOutput = null;
  let brandPackage = null;
  let validatedAssetPackage = null;
  let templateSelection = null;
  let productionOutput = null;
  let orchestratorResult = null;
  let framerPreviewResult = null;
  let qaReport = null;

  await tracker.runStage({
    id: 'S1',
    name: 'Simulate Prospect Approval',
    execute: async () => {
      const approved = missionInput.prospect.approved === true;
      if (!approved) {
        return {
          blockingIssues: ['Prospect not approved.']
        };
      }

      return {
        output: {
          approvedBy: missionInput.prospect.approvedBy,
          companyName: missionInput.prospect.companyName
        }
      };
    }
  });

  await tracker.runStage({
    id: 'S2',
    name: 'Execute Website Intelligence Engine',
    execute: async () => {
      intelligenceOutput = await framerAdapter.researchCompany({
        prospect: missionInput.prospect
      });

      dependencies.push({
        name: 'Framer Server API Credentials',
        status: 'MOCKED',
        detail: 'Dry run used placeholder credentials and did not call live project.'
      });

      if (intelligenceOutput?.dryRun === true) {
        warnings.push('Website Intelligence Engine executed in Framer dry-run mode.');
      }

      return {
        output: intelligenceOutput
      };
    }
  });

  await tracker.runStage({
    id: 'S3',
    name: 'Generate Brand Asset Package',
    execute: async () => {
      brandPackage = await framerAdapter.generateBrandPackage({
        existingBranding: missionInput.existingBranding,
        companyResearch: intelligenceOutput
      });

      return {
        output: brandPackage
      };
    }
  });

  await tracker.runStage({
    id: 'S4',
    name: 'Validate Asset Package',
    execute: async () => {
      const requiredFields = ['preservedBranding', 'brandNarrative'];
      const missing = requiredFields.filter((field) => brandPackage?.[field] === undefined || brandPackage?.[field] === null);

      if (missing.length > 0) {
        return {
          blockingIssues: [`Asset package missing fields: ${missing.join(', ')}`]
        };
      }

      validatedAssetPackage = {
        isValid: true,
        requiredFields,
        missing
      };

      return {
        output: validatedAssetPackage
      };
    }
  });

  await tracker.runStage({
    id: 'S5',
    name: 'Select Roofing Template v1',
    execute: async () => {
      templateSelection = await framerAdapter.selectTemplate({
        brandPackage
      });

      templateSelection = {
        ...templateSelection,
        templateId: 'roofing-template-v1'
      };

      return {
        output: templateSelection
      };
    }
  });

  await tracker.runStage({
    id: 'S6',
    name: 'Execute Website Production System',
    execute: async () => {
      if (!intelligenceOutput?.summary) {
        return {
          blockingIssues: ['Production rejected intelligence output: missing summary.']
        };
      }

      handoffs.intelligenceToProductionAccepted = true;

      productionOutput = await framerAdapter.generateWebsite({
        templateSelection,
        brandPackage,
        websiteSpec: {
          companyName: missionInput.existingBranding.companyName,
          services: missionInput.existingBranding.services,
          contact: missionInput.existingBranding.contact,
          serviceAreas: missionInput.existingBranding.serviceAreas,
          reviews: missionInput.existingBranding.reviews,
          photography: missionInput.existingBranding.photography
        }
      });

      return {
        output: productionOutput,
        warnings: productionOutput?.warnings ?? []
      };
    }
  });

  await tracker.runStage({
    id: 'S7',
    name: 'Execute Website Orchestrator (Stop at CEO Gate)',
    execute: async () => {
      if (!productionOutput?.websiteId) {
        return {
          blockingIssues: ['Orchestrator rejected production output: missing websiteId.']
        };
      }

      handoffs.productionToOrchestratorAccepted = true;

      const adapterRegistry = new WebsiteProviderAdapterRegistry()
        .register({ adapterType: 'FRAMER', adapter: framerAdapter })
        .register({
          adapterType: 'OTHER',
          adapter: {
            name: 'Fallback Adapter',
            async researchCompany({ prospect }) {
              return { summary: `Fallback research for ${prospect?.companyName ?? 'unknown'}`, confidence: 0.6 };
            },
            async generateBrandPackage({ existingBranding }) {
              return { preservedBranding: { ...existingBranding }, brandNarrative: 'Fallback narrative', confidence: 0.6, warnings: [] };
            },
            async selectTemplate() {
              return { templateId: 'fallback-template', confidence: 0.6 };
            },
            async generateWebsite({ brandPackage }) {
              return { websiteId: `fallback-${Date.now()}`, brandingSnapshot: brandPackage?.preservedBranding ?? {}, confidence: 0.6, warnings: [] };
            },
            async publishWebsite({ generatedWebsite }) {
              return { websiteId: generatedWebsite?.websiteId ?? null, status: 'PUBLISHED', confidence: 0.6 };
            },
            async buildDeliveryPackage({ mission, artifacts }) {
              return { missionId: mission?.missionId ?? null, websiteId: artifacts?.generatedWebsite?.websiteId ?? null, handoffChecklist: [] };
            }
          }
        });

      const intelligenceEngine = {
        researchCompany: async ({ mission }) => {
          if (mission.prospect.companyName !== missionInput.prospect.companyName) {
            throw new Error('Unexpected prospect handoff to intelligence engine.');
          }

          return intelligenceOutput;
        },
        generateBrandPackage: async ({ mission }) => {
          if (mission.existingBranding.companyName !== missionInput.existingBranding.companyName) {
            throw new Error('Unexpected branding handoff to intelligence engine.');
          }

          return brandPackage;
        }
      };

      const websiteProductionSystem = {
        selectTemplate: async () => templateSelection,
        generateWebsite: async ({ adapter }) => {
          handoffs.orchestratorInvokedFramerAdapter = Boolean(adapter?.type === 'FRAMER');
          return productionOutput;
        },
        publishWebsite: async ({ adapter, artifacts, mission }) => {
          return adapter.publishWebsite({
            generatedWebsite: artifacts.generatedWebsite,
            ceoApproved: mission.ceoDecision === 'APPROVED'
          });
        }
      };

      const qaEngine = {
        review: async ({ artifacts }) => ({
          passed: true,
          warnings: artifacts.generatedWebsite?.warnings ?? [],
          blockingIssues: []
        })
      };

      const deliveryPackageEngine = {
        create: async ({ mission, artifacts }) => framerAdapter.buildDeliveryPackage({ mission, artifacts })
      };

      const orchestrator = new AtlasWebsiteOrchestrator({
        adapterRegistry,
        websiteIntelligenceEngine: intelligenceEngine,
        websiteProductionSystem,
        qaEngine,
        deliveryPackageEngine
      });

      orchestratorResult = await orchestrator.runMission(missionInput);

      if (orchestratorResult?.mission?.state !== 'REVISION_REQUIRED') {
        return {
          blockingIssues: [`Expected mission to stop at CEO gate with REVISION_REQUIRED, got ${orchestratorResult?.mission?.state ?? 'UNKNOWN'}.`]
        };
      }

      if (orchestratorResult?.mission?.currentStageId !== 'CEO_APPROVAL_GATE') {
        return {
          blockingIssues: [`Expected current stage CEO_APPROVAL_GATE, got ${orchestratorResult?.mission?.currentStageId ?? 'UNKNOWN'}.`]
        };
      }

      return {
        output: {
          missionState: orchestratorResult.mission.state,
          currentStage: orchestratorResult.mission.currentStageId,
          completion: orchestratorResult.dashboard.completionPercentage
        },
        warnings: orchestratorResult.dashboard.warnings
      };
    }
  });

  await tracker.runStage({
    id: 'S8',
    name: 'Execute Framer Adapter in PREVIEW MODE ONLY',
    execute: async () => {
      const generatedWebsite = orchestratorResult?.mission?.artifacts?.generatedWebsite ?? productionOutput;
      framerPreviewResult = await framerAdapterCore.createPreview({
        generatedWebsite,
        previewReason: 'ATLAS_EXECUTIVE_DRY_RUN'
      });

      handoffs.framerPreviewReturned = Boolean(framerPreviewResult?.deployment?.id || framerPreviewResult?.hostnames?.length);

      return {
        output: framerPreviewResult,
        warnings: framerPreviewResult?.dryRun ? ['Framer preview response generated in dry-run mode.'] : []
      };
    }
  });

  await tracker.runStage({
    id: 'S9',
    name: 'Generate QA Report',
    execute: async () => {
      const orchestratorQa = orchestratorResult?.mission?.artifacts?.qaReport ?? null;

      qaReport = {
        source: 'WEBSITE_ORCHESTRATOR_QA_ENGINE',
        passed: orchestratorQa?.passed === true,
        warnings: orchestratorQa?.warnings ?? [],
        blockingIssues: orchestratorQa?.blockingIssues ?? [],
        confidence: orchestratorQa?.passed === true ? 0.88 : 0.2
      };

      handoffs.qaExecuted = true;

      return {
        output: qaReport,
        warnings: qaReport.warnings,
        blockingIssues: qaReport.blockingIssues
      };
    }
  });

  const executiveReportStage = await tracker.runStage({
    id: 'S10',
    name: 'Generate Executive Delivery Report',
    execute: async () => {
      const orchestrationBlockingIssues = orchestratorResult?.dashboard?.blockingIssues ?? [];
      if (orchestrationBlockingIssues.length > 0) {
        blockingIssues.push(...orchestrationBlockingIssues);
      }

      if (orchestratorResult?.mission?.state !== 'REVISION_REQUIRED') {
        blockingIssues.push('Mission did not stop at CEO Approval Gate as required.');
      }

      missingIntegrations.push(
        'Live Framer Server API credentials not configured (dry-run placeholders used).',
        'Live Plugin/External Agent execution not invoked in this VPS-only dry run.',
        'Persistent idempotency storage across process restarts is not yet implemented.'
      );

      handoffs.executiveReportGenerated = true;

      return {
        output: {
          readyForCeoApproval: true,
          publishExecuted: false,
          stopReason: 'CEO approval required before publish.'
        }
      };
    }
  });

  await tracker.runStage({
    id: 'S11',
    name: 'STOP (CEO Approval Required Before Publish)',
    execute: async () => ({
      output: {
        stopConfirmed: true,
        rationale: 'Mission intentionally stopped before publish.'
      },
      warnings: executiveReportStage.output?.publishExecuted === false
        ? ['Publish intentionally not executed.']
        : []
    })
  });

  const report = buildExecutiveReport({
    missionInput,
    timeline: tracker.timeline,
    stageResults: tracker.stageResults,
    handoffs,
    orchestratorResult,
    framerPreviewResult,
    qaReport,
    dependencies,
    warnings,
    blockingIssues,
    missingIntegrations
  });

  mkdirSync('/root/atlas/review', { recursive: true });
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2));
  writeFileSync(REPORT_MD_PATH, toMarkdown(report));

  console.log('Atlas Website End-to-End Dry Run v1 complete.');
  console.log(`Report JSON: ${REPORT_JSON_PATH}`);
  console.log(`Report Markdown: ${REPORT_MD_PATH}`);
  console.log(`Overall Status: ${report.overallStatus}`);
  console.log(`Stopped at: ${report.orchestrator.currentStage}`);
}

runMission().catch((error) => {
  console.error('Dry run mission execution failed.');
  console.error(error);
  process.exitCode = 1;
});
