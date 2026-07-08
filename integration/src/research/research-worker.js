export class ResearchWorker {
  constructor(researchCoordinator) {
    this.researchCoordinator = researchCoordinator;
  }

  async execute(task) {
    const researchRequest = {
      id: task.id,
      objective: task.objective ?? task.name,
      context: task.context ?? {},
      capability: 'research'
    };
    const researchResult = await this.researchCoordinator.research(researchRequest);

    return {
      taskId: task.id,
      status: 'COMPLETED',
      findings: researchResult?.report?.findings ?? [],
      completedAt: task.completedAt ?? 'COMPLETED_AT_PLACEHOLDER',
      report: researchResult?.report ?? {}
    };
  }
}
