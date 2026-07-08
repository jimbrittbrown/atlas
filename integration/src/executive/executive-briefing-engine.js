export class ExecutiveBriefingEngine {
  build({
    enterpriseState = {},
    activeMissions = enterpriseState.activeMissions ?? [],
    outstandingDecisions = enterpriseState.outstandingDecisions ?? [],
    enterpriseHealth = enterpriseState.enterpriseHealth ?? 'UNKNOWN',
    recentCompletions = enterpriseState.recentCompletions ?? []
  } = {}) {
    const normalizedActiveMissions = this.normalizeRecords(activeMissions);
    const normalizedOutstandingDecisions = this.normalizeRecords(outstandingDecisions);
    const normalizedRecentCompletions = this.normalizeRecords(recentCompletions);
    const executiveHealth = this.resolveExecutiveHealth({
      enterpriseHealth,
      normalizedActiveMissions,
      normalizedOutstandingDecisions,
      normalizedRecentCompletions
    });

    return {
      executiveHealth,
      activeMissions: normalizedActiveMissions.length,
      completedWork: normalizedRecentCompletions.length,
      outstandingDecisions: this.summarizeOutstandingDecisions(normalizedOutstandingDecisions),
      currentRisks: this.buildCurrentRisks({
        normalizedActiveMissions,
        normalizedOutstandingDecisions,
        normalizedRecentCompletions
      }),
      recommendedNextAction: this.recommendNextAction({
        normalizedActiveMissions,
        normalizedOutstandingDecisions,
        normalizedRecentCompletions
      }),
      executiveSummary: this.buildExecutiveSummary({
        executiveHealth,
        normalizedActiveMissions,
        normalizedOutstandingDecisions,
        normalizedRecentCompletions
      })
    };
  }

  normalizeRecords(records) {
    if (!Array.isArray(records)) {
      return [];
    }

    return records
      .filter(record => record !== null && record !== undefined)
      .map(record => (typeof record === 'object' ? { ...record } : { value: record }))
      .sort((a, b) => this.sortKey(a).localeCompare(this.sortKey(b)));
  }

  summarizeOutstandingDecisions(outstandingDecisions) {
    return outstandingDecisions.map(decision => ({
      decisionId: decision.id ?? decision.decisionId ?? 'UNKNOWN_DECISION',
      title: decision.title ?? decision.summary ?? decision.question ?? 'Outstanding decision',
      status: decision.status ?? 'PENDING',
      owner: decision.owner ?? 'UNASSIGNED'
    }));
  }

  buildCurrentRisks({ normalizedActiveMissions, normalizedOutstandingDecisions, normalizedRecentCompletions }) {
    const risks = [];

    if (normalizedOutstandingDecisions.length > 0) {
      risks.push({
        code: 'OUTSTANDING_DECISIONS',
        severity: 'HIGH',
        description: `${normalizedOutstandingDecisions.length} decisions require executive attention.`
      });
    }

    const blockedMissions = normalizedActiveMissions.filter(mission => String(mission.status).toUpperCase().includes('BLOCKED'));
    if (blockedMissions.length > 0) {
      risks.push({
        code: 'BLOCKED_MISSIONS',
        severity: 'HIGH',
        description: `${blockedMissions.length} active missions are blocked.`
      });
    }

    if (normalizedRecentCompletions.length === 0 && normalizedActiveMissions.length === 0) {
      risks.push({
        code: 'LOW_EXECUTION_SIGNAL',
        severity: 'MEDIUM',
        description: 'No active missions or recent completions were reported.'
      });
    }

    return risks;
  }

  recommendNextAction({ normalizedActiveMissions, normalizedOutstandingDecisions, normalizedRecentCompletions }) {
    if (normalizedOutstandingDecisions.length > 0) {
      return 'Resolve outstanding decisions before expanding execution scope.';
    }

    if (normalizedActiveMissions.length > 0) {
      return 'Continue executing active missions and monitor completion milestones.';
    }

    if (normalizedRecentCompletions.length > 0) {
      return 'Archive completed work and define the next mission queue.';
    }

    return 'Define the next executive priority and start a new mission.';
  }

  buildExecutiveSummary({ executiveHealth, normalizedActiveMissions, normalizedOutstandingDecisions, normalizedRecentCompletions }) {
    return [
      `Health: ${executiveHealth}`,
      `Active missions: ${normalizedActiveMissions.length}`,
      `Outstanding decisions: ${normalizedOutstandingDecisions.length}`,
      `Recent completions: ${normalizedRecentCompletions.length}`
    ].join(' | ');
  }

  resolveExecutiveHealth({ enterpriseHealth, normalizedActiveMissions, normalizedOutstandingDecisions, normalizedRecentCompletions }) {
    const normalizedHealth = String(enterpriseHealth).toUpperCase();

    if (normalizedHealth !== 'UNKNOWN') {
      return normalizedHealth;
    }

    if (normalizedOutstandingDecisions.length > 0) {
      return 'ATTENTION_REQUIRED';
    }

    if (normalizedActiveMissions.length > 0) {
      return 'HEALTHY';
    }

    if (normalizedRecentCompletions.length > 0) {
      return 'STABLE';
    }

    return 'NO_ACTIVE_MISSIONS';
  }

  sortKey(record) {
    return String(record.id ?? record.decisionId ?? record.title ?? record.summary ?? record.question ?? record.value ?? '');
  }
}
