export const WebsiteWorkflowStages = Object.freeze([
  {
    id: 'PROSPECT_APPROVED',
    label: 'Prospect Approved',
    order: 1,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'COMPANY_RESEARCH',
    label: 'Company Research',
    order: 2,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'BRAND_PACKAGE_GENERATION',
    label: 'Brand Package Generation',
    order: 3,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'TEMPLATE_SELECTION',
    label: 'Template Selection',
    order: 4,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'WEBSITE_GENERATION',
    label: 'Website Generation',
    order: 5,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'QA',
    label: 'QA',
    order: 6,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'EXECUTIVE_PREVIEW',
    label: 'Executive Preview',
    order: 7,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'CEO_APPROVAL_GATE',
    label: 'CEO Approval Gate',
    order: 8,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'PUBLISH',
    label: 'Publish',
    order: 9,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'DELIVERY_PACKAGE',
    label: 'Delivery Package',
    order: 10,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  }
]);

export const WebsiteMissionStates = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  DELIVERED: 'DELIVERED'
});

export function createWebsiteMissionStateMachine() {
  const allowedTransitions = {
    [WebsiteMissionStates.WAITING]: [
      WebsiteMissionStates.RUNNING,
      WebsiteMissionStates.FAILED
    ],
    [WebsiteMissionStates.RUNNING]: [
      WebsiteMissionStates.REVISION_REQUIRED,
      WebsiteMissionStates.READY_FOR_APPROVAL,
      WebsiteMissionStates.FAILED
    ],
    [WebsiteMissionStates.REVISION_REQUIRED]: [
      WebsiteMissionStates.RUNNING,
      WebsiteMissionStates.FAILED
    ],
    [WebsiteMissionStates.READY_FOR_APPROVAL]: [
      WebsiteMissionStates.APPROVED,
      WebsiteMissionStates.REVISION_REQUIRED,
      WebsiteMissionStates.FAILED
    ],
    [WebsiteMissionStates.APPROVED]: [
      WebsiteMissionStates.PUBLISHED,
      WebsiteMissionStates.FAILED
    ],
    [WebsiteMissionStates.PUBLISHED]: [
      WebsiteMissionStates.DELIVERED,
      WebsiteMissionStates.FAILED
    ],
    [WebsiteMissionStates.DELIVERED]: [],
    [WebsiteMissionStates.FAILED]: []
  };

  return {
    states: WebsiteMissionStates,
    terminalStates: new Set([WebsiteMissionStates.DELIVERED, WebsiteMissionStates.FAILED]),
    canTransition(from, to) {
      return (allowedTransitions[from] ?? []).includes(to);
    },
    transitionMap: allowedTransitions,
    validateTransition({ fromState, toState }) {
      if (this.terminalStates.has(fromState)) {
        return {
          isValid: false,
          reason: `Cannot transition from terminal state ${fromState}.`
        };
      }

      if (!this.canTransition(fromState, toState)) {
        return {
          isValid: false,
          reason: `Invalid transition ${fromState} -> ${toState}.`
        };
      }

      return {
        isValid: true,
        reason: null
      };
    }
  };
}

export function createWebsiteMissionRequest({
  missionId,
  prospect = {},
  existingBranding = {},
  brandingChangeRequest = null,
  ceoDecision = null,
  providerHint = 'SPECIALIST_POOL',
  adapterType = 'OTHER',
  estimatedStageMinutes = 15
} = {}) {
  return {
    missionId: missionId ?? `website-${Date.now()}`,
    prospect,
    existingBranding,
    brandingChangeRequest,
    ceoDecision,
    providerHint,
    adapterType,
    estimatedStageMinutes
  };
}

export function validateWebsiteMissionRequest(request = {}) {
  const issues = [];

  if (!request.missionId || String(request.missionId).trim().length === 0) {
    issues.push('missionId is required.');
  }

  if (request?.prospect?.approved !== true) {
    issues.push('prospect.approved must be true before mission execution.');
  }

  if (!request?.prospect?.companyName || String(request.prospect.companyName).trim().length === 0) {
    issues.push('prospect.companyName is required.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function calculateCompletionPercentage(completedStages = 0) {
  const totalStages = WebsiteWorkflowStages.length;
  const normalizedCompleted = Math.max(0, Math.min(Number(completedStages) || 0, totalStages));
  return Math.round((normalizedCompleted / totalStages) * 100);
}

export function resolveStageById(stageId) {
  return WebsiteWorkflowStages.find((stage) => stage.id === stageId) ?? null;
}

export function stageIndex(stageId) {
  return WebsiteWorkflowStages.findIndex((stage) => stage.id === stageId);
}
