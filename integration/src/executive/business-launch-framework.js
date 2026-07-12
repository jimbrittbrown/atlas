import {
  BusinessLaunchPipelineStages,
  createBusinessLaunchFrameworkInput,
  createBusinessLaunchFrameworkResult,
  requiredLaunchPackageSections,
  validateBusinessLaunchFrameworkInput,
  validateBusinessLaunchPackage
} from './business-launch-framework-contracts.js';

export class BusinessLaunchFramework {
  generate(inputPayload = {}) {
    const input = createBusinessLaunchFrameworkInput(inputPayload);
    const inputValidation = validateBusinessLaunchFrameworkInput(input);

    if (!inputValidation.isValid) {
      throw new Error(`Business launch framework input invalid: ${inputValidation.issues.join(' | ')}`);
    }

    const frameworkArchitecture = this.buildFrameworkArchitecture();
    const launchPackageSchema = this.buildLaunchPackageSchema();
    const pipeline = this.buildPipeline();
    const workforceAssignment = this.selectAISpecialists(input);
    const requiredArtifacts = this.buildRequiredArtifacts();
    const executiveWorkflow = this.buildExecutiveWorkflow();
    const launchPackage = this.buildLaunchPackage({ input, workforceAssignment });

    const packageValidation = validateBusinessLaunchPackage(launchPackage);
    if (!packageValidation.isValid) {
      throw new Error(`Business launch package missing required sections: ${packageValidation.missingSections.join(', ')}`);
    }

    const dashboardProjection = this.buildDashboardProjection({
      launchPackage,
      workforceAssignment,
      availableBudget: input.availableBudget,
      ceoObjectives: input.ceoObjectives
    });

    return createBusinessLaunchFrameworkResult({
      frameworkArchitecture,
      launchPackageSchema,
      pipeline,
      requiredArtifacts,
      executiveWorkflow,
      dashboardProjection,
      launchPackage
    });
  }

  buildFrameworkArchitecture() {
    return {
      name: 'Atlas Business Launch Framework',
      classification: 'Permanent Executive Operating Procedure',
      purpose: 'Convert an approved business opportunity into an executable, governed launch plan reusable across all Atlas businesses.',
      designPrinciples: [
        'Reusable across business models and sectors.',
        'No business-specific assumptions in framework logic.',
        'Workforce Registry is memory, not total market knowledge.',
        'Specialist assignment must check active champion first, then run external market discovery when absent.',
        'CEO approval gates before launch and major scope transitions.',
        'Performance monitoring feeds structured improvement recommendations.'
      ],
      inputs: [
        'Approved Business Recommendation',
        'CEO Objectives',
        'Available Workforce',
        'Available Budget',
        'Current Atlas Assets'
      ],
      output: 'Business Launch Package'
    };
  }

  buildLaunchPackageSchema() {
    const fields = requiredLaunchPackageSections();

    return {
      version: '1.0.0',
      packageName: 'Business Launch Package',
      requiredSections: fields,
      sectionCount: fields.length
    };
  }

  buildPipeline() {
    return BusinessLaunchPipelineStages.map((stage, index) => ({
      order: index + 1,
      stage,
      gate: this.resolveGate(stage),
      primaryDecisionOwner: this.resolveOwner(stage)
    }));
  }

  resolveGate(stage) {
    const gates = {
      APPROVED_BUSINESS: 'Approved recommendation must include objective, target customer, and revenue model.',
      LAUNCH_PLANNING: 'Launch package sections 1-20 completed and internally reviewed.',
      WORKFORCE_ASSIGNMENT: 'Each required specialist role checks active champion; if absent, external market discovery returns top benchmark candidates and requires CEO benchmark approval.',
      ASSET_CREATION: 'Core brand, website, marketing, sales, and operations assets created.',
      QUALITY_REVIEW: 'Quality review passes without critical blockers.',
      CEO_APPROVAL: 'CEO explicitly approves launch package and readiness status.',
      LAUNCH: 'Launch command authorized and release checklist complete.',
      PERFORMANCE_MONITORING: 'Tracking instrumentation and KPI dashboard are live.',
      IMPROVEMENT_RECOMMENDATIONS: 'Performance review produces ranked recommendations for next cycle.'
    };

    return gates[stage] ?? 'Gate definition pending.';
  }

  resolveOwner(stage) {
    const owners = {
      APPROVED_BUSINESS: 'Executive Office',
      LAUNCH_PLANNING: 'Launch Strategy Lead',
      WORKFORCE_ASSIGNMENT: 'Workforce Registry Service',
      ASSET_CREATION: 'Execution Program Manager',
      QUALITY_REVIEW: 'Quality Review Council',
      CEO_APPROVAL: 'CEO',
      LAUNCH: 'Launch Operations Lead',
      PERFORMANCE_MONITORING: 'Performance Intelligence Lead',
      IMPROVEMENT_RECOMMENDATIONS: 'Executive Improvement Council'
    };

    return owners[stage] ?? 'Executive Office';
  }

