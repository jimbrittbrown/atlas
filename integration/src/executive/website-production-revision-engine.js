function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function workerAssignments(workforceDirector) {
  const dashboard = workforceDirector?.buildDashboard?.() ?? {};
  return (dashboard.currentWorkload ?? [])
    .flatMap((item) => item.workers ?? [])
    .map((worker) => worker.workerName ?? worker.workerId ?? 'UNASSIGNED');
}

export class WebsiteProductionRevisionEngine {
  constructor({ now, maxAttempts = 2 } = {}) {
    this.now = now;
    this.maxAttempts = maxAttempts;
  }

  run({ qaEngine, session, requiredPages, pipelineMission, projectDetails, workforceDirector } = {}) {
    const history = [];
    let attempt = 0;
    let qa = qaEngine.evaluate({
      reviewId: session.reviewId,
      requiredPages,
      pipelineMission,
      projectDetails
    });

    while (qa.qaStatus !== 'PASS' && attempt < this.maxAttempts) {
      attempt += 1;
      const tasks = qa.recommendations.map((recommendation, index) => ({
        taskId: `${session.reviewId}_revision_${attempt}_${index + 1}`,
        recommendation,
        assignedWorkers: workerAssignments(workforceDirector),
        status: 'ROUTED',
        createdAt: nowIso(this.now)
      }));

      history.push({
        attempt,
        tasks,
        previousScore: qa.qualityScore,
        previousIssuesRemaining: qa.issuesRemaining,
        triggeredBy: 'QA_FINDINGS'
      });

      // Recovery loop: rerun QA automatically after revision routing.
      qa = qaEngine.evaluate({
        reviewId: session.reviewId,
        requiredPages,
        pipelineMission,
        projectDetails
      });
    }

    return {
      qa,
      history,
      retries: attempt,
      haltedAtGovernanceCheckpoint: qa.qaStatus !== 'PASS'
    };
  }
}
