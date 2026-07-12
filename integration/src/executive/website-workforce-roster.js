import {
  WorkerStatuses,
  WorkforceDivisions,
  WorkforceSpecialties
} from './workforce-director-contracts.js';

export function createDefaultWebsiteWorkforceRoster() {
  return [
    {
      workerName: 'Company Research Specialist',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.COMPANY_RESEARCH_SPECIALIST,
      capabilities: ['COMPANY_RESEARCH'],
      status: WorkerStatuses.IDLE
    },
    {
      workerName: 'Brand Strategy Specialist',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.BRAND_STRATEGY_SPECIALIST,
      capabilities: ['BRAND_PACKAGE_GENERATION'],
      status: WorkerStatuses.IDLE
    },
    {
      workerName: 'Messaging Specialist',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.MESSAGING_SPECIALIST,
      capabilities: ['BRAND_PACKAGE_GENERATION'],
      status: WorkerStatuses.IDLE
    },
    {
      workerName: 'Website Architect',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.WEBSITE_ARCHITECT,
      capabilities: ['TEMPLATE_SELECTION', 'CUSTOMIZATION_PACKAGE_GENERATION'],
      status: WorkerStatuses.IDLE
    },
    {
      workerName: 'Framer Production Specialist',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.FRAMER_PRODUCTION_SPECIALIST,
      capabilities: ['WEBSITE_PRODUCTION_CUSTOMIZATION', 'FRAMER_BUILD_INSTRUCTION_GENERATION', 'SANDBOX_PROJECT_UPSERT'],
      status: WorkerStatuses.IDLE
    },
    {
      workerName: 'QA Specialist',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.QA_SPECIALIST,
      capabilities: ['SANDBOX_PROJECT_UPSERT'],
      status: WorkerStatuses.IDLE
    },
    {
      workerName: 'Executive Package Specialist',
      division: WorkforceDivisions.WEBSITE_DIVISION,
      specialty: WorkforceSpecialties.EXECUTIVE_PACKAGE_SPECIALIST,
      capabilities: ['EXECUTIVE_PACKAGE_REVIEW'],
      status: WorkerStatuses.IDLE
    }
  ];
}
