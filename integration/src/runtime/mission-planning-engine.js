import { createMissionPlan, validateMissionPlan } from './mission-plan-contracts.js';

export class MissionPlanningEngine {
  constructor({
    launchPlanGenerator,
    executionPlanGenerator,
    plannerVersion = '1.0.0'
  } = {}) {
    this.launchPlanGenerator = launchPlanGenerator;
    this.executionPlanGenerator = executionPlanGenerator;
    this.plannerVersion = plannerVersion;
  }

  generateMissionPlan({ request = {}, runtimeContext } = {}) {
    const launchPlan = this.resolveLaunchPlan(request);
    const executionPlan = this.resolveExecutionPlan({ request, launchPlan });
    const executionInputs = this.buildExecutionInputs(request);

    const plan = createMissionPlan({
      planId: `PLAN-${runtimeContext.missionId}`,
      missionId: runtimeContext.missionId,
      requestId: runtimeContext.requestId,
      objective: {
        missionObjective: request.objective ?? runtimeContext.missionObjective,
        businessGoal: request.businessName ?? request.topic ?? 'Mission delivery',
        audience: request.audience ?? 'General Audience'
      },
      successMetrics: [
        {
          metricId: 'QUALITY_GATE_PASS_RATE',
          target: 'PASS',
          source: 'QUALITY_REVIEW'
        },
        {
          metricId: 'RUNTIME_TERMINAL_STATE',
          target: 'COMPLETED',
          source: 'MISSION_RUNTIME_ORCHESTRATOR'
        }
      ],
      constraints: {
        hardConstraints: [
          'MISSION_PLAN_REQUIRED_BEFORE_EXECUTION',
          'QUALITY_GATE_REQUIRED_BEFORE_PUBLISHING'
        ],
        softConstraints: [
          'PREFER_REQUESTED_PROVIDER_WHEN_AVAILABLE',
          'MINIMIZE_REWORK_ACROSS_PHASES'
        ],
        timeBudgetMinutes: Number.isFinite(Number(request.targetDuration))
          ? Math.max(15, Number(request.targetDuration))
          : 60
      },
      selectedStrategy: {
        strategyId: 'STRATEGY-STAGED-PRODUCTION',
        name: 'Staged Content Production Strategy',
        rationale: 'Preserve existing production pipeline while introducing explicit planning contract.',
        approach: 'Plan-first staged execution with quality and executive governance gates.',
        assumptions: [
          'Core production workers are available.',
          'Capability selection uses placeholders until registry integration is enabled.'
        ]
      },
      confidence: {
        score: this.resolveConfidenceScore(request),
        rationale: 'Confidence derived from decision package readiness and baseline runtime policy checks.'
      },
      requiredDirectors: this.selectRequiredDirectors(request),
      requiredCertifiedCapabilities: this.selectRequiredCertifiedCapabilities(request),
      providerPreferences: this.buildProviderPreferences(request),
      executionPhases: this.buildExecutionPhases(),
      expectedArtifacts: this.buildExpectedArtifacts(),
      approvalRequirements: {
        requiredApprovers: ['CQO', 'EXECUTIVE_COUNCIL', 'CEO'],
        minimumApprovals: 2,
        requiresExecutiveReview: true,
        requiresCEODecision: true
      },
      riskAssessment: {
        overallRiskLevel: this.resolveOverallRiskLevel(request),
        risks: [
          {
            riskId: 'RISK-QUALITY-001',
            description: 'Artifact quality gate may fail due to inconsistent inputs.',
            severity: 'HIGH',
            mitigation: 'Apply quality review and remediation tasks before publication.'
          },
          {
            riskId: 'RISK-PROVIDER-001',
            description: 'Preferred provider may be unavailable during execution.',
            severity: 'MEDIUM',
            mitigation: 'Use configured provider fallback policy.'
          }
        ]
      },
      aeisMeasurementHooks: {
        hookVersion: '1.0.0',
        hooks: [
          {
            hookId: 'AEIS-HOOK-PLAN-CREATED',
            stage: 'PLANNING',
            metricRef: 'MISSION_PLAN_CREATED'
          },
          {
            hookId: 'AEIS-HOOK-QUALITY-GATE',
            stage: 'QUALITY_REVIEW',
            metricRef: 'QUALITY_GATE_RESULT'
          },
          {
            hookId: 'AEIS-HOOK-TERMINAL-OUTCOME',
            stage: 'COMPLETED',
            metricRef: 'MISSION_TERMINAL_OUTCOME'
          }
        ]
      },
      translation: {
        launchPlan,
        executionPlan,
        executionInputs
      },
      generatedAt: new Date().toISOString(),
      plannerVersion: this.plannerVersion
    });

    const validation = validateMissionPlan(plan);

    if (!validation.isValid) {
      throw new Error(`MissionPlanningEngine generated invalid Mission Plan: ${validation.issues.map(issue => issue.issue).join(', ')}`);
    }

    return plan;
  }

