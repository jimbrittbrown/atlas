import {
  createFramerAdapterConfigFromEnv,
  validateFramerAdapterConfig
} from './framer-adapter-config.js';
import { FramerAuthClient } from './framer-auth-client.js';
import { FramerExternalAgentBoundary, FramerPluginBoundary } from './framer-agent-boundaries.js';
import { FramerAdapterError, normalizeFramerError } from './framer-error-normalizer.js';
import { FramerServerApiClient } from './framer-server-api-client.js';

function stableStringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  const sorted = Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = value[key];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

function createIdempotencyKey({ stage, payload }) {
  return `${stage}:${stableStringify(payload)}`;
}

export class AtlasFramerWebsiteAdapter {
  constructor({
    config,
    authClient,
    serverApiClient,
    pluginBoundary,
    externalAgentBoundary,
    logger
  } = {}) {
    this.name = 'Framer Adapter';
    this.type = 'FRAMER';
    this.config = config ?? createFramerAdapterConfigFromEnv(process.env);
    this.logger = logger ?? { log: () => {} };

    const validation = validateFramerAdapterConfig(this.config);
    this.configValidation = validation;

    this.authClient = authClient ?? new FramerAuthClient({ config: this.config });
    this.serverApiClient = serverApiClient ?? new FramerServerApiClient({ config: this.config, logger: this.logger });
    this.pluginBoundary = pluginBoundary ?? new FramerPluginBoundary();
    this.externalAgentBoundary = externalAgentBoundary ?? new FramerExternalAgentBoundary({
      enabled: Boolean(this.config.externalAgentEnabled)
    });

    this.idempotencyStore = new Map();
  }

  enforceNoWrite(operation) {
    if (this.config.readOnly === true) {
      throw new FramerAdapterError({
        message: `Read-only mode is enabled. ${operation} is blocked by policy.`,
        code: 'FRAMER_READ_ONLY_BLOCK',
        retryable: false,
        stage: 'POLICY',
        operation
      });
    }
  }

  async withIdempotency({ stage, payload, executor }) {
    const key = createIdempotencyKey({ stage, payload });
    if (this.idempotencyStore.has(key)) {
      return {
        ...this.idempotencyStore.get(key),
        idempotentReplay: true
      };
    }

    const value = await executor();
    this.idempotencyStore.set(key, value);
    return {
      ...value,
      idempotentReplay: false
    };
  }

  log(operation, details = {}) {
    this.logger.log({
      provider: 'FRAMER',
      operation,
      ...details
    });
  }

  normalizeAndThrow(error, context = {}) {
    throw normalizeFramerError(error, context);
  }

