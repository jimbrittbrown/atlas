import { EmploymentStatus } from './workforce-models.js';

export class WorkforceRules {
  applyBenchmarkOutcome({ specialists = [], category }) {
    const candidates = specialists
      .filter(item => item.category === category)
      .sort((a, b) => Number(b.currentBenchmarkScore ?? -1) - Number(a.currentBenchmarkScore ?? -1));

    const champion = candidates[0] ?? null;
    const runnerUp = candidates[1] ?? null;

    for (const specialist of candidates) {
      if (champion && specialist.specialistId === champion.specialistId) {
        specialist.currentEmploymentStatus = EmploymentStatus.CHAMPION;
        specialist.currentRank = 1;
      } else if (runnerUp && specialist.specialistId === runnerUp.specialistId) {
        specialist.currentEmploymentStatus = EmploymentStatus.RUNNER_UP;
        specialist.currentRank = 2;
      } else if (
        specialist.currentEmploymentStatus !== EmploymentStatus.RETIRED
        && specialist.currentEmploymentStatus !== EmploymentStatus.DEPRECATED
      ) {
        specialist.currentEmploymentStatus = EmploymentStatus.ACTIVE;
        specialist.currentRank = specialist.currentRank ?? null;
      }
    }

    return {
      champion,
      runnerUp,
      otherCandidates: candidates.slice(2)
    };
  }

  shouldRetire({ specialist, reason = '' }) {
    if (!specialist) return false;

    if (specialist.currentEmploymentStatus === EmploymentStatus.DEPRECATED) {
      return true;
    }

    const normalizedReason = String(reason).toLowerCase();
    return normalizedReason.includes('security')
      || normalizedReason.includes('discontinued')
      || normalizedReason.includes('contract-ended');
  }

  shouldPromoteToActive({ specialist }) {
    if (!specialist) return false;
    return specialist.connectionStatus === 'CONNECTED'
      && specialist.currentEmploymentStatus !== EmploymentStatus.RETIRED
      && specialist.currentEmploymentStatus !== EmploymentStatus.DEPRECATED;
  }
}
