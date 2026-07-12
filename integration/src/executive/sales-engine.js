import {
  AtlasSalesEngineCapabilities,
  AtlasSalesEnginePipelineStages,
  createSalesEngineInput,
  createSalesEngineResult,
  validateSalesEngineInput,
  validateSalesEnginePackage
} from './sales-engine-contracts.js';

export class AtlasSalesEngine {
  buildDepartment(inputPayload = {}) {
    const input = createSalesEngineInput(inputPayload);
    const validation = validateSalesEngineInput(input);

    if (!validation.isValid) {
      throw new Error(`Sales Engine input invalid: ${validation.issues.join(' | ')}`);
    }

    const salesEngineArchitecture = this.buildArchitecture(input);
    const departmentResponsibilities = this.buildDepartmentResponsibilities();
    const pipeline = this.buildPipeline();
    const requiredArtifacts = this.buildRequiredArtifacts();
    const dashboardModel = this.buildDashboardModel(input);
    const executiveWorkflow = this.buildExecutiveWorkflow(input);

    const result = createSalesEngineResult({
      salesEngineArchitecture,
      departmentResponsibilities,
      pipeline,
      requiredArtifacts,
      dashboardModel,
      executiveWorkflow
    });

    const packageValidation = validateSalesEnginePackage(result);
    if (!packageValidation.isValid) {
      throw new Error(`Sales Engine package incomplete: ${packageValidation.missingFields.join(', ')}`);
    }

    return result;
  }

  buildArchitecture(input) {
    return {
      departmentName: input.departmentName,
      classification: 'Permanent Executive Department',
      mission: 'Acquire customers, convert prospects, track revenue, and continuously improve sales performance for all Atlas operating companies.',
      firstOperatingCompany: input.operatingCompany ?? 'Atlas Web',
      reusableByAllCompanies: true,
      capabilities: [...AtlasSalesEngineCapabilities],
      constitutionalAlignment: [
        'Specialists execute; Atlas governs and measures outcomes.',
        'Benchmarking and evidence drive specialist selection.',
        'CEO retains final decision authority on strategic gates.'
      ]
    };
  }

  buildDepartmentResponsibilities() {
    return [
      {
        responsibility: 'Prospect Intelligence',
        scope: ['Prospect Discovery', 'Prospect Scoring', 'Website Audit Generation'],
        outcome: 'Consistent pipeline of high-probability qualified prospects.'
      },
      {
        responsibility: 'Conversion Operations',
        scope: ['Outreach Generation', 'Meeting Tracking', 'Proposal Generation'],
        outcome: 'Qualified opportunities progress to revenue conversations.'
      },
      {
        responsibility: 'Revenue Operations',
        scope: ['Contract Generation', 'Invoice Generation', 'Follow-up Scheduling'],
        outcome: 'Reduced friction from proposal to cash collection.'
      },
      {
        responsibility: 'Retention and Expansion',
        scope: ['Customer Satisfaction Tracking', 'Referral Tracking', 'Repeat Business orchestration'],
        outcome: 'Higher LTV, referrals, and repeat sales velocity.'
      },
      {
        responsibility: 'Executive Sales Intelligence',
        scope: ['Win/Loss Analysis', 'Revenue Dashboard', 'Sales Analytics'],
        outcome: 'CEO-grade visibility and continuous improvement loops.'
      }
    ];
  }

  buildPipeline() {
    return AtlasSalesEnginePipelineStages.map((stage, index) => ({
      order: index + 1,
      stage,
      entryCriteria: this.resolveEntryCriteria(stage),
      exitCriteria: this.resolveExitCriteria(stage),
      owner: this.resolveOwner(stage)
    }));
  }

  resolveEntryCriteria(stage) {
    const map = {
      PROSPECT: 'Target account is identified with decision-maker signal.',
      QUALIFIED_PROSPECT: 'Fit score exceeds qualification threshold.',
      AUDIT: 'Prospect has qualification evidence and contact path.',
      OUTREACH: 'Audit completed and outreach hypothesis approved.',
      MEETING: 'Prospect positively engages and books conversation.',
      PROPOSAL: 'Discovery notes and offer recommendation are complete.',
      CLOSED_WON_OR_CLOSED_LOST: 'Proposal decision deadline reached.',
      PROJECT_DELIVERY: 'Closed Won and commercial documents completed.',
      CUSTOMER_SUCCESS: 'Initial delivery milestone achieved.',
      REFERRAL: 'Satisfaction threshold met and referral ask triggered.',
      REPEAT_BUSINESS: 'Customer has active expansion opportunity.'
    };

    return map[stage] ?? 'Entry criteria pending.';
  }

  resolveExitCriteria(stage) {
    const map = {
      PROSPECT: 'Prospect record created in CRM.',
      QUALIFIED_PROSPECT: 'Qualification score and rationale logged.',
      AUDIT: 'Audit output delivered and referenced in outreach.',
      OUTREACH: 'Prospect response state recorded.',
      MEETING: 'Meeting notes captured and next action assigned.',
      PROPOSAL: 'Proposal status set to accepted/rejected.',
      CLOSED_WON_OR_CLOSED_LOST: 'Revenue outcome and reason code captured.',
      PROJECT_DELIVERY: 'Delivery handoff accepted by operating company.',
      CUSTOMER_SUCCESS: 'Satisfaction measurement completed.',
      REFERRAL: 'Referral accepted/declined captured.',
      REPEAT_BUSINESS: 'Expansion deal opened or customer retained in nurture loop.'
    };

    return map[stage] ?? 'Exit criteria pending.';
  }

