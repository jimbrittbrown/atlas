export class ProgramManager {
  supervise(businessExecutionPlan = {}) {
    return this.generateExecutiveProgressReport(businessExecutionPlan);
  }

  generateExecutiveProgressReport(businessExecutionPlan = {}) {
    const tasks = Array.isArray(businessExecutionPlan.tasks) ? businessExecutionPlan.tasks : [];
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
