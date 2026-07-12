export const WebsiteBuilderWorkflowStages = Object.freeze([
  {
    id: 'RECEIVE_PROSPECT_URL',
    label: 'Receive Prospect URL',
    order: 1,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'COMPANY_RESEARCH',
    label: 'Website Intelligence Engine',
    order: 2,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'BRAND_PACKAGE_GENERATION',
    label: 'Generate Brand Package',
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
    id: 'CUSTOMIZATION_PACKAGE_GENERATION',
    label: 'Generate Customization Package',
    order: 5,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'WEBSITE_PRODUCTION_CUSTOMIZATION',
    label: 'Website Production System Customization',
    order: 6,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'FRAMER_BUILD_INSTRUCTION_GENERATION',
    label: 'Generate Framer Build Instructions',
    order: 7,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'SANDBOX_PROJECT_UPSERT',
    label: 'Sandbox Project Create/Update',
    order: 8,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  }
]);

export const WebsiteBuilderMissionStates = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  SANDBOX_UPDATED: 'SANDBOX_UPDATED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

export function createWebsiteBuilderMissionStateMachine() {
  const allowedTransitions = {
    [WebsiteBuilderMissionStates.WAITING]: [
      WebsiteBuilderMissionStates.RUNNING,
      WebsiteBuilderMissionStates.FAILED
    ],
    [WebsiteBuilderMissionStates.RUNNING]: [
      WebsiteBuilderMissionStates.REVISION_REQUIRED,
      WebsiteBuilderMissionStates.SANDBOX_UPDATED,
      WebsiteBuilderMissionStates.FAILED
    ],
    [WebsiteBuilderMissionStates.REVISION_REQUIRED]: [
      WebsiteBuilderMissionStates.RUNNING,
      WebsiteBuilderMissionStates.FAILED
    ],
    [WebsiteBuilderMissionStates.SANDBOX_UPDATED]: [
      WebsiteBuilderMissionStates.COMPLETED,
      WebsiteBuilderMissionStates.FAILED
    ],
    [WebsiteBuilderMissionStates.COMPLETED]: [],
    [WebsiteBuilderMissionStates.FAILED]: []
  };

  return {
    states: WebsiteBuilderMissionStates,
    terminalStates: new Set([WebsiteBuilderMissionStates.COMPLETED, WebsiteBuilderMissionStates.FAILED]),
    transitionMap: allowedTransitions,
    canTransition(from, to) {
      return (allowedTransitions[from] ?? []).includes(to);
    },
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

export function createWebsiteBuilderMissionRequest({
  missionId,
  prospectUrl,
  prospect = {},
  existingBranding = {},
  brandingChangeRequest = null,
  websiteRequirements = {},
  adapterType = 'FRAMER',
  providerHint = 'FRAMER_SANDBOX',
  estimatedStageMinutes = 15,
  stopAfterSandboxUpdate = true
} = {}) {
  return {
    missionId: missionId ?? `website-builder-${Date.now()}`,
    prospectUrl,
    prospect,
    existingBranding,
    brandingChangeRequest,
    websiteRequirements,
    adapterType,
    providerHint,
    estimatedStageMinutes,
    stopAfterSandboxUpdate
  };
}

export function validateWebsiteBuilderMissionRequest(request = {}) {
  const issues = [];

  if (!request.missionId || String(request.missionId).trim().length === 0) {
    issues.push('missionId is required.');
  }

  const prospectUrl = String(request.prospectUrl ?? '').trim();

  if (prospectUrl.length === 0) {
    issues.push('prospectUrl is required.');
  } else {
    try {
      const parsed = new URL(prospectUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push('prospectUrl must use http or https protocol.');
      }
    } catch {
      issues.push('prospectUrl must be a valid absolute URL.');
    }
  }

  if (!request.adapterType || String(request.adapterType).trim().length === 0) {
    issues.push('adapterType is required.');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function resolveWebsiteBuilderStageById(stageId) {
  return WebsiteBuilderWorkflowStages.find((stage) => stage.id === stageId) ?? null;
}

export function websiteBuilderStageIndex(stageId) {
  return WebsiteBuilderWorkflowStages.findIndex((stage) => stage.id === stageId);
}

export function calculateWebsiteBuilderCompletionPercentage(completedStages = 0) {
  const totalStages = WebsiteBuilderWorkflowStages.length;
  const normalizedCompleted = Math.max(0, Math.min(Number(completedStages) || 0, totalStages));
  return Math.round((normalizedCompleted / totalStages) * 100);
}