  selectAISpecialists(input) {
    const roleDemand = [
      'Market Research Specialist',
      'Offer Strategy Specialist',
      'Automation Architect',
      'Growth Marketing Specialist',
      'Sales Systems Specialist',
      'Analytics Specialist'
    ];

    const workforce = Array.isArray(input.availableWorkforce) ? input.availableWorkforce : [];

    const selected = roleDemand.map(role => {
      const candidates = workforce
        .filter(member => String(member?.role ?? '').toLowerCase().includes(role.toLowerCase().split(' ')[0]))
        .sort((a, b) => Number(b?.standingScore ?? 0) - Number(a?.standingScore ?? 0));

      const top = candidates[0] ?? null;

      return {
        role,
        assignmentStatus: top ? 'ASSIGNED' : 'UNFILLED',
        workerId: top?.workerId ?? null,
        workerName: top?.name ?? null,
        standingScore: top?.standingScore ?? null,
        source: 'WORKFORCE_REGISTRY'
      };
    });

    return {
      policy: 'For each required role: select active champion from Workforce Registry or trigger external market discovery and CEO-approved benchmark before hiring.',
      assignments: selected
    };
  }

  buildRequiredArtifacts() {
    return [
      { artifactId: 'LAUNCH-ART-001', name: 'Executive Launch Brief', stage: 'LAUNCH_PLANNING' },
      { artifactId: 'LAUNCH-ART-002', name: 'Workforce Assignment Sheet', stage: 'WORKFORCE_ASSIGNMENT' },
      { artifactId: 'LAUNCH-ART-003', name: 'Brand System Brief', stage: 'ASSET_CREATION' },
      { artifactId: 'LAUNCH-ART-004', name: 'Website Specification', stage: 'ASSET_CREATION' },
      { artifactId: 'LAUNCH-ART-005', name: 'Marketing Campaign Blueprint', stage: 'ASSET_CREATION' },
      { artifactId: 'LAUNCH-ART-006', name: 'Sales Playbook', stage: 'ASSET_CREATION' },
      { artifactId: 'LAUNCH-ART-007', name: 'Operations SOP Pack', stage: 'ASSET_CREATION' },
      { artifactId: 'LAUNCH-ART-008', name: 'Support Response Matrix', stage: 'ASSET_CREATION' },
      { artifactId: 'LAUNCH-ART-009', name: 'Quality Review Report', stage: 'QUALITY_REVIEW' },
      { artifactId: 'LAUNCH-ART-010', name: 'CEO Approval Memo', stage: 'CEO_APPROVAL' },
      { artifactId: 'LAUNCH-ART-011', name: 'KPI Dashboard Baseline', stage: 'PERFORMANCE_MONITORING' },
      { artifactId: 'LAUNCH-ART-012', name: 'Improvement Recommendation Ledger', stage: 'IMPROVEMENT_RECOMMENDATIONS' }
    ];
  }

  buildExecutiveWorkflow() {
    return [
      {
        step: 1,
        action: 'Validate approved business recommendation and mission fit.',
        decisionOwner: 'Executive Office',
        output: 'Mission-ready approved business packet'
      },
      {
        step: 2,
        action: 'Generate launch package and verify all 20 sections complete.',
        decisionOwner: 'Launch Strategy Lead',
        output: 'Business Launch Package v1'
      },
      {
        step: 3,
        action: 'For each required role, check Workforce Registry champion; if absent, run market discovery and prepare top 3 benchmark candidates for CEO approval.',
        decisionOwner: 'Workforce Registry Service',
        output: 'Role-to-specialist assignment map with benchmark approval queue'
      },
      {
        step: 4,
        action: 'Build launch assets and perform quality review.',
        decisionOwner: 'Execution Program Manager',
        output: 'Quality-cleared launch artifacts'
      },
      {
        step: 5,
        action: 'Submit package for CEO go/no-go decision.',
        decisionOwner: 'CEO',
        output: 'CEO approval state'
      },
      {
        step: 6,
        action: 'Run launch, monitor KPI dashboard, and issue improvement recommendations.',
        decisionOwner: 'Performance Intelligence Lead',
        output: 'Post-launch improvement cycle'
      }
    ];
  }

