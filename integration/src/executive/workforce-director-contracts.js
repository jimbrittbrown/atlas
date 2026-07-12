export const WorkerStatuses = Object.freeze({
  IDLE: 'IDLE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE'
});

export const WorkforceDivisions = Object.freeze({
  WEBSITE_DIVISION: 'WEBSITE_DIVISION'
});

export const WorkforceSpecialties = Object.freeze({
  COMPANY_RESEARCH_SPECIALIST: 'COMPANY_RESEARCH_SPECIALIST',
  BRAND_STRATEGY_SPECIALIST: 'BRAND_STRATEGY_SPECIALIST',
  MESSAGING_SPECIALIST: 'MESSAGING_SPECIALIST',
  WEBSITE_ARCHITECT: 'WEBSITE_ARCHITECT',
  FRAMER_PRODUCTION_SPECIALIST: 'FRAMER_PRODUCTION_SPECIALIST',
  QA_SPECIALIST: 'QA_SPECIALIST',
  EXECUTIVE_PACKAGE_SPECIALIST: 'EXECUTIVE_PACKAGE_SPECIALIST'
});

export const MissionWorkforceRequirements = Object.freeze({
  WEBSITE_BUILD: Object.freeze([
    {
      stageId: 'COMPANY_RESEARCH',
      requiredSpecialties: [WorkforceSpecialties.COMPANY_RESEARCH_SPECIALIST]
    },
    {
      stageId: 'BRAND_PACKAGE_GENERATION',
      requiredSpecialties: [
        WorkforceSpecialties.BRAND_STRATEGY_SPECIALIST,
        WorkforceSpecialties.MESSAGING_SPECIALIST
      ]
    },
    {
      stageId: 'TEMPLATE_SELECTION',
      requiredSpecialties: [WorkforceSpecialties.WEBSITE_ARCHITECT]
    },
    {
      stageId: 'CUSTOMIZATION_PACKAGE_GENERATION',
      requiredSpecialties: [WorkforceSpecialties.WEBSITE_ARCHITECT]
    },
    {
      stageId: 'WEBSITE_PRODUCTION_CUSTOMIZATION',
      requiredSpecialties: [WorkforceSpecialties.FRAMER_PRODUCTION_SPECIALIST]
    },
    {
      stageId: 'FRAMER_BUILD_INSTRUCTION_GENERATION',
      requiredSpecialties: [WorkforceSpecialties.FRAMER_PRODUCTION_SPECIALIST]
    },
    {
      stageId: 'SANDBOX_PROJECT_UPSERT',
      requiredSpecialties: [
        WorkforceSpecialties.FRAMER_PRODUCTION_SPECIALIST,
        WorkforceSpecialties.QA_SPECIALIST
      ]
    }
  ])
});

export function resolveWorkforceRequirementsForMissionType(missionType) {
  const key = String(missionType ?? '').toUpperCase().trim();
  return MissionWorkforceRequirements[key] ?? [];
}
