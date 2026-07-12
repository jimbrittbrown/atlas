import { FramerAdapterError, normalizeFramerError } from './framer-error-normalizer.js';

const READ_OPERATION_SPECS = Object.freeze([
  {
    category: 'projectMetadata',
    operationId: 'projectInfo',
    description: 'Connected project metadata',
    methodNames: ['getProjectInfo']
  },
  {
    category: 'projectMetadata',
    operationId: 'branchMetadata',
    description: 'Project branch metadata',
    methodNames: ['getBranches']
  },
  {
    category: 'projectMetadata',
    operationId: 'activeBranchMetadata',
    description: 'Active branch metadata',
    methodNames: ['getActiveBranch']
  },
  {
    category: 'pageMetadata',
    operationId: 'pages',
    description: 'Page metadata and routing nodes',
    methodNames: ['getNodesWithType', 'getPages', 'listPages'],
    argsBuilder: () => ['WebPageNode']
  },
  {
    category: 'cmsCollections',
    operationId: 'collections',
    description: 'CMS collections',
    methodNames: ['getCollections']
  },
  {
    category: 'cmsCollections',
    operationId: 'managedCollections',
    description: 'Managed CMS collections',
    methodNames: ['getManagedCollections']
  },
  {
    category: 'assets',
    operationId: 'assetInventory',
    description: 'Asset inventory metadata',
    methodNames: ['getAssets', 'listAssets']
  },
  {
    category: 'images',
    operationId: 'imageInventory',
    description: 'Image asset metadata',
    methodNames: ['getImages', 'listImages']
  },
  {
    category: 'styles',
    operationId: 'colorStyles',
    description: 'Color style metadata',
    methodNames: ['getColorStyles']
  },
  {
    category: 'styles',
    operationId: 'textStyles',
    description: 'Text style metadata',
    methodNames: ['getTextStyles']
  },
  {
    category: 'components',
    operationId: 'componentNodes',
    description: 'Component node metadata',
    methodNames: ['getNodesWithType', 'getComponents', 'listComponents'],
    argsBuilder: () => ['ComponentNode']
  },
  {
    category: 'variables',
    operationId: 'variables',
    description: 'Variable definitions and bindings',
    methodNames: ['getVariables']
  },
  {
    category: 'fonts',
    operationId: 'fonts',
    description: 'Font metadata',
    methodNames: ['getFonts']
  },
  {
    category: 'navigation',
    operationId: 'redirects',
    description: 'Redirect and navigation metadata',
    methodNames: ['getRedirects', 'getNavigation', 'getNavigationStructure']
  },
  {
    category: 'publishingMetadata',
    operationId: 'publishInfo',
    description: 'Publish metadata for staging and production',
    methodNames: ['getPublishInfo']
  },
  {
    category: 'publishingMetadata',
    operationId: 'deployments',
    description: 'Deployment history metadata',
    methodNames: ['getDeployments']
  },
  {
    category: 'analyticsMetadata',
    operationId: 'analyticsSummary',
    description: 'Analytics metadata when exposed by API context',
    methodNames: ['getAnalytics', 'getSiteAnalytics', 'getAnalyticsSummary']
  },
  {
    category: 'projectMetadata',
    operationId: 'versions',
    description: 'Project version metadata',
    methodNames: ['getVersions']
  }
]);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createReadCategorySummary(categoryName) {
  return {
    category: categoryName,
    operations: [],
    supportedEndpoints: [],
    unsupportedEndpoints: [],
    limitations: []
  };
}

function summarizeOperationValue(value) {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length
    };
  }

  if (value && typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value).sort()
    };
  }

  return {
    type: typeof value,
    value
  };
}

