import { ExecutiveOperationsActionTypes, ExecutiveOperationsRiskLevels } from './executive-operations-loop-contracts.js';

const ActionPolicies = Object.freeze({
  [ExecutiveOperationsActionTypes.ROUTE_VALIDATED_INTAKE]: { allowedByDefault: true, configFlag: 'allowIntakeRouting', riskLevel: ExecutiveOperationsRiskLevels.MEDIUM, requiredRole: 'EXECUTIVE' },
  [ExecutiveOperationsActionTypes.RETRY_MISSION]: { allowedByDefault: true, configFlag: 'allowRetry', riskLevel: ExecutiveOperationsRiskLevels.MEDIUM, requiredRole: 'EXECUTIVE' },
  [ExecutiveOperationsActionTypes.RESUME_MISSION]: { allowedByDefault: true, configFlag: 'allowResume', riskLevel: ExecutiveOperationsRiskLevels.MEDIUM, requiredRole: 'EXECUTIVE' },
  [ExecutiveOperationsActionTypes.REASSIGN_WORKER]: { allowedByDefault: true, configFlag: 'allowReassignment', riskLevel: ExecutiveOperationsRiskLevels.MEDIUM, requiredRole: 'EXECUTIVE' },
  [ExecutiveOperationsActionTypes.REFRESH_DASHBOARD_SNAPSHOT]: { allowedByDefault: true, configFlag: null, riskLevel: ExecutiveOperationsRiskLevels.LOW, requiredRole: 'VIEWER' },
  [ExecutiveOperationsActionTypes.REFRESH_PROVIDER_HEALTH]: { allowedByDefault: true, configFlag: null, riskLevel: ExecutiveOperationsRiskLevels.LOW, requiredRole: 'VIEWER' },
  [ExecutiveOperationsActionTypes.REQUEST_EXECUTIVE_REVIEW]: { allowedByDefault: false, configFlag: null, riskLevel: ExecutiveOperationsRiskLevels.HIGH, requiredRole: 'CEO' },
  [ExecutiveOperationsActionTypes.ESCALATE_TO_CEO_DECISION_CENTER]: { allowedByDefault: true, configFlag: null, riskLevel: ExecutiveOperationsRiskLevels.LOW, requiredRole: 'EXECUTIVE' },
  [ExecutiveOperationsActionTypes.MARK_STALE_OPERATIONAL_RECORD]: { allowedByDefault: true, configFlag: null, riskLevel: ExecutiveOperationsRiskLevels.LOW, requiredRole: 'EXECUTIVE' }
});

export class ExecutiveOperationsLoopPolicy {
  evaluateAction(action = {}, { config = {}, context = {} } = {}) {
    const policy = ActionPolicies[action.actionType] ?? null;
    if (!policy) {
      return {
        allowed: false,
        denied: true,
        requiresExecutiveApproval: false,
        reason: `Unsupported action type ${action.actionType}.`,
        governingRule: 'UNSUPPORTED_ACTION',
        riskLevel: ExecutiveOperationsRiskLevels.CRITICAL,
        requiredRole: 'CEO',
        recommendedNextAction: 'Create manual executive review item.'
      };
    }

    if (action.actionType === ExecutiveOperationsActionTypes.REQUEST_EXECUTIVE_REVIEW) {
      return {
        allowed: false,
        denied: true,
        requiresExecutiveApproval: true,
        reason: 'Automatic force-review would bypass current CEO authority requirements.',
        governingRule: 'CEO_AUTHORITY_REQUIRED',
        riskLevel: policy.riskLevel,
        requiredRole: policy.requiredRole,
        recommendedNextAction: 'Escalate to CEO Decision Center.'
      };
    }

    if (context.requiresCeoApproval === true) {
      return {
        allowed: false,
        denied: true,
        requiresExecutiveApproval: true,
        reason: 'Action is blocked by existing CEO approval gate.',
        governingRule: 'EXISTING_CEO_APPROVAL_GATE',
        riskLevel: ExecutiveOperationsRiskLevels.HIGH,
        requiredRole: 'CEO',
        recommendedNextAction: 'Create CEO alert and wait for decision.'
      };
    }

    if (policy.configFlag && config[policy.configFlag] === false) {
      return {
        allowed: false,
        denied: true,
        requiresExecutiveApproval: false,
        reason: `Action disabled by configuration flag ${policy.configFlag}.`,
        governingRule: 'CONFIG_DISABLED',
        riskLevel: policy.riskLevel,
        requiredRole: policy.requiredRole,
        recommendedNextAction: 'Leave for manual review.'
      };
    }

    return {
      allowed: true,
      denied: false,
      requiresExecutiveApproval: false,
      reason: 'Action is permitted by policy.',
      governingRule: 'SAFE_OPERATIONAL_ACTION',
      riskLevel: policy.riskLevel,
      requiredRole: policy.requiredRole,
      recommendedNextAction: config.dryRun ? 'Dry run only; no execution performed.' : 'Execute through existing public interface.'
    };
  }
}
