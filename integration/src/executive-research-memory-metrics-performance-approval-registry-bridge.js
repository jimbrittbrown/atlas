export class ExecutiveResearchMemoryMetricsPerformanceApprovalRegistryBridge {
  constructor({
    governanceBridge,
    capabilityRegistryAdapter,
    logger,
  }) {
    this.governanceBridge = governanceBridge;
    this.capabilityRegistryAdapter = capabilityRegistryAdapter;
    this.logger = logger;
  }

  async execute(request) {
    const result = await this.governanceBridge.execute(request);

    const registryRecords = this.capabilityRegistryAdapter.syncCoreCapabilities({
      commitHash: request.context?.commitHash ?? '',
      traceabilityReference: 'docs/implementation-traceability-matrix.md',
      changelogReference: 'CHANGELOG.md',
      testStatus: request.context?.testStatus ?? 'PASS',
    });

    this.logger.log({
      workflowId: result.workflowId,
      message: 'Capability registry synchronized after governance flow',
      registeredCapabilities: registryRecords.map((record) => record.metadata.name),
    });

    return {
      ...result,
      registry: {
        synchronized: true,
        total: registryRecords.length,
      },
    };
  }
}
