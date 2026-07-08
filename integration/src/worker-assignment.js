export class WorkerAssignment {
  constructor({
    assignmentId,
    workerId,
    taskId,
    status = 'ASSIGNED',
    assignedAt = 'ASSIGNED_AT_PLACEHOLDER',
    startedAt = null,
    completedAt = null,
    result = null
  }) {
    this.assignmentId = assignmentId;
    this.workerId = workerId;
    this.taskId = taskId;
    this.status = status;
    this.assignedAt = assignedAt;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.result = result;
  }

  start(startedAt = 'STARTED_AT_PLACEHOLDER') {
    if (this.status !== 'ASSIGNED') {
      throw new Error('WorkerAssignment can only start from ASSIGNED status.');
    }

    this.status = 'IN_PROGRESS';
    this.startedAt = startedAt;

    return this;
  }

  complete(result, completedAt = 'COMPLETED_AT_PLACEHOLDER') {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error('WorkerAssignment can only complete from IN_PROGRESS status.');
    }

    this.status = 'COMPLETED';
    this.completedAt = completedAt;
    this.result = result;

    return this;
  }

  block(result, completedAt = 'COMPLETED_AT_PLACEHOLDER') {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error('WorkerAssignment can only block from IN_PROGRESS status.');
    }

    this.status = 'BLOCKED';
    this.completedAt = completedAt;
    this.result = result;

    return this;
  }
}