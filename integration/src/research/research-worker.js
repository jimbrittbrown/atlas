import { WorkerAssignment } from '../worker-assignment.js';

export class ResearchWorker {
  constructor(researchCoordinator) {
    this.researchCoordinator = researchCoordinator;
  }

  async execute(assignment) {
    if (!(assignment instanceof WorkerAssignment)) {
      throw new Error('ResearchWorker requires a WorkerAssignment instance.');
    }

    assignment.start();

    const researchRequest = {
      id: assignment.taskId,
      objective: assignment.result?.task?.objective
        ?? assignment.result?.task?.name
        ?? `Research task ${assignment.taskId}`,
      context: assignment.result?.task?.context ?? {},
      capability: 'research'
    };
    const researchResult = await this.researchCoordinator.research(researchRequest);

    const completion = {
      taskId: assignment.taskId,
      status: 'COMPLETED',
      findings: researchResult?.report?.findings ?? [],
      completedAt: 'COMPLETED_AT_PLACEHOLDER',
      report: researchResult?.report ?? {}
    };

    assignment.complete(completion, completion.completedAt);

    return completion;
  }
}