  resolveOwner(stage) {
    const map = {
      PROSPECT: 'Prospect Intelligence Lead',
      QUALIFIED_PROSPECT: 'Sales Qualification Lead',
      AUDIT: 'Audit Specialist',
      OUTREACH: 'Outreach Specialist',
      MEETING: 'Sales Closer',
      PROPOSAL: 'Revenue Operations Lead',
      CLOSED_WON_OR_CLOSED_LOST: 'Executive Sales Manager',
      PROJECT_DELIVERY: 'Operating Company Delivery Lead',
      CUSTOMER_SUCCESS: 'Customer Success Lead',
      REFERRAL: 'Growth Partnerships Lead',
      REPEAT_BUSINESS: 'Account Expansion Lead'
    };

    return map[stage] ?? 'Sales Engine Operations';
  }

  buildRequiredArtifacts() {
    return [
      { artifactId: 'SE-ART-001', name: 'Prospect Discovery Ledger', stage: 'PROSPECT' },
      { artifactId: 'SE-ART-002', name: 'Prospect Qualification Scorecard', stage: 'QUALIFIED_PROSPECT' },
      { artifactId: 'SE-ART-003', name: 'Website Audit Brief', stage: 'AUDIT' },
      { artifactId: 'SE-ART-004', name: 'Outreach Sequence Plan', stage: 'OUTREACH' },
      { artifactId: 'SE-ART-005', name: 'Meeting Outcome Log', stage: 'MEETING' },
      { artifactId: 'SE-ART-006', name: 'Proposal Document', stage: 'PROPOSAL' },
      { artifactId: 'SE-ART-007', name: 'Contract Packet', stage: 'CLOSED_WON_OR_CLOSED_LOST' },
      { artifactId: 'SE-ART-008', name: 'Invoice and Payment Record', stage: 'CLOSED_WON_OR_CLOSED_LOST' },
      { artifactId: 'SE-ART-009', name: 'Follow-up Schedule Register', stage: 'CUSTOMER_SUCCESS' },
      { artifactId: 'SE-ART-010', name: 'Win/Loss Review Report', stage: 'CLOSED_WON_OR_CLOSED_LOST' },
      { artifactId: 'SE-ART-011', name: 'Customer Satisfaction Snapshot', stage: 'CUSTOMER_SUCCESS' },
      { artifactId: 'SE-ART-012', name: 'Referral and Repeat Business Ledger', stage: 'REFERRAL' },
      { artifactId: 'SE-ART-013', name: 'Revenue Dashboard Snapshot', stage: 'REPEAT_BUSINESS' },
      { artifactId: 'SE-ART-014', name: 'Sales Analytics Weekly Brief', stage: 'REPEAT_BUSINESS' }
    ];
  }

  buildDashboardModel(input) {
    return {
      operatingCompany: input.operatingCompany ?? 'Atlas Web',
      executiveNorthStar: 'Time to first reliable customer revenue',
      corePanels: [
        'Pipeline Velocity',
        'Qualification Conversion Rate',
        'Audit-to-Meeting Conversion',
        'Proposal Win Rate',
        'Revenue by Stage',
        'Cash Collection',
        'Customer Satisfaction',
        'Referral Rate',
        'Repeat Business Rate'
      ],
      executiveSignals: {
        healthy: 'Pipeline conversion and margin targets met for two consecutive cycles.',
        attentionRequired: 'Any two adjacent stage conversions below threshold for one cycle.',
        interventionRequired: 'Revenue target miss for two cycles with declining win rate.'
      },
      atlasWebOnboardingStatus: 'ENABLED_AS_FIRST_OPERATING_COMPANY'
    };
  }

  buildExecutiveWorkflow(input) {
    return [
      {
        step: 1,
        action: 'Initialize Sales Engine for operating company and set sales objectives.',
        owner: 'Executive Sales Director',
        output: `${input.operatingCompany ?? 'Atlas Web'} sales mission charter`
      },
      {
        step: 2,
        action: 'Run prospect discovery and qualification with scored prioritization.',
        owner: 'Prospect Intelligence Lead',
        output: 'Ranked qualified prospect queue'
      },
      {
        step: 3,
        action: 'Generate audits and outreach plans, then execute meeting conversion loop.',
        owner: 'Conversion Operations Lead',
        output: 'Meeting pipeline with proposal-ready opportunities'
      },
      {
        step: 4,
        action: 'Issue proposals, contracts, invoices, and follow-up schedules.',
        owner: 'Revenue Operations Lead',
        output: 'Closed Won/Closed Lost outcomes with payment status'
      },
      {
        step: 5,
        action: 'Track customer success, referral generation, and repeat business.',
        owner: 'Customer Success Lead',
        output: 'Expansion-ready account set'
      },
      {
        step: 6,
        action: 'Review revenue dashboard and sales analytics for optimization directives.',
        owner: 'Executive Office',
        output: 'Next-cycle sales improvement decisions'
      }
    ];
  }
}
