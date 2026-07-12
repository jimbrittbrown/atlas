import { ExecutiveOperationsPriorityBands, ExecutiveOperationsUrgencyBands } from './executive-operations-loop-contracts.js';

function normalize(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function scoreToBand(score) {
  if (score >= 85) return ExecutiveOperationsPriorityBands.CRITICAL;
  if (score >= 65) return ExecutiveOperationsPriorityBands.HIGH;
  if (score >= 40) return ExecutiveOperationsPriorityBands.MEDIUM;
  return ExecutiveOperationsPriorityBands.LOW;
}

function scoreToUrgency(score) {
  if (score >= 85) return ExecutiveOperationsUrgencyBands.IMMEDIATE;
  if (score >= 65) return ExecutiveOperationsUrgencyBands.NOW;
  if (score >= 40) return ExecutiveOperationsUrgencyBands.SOON;
  return ExecutiveOperationsUrgencyBands.DEFER;
}

export class ExecutiveOperationsPriorityEngine {
  prioritize(findings = []) {
    const ranked = findings.map((finding) => {
      const customerImpact = normalize(finding.customerImpact);
      const missionUrgency = normalize(finding.missionUrgency);
      const blockedDuration = Math.min(normalize(finding.blockedDurationHours), 168) / 168 * 100;
      const deadlinePressure = finding.deadlineHoursRemaining == null
        ? 0
        : Math.max(0, 100 - Math.min(normalize(finding.deadlineHoursRemaining), 240) / 240 * 100);
      const businessValue = normalize(finding.estimatedBusinessValue, 0);
      const operationalRisk = normalize(finding.operationalRisk) * 100;
      const recoveryProbability = normalize(finding.estimatedRecoveryProbability, 0.5) * 100;
      const priorityScore = Number((
        customerImpact * 0.2
        + missionUrgency * 0.17
        + blockedDuration * 0.12
        + deadlinePressure * 0.14
        + businessValue * 0.1
        + operationalRisk * 0.16
        + recoveryProbability * 0.11
      ).toFixed(2));

      return {
        ...finding,
        priorityScore,
        priorityBand: scoreToBand(priorityScore),
        urgencyBand: scoreToUrgency(priorityScore),
        explanation: `Score=${priorityScore} from customer impact ${customerImpact}, urgency ${missionUrgency}, risk ${operationalRisk.toFixed(2)}, recovery probability ${recoveryProbability.toFixed(2)}.`,
        confidenceScore: normalize(finding.confidenceScore, 0.7)
      };
    });

    ranked.sort((a, b) => b.priorityScore - a.priorityScore || String(a.findingId).localeCompare(String(b.findingId)));

    return ranked.map((item, index) => ({
      ...item,
      recommendedHandlingOrder: index + 1
    }));
  }
}
