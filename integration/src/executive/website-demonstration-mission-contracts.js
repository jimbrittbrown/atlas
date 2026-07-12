export const WebsiteDemonstrationWorkflowStages = Object.freeze([
  {
    id: 'RECEIVE_WEBSITE_URL',
    label: 'Receive Website URL',
    order: 1,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'WEBSITE_INTELLIGENCE_RESEARCH',
    label: 'Website Intelligence Research',
    order: 2,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'EXECUTIVE_INTELLIGENCE_REPORT',
    label: 'Executive Intelligence Report',
    order: 3,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'BRAND_PACKAGE_GENERATION',
    label: 'Brand Package Generation',
    order: 4,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'TEMPLATE_SELECTION',
    label: 'Template Selection',
    order: 5,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'WEBSITE_CUSTOMIZATION_PACKAGE',
    label: 'Website Customization Package',
    order: 6,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'EXECUTE_WEBSITE_BUILDER_MISSION',
    label: 'Execute Website Builder Mission',
    order: 7,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'FRAMER_SANDBOX_BUILD_INSTRUCTIONS',
    label: 'Framer Sandbox Build Instructions',
    order: 8,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'STOP_BEFORE_PUBLISH',
    label: 'Stop Before Publish',
    order: 9,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'EXECUTIVE_REVIEW_PACKAGE',
    label: 'Executive Review Package',
    order: 10,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  }
]);

export const WebsiteDemonstrationMissionStates = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  REVIEW_READY: 'REVIEW_READY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

export function createWebsiteDemonstrationMissionStateMachine() {
  const allowedTransitions = {
    [WebsiteDemonstrationMissionStates.WAITING]: [
      WebsiteDemonstrationMissionStates.RUNNING,
      WebsiteDemonstrationMissionStates.FAILED
    ],
    [WebsiteDemonstrationMissionStates.RUNNING]: [
      WebsiteDemonstrationMissionStates.REVIEW_READY,
      WebsiteDemonstrationMissionStates.FAILED
    ],
    [WebsiteDemonstrationMissionStates.REVIEW_READY]: [
      WebsiteDemonstrationMissionStates.COMPLETED,
      WebsiteDemonstrationMissionStates.FAILED
    ],
    [WebsiteDemonstrationMissionStates.COMPLETED]: [],
    [WebsiteDemonstrationMissionStates.FAILED]: []
  };

  return {
    states: WebsiteDemonstrationMissionStates,
    terminalStates: new Set([
      WebsiteDemonstrationMissionStates.COMPLETED,
      WebsiteDemonstrationMissionStates.FAILED
    ]),
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

export function createWebsiteDemonstrationMissionRequest({
  missionId,
  websiteUrl,
  prospect = {},
  existingBranding = {},
  adapterType = 'FRAMER',
  providerHint = 'FRAMER_SANDBOX',
  estimatedStageMinutes = 15
} = {}) {
  return {
    missionId: missionId ?? `website-demonstration-${Date.now()}`,
    websiteUrl,
    prospect,
    existingBranding,
    adapterType,
    providerHint,
    estimatedStageMinutes
  };
}

export function validateWebsiteDemonstrationMissionRequest(request = {}) {
  const issues = [];

  if (!request.missionId || String(request.missionId).trim().length === 0) {
    issues.push('missionId is required.');
  }

  const websiteUrl = String(request.websiteUrl ?? '').trim();

  if (websiteUrl.length === 0) {
    issues.push('websiteUrl is required.');
  } else {
    try {
      const parsed = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push('websiteUrl must use http or https protocol.');
      }
    } catch {
      issues.push('websiteUrl must be a valid absolute URL.');
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

export function resolveWebsiteDemonstrationStageById(stageId) {
  return WebsiteDemonstrationWorkflowStages.find((stage) => stage.id === stageId) ?? null;
}

export function websiteDemonstrationStageIndex(stageId) {
  return WebsiteDemonstrationWorkflowStages.findIndex((stage) => stage.id === stageId);
}

export function calculateWebsiteDemonstrationCompletionPercentage(completedStages = 0) {
  const totalStages = WebsiteDemonstrationWorkflowStages.length;
  const normalizedCompleted = Math.max(0, Math.min(Number(completedStages) || 0, totalStages));
  return Math.round((normalizedCompleted / totalStages) * 100);
}
