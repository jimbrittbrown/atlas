import {
  DemonstrationProjectTypes,
  DemonstrationFactoryWorkflowStages,
  createDemonstrationFactoryInput,
  createDemonstrationFactoryResult,
  validateDemonstrationFactoryInput,
  validateDemonstrationFactoryPackage
} from './demonstration-factory-contracts.js';

export class AtlasWebDemonstrationFactory {
  buildFactory(inputPayload = {}) {
    const input = createDemonstrationFactoryInput(inputPayload);
    const validation = validateDemonstrationFactoryInput(input);

    if (!validation.isValid) {
      throw new Error(`Demonstration Factory input invalid: ${validation.issues.join(' | ')}`);
    }

    const result = createDemonstrationFactoryResult({
      architecture: this.buildArchitecture(input),
      workflow: this.buildWorkflow(),
      requiredSpecialists: this.buildRequiredSpecialists(),
      artifacts: this.buildArtifacts(),
      executiveReviewProcess: this.buildExecutiveReviewProcess(),
      futureIntegrationWithSalesEngine: this.buildSalesEngineIntegration(),
      controls: this.buildControls()
    });

    const packageValidation = validateDemonstrationFactoryPackage(result);
    if (!packageValidation.isValid) {
      throw new Error(`Demonstration Factory package incomplete: ${packageValidation.missingFields.join(', ')}`);
    }

    return result;
  }

  buildArchitecture(input) {
    return {
      factoryName: input.factoryName,
      operatingCompany: input.operatingCompany,
      mission: input.ceoObjective,
      objectivePriority: 'Qualified leads and booked jobs over visual novelty.',
      projectTypes: [
        {
          type: DemonstrationProjectTypes[0],
          purpose: 'Public capability proof using fictional businesses.',
          visibility: 'PUBLIC',
          requiredComponents: [
            'Company name',
            'Logo',
            'Branding system',
            'Homepage',
            'Landing page',
            'Mobile version',
            'Conversion-focused layout',
            'Trust indicators',
            'CTA strategy',
            'Local SEO structure',
            'Design decision rationale with research references'
          ]
        },
        {
          type: DemonstrationProjectTypes[1],
          purpose: 'Private prospect-specific conversion recommendation proof.',
          visibility: 'PRIVATE',
          requiredComponents: [
            'Existing website analysis',
            'Conversion weakness diagnosis',
            'Redesigned homepage',
            'Before/after comparison',
            'Executive audit',
            'Research-backed recommendation rationale',
            'Estimated business impact',
            'Confidence level by recommendation',
            'Mandatory disclosure statement'
          ],
          disclosureStatement: 'Prepared by Atlas as a demonstration of our recommended improvements.'
        }
      ]
    };
  }

  buildWorkflow() {
    return DemonstrationFactoryWorkflowStages.map((stage, index) => ({
      order: index + 1,
      stage,
      owner: this.resolveOwner(stage),
      objective: this.resolveObjective(stage),
      output: this.resolveOutput(stage)
    }));
  }

  resolveOwner(stage) {
    const map = {
      MISSION_INTAKE: 'Executive Producer',
      PROJECT_SCOPING: 'Program Manager',
      RESEARCH_AND_ANALYSIS: 'Market Research Specialist',
      CONVERSION_STRATEGY_BLUEPRINT: 'Conversion Strategist',
      DEMONSTRATION_BUILD: 'Web Experience Specialist',
      EXECUTIVE_AUDIT_AND_IMPACT_MODELING: 'Executive Audit Specialist',
      CEO_REVIEW_PACKAGE_ASSEMBLY: 'Executive Operations Manager',
      READY_FOR_SALES_HANDOFF: 'Sales Enablement Specialist'
    };

    return map[stage] ?? 'Atlas Executive Office';
  }

  resolveObjective(stage) {
    const map = {
      MISSION_INTAKE: 'Confirm demonstration type and business outcome target.',
      PROJECT_SCOPING: 'Define conversion scope and measurable KPI assumptions.',
      RESEARCH_AND_ANALYSIS: 'Collect evidence and baseline website performance signals.',
      CONVERSION_STRATEGY_BLUEPRINT: 'Map design changes directly to lead and booking outcomes.',
      DEMONSTRATION_BUILD: 'Produce homepage/landing/mobile demonstration assets.',
      EXECUTIVE_AUDIT_AND_IMPACT_MODELING: 'Quantify expected impact and assign confidence levels.',
      CEO_REVIEW_PACKAGE_ASSEMBLY: 'Assemble audit, comparison, references, and decision narrative.',
      READY_FOR_SALES_HANDOFF: 'Prepare approved package for optional future sales use.'
    };

    return map[stage] ?? 'Objective pending.';
  }

  resolveOutput(stage) {
    const map = {
      MISSION_INTAKE: 'Mission brief with demonstration type classification',
      PROJECT_SCOPING: 'Scope charter and KPI rubric',
      RESEARCH_AND_ANALYSIS: 'Research reference sheet and baseline findings',
      CONVERSION_STRATEGY_BLUEPRINT: 'Conversion blueprint with CTA and trust architecture',
      DEMONSTRATION_BUILD: 'Demonstration homepage, landing page, and mobile variant',
      EXECUTIVE_AUDIT_AND_IMPACT_MODELING: 'Executive audit and business impact report',
      CEO_REVIEW_PACKAGE_ASSEMBLY: 'CEO review package',
      READY_FOR_SALES_HANDOFF: 'Sales Engine handoff package (no outreach executed)'
    };

    return map[stage] ?? 'Output pending.';
  }