  buildLaunchPackage({ input, workforceAssignment }) {
    const recommendation = input.approvedBusinessRecommendation ?? {};
    const objective = input.ceoObjectives[0] ?? 'Execute approved business with disciplined launch governance.';

    return {
      executiveSummary: this.buildExecutiveSummary({ recommendation, objective }),
      businessMission: recommendation.businessMission ?? objective,
      targetCustomer: recommendation.targetCustomer ?? 'Target customer segment to be validated during launch planning.',
      valueProposition: recommendation.valueProposition ?? 'Deliver measurable customer outcomes faster and more reliably than current alternatives.',
      revenueModel: recommendation.revenueModel ?? 'Revenue model defined from approved recommendation and validated in launch planning.',
      pricingStrategy: this.buildPricingStrategy({ recommendation, budget: input.availableBudget }),
      requiredAISpecialists: workforceAssignment,
      requiredHumanDecisions: this.buildRequiredHumanDecisions(),
      brandRequirements: this.buildBrandRequirements(),
      websiteRequirements: this.buildWebsiteRequirements(),
      marketingRequirements: this.buildMarketingRequirements(),
      salesRequirements: this.buildSalesRequirements(),
      contentRequirements: this.buildContentRequirements(),
      operationsRequirements: this.buildOperationsRequirements(),
      customerSupportRequirements: this.buildCustomerSupportRequirements(),
      analyticsRequirements: this.buildAnalyticsRequirements(),
      kpiDashboard: this.buildKpiDashboard(),
      first30DayExecutionPlan: this.build30DayPlan(),
      first90DayGrowthPlan: this.build90DayPlan(),
      executiveRiskAssessment: this.buildExecutiveRiskAssessment()
    };
  }

  buildExecutiveSummary({ recommendation, objective }) {
    return {
      mission: 'Convert approved opportunity into executable launch system.',
      approvedBusiness: recommendation.businessDescription ?? recommendation.businessName ?? 'Approved business recommendation',
      primaryObjective: objective,
      launchReadinessTarget: 'CEO_APPROVED_FOR_LAUNCH',
      reusableFramework: true
    };
  }

  buildPricingStrategy({ recommendation, budget }) {
    return {
      strategyType: recommendation.pricingStrategy ?? 'Value-anchored with fast market validation loops',
      launchPricingApproach: 'Start with a low-friction entry offer, then expand into retained and premium tiers.',
      budgetGuardrail: budget?.maxBudget ?? budget?.totalBudget ?? 'Budget ceiling pending CFO confirmation',
      pricingReviewCadence: 'Weekly for first 30 days, bi-weekly for days 31-90.'
    };
  }

  buildRequiredHumanDecisions() {
    return [
      'CEO decision on final offer positioning before launch.',
      'Executive sign-off on pricing guardrails and discount authority.',
      'Brand lead approval on identity and messaging before publication.',
      'Quality lead sign-off before launch gate is opened.',
      'CEO go/no-go after quality review.'
    ];
  }

  buildBrandRequirements() {
    return {
      corePositioning: 'Outcome-focused and evidence-backed.',
      messagingPrinciples: [
        'State customer pain in concrete operational terms.',
        'Communicate measurable business outcomes.',
        'Avoid hype or unsupported performance claims.'
      ],
      brandAssets: [
        'Brand narrative one-pager',
        'Visual identity starter kit',
        'Voice and tone guidance'
      ]
    };
  }

  buildWebsiteRequirements() {
    return {
      mustHavePages: ['Home', 'Offer', 'Proof', 'Pricing', 'Contact'],
      conversionRequirements: [
        'Primary call-to-action above the fold.',
        'Lead capture integrated with CRM.',
        'Measurement events for page-to-lead conversion.'
      ],
      technicalRequirements: [
        'Mobile-first responsive layout',
        'Core web vitals baseline monitoring',
        'Analytics and attribution tags'
      ]
    };
  }

  buildMarketingRequirements() {
    return {
      launchChannels: ['Direct outreach', 'Content distribution', 'Partnership referrals'],
      campaignSystem: 'Weekly campaign sprint with message-test-measure loop.',
      requiredAssets: ['Offer page', 'Outbound sequence', 'Case/proof content', 'Retargeting setup']
    };
  }

  buildSalesRequirements() {
    return {
      pipelineDesign: 'Lead -> Qualified -> Proposal -> Closed Won/Lost',
      salesAssets: ['Qualification script', 'Proposal template', 'Objection handling matrix'],
      governance: 'All proposals above pricing threshold require executive approval.'
    };
  }

  buildContentRequirements() {
    return {
      narrativePillars: ['Pain clarity', 'Outcome proof', 'Execution trust'],
      cadence: 'Minimum 3 high-value pieces per week during first 30 days.',
      formats: ['Short-form insight', 'Case breakdown', 'Offer explainer']
    };
  }

  buildOperationsRequirements() {
    return {
      processBaseline: ['Intake', 'Delivery', 'Quality checks', 'Handoff', 'Retention motion'],
      standardOperatingProcedures: 'SOP required for every recurring workflow before scale phase.',
      escalationPath: 'Execution lead -> Program manager -> Executive office'
    };
  }

