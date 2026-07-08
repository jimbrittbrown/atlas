export class BusinessLaunchPlanGenerator {
  generate(executiveDecisionPackage = {}) {
    const businessName = this.resolveBusinessName(executiveDecisionPackage);
    const objective = this.resolveObjective(executiveDecisionPackage, businessName);
    const phases = this.buildPhases();
    const milestones = phases.flatMap(phase => phase.milestones);
    const successCriteria = this.buildSuccessCriteria(executiveDecisionPackage);

    return {
      businessName,
      objective,
      phases,
      milestones,
      successCriteria
    };
  }

  resolveBusinessName(executiveDecisionPackage) {
    return executiveDecisionPackage.businessName
      ?? executiveDecisionPackage.mission?.title
      ?? 'Atlas Business Opportunity';
  }

  resolveObjective(executiveDecisionPackage, businessName) {
    return executiveDecisionPackage.objective
      ?? `Launch ${businessName} with disciplined executive governance.`;
  }

  buildPhases() {
    return [
      {
        name: 'Foundation',
        milestones: [
          'FOUNDATION-M1: Define operating model and ownership.',
          'FOUNDATION-M2: Establish launch readiness baseline.'
        ]
      },
      {
        name: 'Production',
        milestones: [
          'PRODUCTION-M1: Deliver initial production release.',
          'PRODUCTION-M2: Validate quality, controls, and throughput.'
        ]
      },
      {
        name: 'Growth',
        milestones: [
          'GROWTH-M1: Activate repeatable demand channels.',
          'GROWTH-M2: Scale operations against executive guardrails.'
        ]
      }
    ];
  }

  buildSuccessCriteria(executiveDecisionPackage) {
    return [
      `Recommendation Alignment: ${executiveDecisionPackage.recommendation ?? 'NO_RECOMMENDATION_AVAILABLE'}`,
      `Decision Readiness: ${executiveDecisionPackage.decisionReadiness?.status ?? 'UNKNOWN'}`,
      `Confidence Target: >= ${executiveDecisionPackage.confidence ?? 0}`
    ];
  }
}
