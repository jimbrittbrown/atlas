import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { WorkerAssignment } from './worker-assignment.js';

export class AssignmentRepository {
  constructor({ storagePath = null } = {}) {
    this.storagePath = storagePath;
    this.inMemoryAssignments = [];
  }

  saveAssignment(assignment) {
    const assignments = this.listAssignments();
    const index = assignments.findIndex(item => item.assignmentId === assignment.assignmentId);

    if (index >= 0) {
      assignments[index] = this.hydrate(this.serialize(assignment));
    } else {
      assignments.push(this.hydrate(this.serialize(assignment)));
    }

    this.persist(assignments);

    return this.hydrate(this.serialize(assignment));
  }

  loadAssignment(assignmentId) {
    const assignments = this.listAssignments();
    const assignment = assignments.find(item => item.assignmentId === assignmentId);

    return assignment ?? null;
  }

  listAssignments() {
    const assignments = this.storagePath === null
      ? this.inMemoryAssignments
      : this.readFromDisk();

    return assignments
      .map(assignment => this.hydrate(this.serialize(assignment)))
      .sort((a, b) => a.assignmentId.localeCompare(b.assignmentId));
  }

  updateAssignment(assignment) {
    return this.saveAssignment(assignment);
  }

  persist(assignments) {
    const normalized = assignments
      .map(assignment => this.serialize(assignment))
      .sort((a, b) => a.assignmentId.localeCompare(b.assignmentId));

    if (this.storagePath === null) {
      this.inMemoryAssignments = normalized.map(assignment => this.hydrate(assignment));

      return;
    }

    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify({ assignments: normalized }, null, 2));
  }

  readFromDisk() {
    if (!existsSync(this.storagePath)) {
      return [];
    }

    const content = readFileSync(this.storagePath, 'utf8').trim();

    if (content.length === 0) {
      return [];
    }

    const parsed = JSON.parse(content);

    return Array.isArray(parsed.assignments)
      ? parsed.assignments.map(assignment => this.hydrate(assignment))
      : [];
  }

  serialize(assignment) {
    return {
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      startedAt: assignment.startedAt,
      completedAt: assignment.completedAt,
      result: assignment.result
    };
  }

  hydrate(assignment) {
    return new WorkerAssignment({
      assignmentId: assignment.assignmentId,
      workerId: assignment.workerId,
      taskId: assignment.taskId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      startedAt: assignment.startedAt,
      completedAt: assignment.completedAt,
      result: assignment.result
    });
  }
}