  async verifyConnection() {
    try {
      if (this.config.dryRun) {
        return {
          connected: true,
          mode: 'DRY_RUN',
          workspace: {
            supported: false,
            methodName: null,
            value: null
          },
          projects: {
            supported: false,
            methodName: null,
            value: []
          },
          sites: {
            supported: false,
            methodName: null,
            value: []
          },
          projectInfo: {
            supported: false,
            methodName: null,
            value: null
          },
          publishInfo: {
            supported: false,
            methodName: null,
            value: null
          },
          limitations: [
            'Dry-run mode enabled. Live Framer connection was not attempted.'
          ]
        };
      }

      const auth = this.authClient.authenticate();
      const report = await this.serverApiClient.getConnectionReport({
        projectUrl: auth.projectUrl,
        apiKey: auth.apiKey
      });

      const limitations = [];
      if (!report.workspace.supported) {
        limitations.push('Workspace listing is not exposed by detected Server API methods in this context.');
      }
      if (!report.projects.supported) {
        limitations.push('Project listing is not exposed by detected Server API methods in this context.');
      }
      if (!report.sites.supported) {
        limitations.push('Site listing is not exposed by detected Server API methods in this context.');
      }

      return {
        ...report,
        mode: 'LIVE',
        limitations
      };
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'CONNECTION', operation: 'verifyConnection' });
    }
  }

  async readAllProjectDetails() {
    try {
      if (this.config.dryRun) {
        return {
          mode: 'DRY_RUN',
          connected: true,
          supportedEndpoints: [],
          unsupportedEndpoints: [],
          categories: {},
          limitations: ['Dry-run mode enabled. Live project detail discovery was not attempted.'],
          recommendedFutureWriteOperations: []
        };
      }

      const auth = this.authClient.authenticate();
      const capabilityReport = await this.serverApiClient.discoverReadOnlyCapabilities({
        projectUrl: auth.projectUrl,
        apiKey: auth.apiKey
      });

      return {
        ...capabilityReport,
        mode: 'LIVE'
      };
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'READ_PROJECT', operation: 'readAllProjectDetails' });
    }
  }

  async listProjects() {
    const report = await this.verifyConnection();
    const projects = report.projects?.supported ? report.projects.value : [];

    if (Array.isArray(projects) && projects.length > 0) {
      return {
        projects,
        source: report.projects.methodName,
        limitations: report.limitations
      };
    }

    if (report.projectInfo?.supported && report.projectInfo?.value) {
      return {
        projects: [report.projectInfo.value],
        source: report.projectInfo.methodName,
        limitations: [
          ...(report.limitations ?? []),
          'Returned connected project only; global project list unavailable in this context.'
        ]
      };
    }

    return {
      projects: [],
      source: null,
      limitations: [
        ...(report.limitations ?? []),
        'No project metadata methods available in current connection context.'
      ]
    };
  }

  async readProjectMetadata() {
    const details = await this.readAllProjectDetails();
    return {
      projectInfo: details.details?.projectMetadata?.projectInfo ?? null,
      publishInfo: details.details?.publishingMetadata?.publishInfo ?? null,
      branches: details.details?.projectMetadata?.branchMetadata ?? null,
      activeBranch: details.details?.projectMetadata?.activeBranchMetadata ?? null,
      versions: details.details?.projectMetadata?.versions ?? null,
      limitations: details.limitations ?? []
    };
  }

  async readSiteInformation() {
    const details = await this.readAllProjectDetails();

    const siteMetadata = details.details?.pageMetadata?.pages;
    const redirectMetadata = details.details?.navigation?.redirects;
    const publishInfo = details.details?.publishingMetadata?.publishInfo ?? null;

    const sites = Array.isArray(siteMetadata)
      ? siteMetadata
      : siteMetadata
        ? [siteMetadata]
        : [];

    return {
      sites,
      redirects: redirectMetadata ?? [],
      publishInfo,
      source: 'read-engine-v2',
      limitations: details.limitations ?? []
    };
  }

  async readPreviewInformation() {
    const details = await this.readAllProjectDetails();
    return {
      preview: details.details?.publishingMetadata?.publishInfo ?? null,
      deployments: details.details?.publishingMetadata?.deployments ?? [],
      source: 'read-engine-v2',
      limitations: details.limitations ?? []
    };
  }

  async applySandboxBuildInstructions({
    buildInstructions = {},
    customizationPackage = {},
    productionCustomization = {}
  } = {}) {
    try {
      const auth = this.authClient.authenticate();
      const snapshot = this.config.dryRun
        ? {
          projectInfo: {
            id: 'dry-run-sandbox-project',
            name: 'Dry Run Sandbox'
          },
          publishInfo: null
        }
        : await this.serverApiClient.getProjectSnapshot({
          projectUrl: auth.projectUrl,
          apiKey: auth.apiKey
        });

      const sandboxName = String(snapshot?.projectInfo?.name ?? '').toLowerCase();
      const sandboxUrl = String(auth.projectUrl ?? '').toLowerCase();
      const sandboxDetected = sandboxName.includes('sandbox') || sandboxUrl.includes('sandbox');

      const pluginPlan = this.pluginBoundary.createTaskPlan({
        operation: 'sandbox-project-upsert',
        details: {
          sandboxProjectId: snapshot?.projectInfo?.id ?? null,
          sandboxProjectName: snapshot?.projectInfo?.name ?? null,
          hasCustomizationPackage: Boolean(customizationPackage),
          hasBuildInstructions: Boolean(buildInstructions),
          hasProductionCustomization: Boolean(productionCustomization)
        }
      });

      const externalAgentPlan = this.externalAgentBoundary.createTaskPlan({
        operation: 'sandbox-site-build-application',
        details: {
          sandboxProjectId: snapshot?.projectInfo?.id ?? null,
          sandboxProjectName: snapshot?.projectInfo?.name ?? null
        }
      });

      return {
        status: this.config.dryRun
          ? 'SANDBOX_UPSERT_PREPARED_DRY_RUN'
          : 'SANDBOX_UPSERT_PREPARED_LIVE',
        sandboxOnly: true,
        sandboxDetected,
        sandboxProject: {
          id: snapshot?.projectInfo?.id ?? null,
          name: snapshot?.projectInfo?.name ?? null,
          projectUrl: auth.projectUrl
        },
        accepted: {
          buildInstructions: Boolean(buildInstructions),
          customizationPackage: Boolean(customizationPackage),
          productionCustomization: Boolean(productionCustomization)
        },
        publishExecuted: false,
        deployExecuted: false,
        writeExecuted: false,
        productionOverwriteExecuted: false,
        destructiveOperationExecuted: false,
        appliedOperations: [],
        previewInfo: snapshot?.publishInfo ?? null,
        taskPlans: {
          plugin: pluginPlan,
          externalAgent: externalAgentPlan
        },
        limitations: [
          'Read-only mission policy kept write and publish actions disabled.',
          'Build instructions were prepared and routed through Framer boundaries for sandbox-only execution governance.'
        ]
      };
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'WEBSITE_GENERATION', operation: 'applySandboxBuildInstructions' });
    }
  }

  async prepareDuplicateWorkflow({ sourceProjectId, duplicateName }) {
    return {
      executable: false,
      reason: 'Preparation only. Execution intentionally disabled by policy.',
      requested: {
        sourceProjectId: sourceProjectId ?? null,
        duplicateName: duplicateName ?? null
      },
      plannedSteps: [
        'Validate source project read access',
        'Invoke Framer duplication method when officially supported and enabled',
        'Rename duplicate project using approved naming standard',
        'Return duplicated project identifier and preview URL metadata'
      ],
      policyRequirements: {
        readOnlyMustBeDisabled: true,
        allowProjectDuplicationFlag: 'FRAMER_ALLOW_PROJECT_DUPLICATION',
        ceoTicketRequired: true
      }
    };
  }

  async researchCompany({ prospect = {} } = {}) {
    try {
      return this.withIdempotency({
        stage: 'COMPANY_RESEARCH',
        payload: { companyName: prospect.companyName },
        executor: async () => {
          const auth = this.authClient.authenticate();

          if (this.config.dryRun) {
            return {
              summary: `Dry-run Framer research for ${prospect.companyName ?? 'unknown company'}.`,
              confidence: 0.7,
              findings: [],
              projectInfo: null,
              publishInfo: null,
              dryRun: true
            };
          }

          const snapshot = await this.serverApiClient.getProjectSnapshot({
            projectUrl: auth.projectUrl,
            apiKey: auth.apiKey
          });

          const projectDetails = await this.readAllProjectDetails();

          return {
            summary: `Framer project context loaded for ${prospect.companyName ?? 'unknown company'}.`,
            confidence: 0.8,
            findings: [],
            projectInfo: snapshot.projectInfo,
            publishInfo: snapshot.publishInfo,
            projectDetails,
            dryRun: false
          };
        }
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'COMPANY_RESEARCH', operation: 'researchCompany' });
    }
  }

  async generateBrandPackage({ existingBranding = {}, companyResearch = {} } = {}) {
    try {
      return this.withIdempotency({
        stage: 'BRAND_PACKAGE_GENERATION',
        payload: { existingBranding, summary: companyResearch.summary ?? '' },
        executor: async () => ({
          preservedBranding: { ...existingBranding },
          brandNarrative: companyResearch.summary ?? 'Framer-aligned brand narrative.',
          confidence: 0.78,
          warnings: [],
          capabilityNotes: {
            approach: 'Preserve existing branding in Atlas orchestration and map to Framer styles/assets.',
            pluginPlan: this.pluginBoundary.createTaskPlan({
              operation: 'brand-style-application',
              details: {
                supportsColorStyles: true,
                supportsTextStyles: true
              }
            })
          }
        })
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'BRAND_PACKAGE_GENERATION', operation: 'generateBrandPackage' });
    }
  }

  async selectTemplate({ brandPackage = {} } = {}) {
    try {
      return this.withIdempotency({
        stage: 'TEMPLATE_SELECTION',
        payload: {
          brandNarrative: brandPackage.brandNarrative ?? '',
          dryRun: this.config.dryRun
        },
        executor: async () => ({
          templateId: 'framer-template-existing-project',
          rationale: 'Framer Server API works against an existing project URL; Atlas applies updates into connected project.',
          confidence: 0.74,
          externalAgentPlan: this.externalAgentBoundary.createTaskPlan({
            operation: 'template-remix-or-layout-heavy-selection',
            details: {
              reason: 'Template-level canvas restructuring may require external agent/plugin context.'
            }
          })
        })
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'TEMPLATE_SELECTION', operation: 'selectTemplate' });
    }
  }

  async generateWebsite({ templateSelection = {}, brandPackage = {}, websiteSpec = {} } = {}) {
    try {
      return this.withIdempotency({
        stage: 'WEBSITE_GENERATION',
        payload: {
          templateId: templateSelection.templateId,
          brandNarrative: brandPackage.brandNarrative,
          websiteSpec
        },
        executor: async () => {
          const auth = this.authClient.authenticate();

          const projectSnapshot = this.config.dryRun
            ? { projectInfo: null, publishInfo: null }
            : await this.serverApiClient.getProjectSnapshot({
              projectUrl: auth.projectUrl,
              apiKey: auth.apiKey
            });

          let cmsSnapshot = { collections: [], managedCollections: [] };
          if (!this.config.dryRun) {
            cmsSnapshot = await this.serverApiClient.getCmsCollections({
              projectUrl: auth.projectUrl,
              apiKey: auth.apiKey
            });
          }

          return {
            websiteId: projectSnapshot.projectInfo?.id ?? `framer-site-${Date.now()}`,
            provider: this.name,
            templateId: templateSelection.templateId ?? 'framer-template-existing-project',
            brandingSnapshot: brandPackage.preservedBranding ?? {},
            previewUrl: null,
            confidence: 0.8,
            warnings: this.config.dryRun
              ? ['Dry-run enabled: no Framer mutations executed.']
              : [],
            projectInfo: projectSnapshot.projectInfo,
            publishInfo: projectSnapshot.publishInfo,
            cmsCollections: cmsSnapshot.collections,
            managedCollections: cmsSnapshot.managedCollections,
            pendingOperations: {
              content: 'CAPABILITY_GATED',
              cms: 'CAPABILITY_GATED',
              assets: 'CAPABILITY_GATED',
              canvas: 'CAPABILITY_GATED'
            },
            boundaryPlans: {
              plugin: this.pluginBoundary.createTaskPlan({
                operation: 'canvas-and-component-mutations',
                details: {
                  nodesApi: true,
                  assetsApi: true,
                  cmsApi: true
                }
              }),
              externalAgent: this.externalAgentBoundary.createTaskPlan({
                operation: 'high-level-site-rewrites',
                details: {
                  supportsCmsAndCanvas: true
                }
              })
            }
          };
        }
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'WEBSITE_GENERATION', operation: 'generateWebsite' });
    }
  }

  async createPreview({ generatedWebsite = {}, previewReason = 'EXECUTIVE_PREVIEW' } = {}) {
    try {
      return this.withIdempotency({
        stage: 'EXECUTIVE_PREVIEW',
        payload: {
          websiteId: generatedWebsite.websiteId,
          previewReason
        },
        executor: async () => {
          this.enforceNoWrite('createPreview');

          if (!this.config.allowPreviewPublish) {
            throw new FramerAdapterError({
              message: 'Preview publishing is disabled by FRAMER_ALLOW_PREVIEW_PUBLISH.',
              code: 'FRAMER_POLICY_BLOCK',
              retryable: false,
              stage: 'EXECUTIVE_PREVIEW',
              operation: 'createPreview'
            });
          }

          if (this.config.dryRun) {
            return {
              deployment: { id: 'dry-run-preview' },
              hostnames: ['https://preview.dry-run.framer.local'],
              dryRun: true
            };
          }

          const auth = this.authClient.authenticate();
          return this.serverApiClient.publishPreview({
            projectUrl: auth.projectUrl,
            apiKey: auth.apiKey
          });
        }
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'EXECUTIVE_PREVIEW', operation: 'createPreview' });
    }
  }

  async publishWebsite({ generatedWebsite = {}, ceoApproved = false } = {}) {
    try {
      this.enforceNoWrite('publishWebsite');

      if (!ceoApproved) {
        throw new FramerAdapterError({
          message: 'CEO approval is required before production deploy.',
          code: 'FRAMER_GOVERNANCE_BLOCK',
          retryable: false,
          stage: 'PUBLISH',
          operation: 'publishWebsite'
        });
      }

      if (!this.config.allowProductionDeploy) {
        throw new FramerAdapterError({
          message: 'Production deploy blocked by FRAMER_ALLOW_PRODUCTION_DEPLOY policy.',
          code: 'FRAMER_POLICY_BLOCK',
          retryable: false,
          stage: 'PUBLISH',
          operation: 'publishWebsite'
        });
      }

      return this.withIdempotency({
        stage: 'PUBLISH',
        payload: {
          websiteId: generatedWebsite.websiteId,
          ceoApproved
        },
        executor: async () => {
          if (this.config.dryRun) {
            return {
              websiteId: generatedWebsite.websiteId ?? null,
              status: 'PUBLISHED_DRY_RUN',
              publishedUrl: 'https://published.dry-run.framer.local',
              confidence: 0.82,
              dryRun: true
            };
          }

          const auth = this.authClient.authenticate();
          const previewResult = await this.serverApiClient.publishPreview({
            projectUrl: auth.projectUrl,
            apiKey: auth.apiKey
          });

          const deploymentId = previewResult?.deployment?.id;
          if (!deploymentId) {
            throw new FramerAdapterError({
              message: 'Framer preview publish did not return a deployment id.',
              code: 'FRAMER_DEPLOYMENT_ID_MISSING',
              retryable: false,
              stage: 'PUBLISH',
              operation: 'publishWebsite'
            });
          }

          await this.serverApiClient.deployToProduction({
            projectUrl: auth.projectUrl,
            apiKey: auth.apiKey,
            deploymentId
          });

          return {
            websiteId: generatedWebsite.websiteId ?? null,
            status: 'PUBLISHED',
            publishedUrl: generatedWebsite.publishInfo?.url ?? null,
            deploymentId,
            confidence: 0.85,
            dryRun: false
          };
        }
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'PUBLISH', operation: 'publishWebsite' });
    }
  }

  async buildDeliveryPackage({ mission = {}, artifacts = {} } = {}) {
    try {
      return this.withIdempotency({
        stage: 'DELIVERY_PACKAGE',
        payload: {
          missionId: mission.missionId,
          websiteId: artifacts.generatedWebsite?.websiteId
        },
        executor: async () => ({
          missionId: mission.missionId ?? null,
          websiteId: artifacts.generatedWebsite?.websiteId ?? null,
          publishedUrl: artifacts.publishedWebsite?.publishedUrl ?? null,
          handoffChecklist: [
            'Framer project URL recorded',
            'Preview/deploy evidence recorded',
            'CMS sync summary recorded',
            'Governance approvals archived'
          ],
          providerDiagnostics: {
            configValidation: this.configValidation,
            dryRun: this.config.dryRun
          }
        })
      });
    } catch (error) {
      this.normalizeAndThrow(error, { stage: 'DELIVERY_PACKAGE', operation: 'buildDeliveryPackage' });
    }
  }
}
