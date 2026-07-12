import {
  ExecutiveDecisions,
  ProposalStatuses
} from './executive-planning-contracts.js';
import { MissionExecutiveStatuses } from './customer-intake-mission-control-contracts.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

export class MissionConversionBridge {
  constructor({ missionControl, missionRegistry, now } = {}) {
    this.now = now;
    this.missionControl = missionControl;
    this.missionRegistry = missionRegistry ?? missionControl?.missionRegistry;
    this.convertedProposalToMission = new Map();
  }

  canConvert({ proposal, decision } = {}) {
    const decisionType = String(decision?.decision ?? '').toUpperCase();
    const allowedDecision = decisionType === ExecutiveDecisions.APPROVE || decisionType === ExecutiveDecisions.APPROVE_WITH_CONDITIONS;

    if (!allowedDecision) {
      return {
        allowed: false,
        reason: 'Proposal decision must be APPROVE or APPROVE_WITH_CONDITIONS before conversion.'
      };
    }

    if (proposal?.status === ProposalStatuses.CONVERTED_TO_MISSION) {
      return {
        allowed: false,
        reason: 'Proposal already converted to mission.'
      };
    }

    if (this.convertedProposalToMission.has(proposal.proposalId)) {
      return {
        allowed: false,
        reason: 'Proposal already linked to mission in conversion map.'
      };
    }

    return { allowed: true, reason: null };
  }

  buildMissionControlPayload(proposal, evaluation, decision) {
    const companyName = proposal.metadata?.companyName
      ?? proposal.metadata?.organizationName
      ?? proposal.title;

    return {
      companyName,
      contactName: proposal.metadata?.contactName ?? 'Executive Planning System',
      email: proposal.metadata?.contactEmail ?? 'executive-planning@atlas.internal',
      phone: proposal.metadata?.contactPhone ?? '+1-000-000-0000',
      website: proposal.metadata?.website ?? 'https://atlas.internal/proposal',
      industry: proposal.metadata?.industry ?? proposal.missionType,
      missionType: proposal.missionType,
      adapterType: proposal.metadata?.adapterType ?? 'FRAMER',
      providerHint: proposal.metadata?.providerHint ?? 'FRAMER_SANDBOX',
      existingBranding: proposal.metadata?.existingBranding ?? {},
      lineage: {
        proposalId: proposal.proposalId,
        sourceType: proposal.sourceType,
        sourceId: proposal.sourceId,
        customerId: proposal.customerId,
        strategicPriority: evaluation?.priorityBand ?? null,
        requiredCapabilities: proposal.requiredCapabilities,
        estimatedEffort: proposal.estimatedEffort,
        estimatedDuration: proposal.estimatedDuration,
        decision: decision?.decision ?? null
      }
    };
  }

  async convertApprovedProposal({ proposal, evaluation, decision } = {}) {
    const gate = this.canConvert({ proposal, decision });
    if (!gate.allowed) {
      return {
        converted: false,
        blocked: true,
        reason: gate.reason,
        missionId: this.convertedProposalToMission.get(proposal?.proposalId) ?? null,
        telemetry: {
          attemptedAt: isoNow(this.now)
        }
      };
    }

    const payload = this.buildMissionControlPayload(proposal, evaluation, decision);

    let missionControlResult;

    if (proposal.missionType === 'WEBSITE_BUILD' && this.missionControl && typeof this.missionControl.intake === 'function') {
      missionControlResult = await this.missionControl.intake(payload);

      if (!missionControlResult?.accepted || !missionControlResult?.mission?.missionId) {
        return {
          converted: false,
          blocked: true,
          reason: 'Mission Control intake rejected conversion payload.',
          missionId: null,
          telemetry: {
            attemptedAt: isoNow(this.now),
            missionControlAccepted: Boolean(missionControlResult?.accepted)
          }
        };
      }

      const missionId = missionControlResult.mission.missionId;
      this.convertedProposalToMission.set(proposal.proposalId, missionId);

      return {
        converted: true,
        blocked: false,
        reason: null,
        missionId,
        missionControlResult,
        telemetry: {
          attemptedAt: isoNow(this.now),
          convertedAt: isoNow(this.now),
          route: 'MISSION_CONTROL_INTAKE',
          missionType: proposal.missionType,
          decision: decision.decision
        }
      };
    }

    if (!this.missionRegistry || typeof this.missionRegistry.createMission !== 'function') {
      return {
        converted: false,
        blocked: true,
        reason: 'Mission registry is unavailable for non-website conversion path.',
        missionId: null,
        telemetry: {
          attemptedAt: isoNow(this.now)
        }
      };
    }

    const mission = this.missionRegistry.createMission({
      customerId: proposal.customerId,
      missionType: proposal.missionType,
      assignedWorkforce: ['EXECUTION_DIVISION_POOL'],
      currentStage: 'PLANNED_APPROVED_PENDING_ROUTING',
      progress: 0,
      executiveStatus: MissionExecutiveStatuses.ACTIVE
    });

    const linkedMission = this.missionRegistry.updateMission(mission.missionId, {
      lineage: {
        proposalId: proposal.proposalId,
        sourceType: proposal.sourceType,
        sourceId: proposal.sourceId
      },
      strategicPriority: evaluation?.priorityBand ?? null,
      requiredCapabilities: proposal.requiredCapabilities,
      estimatedEffort: proposal.estimatedEffort,
      estimatedDuration: proposal.estimatedDuration,
      estimatedCost: proposal.estimatedCost,
      governance: {
        publishAllowed: false,
        productionDeploymentAllowed: false
      }
    });

    this.convertedProposalToMission.set(proposal.proposalId, linkedMission.missionId);

    return {
      converted: true,
      blocked: false,
      reason: null,
      missionId: linkedMission.missionId,
      missionControlResult: {
        accepted: true,
        mission: linkedMission,
        route: 'MISSION_REGISTRY_PENDING_ROUTING'
      },
      telemetry: {
        attemptedAt: isoNow(this.now),
        convertedAt: isoNow(this.now),
        route: 'MISSION_REGISTRY_PENDING_ROUTING',
        missionType: proposal.missionType,
        decision: decision.decision
      }
    };
  }
}
