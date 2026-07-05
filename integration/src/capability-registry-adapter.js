export class CapabilityRegistryAdapter {
  constructor(registryService) {
    this.registryService = registryService;
  }

  registerOrUpdateCapability(metadata) {
    const existing = this.registryService.getCapability(metadata.name);
    if (existing) {
      return this.registryService.updateCapability(metadata.name, metadata);
    }
    return this.registryService.registerCapability(metadata);
  }

  syncCoreCapabilities({ commitHash = '', traceabilityReference = '', changelogReference = '', testStatus = 'PASS' } = {}) {
    const coreCapabilities = [
      {
        name: 'Executive Service',
        version: 'v1.0',
        purpose: 'Workflow orchestration and lifecycle ownership.',
        owner: 'Executive',
        dependencies: [],
        publicInterfaces: [
          { name: 'receiveRequest' },
          { name: 'createWorkflow' },
          { name: 'delegate' },
          { name: 'monitor' },
          { name: 'handleRequest' },
        ],
        releaseTag: 'executive-service-v1.0',
        commitHash,
        status: 'RELEASED',
        documentation: { architecture: 'docs/reviews/executive-core-review-package-2026-07-05.md' },
        changelogReference,
        traceabilityReference,
        testStatus,
      },
      {
        name: 'Research Service',
        version: 'v1.0',
        purpose: 'Evidence collection and report generation.',
        owner: 'Research',
        dependencies: [{ name: 'Executive Service', version: 'v1.0' }],
        publicInterfaces: [{ name: 'createResearchJob' }, { name: 'executeResearch' }],
        releaseTag: 'research-service-v1.0',
        commitHash,
        status: 'RELEASED',
        documentation: { architecture: 'docs/reviews/executive-core-review-package-2026-07-05.md' },
        changelogReference,
        traceabilityReference,
        testStatus,
      },
      {
        name: 'Memory Service',
        version: 'v1.0',
        purpose: 'Organizational memory storage and retrieval.',
        owner: 'Memory',
        dependencies: [{ name: 'Research Service', version: 'v1.0' }],
        publicInterfaces: [{ name: 'recordCompletedInformation' }, { name: 'retrieve' }],
        releaseTag: 'memory-service-v1.0',
        commitHash,
        status: 'RELEASED',
        documentation: { architecture: 'docs/reviews/executive-core-review-package-2026-07-05.md' },
        changelogReference,
        traceabilityReference,
        testStatus,
      },
      {
        name: 'Metrics Service',
        version: 'v1.0',
        purpose: 'Measurement event recording and retrieval.',
        owner: 'Metrics',
        dependencies: [{ name: 'Memory Service', version: 'v1.0' }],
        publicInterfaces: [{ name: 'recordMetricEvent' }, { name: 'retrieveMetrics' }, { name: 'aggregateMetrics' }],
        releaseTag: 'metrics-service-v1.0',
        commitHash,
        status: 'RELEASED',
        documentation: { architecture: 'docs/reviews/executive-core-review-package-2026-07-05.md' },
        changelogReference,
        traceabilityReference,
        testStatus,
      },
      {
        name: 'Performance Intelligence Service',
        version: 'v1.0',
        purpose: 'Cross-service intelligence artifact generation.',
        owner: 'Performance Intelligence',
        dependencies: [{ name: 'Metrics Service', version: 'v1.0' }, { name: 'Memory Service', version: 'v1.0' }],
        publicInterfaces: [{ name: 'generateIntelligence' }, { name: 'retrieveIntelligence' }, { name: 'generatePerformanceReport' }],
        releaseTag: 'performance-intelligence-service-v1.0',
        commitHash,
        status: 'RELEASED',
        documentation: { architecture: 'docs/reviews/executive-core-review-package-2026-07-05.md' },
        changelogReference,
        traceabilityReference,
        testStatus,
      },
      {
        name: 'Approval Service',
        version: 'v1.0',
        purpose: 'Governance authorization gate for execution readiness.',
        owner: 'Approval',
        dependencies: [{ name: 'Performance Intelligence Service', version: 'v1.0' }],
        publicInterfaces: [{ name: 'requestApproval' }, { name: 'approve' }, { name: 'reject' }, { name: 'isAuthorized' }],
        releaseTag: 'approval-service-v1.0',
        commitHash,
        status: 'RELEASED',
        documentation: { architecture: 'docs/reviews/executive-core-review-package-2026-07-05.md' },
        changelogReference,
        traceabilityReference,
        testStatus,
      },
    ];

    return coreCapabilities.map((capability) => this.registerOrUpdateCapability(capability));
  }
}