function listFunctionNamesDeep(target) {
  const names = new Set();
  let cursor = target;

  while (cursor && cursor !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(cursor)) {
      if (name === 'constructor') {
        continue;
      }

      if (typeof target?.[name] === 'function') {
        names.add(name);
      }
    }

    cursor = Object.getPrototypeOf(cursor);
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export class FramerServerApiClient {
  constructor({ config, connectFn, logger } = {}) {
    this.config = config ?? {};
    this.connectFn = connectFn;
    this.logger = logger ?? { log: () => {} };
  }

  async resolveConnectFn() {
    if (typeof this.connectFn === 'function') {
      return this.connectFn;
    }

    try {
      const module = await import('framer-api');
      if (typeof module.connect !== 'function') {
        throw new Error('framer-api module does not export connect().');
      }

      return module.connect;
    } catch (error) {
      throw new FramerAdapterError({
        message: `Failed to load framer-api package: ${error instanceof Error ? error.message : String(error)}`,
        code: 'FRAMER_SDK_LOAD_ERROR',
        retryable: false,
        stage: 'CONNECTION',
        operation: 'load-sdk'
      });
    }
  }

  async withConnection({ projectUrl, apiKey, stage, operation, executor, retryable = true }) {
    const connect = await this.resolveConnectFn();
    const maxAttempts = Math.max(1, Number(this.config.maxRetries ?? 0) + 1);
    const retryDelayMs = Math.max(0, Number(this.config.retryDelayMs ?? 250));

    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      let framer;

      try {
        framer = await connect(projectUrl, apiKey);
        const result = await executor(framer);
        await framer.disconnect?.();
        return result;
      } catch (error) {
        try {
          await framer?.disconnect?.();
        } catch {
          // Ignore disconnect failures after primary operation errors.
        }

        const normalized = normalizeFramerError(error, { stage, operation, details: { attempt } });

        if (!retryable || !normalized.retryable || attempt >= maxAttempts) {
          throw normalized;
        }

        this.logger.log({
          provider: 'FRAMER',
          stage,
          operation,
          attempt,
          retrying: true,
          message: normalized.message
        });

        await wait(retryDelayMs * attempt);
      }
    }

    throw new FramerAdapterError({
      message: 'Unexpected retry loop termination in Framer Server API client.',
      code: 'FRAMER_RETRY_LOOP_ERROR',
      retryable: false,
      stage,
      operation
    });
  }

  async safeCall({ framer, methodName, args = [], stage, operation }) {
    const method = framer?.[methodName];
    if (typeof method !== 'function') {
      throw new FramerAdapterError({
        message: `Framer method ${methodName} is not supported by current interface/context.`,
        code: 'FRAMER_UNSUPPORTED_OPERATION',
        retryable: false,
        stage,
        operation
      });
    }

    return method.apply(framer, args);
  }

  async probeCall({ framer, methodNames = [], args = [], stage, operation }) {
    for (const methodName of methodNames) {
      if (typeof framer?.[methodName] === 'function') {
        const value = await this.safeCall({
          framer,
          methodName,
          args,
          stage,
          operation
        });

        return {
          supported: true,
          methodName,
          value
        };
      }
    }

    return {
      supported: false,
      methodName: null,
      value: null
    };
  }

  async probeReadOperation({ framer, spec, context = {} }) {
    const availableMethodName = spec.methodNames.find((methodName) => typeof framer?.[methodName] === 'function') ?? null;

    if (!availableMethodName) {
      return {
        category: spec.category,
        operationId: spec.operationId,
        description: spec.description,
        supported: false,
        callable: false,
        methodName: null,
        requiresArguments: false,
        value: null,
        valueSummary: null,
        limitation: `No detected API method for ${spec.operationId}.`
      };
    }

    const method = framer[availableMethodName];
    const hasArgsBuilder = typeof spec.argsBuilder === 'function';
    const args = hasArgsBuilder ? spec.argsBuilder(context) : [];
    const requiresArguments = hasArgsBuilder || method.length > 0;

    if (hasArgsBuilder && (!Array.isArray(args) || args.length === 0)) {
      return {
        category: spec.category,
        operationId: spec.operationId,
        description: spec.description,
        supported: true,
        callable: false,
        methodName: availableMethodName,
        requiresArguments,
        value: null,
        valueSummary: null,
        limitation: `${availableMethodName} requires contextual arguments that were unavailable.`
      };
    }

    if (!hasArgsBuilder && method.length > 0) {
      return {
        category: spec.category,
        operationId: spec.operationId,
        description: spec.description,
        supported: true,
        callable: false,
        methodName: availableMethodName,
        requiresArguments,
        value: null,
        valueSummary: null,
        limitation: `${availableMethodName} requires arguments and was not invoked automatically.`
      };
    }

    try {
      const value = await this.safeCall({
        framer,
        methodName: availableMethodName,
        args,
        stage: 'READ_CAPABILITY_DISCOVERY',
        operation: spec.operationId
      });

      return {
        category: spec.category,
        operationId: spec.operationId,
        description: spec.description,
        supported: true,
        callable: true,
        methodName: availableMethodName,
        requiresArguments,
        value,
        valueSummary: summarizeOperationValue(value),
        limitation: null
      };
    } catch (error) {
      const normalized = normalizeFramerError(error, {
        stage: 'READ_CAPABILITY_DISCOVERY',
        operation: spec.operationId,
        details: { methodName: availableMethodName }
      });

      return {
        category: spec.category,
        operationId: spec.operationId,
        description: spec.description,
        supported: true,
        callable: false,
        methodName: availableMethodName,
        requiresArguments,
        value: null,
        valueSummary: null,
        limitation: `${availableMethodName} probe failed: ${normalized.message}`
      };
    }
  }

  async discoverReadOnlyCapabilities({ projectUrl, apiKey }) {
    return this.withConnection({
      projectUrl,
      apiKey,
      stage: 'READ_CAPABILITY_DISCOVERY',
      operation: 'discover-read-only-capabilities',
      executor: async (framer) => {
        const availableMethods = listFunctionNamesDeep(framer ?? {});
        const categories = {};
        const operations = [];
        const collectedData = {};

        for (const spec of READ_OPERATION_SPECS) {
          const result = await this.probeReadOperation({
            framer,
            spec,
            context: collectedData
          });
          operations.push(result);

          if (!categories[spec.category]) {
            categories[spec.category] = createReadCategorySummary(spec.category);
          }

          categories[spec.category].operations.push({
            operationId: result.operationId,
            description: result.description,
            methodName: result.methodName,
            supported: result.supported,
            callable: result.callable,
            requiresArguments: result.requiresArguments,
            valueSummary: result.valueSummary,
            limitation: result.limitation
          });

          if (result.supported && result.callable) {
            categories[spec.category].supportedEndpoints.push({
              operationId: result.operationId,
              methodName: result.methodName
            });

            if (!collectedData[spec.category]) {
              collectedData[spec.category] = {};
            }
            collectedData[spec.category][result.operationId] = result.value;
          } else {
            categories[spec.category].unsupportedEndpoints.push({
              operationId: result.operationId,
              methodName: result.methodName,
              reason: result.limitation
            });
          }

          if (result.limitation) {
            categories[spec.category].limitations.push(result.limitation);
          }
        }

        const supportedEndpoints = operations
          .filter((operation) => operation.supported && operation.callable)
          .map((operation) => ({
            category: operation.category,
            operationId: operation.operationId,
            methodName: operation.methodName
          }));

        const unsupportedEndpoints = operations
          .filter((operation) => !(operation.supported && operation.callable))
          .map((operation) => ({
            category: operation.category,
            operationId: operation.operationId,
            methodName: operation.methodName,
            reason: operation.limitation
          }));

        const limitations = Array.from(new Set(
          operations
            .map((operation) => operation.limitation)
            .filter((entry) => typeof entry === 'string' && entry.length > 0)
        ));

        return {
          connected: true,
          availableMethodCount: availableMethods.length,
          availableMethods,
          categories,
          operations,
          supportedEndpoints,
          unsupportedEndpoints,
          limitations,
          details: collectedData,
          recommendedFutureWriteOperations: [
            'Controlled CMS upsert workflow after CEO write authorization',
            'Policy-gated preview publish flow in sandbox branch',
            'CEO-approved production deploy workflow with explicit ticket evidence',
            'Asset replacement workflow with idempotency and rollback checkpoints',
            'Project duplication and branch promotion workflow after governance approval'
          ]
        };
      }
    });
  }

  async getProjectSnapshot({ projectUrl, apiKey }) {
    return this.withConnection({
      projectUrl,
      apiKey,
      stage: 'READ_PROJECT',
      operation: 'get-project-snapshot',
      executor: async (framer) => {
        const projectInfo = await this.safeCall({
          framer,
          methodName: 'getProjectInfo',
          stage: 'READ_PROJECT',
          operation: 'getProjectInfo'
        });

        const publishInfo = typeof framer.getPublishInfo === 'function'
          ? await this.safeCall({
            framer,
            methodName: 'getPublishInfo',
            stage: 'READ_PROJECT',
            operation: 'getPublishInfo'
          })
          : null;

        return {
          projectInfo,
          publishInfo
        };
      }
    });
  }

  async getCmsCollections({ projectUrl, apiKey }) {
    return this.withConnection({
      projectUrl,
      apiKey,
      stage: 'CMS',
      operation: 'get-cms-collections',
      executor: async (framer) => {
        const collections = typeof framer.getCollections === 'function'
          ? await this.safeCall({
            framer,
            methodName: 'getCollections',
            stage: 'CMS',
            operation: 'getCollections'
          })
          : [];

        const managedCollections = typeof framer.getManagedCollections === 'function'
          ? await this.safeCall({
            framer,
            methodName: 'getManagedCollections',
            stage: 'CMS',
            operation: 'getManagedCollections'
          })
          : [];

        return {
          collections,
          managedCollections
        };
      }
    });
  }

  async publishPreview({ projectUrl, apiKey }) {
    return this.withConnection({
      projectUrl,
      apiKey,
      stage: 'PREVIEW',
      operation: 'publish-preview',
      executor: async (framer) => this.safeCall({
        framer,
        methodName: 'publish',
        stage: 'PREVIEW',
        operation: 'publish'
      })
    });
  }

  async deployToProduction({ projectUrl, apiKey, deploymentId }) {
    return this.withConnection({
      projectUrl,
      apiKey,
      stage: 'PUBLISH',
      operation: 'deploy-production',
      executor: async (framer) => this.safeCall({
        framer,
        methodName: 'deploy',
        args: [deploymentId],
        stage: 'PUBLISH',
        operation: 'deploy'
      })
    });
  }

  async getConnectionReport({ projectUrl, apiKey }) {
    return this.withConnection({
      projectUrl,
      apiKey,
      stage: 'CONNECTION',
      operation: 'get-connection-report',
      executor: async (framer) => {
        const workspaceProbe = await this.probeCall({
          framer,
          methodNames: ['getWorkspaceInfo', 'getWorkspace'],
          stage: 'CONNECTION',
          operation: 'workspace-probe'
        });

        const projectsProbe = await this.probeCall({
          framer,
          methodNames: ['getProjects', 'listProjects'],
          stage: 'CONNECTION',
          operation: 'projects-probe'
        });

        const sitesProbe = await this.probeCall({
          framer,
          methodNames: ['getSites', 'listSites', 'getPublishedSites'],
          stage: 'CONNECTION',
          operation: 'sites-probe'
        });

        const projectInfoProbe = await this.probeCall({
          framer,
          methodNames: ['getProjectInfo'],
          stage: 'CONNECTION',
          operation: 'project-info-probe'
        });

        const publishInfoProbe = await this.probeCall({
          framer,
          methodNames: ['getPublishInfo'],
          stage: 'CONNECTION',
          operation: 'publish-info-probe'
        });

        return {
          connected: true,
          workspace: workspaceProbe,
          projects: projectsProbe,
          sites: sitesProbe,
          projectInfo: projectInfoProbe,
          publishInfo: publishInfoProbe
        };
      }
    });
  }
}
