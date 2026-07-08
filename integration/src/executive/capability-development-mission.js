import { ExecutiveDecisionPackageGenerator } from './executive-decision-package-generator.js';

export class CapabilityDevelopmentMission {
  constructor({ executiveDecisionPackageGenerator = null } = {}) {
    this.executiveDecisionPackageGenerator = executiveDecisionPackageGenerator ?? new ExecutiveDecisionPackageGenerator();
  }

  run({ capabilityName, businessNeed, expectedBusinessImpact } = {}) {
    const normalizedCapabilityName = this.normalizeCapabilityName(capabilityName);
    const normalizedBusinessNeed = this.normalizeBusinessNeed(businessNeed);
    const normalizedExpectedBusinessImpact = this.normalizeExpectedBusinessImpact(expectedBusinessImpact);
    const objective = this.defineCapabilityObjective({
      capabilityName: normalizedCapabilityName,
      businessNeed: normalizedBusinessNeed,
      expectedBusinessImpact: normalizedExpectedBusinessImpact
    });
    const researchPlan = this.identifyRequiredResearch({
      capabilityName: normalizedCapabilityName,
      businessNeed: normalizedBusinessNeed
    });
    const engineeringRoadmap = this.produceEngineeringRoadmap({
      capabilityName: normalizedCapabilityName,
      businessNeed: normalizedBusinessNeed,
      expectedBusinessImpact: normalizedExpectedBusinessImpact,
      researchPlan
    });
    const estimatedImpact = this.estimateImplementationScope({
      expectedBusinessImpact: normalizedExpectedBusinessImpact,
      engineeringRoadmap
    });
    const executiveRecommendation = this.generateExecutiveDecisionPackage({
      capabilityName: normalizedCapabilityName,
      objective,
      researchPlan,
      engineeringRoadmap,
      estimatedImpact
    });

    return {
      capabilityName: normalizedCapabilityName,
      objective,
      researchPlan,
      engineeringRoadmap,
      estimatedImpact,
      approvalRequired: true,
      executiveRecommendation
    };
  }

  defineCapabilityObjective({ capabilityName, businessNeed, expectedBusinessImpact }) {
    return `${capabilityName} will address ${businessNeed} and deliver ${expectedBusinessImpact}.`;
  }

  identifyRequiredResearch({ capabilityName, businessNeed }) {
    return {
      researchId: `RESEARCH-${this.normalizeToken(capabilityName)}`,
      questions: [
        `${capabilityName} vendor options and constraints`,
        `Operational risks associated with ${businessNeed}`,
        'Integration effort and dependency mapping',
        'Security, compliance, and support requirements'
      ],
      requestedAt: 'REQUESTED_AT_PLACEHOLDER'
    };
  }

  produceEngineeringRoadmap({ capabilityName, businessNeed, expectedBusinessImpact, researchPlan }) {
    return {
      roadmapId: `ROADMAP-${this.normalizeToken(capabilityName)}`,
      phases: [
        {
          name: 'Discovery',
          tasks: [
            `Validate ${businessNeed}`,
            'Confirm engineering constraints',
            'Complete implementation sizing'
          ]
        },
        {
          name: 'Build',
          tasks: [
            `Implement ${capabilityName}`,
            'Integrate with existing executive workflow',
            'Prepare release readiness checks'
          ]
        },
        {
          name: 'Launch',
          tasks: [
            `Operationalize ${capabilityName}`,
            `Measure ${expectedBusinessImpact}`,
            'Handover to enterprise operations'
          ]
        }
      ],
      researchDependencies: researchPlan.questions
    };
  }

  estimateImplementationScope({ expectedBusinessImpact, engineeringRoadmap }) {
    const taskCount = engineeringRoadmap.phases.reduce((total, phase) => total + phase.tasks.length, 0);

    return {
      scopeLevel: taskCount > 7 ? 'LARGE' : 'MEDIUM',
      taskCount,
      businessImpactSummary: expectedBusinessImpact,
      implementationEffort: taskCount * 2
    };
  }

  generateExecutiveDecisionPackage({ capabilityName, objective, researchPlan, engineeringRoadmap, estimatedImpact }) {
    const decisionReadiness = {
      status: 'READY_WITH_CONDITIONS',
      rationale: 'Capability development requires research and approval before engineering begins.',
      missingEvidence: ['Approved implementation authorization'],
      criticalUnknowns: ['Final provider or internal implementation decisions']
    };

    return this.executiveDecisionPackageGenerator.generate({
      mission: {
        id: `CAPABILITY-${this.normalizeToken(capabilityName)}`,
        title: capabilityName,
        decisionClass: 'Strategic'
      },
      findings: [
        {
          id: `FINDING-${this.normalizeToken(capabilityName)}`,
          statement: objective,
          supportingEvidence: [
            {
              provider: 'CapabilityDevelopmentMission',
              requestId: researchPlan.researchId,
              sourceResponse: {
                researchPlan,
                engineeringRoadmap,
                estimatedImpact
              }
            }
          ]
        }
      ],
      beliefs: [
        {
          id: `BELIEF-${this.normalizeToken(capabilityName)}`,
          statement: `The capability should be developed only after approval and research completion.`,
          confidence: 0.9,
          supportingFindings: [`FINDING-${this.normalizeToken(capabilityName)}`]
        }
      ],
      importance: [
        {
          id: `BELIEF-${this.normalizeToken(capabilityName)}`,
          importance: 'high'
        }
      ],
      decisionReadiness,
      executiveTensions: [
        {
          id: `TENSION-${this.normalizeToken(capabilityName)}`,
          title: 'Approval Required Before Engineering Begins'
        }
      ],
      synthesis: {
        executiveSummary: `Develop ${capabilityName} through a gated capability mission with approved engineering scope.`
      }
    });
  }

  normalizeCapabilityName(capabilityName) {
    return typeof capabilityName === 'string' && capabilityName.trim().length > 0
      ? capabilityName.trim()
      : 'UNSPECIFIED_CAPABILITY';
  }

  normalizeBusinessNeed(businessNeed) {
    return typeof businessNeed === 'string' && businessNeed.trim().length > 0
      ? businessNeed.trim()
      : 'unspecified business need';
  }

  normalizeExpectedBusinessImpact(expectedBusinessImpact) {
    return typeof expectedBusinessImpact === 'string' && expectedBusinessImpact.trim().length > 0
      ? expectedBusinessImpact.trim()
      : 'undefined business impact';
  }

  normalizeToken(value) {
    return String(value)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'UNKNOWN';
  }
}