  translateMissionPlanToRuntimePlan(missionPlan = {}) {
    return {
      launchPlan: missionPlan.translation?.launchPlan ?? { phases: [] },
      executionPlan: missionPlan.translation?.executionPlan ?? { tasks: [] },
      executionInputs: missionPlan.translation?.executionInputs ?? {}
    };
  }

  resolveLaunchPlan(request = {}) {
    if (request.plan?.launchPlan) {
      return request.plan.launchPlan;
    }

    if (!this.launchPlanGenerator || typeof this.launchPlanGenerator.generate !== 'function') {
      return { phases: [] };
    }

    return this.launchPlanGenerator.generate({
      businessName: request.businessName,
      objective: request.objective,
      recommendation: request.decisionPackage?.recommendation ?? 'UNDER_EXECUTION',
      decisionReadiness: {
        status: request.decisionPackage?.decisionReadiness?.status ?? 'IN_PROGRESS'
      },
      confidence: request.decisionPackage?.confidence ?? 50
    });
  }

  resolveExecutionPlan({ request = {}, launchPlan = {} } = {}) {
    if (request.plan?.executionPlan) {
      return request.plan.executionPlan;
    }

    if (!this.executionPlanGenerator || typeof this.executionPlanGenerator.generate !== 'function') {
      return { tasks: [] };
    }

    return this.executionPlanGenerator.generate(launchPlan);
  }

  buildExecutionInputs(request = {}) {
    return {
      topic: request.topic,
      audience: request.audience,
      targetLength: request.targetLength,
      style: request.style,
      voiceStyle: request.voiceStyle,
      language: request.language,
      targetDuration: request.targetDuration,
      sceneDescription: request.sceneDescription,
      artStyle: request.artStyle,
      imageCount: request.imageCount,
      targetFormat: request.targetFormat,
      targetResolution: request.targetResolution,
      targetPlatform: request.targetPlatform,
      categoryId: request.categoryId,
      publishTime: request.publishTime,
      scheduledPublishTime: request.scheduledPublishTime
    };
  }

  selectRequiredDirectors() {
    return [
      {
        directorProfileId: 'DIRECTOR-STORY-001',
        role: 'Story Director',
        minimumCompetencyLevel: 3,
        responsibility: 'Own script narrative and audience alignment.'
      },
      {
        directorProfileId: 'DIRECTOR-PRODUCTION-001',
        role: 'Production Director',
        minimumCompetencyLevel: 3,
        responsibility: 'Own media assembly and production continuity.'
      }
    ];
  }

