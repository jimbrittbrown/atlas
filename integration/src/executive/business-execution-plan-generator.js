export class BusinessExecutionPlanGenerator {
  generate(businessLaunchPlan = {}) {
    const phases = this.buildPhases(businessLaunchPlan);
    const tasks = this.buildTasks(phases);
    const dependencies = this.buildDependencies(tasks);
    const executionOrder = tasks.map(task => task.id);
    const completionCriteria = this.buildCompletionCriteria({ phases, tasks });

    return {
      phases,
      tasks,
      dependencies,
      executionOrder,
      completionCriteria
    };
  }

  buildPhases(businessLaunchPlan) {
    const launchPlanPhases = Array.isArray(businessLaunchPlan.phases)
      ? businessLaunchPlan.phases
      : [];

    if (launchPlanPhases.length > 0) {
      return launchPlanPhases.map((phase, index) => ({
        id: `PHASE-${String(index + 1).padStart(3, '0')}`,
        name: phase.name ?? `Phase ${index + 1}`,
        milestones: Array.isArray(phase.milestones) ? phase.milestones : []
      }));
    }

    return [
      {
        id: 'PHASE-001',
        name: 'Foundation',
        milestones: ['FOUNDATION-M1: Placeholder milestone.']
      },
      {
        id: 'PHASE-002',
        name: 'Production',
        milestones: ['PRODUCTION-M1: Placeholder milestone.']
      },
      {
        id: 'PHASE-003',
        name: 'Growth',
        milestones: ['GROWTH-M1: Placeholder milestone.']
      }
    ];
  }

  buildTasks(phases) {
    const tasks = [];

    phases.forEach(phase => {
      phase.milestones.forEach((milestone, milestoneIndex) => {
        const taskId = `TASK-${String(tasks.length + 1).padStart(3, '0')}`;

        tasks.push({
          id: taskId,
          phaseId: phase.id,
          phaseName: phase.name,
          milestone,
          title: `Execute ${phase.name} milestone ${milestoneIndex + 1}`,
          description: milestone,
          status: 'PENDING'
        });
      });

      if (phase.milestones.length === 0) {
        const taskId = `TASK-${String(tasks.length + 1).padStart(3, '0')}`;

        tasks.push({
          id: taskId,
          phaseId: phase.id,
          phaseName: phase.name,
          milestone: `${phase.name}-M0: Placeholder milestone.`,
          title: `Execute ${phase.name} phase placeholder milestone`,
          description: `${phase.name} phase requires milestone definition.`,
          status: 'PENDING'
        });
      }

    });

    return tasks;
  }

  buildDependencies(tasks) {
    return tasks.map((task, index) => ({
      taskId: task.id,
      dependsOn: index === 0 ? [] : [tasks[index - 1].id]
    }));
  }

  buildCompletionCriteria({ phases, tasks }) {
    return [
      `All tasks completed: ${tasks.length}`,
      `All phases completed: ${phases.length}`,
      'No pending executive blockers remain.'
    ];
  }
}