  buildRequiredSpecialists() {
    return [
      {
        specialist: 'Market Research Specialist',
        responsibility: 'Evidence collection for local SEO, conversion patterns, and industry benchmarks.'
      },
      {
        specialist: 'Conversion Strategist',
        responsibility: 'Translate findings into CTA flows and trust architecture tied to lead outcomes.'
      },
      {
        specialist: 'Brand and Visual Systems Designer',
        responsibility: 'Create coherent visual system that supports scanning, trust, and action.'
      },
      {
        specialist: 'Web Experience Specialist',
        responsibility: 'Build homepage, landing page, and mobile variants for demonstration assets.'
      },
      {
        specialist: 'Technical SEO Specialist',
        responsibility: 'Design local SEO structure and on-page intent alignment.'
      },
      {
        specialist: 'Executive Audit Specialist',
        responsibility: 'Produce conversion weakness diagnosis and recommendation confidence model.'
      },
      {
        specialist: 'Business Impact Analyst',
        responsibility: 'Estimate lead and booking impact ranges with confidence bands.'
      },
      {
        specialist: 'Executive Operations Manager',
        responsibility: 'Assemble final package and enforce disclosure/compliance controls.'
      }
    ];
  }

  buildArtifacts() {
    return [
      {
        artifactId: 'DF-ART-001',
        name: 'Portfolio Demonstration Package',
        requiredFor: 'PORTFOLIO_DEMONSTRATION'
      },
      {
        artifactId: 'DF-ART-002',
        name: 'Prospect Demonstration Package',
        requiredFor: 'PROSPECT_DEMONSTRATION'
      },
      {
        artifactId: 'DF-ART-003',
        name: 'Executive Audit',
        requiredFor: 'BOTH'
      },
      {
        artifactId: 'DF-ART-004',
        name: 'Before/After Comparison',
        requiredFor: 'PROSPECT_DEMONSTRATION'
      },
      {
        artifactId: 'DF-ART-005',
        name: 'Research Reference Sheet',
        requiredFor: 'BOTH'
      },
      {
        artifactId: 'DF-ART-006',
        name: 'Estimated Business Impact Report',
        requiredFor: 'BOTH'
      },
      {
        artifactId: 'DF-ART-007',
        name: 'CEO Review Package',
        requiredFor: 'BOTH'
      }
    ];
  }

  buildExecutiveReviewProcess() {
    return [
      {
        gate: 'GATE_1_OBJECTIVE_ALIGNMENT',
        reviewQuestion: 'Does each major recommendation connect to qualified leads or booked jobs?',
        passCriteria: 'Every recommendation has measurable outcome linkage and KPI hypothesis.'
      },
      {
        gate: 'GATE_2_EVIDENCE_QUALITY',
        reviewQuestion: 'Are recommendations supported by research or accepted conversion best practices?',
        passCriteria: 'All major recommendations include citation or explicit best-practice rationale.'
      },
      {
        gate: 'GATE_3_DISCLOSURE_COMPLIANCE',
        reviewQuestion: 'Is the demonstration clearly disclosed as Atlas-generated recommendation work?',
        passCriteria: 'Prospect package contains required disclosure statement verbatim.'
      },
      {
        gate: 'GATE_4_EXECUTIVE_READINESS',
        reviewQuestion: 'Is the package complete for CEO decision and optional Sales Engine handoff?',
        passCriteria: 'All required artifacts present; no outreach, publishing, or contact actions taken.'
      }
    ];
  }

  buildSalesEngineIntegration() {
    return {
      integrationStatus: 'READY_FOR_FUTURE_HANDOFF',
      handoffTrigger: 'CEO approval of demonstration package',
      mappedSalesEngineStages: [
        {
          salesStage: 'AUDIT',
          demonstrationArtifact: 'Executive Audit',
          handoffValue: 'Accelerates prospect understanding of conversion opportunities.'
        },
        {
          salesStage: 'OUTREACH',
          demonstrationArtifact: 'Prospect Demonstration Package',
          handoffValue: 'Provides personalized proof asset after CEO authorization.'
        },
        {
          salesStage: 'MEETING',
          demonstrationArtifact: 'Before/After Comparison',
          handoffValue: 'Anchors consultative discussion with visual and business impact evidence.'
        },
        {
          salesStage: 'PROPOSAL',
          demonstrationArtifact: 'Estimated Business Impact Report',
          handoffValue: 'Supports pricing confidence and expected ROI discussion.'
        }
      ],
      restrictions: [
        'No outreach executed by Demonstration Factory.',
        'No publishing executed by Demonstration Factory.',
        'No direct prospect contact executed by Demonstration Factory.'
      ]
    };
  }

  buildControls() {
    return {
      governancePolicy: 'Demonstration assets are sales-enablement proofs, not represented as client delivery history.',
      mandatoryDisclaimer: 'Prepared by Atlas as a demonstration of our recommended improvements.',
      prohibitedActions: ['OUTREACH', 'PUBLISHING', 'PROSPECT_CONTACT']
    };
  }
}
