export class MemoryServiceAdapter {
  constructor(memoryService) {
    this.memoryService = memoryService;
  }

  async storeResearchCompletion({ workflowId, requestId, report, evidence = [], findings = [], metadata = {} }) {
    return this.memoryService.recordResearchReport({
      title: `Research completion for workflow ${workflowId}`,
      summary: 'Research report stored for executive continuity',
      content: JSON.stringify({ report, evidence, findings }),
      metadata: {
        workflowId,
        requestId,
        source: 'research-service',
        createdBy: 'integration-bridge',
        tags: ['research', 'executive-handoff', ...(metadata.tags ?? [])],
      },
      references: [
        { referenceType: 'workflow', referenceId: workflowId },
        { referenceType: 'request', referenceId: requestId },
      ],
    });
  }

  async storeWorkflowHistory({ workflowId, requestId, summary, details }) {
    return this.memoryService.recordWorkflowHistory({
      title: `Workflow history ${workflowId}`,
      summary,
      content: details,
      metadata: {
        workflowId,
        requestId,
        source: 'executive-service',
        createdBy: 'integration-bridge',
        tags: ['workflow-history'],
      },
      references: [
        { referenceType: 'workflow', referenceId: workflowId },
        { referenceType: 'request', referenceId: requestId },
      ],
    });
  }
}
