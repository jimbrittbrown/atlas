export const WebsiteExecutiveReviewWorkflowStages = Object.freeze([
  {
    id: 'RECEIVE_PROSPECT_URL',
    label: 'Receive Prospect URL',
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
    id: 'BRAND_PACKAGE_GENERATION',
    label: 'Brand Package Generation',
    order: 3,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'TEMPLATE_RECOMMENDATION',
    label: 'Template Recommendation',
    order: 4,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'CUSTOMIZATION_PLAN_GENERATION',
    label: 'Customization Plan Generation',
    order: 5,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'EXECUTIVE_REVIEW_PACKAGE',
    label: 'Executive Review Package',
    order: 6,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  },
  {
    id: 'AWAIT_CEO_APPROVAL',
    label: 'Await CEO Approval',
    order: 7,
    supportsRecovery: ['retry', 'resume', 'rollback', 'failure-logging']
  }
]);

export const WebsiteExecutiveReviewMissionStates = Object.freeze({
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  REVIEW_READY: 'REVIEW_READY',
  AWAITING_CEO_APPROVAL: 'AWAITING_CEO_APPROVAL',
  FAILED: 'FAILED'
});

export function createWebsiteExecutiveReviewMissionStateMachine() {
  const allowedTransitions = {
    [WebsiteExecutiveReviewMissionStates.WAITING]: [
      WebsiteExecutiveReviewMissionStates.RUNNING,
      WebsiteExecutiveReviewMissionStates.FAILED
    ],
    [WebsiteExecutiveReviewMissionStates.RUNNING]: [
      WebsiteExecutiveReviewMissionStates.REVIEW_READY,
      WebsiteExecutiveReviewMissionStates.FAILED
    ],
    [WebsiteExecutiveReviewMissionStates.REVIEW_READY]: [
      WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL,
      WebsiteExecutiveReviewMissionStates.FAILED
    ],
    [WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL]: [],
    [WebsiteExecutiveReviewMissionStates.FAILED]: []
  };

  return {
    states: WebsiteExecutiveReviewMissionStates,
    transitionMap: allowedTransitions,
    terminalStates: new Set([
      WebsiteExecutiveReviewMissionStates.AWAITING_CEO_APPROVAL,
      WebsiteExecutiveReviewMissionStates.FAILED
    ]),
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

export function createWebsiteExecutiveReviewMissionRequest({
  missionId,
  prospectUrl,
  prospect = {},
  existingBranding = {},
  adapterType = 'FRAMER',
  providerHint = 'FRAMER_SANDBOX',
  estimatedStageMinutes = 10
} = {}) {
  return {
    missionId: missionId ?? `website-executive-review-${Date.now()}`,
    prospectUrl,
    prospect,
    existingBranding,
    adapterType,
    providerHint,
    estimatedStageMinutes
  };
}

export function validateWebsiteExecutiveReviewMissionRequest(request = {}) {
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

export function resolveWebsiteExecutiveReviewStageById(stageId) {
  return WebsiteExecutiveReviewWorkflowStages.find((stage) => stage.id === stageId) ?? null;
}

export function websiteExecutiveReviewStageIndex(stageId) {
  return WebsiteExecutiveReviewWorkflowStages.findIndex((stage) => stage.id === stageId);
}

export function calculateWebsiteExecutiveReviewCompletionPercentage(completedStages = 0) {
  const totalStages = WebsiteExecutiveReviewWorkflowStages.length;
  const normalizedCompleted = Math.max(0, Math.min(Number(completedStages) || 0, totalStages));
  return Math.round((normalizedCompleted / totalStages) * 100);
}
