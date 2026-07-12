export class BusinessLaunchFrameworkDashboard {
  project({ frameworkResult = {} } = {}) {
    const projection = frameworkResult?.dashboardProjection ?? {};
    const workflow = Array.isArray(frameworkResult?.executiveWorkflow)
      ? frameworkResult.executiveWorkflow
      : [];

    return {
      executiveHealth: this.resolveExecutiveHealth(projection),
      launchStatus: projection.launchStatus ?? 'UNKNOWN',
      objectiveCount: Array.isArray(projection.objectiveAlignment) ? projection.objectiveAlignment.length : 0,
      workforceReadiness: projection.workforceReadiness ?? {
        requiredRoles: 0,
        assignedRoles: 0,
        unfilledRoles: 0
      },
      budgetSnapshot: projection.budgetSnapshot ?? {
        allocatedBudget: null,
        maxBudget: null,
        budgetStatus: 'UNDER_REVIEW'
      },
      nextExecutiveAction: workflow[1]?.action ?? 'Generate launch package.',
      executiveDecisionSignal: projection.executiveDecisionSignal ?? 'UNDER_REVIEW'
    };
  }

  resolveExecutiveHealth(projection = {}) {
    const unfilled = Number(projection?.workforceReadiness?.unfilledRoles ?? 0);

    if (unfilled > 0) return 'ATTENTION_REQUIRED';
    if (projection?.launchStatus === 'PLANNING_READY') return 'HEALTHY';
    return 'UNDER_REVIEW';
  }
}