  selectRequiredCertifiedCapabilities() {
    return [
      {
        capabilityId: 'CAP-OPENING-HOOKS-PLACEHOLDER',
        capabilityName: 'Opening Hooks',
        minimumCompetencyLevel: 3,
        selectionMode: 'PLACEHOLDER',
        source: 'MISSION_PLANNING_ENGINE_MOCK',
        registryStatus: 'PENDING_REGISTRY_INTEGRATION'
      },
      {
        capabilityId: 'CAP-EXECUTIVE-NARRATIVE-PLACEHOLDER',
        capabilityName: 'Executive Narrative Packaging',
        minimumCompetencyLevel: 3,
        selectionMode: 'PLACEHOLDER',
        source: 'MISSION_PLANNING_ENGINE_MOCK',
        registryStatus: 'PENDING_REGISTRY_INTEGRATION'
      }
    ];
  }

  buildProviderPreferences(request = {}) {
    const scriptProvider = request.providerPreferences?.scriptProvider ?? 'INTERNAL_SCRIPT_ENGINE';
    const voiceProvider = request.providerPreferences?.voiceProvider ?? 'ELEVENLABS';
    const imageProvider = request.providerPreferences?.imageProvider ?? 'GOOGLE_IMAGEN';
    const videoProvider = request.providerPreferences?.videoProvider ?? 'GOOGLE_VIDEO_ASSEMBLY';

    return {
      script: [{ provider: scriptProvider, priority: 1 }],
      voice: [{ provider: voiceProvider, priority: 1 }],
      image: [{ provider: imageProvider, priority: 1 }],
      video: [{ provider: videoProvider, priority: 1 }],
      fallbackPolicy: [
        { type: 'VOICE_PROVIDER', mode: 'RETRY_WITH_DEFAULT_PROVIDER' },
        { type: 'IMAGE_PROVIDER', mode: 'RETRY_WITH_DEFAULT_PROVIDER' },
        { type: 'VIDEO_PROVIDER', mode: 'RETRY_WITH_DEFAULT_PROVIDER' }
      ]
    };
  }

  buildExecutionPhases() {
    return [
      {
        phaseId: 'PHASE-PLAN',
        name: 'Planning',
        objective: 'Generate validated mission plan contract.',
        exitCriteria: ['MISSION_PLAN_VALIDATED']
      },
      {
        phaseId: 'PHASE-PRODUCTION',
        name: 'Production',
        objective: 'Produce script, voice, image, timeline, and video assets.',
        exitCriteria: ['MEDIA_RENDER_COMPLETED']
      },
      {
        phaseId: 'PHASE-GOVERNANCE',
        name: 'Governance Review',
        objective: 'Pass quality and executive approval gates before publication.',
        exitCriteria: ['CEO_DECISION_RECORDED']
      }
    ];
  }

  buildExpectedArtifacts() {
    return [
      { artifactType: 'MISSION_PLAN', requiredByPhase: 'PLANNING' },
      { artifactType: 'SCRIPT', requiredByPhase: 'SCRIPTING' },
      { artifactType: 'VOICE', requiredByPhase: 'VOICE_GENERATION' },
      { artifactType: 'IMAGES', requiredByPhase: 'IMAGE_GENERATION' },
      { artifactType: 'TIMELINE', requiredByPhase: 'TIMELINE_BUILD' },
      { artifactType: 'VIDEO', requiredByPhase: 'MEDIA_RENDER' },
      { artifactType: 'QUALITY_REVIEW', requiredByPhase: 'QUALITY_REVIEW' },
      { artifactType: 'EXECUTIVE_DECISION_PACKET', requiredByPhase: 'EXECUTIVE_REVIEW' }
    ];
  }

  resolveConfidenceScore(request = {}) {
    const candidate = Number(request.decisionPackage?.confidence ?? 65);
    return Math.max(0, Math.min(100, candidate));
  }

  resolveOverallRiskLevel(request = {}) {
    const publishingMode = String(request.publishingMode ?? request.runtimePolicy?.publishingMode ?? 'NONE').toUpperCase();
    return publishingMode === 'NONE' ? 'MEDIUM' : 'HIGH';
  }
}