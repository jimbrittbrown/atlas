import { WorkerAssignment } from '../worker-assignment.js';
import { AssignmentRepository } from '../assignment-repository.js';

export class ProgramManager {
  constructor({ assignmentRepository } = {}) {
    this.assignmentRepository = assignmentRepository ?? new AssignmentRepository();
    this.assignments = this.assignmentRepository.listAssignments();
  }

  supervise(businessExecutionPlan = {}) {
    return this.generateExecutiveProgressReport(businessExecutionPlan);
  }

  assignTasks(businessExecutionPlan = {}, workerId = 'RESEARCH-WORKER-001') {
    const tasks = Array.isArray(businessExecutionPlan.tasks) ? businessExecutionPlan.tasks : [];

    this.assignments = tasks.map((task, index) => new WorkerAssignment({
      assignmentId: `ASG-${String(index + 1).padStart(3, '0')}`,
      workerId,
      taskId: task.id ?? `TASK-${String(index + 1).padStart(3, '0')}`,
      result: {
        task
      }
    }));

    this.assignments.forEach(assignment => {
      this.assignmentRepository.saveAssignment(assignment);
    });
    this.assignments = this.assignmentRepository.listAssignments();

    return this.assignments;
  }

  receiveCompletion(completedAssignment) {
    this.assignmentRepository.updateAssignment(completedAssignment);
    this.assignments = this.assignmentRepository.listAssignments();

    return this.generateExecutiveProgressReport({ tasks: this.assignments });
  }

  generateExecutiveProgressReport(businessExecutionPlan = {}) {
    const tasks = Array.isArray(businessExecutionPlan.tasks)
      ? businessExecutionPlan.tasks
      : this.assignments;
    const completedTasks = tasks.filter(task => String(task.status).toUpperCase() === 'COMPLETED').length;
    const blockedTasks = tasks.filter(task => String(task.status).toUpperCase() === 'BLOCKED').length;
    const overdueTasks = tasks.filter(task => this.isOverdue(task)).length;
    const activeTasks = tasks.length - completedTasks - blockedTasks;
    const completionPercentage = tasks.length === 0
      ? 0
      : Math.round((completedTasks / tasks.length) * 100);

    return {
      completionPercentage,
      completedTasks,
      activeTasks,
      blockedTasks,
      executiveStatus: this.calculateExecutiveStatus({
        taskCount: tasks.length,
        blockedTasks,
        overdueTasks,
        completionPercentage
      })
    };
  }

  isOverdue(task = {}) {
    if (task.overdue === true) {
      return true;
    }

    return String(task.status).toUpperCase() === 'OVERDUE';
  }

  calculateExecutiveStatus({ taskCount, blockedTasks, overdueTasks, completionPercentage }) {
    if (taskCount === 0) {
      return 'NO_EXECUTION_ACTIVITY';
    }

    if (blockedTasks > 0) {
      return 'BLOCKED';
    }

    if (overdueTasks > 0) {
      return 'AT_RISK';
    }

    if (completionPercentage === 100) {
      return 'COMPLETE';
    }

    return 'ON_TRACK';
  }
}