  buildCustomerSupportRequirements() {
    return {
      supportChannels: ['Email', 'Ticketing system', 'Priority escalation path'],
      serviceLevels: {
        firstResponseTargetHours: 8,
        resolutionTargetHours: 48
      },
      qualityStandard: 'Every customer issue classified by severity and linked to root cause category.'
    };
  }

  buildAnalyticsRequirements() {
    return {
      eventTracking: ['Lead captured', 'Meeting booked', 'Proposal sent', 'Deal closed', 'Churn event'],
      dataSources: ['Website analytics', 'CRM', 'Billing', 'Support platform'],
      reportingCadence: 'Daily operational snapshot and weekly executive review.'
    };
  }

  buildKpiDashboard() {
    return {
      northStarMetric: 'Time to reliable weekly cash flow',
      launchKpis: [
        'Leads generated',
        'Qualified pipeline value',
        'Win rate',
        'Time to first revenue',
        'Gross margin',
        'Customer retention',
        'Support resolution SLA',
        'Automation coverage'
      ],
      decisionThresholds: {
        scale: 'Sustain target margin and conversion for 4 consecutive weeks.',
        stabilize: 'If 2 consecutive weeks miss target margin or SLA.',
        pivot: 'If no improvement after 2 stabilization cycles.'
      }
    };
  }

  build30DayPlan() {
    return [
      'Week 1: Finalize offer architecture, specialist assignments, and launch asset backlog.',
      'Week 2: Publish minimum launch assets and activate first demand channels.',
      'Week 3: Run first full sales cycle, instrument KPI dashboard, and resolve operational bottlenecks.',
      'Week 4: Present performance review to CEO and approve scale/stabilize/pivot decision.'
    ];
  }

  build90DayPlan() {
    return [
      'Days 1-30: Establish launch baseline and first revenue reliability signals.',
      'Days 31-60: Expand proven channels, strengthen fulfillment throughput, and harden SOPs.',
      'Days 61-90: Systematize growth loops, optimize unit economics, and prepare enterprise expansion options.'
    ];
  }

  buildExecutiveRiskAssessment() {
    return {
      riskCategories: [
        {
          category: 'Demand Risk',
          signal: 'Lead flow below threshold for two consecutive weeks.',
          mitigation: 'Shift channel mix and refine offer positioning.'
        },
        {
          category: 'Execution Risk',
          signal: 'Delivery cycle time exceeds SLA.',
          mitigation: 'Increase automation and narrow scope until throughput stabilizes.'
        },
        {
          category: 'Quality Risk',
          signal: 'Critical QA failures before launch or high post-launch incidents.',
          mitigation: 'Enforce launch hold and complete corrective actions before relaunch.'
        },
        {
          category: 'Financial Risk',
          signal: 'Burn rate exceeds budget guardrails.',
          mitigation: 'Reduce discretionary spend and re-sequence investments.'
        }
      ],
      executiveRecommendationPolicy: 'If any critical risk is unresolved, launch remains blocked pending CEO decision.'
    };
  }

  buildDashboardProjection({ launchPackage, workforceAssignment, availableBudget, ceoObjectives }) {
    const assignments = workforceAssignment?.assignments ?? [];
    const assignedCount = assignments.filter(item => item.assignmentStatus === 'ASSIGNED').length;

    return {
      generatedAt: new Date().toISOString(),
      launchStatus: 'PLANNING_READY',
      objectiveAlignment: ceoObjectives,
      workforceReadiness: {
        requiredRoles: assignments.length,
        assignedRoles: assignedCount,
        unfilledRoles: assignments.length - assignedCount
      },
      budgetSnapshot: {
        allocatedBudget: availableBudget?.allocatedBudget ?? null,
        maxBudget: availableBudget?.maxBudget ?? availableBudget?.totalBudget ?? null,
        budgetStatus: availableBudget?.budgetStatus ?? 'UNDER_REVIEW'
      },
      pipelineProgress: this.buildPipeline().map(stage => ({
        stage: stage.stage,
        status: stage.stage === 'APPROVED_BUSINESS' ? 'COMPLETED' : 'PENDING'
      })),
      keyMilestones: {
        first30DayPlanReady: Array.isArray(launchPackage?.first30DayExecutionPlan),
        first90DayPlanReady: Array.isArray(launchPackage?.first90DayGrowthPlan),
        kpiDashboardReady: Boolean(launchPackage?.kpiDashboard)
      },
      executiveDecisionSignal: assignedCount === assignments.length
        ? 'READY_FOR_LAUNCH_PLANNING_REVIEW'
        : 'WORKFORCE_ASSIGNMENT_GAPS'
    };
  }
}
